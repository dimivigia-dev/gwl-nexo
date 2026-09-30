import { vaPageText } from "./va-layout";
import { extractVAFacts, planVA, type VADocument } from "./va-matching";
import { PDFDocument, degrees } from "pdf-lib";
import JSZip from "jszip";
import * as XLSX from "xlsx";

export type ModuleId = "va" | "fgts" | "cc";
export type FileGroups = Record<string, File[]>;
export type GeneratedFile = { name: string; blob: Blob; contractHint: string | null; contentType: "application/pdf" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
export type ReportRow = Record<string, string>;
export type ReceiptCandidate = { file: File; page: number; text: string; name: string; cpf: string; account: string; value: string };
export type ProcessResult = { name: string; blob: Blob; total: number; pending: number; report: string[]; reportRows: ReportRow[]; contractHints: string[]; generatedFiles: GeneratedFile[]; receiptCandidates: ReceiptCandidate[] };

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\.PDF$/i, "").replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const stop = new Set(["PDF", "NFSE", "NAME", "NOTA", "DEBITO", "RELATORIO", "PEDIDO", "DEPARTAMENTO", "DEMONSTRATIVO", "GUIA", "FGTS", "COMPROVANTE", "PAGAMENTO", "RECIBO", "CONTRACHEQUE", "FICHARIO"]);
const tokens = (value: string) => normalize(value).split(" ").filter((x) => x.length > 1 && !stop.has(x) && !/^\d{5,}$/.test(x));
const scoreText = (a: string, b: string) => {
  const aa = new Set(tokens(a)); const bb = new Set(tokens(b));
  if (!aa.size || !bb.size) return 0;
  let matches = 0; aa.forEach((x) => { if (bb.has(x)) matches += 1; });
  return (2 * matches) / (aa.size + bb.size);
};
const money = (text: string) => (text.replace(/\u00a0/g," ").match(/\b\d{1,3}(?:[ .]\d{3})*[,.]\d{2}\b/g)||[]).map((value) => value.replace(/\D/g, "")).filter(Boolean);
const overlapMoney = (a: string, b: string) => money(a).some((v) => money(b).includes(v)) ? .24 : 0;

async function pdfjs() {
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  lib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  return lib;
}

async function readPages(file: File, visualOrder = false) {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i); const content = await page.getTextContent();
    pages.push(visualOrder ? vaPageText(content.items.filter((item): item is Extract<typeof item, {str:string}> => "str" in item)) : content.items.map((item) => "str" in item ? `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}` : "").join(""));
  }
  return pages;
}

async function merge(parts: Array<{ file: File; page?: number }>) {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(await part.file.arrayBuffer(), { ignoreEncryption: true });
    const indexes = part.page === undefined ? src.getPageIndices() : [part.page];
    const copied = await out.copyPages(src, indexes);
    copied.forEach((p) => out.addPage(p));
  }
  return new Blob([await out.save() as BlobPart], { type: "application/pdf" });
}

function workbook(rows: Array<Record<string, string>>, notes: string[] = []) {
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Status: "Nenhuma pendência" }]);
  ws["!autofilter"] = { ref: ws["!ref"] || "A1:A1" }; ws["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
  const keys=Object.keys(rows[0]||{Status:""}); ws["!cols"]=keys.map(key=>({wch:Math.min(58,Math.max(key.length+2,...rows.map(row=>String(row[key]||"").length+2)))}));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Processamento");
  const summary=XLSX.utils.aoa_to_sheet([["GWL Flow — Resumo do processamento"],["Gerado em",new Date().toLocaleString("pt-BR")],[],...notes.map(note=>[note])]);summary["!cols"]=[{wch:72},{wch:24}];XLSX.utils.book_append_sheet(wb,summary,"Resumo");
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

export function buildReportFile(module:ModuleId,rows:ReportRow[],notes:string[]):GeneratedFile{return{name:`RELATORIO_${module.toUpperCase()}_${new Date().toISOString().slice(0,10)}.xlsx`,blob:new Blob([workbook(rows,notes)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),contractHint:null,contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}}

async function makeZip(module: ModuleId, files: Array<{ name: string; blob: Blob }>, rows: Array<Record<string, string>>, report: string[]) {
  const zip = new JSZip(); const folder = zip.folder("arquivos_finalizados")!;
  files.forEach((f) => folder.file(f.name, f.blob));
  zip.file("relatorio_processamento.xlsx", workbook(rows,report));
  zip.file("LEIA-ME.txt", [`GWL Flow — Processamento ${module.toUpperCase()}`, "", ...report].join("\r\n"));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

const best = (anchor: File, candidates: File[], extra: Record<string, string> = {}) => candidates.map((file) => ({ file, score: scoreText(anchor.name, file.name) + overlapMoney(extra[anchor.name] || "", extra[file.name] || "") })).sort((a, b) => b.score - a.score)[0];
const safe = (value: string) => normalize(value).replace(/\s+/g, " ").slice(0, 70) || "DOCUMENTO";

async function processVA(groups: FileGroups) {
  const outputs: GeneratedFile[]=[]; const rows: ReportRow[]=[]; const notes:string[]=[];
  const documents:VADocument[]=[]; const files=new Map<string,File>();
  for(const kind of ["nfse","debito","relatorio"] as const){
    const hashes=new Set<string>();
    for(const [index,file] of (groups[kind]||[]).entries()){
      const id=`${kind}:${index}`;files.set(id,file);
      try{
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await file.arrayBuffer()))).map(v=>v.toString(16).padStart(2,"0")).join("");
        if(hashes.has(hash)){rows.push({Arquivo:file.name,Tipo:kind,Status:"Duplicado ignorado",Observação:"Conteúdo idêntico a outro PDF na mesma área."});continue}hashes.add(hash);
        const facts=extractVAFacts((await readPages(file,true)).join("\n"));documents.push({id,kind,name:file.name,facts});
      }catch{documents.push({id,kind,name:file.name,facts:{value:"",orders:[],contracts:[],error:"Não foi possível ler o PDF. Confira se está corrompido ou protegido por senha."}})}
    }
  }
  for(const [index,plan] of planVA(documents).entries()){
    const names=(kind:string)=>plan.documents.filter(d=>d.kind===kind).map(d=>d.name).join(" | ");
    const value=plan.value?displayCents(plan.value):"Não identificado";
    const row:ReportRow={Contrato:plan.contract||"Não identificado",Pedido:plan.order||"Não identificado","Valor do benefício":value,"Nota Fiscal":names("nfse"),"Nota de Débito":names("debito"),Relatório:names("relatorio"),Critério:"Valor exato e exclusivo entre as três áreas",Conferência:plan.warnings.join(" "),Status:""};
    if(plan.error){row.Status=`Pendente: ${plan.error}`;notes.push(`${value}: ${plan.error}`)}
    else{
      try{
        const department=plan.parts.find(d=>d.kind==="relatorio")?.facts.department;
        const label=department|| (plan.contract?`CONTRATO ${plan.contract}`:plan.order?`PEDIDO ${plan.order}`:`BENEFICIO ${value}`);
        const name=`ALIMENTACAO - ${safe(label)} - ${plan.value} - ${index+1}.pdf`;
        const blob=await merge(plan.parts.map(d=>({file:files.get(d.id)!})));
        outputs.push({name,blob,contractHint:department||plan.contract||null,contentType:"application/pdf"});row.Status="Finalizado";row["Arquivo final"]=name;
      }catch{row.Status="Pendente: erro ao montar o PDF; confira os arquivos do conjunto.";notes.push(row.Status)}
    }
    rows.push(row);
  }
  const pending=rows.filter(row=>row.Status.startsWith("Pendente")).length;
  notes.unshift(`${outputs.length} conjunto(s) finalizado(s); ${pending} pendência(s).`,"Ordem aplicada: Nota Fiscal → Nota de Débito → Relatório.","Todas as páginas de cada documento são preservadas. Valores são comparados em centavos, sem aproximação.");
  return {outputs,rows,notes};
}

async function processFGTS(groups: FileGroups) {
  const demos = groups.demonstrativo || [], guides = groups.guia || [], receipts = groups.comprovante || [];
  const text: Record<string, string> = {}; for (const f of [...demos, ...guides]) text[f.name] = (await readPages(f)).join(" ");
  const receiptPages: Array<{ file: File; page: number; text: string }> = [];
  for (const f of receipts) (await readPages(f)).forEach((t, page) => receiptPages.push({ file: f, page, text: t }));
  const outputs: GeneratedFile[] = []; const rows: Array<Record<string, string>> = []; const notes: string[] = []; const usedReceipts=new Set<string>();
  for (const demo of demos) {
    const guide = best(demo, guides, text);
    const anchorText = `${demo.name} ${text[demo.name]}`;
    const guideText=guide?`${guide.file.name} ${text[guide.file.name]||""}`:"";
    const guideValues=money(guideText);const demoValues=money(anchorText);const expectedValue=guideValues.at(-1)||demoValues.at(-1)||"";
    const receipt = receiptPages.map((x) => {const exactValue=expectedValue&&money(x.text).includes(expectedValue)?expectedValue:"";return{...x,exactValue,score:exactValue?1+scoreText(`${anchorText} ${guideText}`,`${x.file.name} ${x.text}`):0}}).filter(x=>x.exactValue&&!usedReceipts.has(`${x.file.name}:${x.page}`)).sort((a,b)=>b.score-a.score)[0];
    const ok = guide?.score >= .16 && Boolean(receipt?.exactValue); const label = tokens(demo.name).slice(-6).join(" ") || demo.name;
    if (ok) {
      usedReceipts.add(`${receipt.file.name}:${receipt.page}`);
      outputs.push({ name: `${safe(label)} - FGTS.pdf`, blob: await merge([{ file: demo }, { file: guide.file }, { file: receipt.file, page: receipt.page }]), contractHint: label, contentType:"application/pdf" });
      rows.push({ Contrato: label, Demonstrativo: demo.name, Guia: guide.file.name, Comprovante: `${receipt.file.name} — pág. ${receipt.page + 1}`, "Valor conferido":displayCents(receipt.exactValue), Critério:"Valor exatamente igual", Status: "Finalizado" });
    } else {
      const missing = [!guide || guide.score < .16 ? "guia" : "", !receipt ? "comprovante com o mesmo valor" : ""].filter(Boolean).join(" e ");
      rows.push({ Contrato: label, Demonstrativo: demo.name, Guia: guide?.file.name || "", Comprovante: "", "Valor esperado":expectedValue?displayCents(expectedValue):"Não identificado", Critério:"Exige valor exatamente igual", Status: `Pendente: ${missing}` }); notes.push(`${label}: faltando ${missing}.`);
    }
  }
  notes.unshift(`${outputs.length} conjunto(s) finalizado(s); ${rows.length - outputs.length} pendência(s).`, "Ordem aplicada: Demonstrativo → Guia → Comprovante.");
  return { outputs, rows, notes };
}

const cpf = (text:string) => (text.match(/\bCPF(?:\/CNPJ)?\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}[- ]?\d{2})\b/i)?.[1]||"").replace(/\D/g,"");
const cents=(value:string)=>(value||"").replace(/\D/g,"");
const labeledValue=(text:string,patterns:RegExp[])=>{for(const pattern of patterns){const found=text.match(pattern)?.[1];if(found)return cents(found)}return ""};
const payslipValue=(text:string)=>labeledValue(text,[/(?:VALOR\s+)?L[IÍ]QUIDO(?:\s+A\s+RECEBER)?[\s\S]{0,45}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,/L[IÍ]Q\.?\s*(?:A\s+RECEBER)?[\s\S]{0,45}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,/TOTAL\s+L[IÍ]QUIDO[\s\S]{0,45}?(\d{1,3}(?:\.\d{3})*,\d{2})/i]);
const receiptValue=(text:string)=>labeledValue(text,[/VALOR\s+(?:PAGO|DA\s+(?:TRANSFER[EÊ]NCIA|TRANSA[CÇ][AÃ]O|OPERA[CÇ][AÃ]O))[\s\S]{0,45}?(\d{1,3}(?:\.\d{3})*,\d{2})/i,/VALOR\s*:?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/i,/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i]);
const displayCents=(value:string)=>value?`R$ ${(Number(value)/100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}`:"";
const cleanPerson=(value:string)=>normalize(value).replace(/^\d+\s*/,"").split(/PERIODO|CPF|AGENCIA|CONTA|CARGO|MATRICULA|BANCO|VALOR|CTPS|DEPTO|ADMISSAO/i)[0].trim();
const payslipName = (text:string) => {
  const patterns=[
    /FUNC\.?\s*:\s*\d+\s*-\s*([^\n]+?)\s+PER[IÍ]ODO\s*:/i,
    /FUNCION[AÁ]RIO\s*:\s*([^\n]+?)\s+PER[IÍ]ODO\s*:/i,
    /NOME\s+DO\s+(?:FUNCION[AÁ]RIO|EMPREGADO)\s*:\s*([^\n]+)/i,
    /TRABALHADOR\s*:\s*([^\n]+)/i,
    /PREZADO\s*\(?A\)?\s*([^\n]+)/i,
  ];
  for(const pattern of patterns){const found=text.match(pattern);if(found){const name=cleanPerson(found[1]);if(name)return name}}
  return "";
};
const receiptName = (text:string) => {
  const patterns=[
    /DADOS\s+DA\s+CONTA\s+(?:A\s+SER\s+)?CREDITADA\s*:?[\s\S]*?NOME\s*:\s*([^\n:]+?)(?=\s+AG[EÊÉ]?N(?:C|Ç)IA\s*:|\s+CONTA|\s+VALOR|\n|$)/i,
    /NOME\s+DO\s+FAVORECIDO\s*:?\s*([^\n:]+)/i,
    /CR[EÉ]DITO\s+PARA\s*:?\s*([^\n:]+)/i,
    /BENEFICI[AÁ]RIO\s*:?\s*([^\n:]+)/i,
    /RECEBEDOR\s*:\s*([^\n:]+)/i,
  ];
  for(const pattern of patterns){const found=text.match(pattern);if(found){const name=cleanPerson(found[1]);if(name)return name}}
  return "";
};
const canonicalPerson=(value:string)=>cleanPerson(value).split(" ").filter(x=>!["DE","DA","DO","DOS","DAS","E","O","A"].includes(x)).join(" ");
const editDistance=(a:string,b:string)=>{const prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let diagonal=prev[0];prev[0]=i;for(let j=1;j<=b.length;j++){const above=prev[j];prev[j]=Math.min(prev[j]+1,prev[j-1]+1,diagonal+(a[i-1]===b[j-1]?0:1));diagonal=above}}return prev[b.length]};
const wordSimilarity=(a:string,b:string)=>{if(a===b)return 1;if(a.length===1||b.length===1)return a[0]===b[0]?0.9:0;if(Math.min(a.length,b.length)<3)return 0;return 1-editDistance(a,b)/Math.max(a.length,b.length)};
function personSimilarity(a:string,b:string){
  const aa=canonicalPerson(a).split(" ").filter(Boolean),bb=canonicalPerson(b).split(" ").filter(Boolean);if(aa.length<2||bb.length<2)return 0;
  if(aa.join(" ")===bb.join(" "))return 1;
  const short=aa.length<=bb.length?aa:bb,long=aa.length<=bb.length?bb:aa;const available=new Set(long.map((_,i)=>i));const matched:number[]=[];
  for(const word of short){let bestIndex=-1,bestScore=0;for(const index of available){const score=wordSimilarity(word,long[index]);if(score>bestScore){bestScore=score;bestIndex=index}}if(bestIndex>=0){available.delete(bestIndex);matched.push(bestScore)}}
  const strong=matched.filter(score=>score>=.78).length;if(strong<2)return 0;const average=matched.reduce((sum,score)=>sum+score,0)/short.length;const coverage=strong/short.length;const lengthBalance=short.length/long.length;
  return Math.min(.995,average*.6+coverage*.28+lengthBalance*.12);
}

async function processCC(groups: FileGroups) {
  const payslips = groups.contracheque || [], receipts = groups.comprovante || [];
  type CcPage={ file: File; page: number; text: string; name: string; cpf:string;value:string };
  type CcMatch=CcPage&{receiptIndex:number;cpfExact:boolean;exactName:boolean;nameScore:number;cpfConflict:boolean;valueExact:boolean;priority:number;score:number};
  const grouped=new Map<string,CcPage[]>(),cpPages:CcPage[]=[];
  for (const f of payslips) {const label=ccGroupLabel(f);const pages=grouped.get(label)||[];(await readPages(f)).forEach((text, page) => pages.push({ file: f, page, text, name: payslipName(text),cpf:cpf(text),value:payslipValue(text) }));grouped.set(label,pages)}
  for (const f of receipts) (await readPages(f)).forEach((text, page) => cpPages.push({ file: f, page, text, name: receiptName(text),cpf:cpf(text),value:receiptValue(text) }));
  const assignments=new Map<CcPage,CcMatch>(),usedReceipts=new Set<number>();
  const edges:Array<{cc:CcPage;match:CcMatch}>=[];
  for(const ccPages of grouped.values())for(const cc of ccPages){
    const ccKey=canonicalPerson(cc.name);
    cpPages.forEach((cp,receiptIndex)=>{const cpKey=canonicalPerson(cp.name);const cpfExact=Boolean(cc.cpf&&cp.cpf&&cc.cpf===cp.cpf);const cpfConflict=Boolean(cc.cpf&&cp.cpf&&cc.cpf!==cp.cpf);const exactName=Boolean(ccKey&&cpKey&&ccKey===cpKey);const evidence=looseNameEvidence(cc.name,cp.name);const looseScore=evidence.tokenHits>=2?evidence.score:0;const nameScore=cpfConflict?0:Math.max(personSimilarity(cc.name,cp.name),looseScore);const valueExact=Boolean(cc.value&&cp.value&&cc.value===cp.value);let priority=0;if(cpfExact)priority=6;else if(exactName&&valueExact)priority=5;else if(exactName)priority=4;else if(valueExact&&!cpfConflict&&evidence.tokenHits>=2&&nameScore>=.42)priority=3;else if(nameScore>=.90)priority=1;if(!priority)return;const score=priority*10+nameScore+(valueExact?.25:0);edges.push({cc,match:{...cp,receiptIndex,cpfExact,exactName,nameScore,cpfConflict,valueExact,priority,score}})});
  }
  edges.sort((a,b)=>b.match.score-a.match.score);
  for(const edge of edges){if(assignments.has(edge.cc)||usedReceipts.has(edge.match.receiptIndex))continue;assignments.set(edge.cc,edge.match);usedReceipts.add(edge.match.receiptIndex)}
  const rows: Array<Record<string, string>> = []; const notes: string[] = [];const outputs:GeneratedFile[]=[];
  for(const [label,ccPages] of grouped){const parts:Array<{file:File;page?:number}>=[];let groupPending=0;const locality=label.split(" - ").at(-1)||label;const outputLabel=label.length<=120?label:`${label.slice(0,72)} - ${locality}`;const outputName=`CC + CP - ${outputLabel}.pdf`;
    for (const cc of ccPages) {
      const match=assignments.get(cc);
      const displayName=cc.name||match?.name||`Página ${cc.page+1}`;
      const outputPage=parts.length+1;
      if (match) { const confidence=match.cpfExact||match.exactName?100:Math.min(99,Math.round(match.nameScore*100+(match.valueExact?5:0)));parts.push({ file: cc.file, page: cc.page }, { file: match.file, page: match.page }); rows.push({ Empresa:label,Colaborador: displayName, CPF:cc.cpf||match.cpf||"", "Valor contracheque":displayCents(cc.value), "Valor comprovante":displayCents(match.value), Contracheque: `${cc.file.name} — pág. ${cc.page + 1}`, Comprovante: `${match.file.name} — pág. ${match.page + 1}`, "Critério":match.cpfExact?"CPF idêntico":match.exactName&&match.valueExact?"Nome e valor idênticos":match.exactName?"Nome idêntico normalizado":match.valueExact?"Nome aproximado + valor idêntico":"Nome semelhante com alta confiança", "Confiança":`${confidence}%`, Origem:"Automático por prioridade", "Arquivo final":outputName, "Página do contracheque":String(outputPage), Status: "Finalizado" }); }
      else {groupPending++;parts.push({ file: cc.file, page: cc.page }); rows.push({ Empresa:label,Colaborador: displayName, CPF:cc.cpf||"", "Valor contracheque":displayCents(cc.value), "Valor comprovante":"", Contracheque: `${cc.file.name} — pág. ${cc.page + 1}`, Comprovante: "", "Critério":cc.name?"Nenhuma correspondência segura após a conferência global":"Nome não extraído", "Confiança":"0%", Origem:"Aguardando revisão", "Arquivo final":outputName, "Página do contracheque":String(outputPage), Status: "Pendente: comprovante não localizado com segurança" }); notes.push(`${label} — ${displayName}: comprovante não localizado com segurança.`); }
    }
    if(parts.length)outputs.push({name:outputName,blob:await merge(parts),contractHint:label,contentType:"application/pdf"});notes.push(`${label}: ${ccPages.length} contracheque(s), ${groupPending} pendência(s).`);
  }
  notes.unshift(`${outputs.length} empresa(s) separada(s); ${rows.filter((r) => r.Status === "Finalizado").length} par(es) localizado(s); ${rows.filter((r)=>String(r.Status).startsWith("Pendente")).length} pendência(s).`, "Para cada colaborador, o contracheque é colocado primeiro e o comprovante depois.");
  const receiptCandidates:ReceiptCandidate[]=cpPages.map(cp=>({file:cp.file,page:cp.page,text:cp.text,name:cp.name,cpf:cp.cpf,account:(cp.text.match(/CONTA\s*:?[\s-]*([0-9.\/-]+)/i)?.[1]||""),value:(cp.text.match(/(?:VALOR|R\$)\s*:?[\s-]*(?:R\$\s*)?([0-9.]+,[0-9]{2})/i)?.[1]||"")}));
  return { outputs, rows, notes,receiptCandidates };
}

function looseNameEvidence(a:string,b:string){const aa=canonicalPerson(a).split(" ").filter(Boolean),bb=canonicalPerson(b).split(" ").filter(Boolean);if(!aa.length||!bb.length)return{score:0,tokenHits:0,firstName:false};const available=new Set(bb.map((_,i)=>i));let tokenHits=0,total=0;for(const word of aa){let bestIndex=-1,bestScore=0;for(const index of available){const similarity=wordSimilarity(word,bb[index]);if(similarity>bestScore){bestScore=similarity;bestIndex=index}}if(bestIndex>=0&&bestScore>=.66){available.delete(bestIndex);tokenHits++;total+=bestScore}}const coverage=tokenHits/Math.max(aa.length,bb.length);const quality=tokenHits?total/tokenHits:0;const firstName=wordSimilarity(aa[0],bb[0])>=.66;return{score:quality*.58+coverage*.42,tokenHits,firstName}}

function ccGroupLabel(file:File){
  const path=(file.webkitRelativePath||"").split("/").filter(Boolean);if(path.length<=1)return ccOutputLabel(file.name);
  const dirs=path.slice(0,-1);const genericRoot=/^(CONTRACHEQUES?|CC(?:\s*\+?\s*CP)?|FOLHA(?:S)?|ARQUIVOS?|DOCUMENTOS?|CONTRATOS?|\d{2}[- ]\d{4})$/;
  const useful=dirs.length>1&&genericRoot.test(normalize(dirs[0]))?dirs.slice(1):dirs;
  const folderParts=useful.map(part=>safe(part)).filter(Boolean);const folderLabel=folderParts.join(" - ");let fileLabel=ccOutputLabel(file.name);const lastFolder=normalize(folderParts.at(-1)||"");const normalizedFile=normalize(fileLabel);
  if(lastFolder&&normalizedFile.startsWith(`${lastFolder} `))fileLabel=safe(normalizedFile.slice(lastFolder.length));
  const alreadyRepresented=folderParts.some(part=>normalize(part)===normalize(fileLabel));
  if(fileLabel!=="EMPRESA"&&!alreadyRepresented&&!genericRoot.test(normalize(fileLabel)))return [folderLabel,fileLabel].filter(Boolean).join(" - ");
  return folderLabel||fileLabel;
}

function ccOutputLabel(fileName:string){
  let base=normalize(fileName).replace(/\b\d{2}\s*\d{4}\b/g," ").replace(/\bCONTRACHEQUES?|RECIBOS?|PAGAMENTOS?|FOLHA\b/g," ").replace(/\s+/g," ").trim();
  const parts=fileName.replace(/\.pdf$/i,"").split(/\s+-\s+/).map(part=>normalize(part).replace(/\b\d{2}\s*\d{4}\b/g,"").trim()).filter(Boolean);
  if(parts.length>1){const useful=parts.filter(part=>!/^\d{2}\s*\d{4}$/.test(part));if(useful[0]==="UFG"&&useful[1]?.includes("CAMPUS SAMAMBAIA")&&useful[2])return safe(`${useful[0]} - ${useful[1]} - ${useful[2]}`);if(useful.length>=2)return safe(`${useful[0]} - ${useful[1]}`);if(useful[0])base=useful[0]}
  const known=new Set(["UFG","HEMO","HEMOCENTRO","TST","TRT","OAB","SEDUC","UFCAT","UNIRV","HGG","FUNEV","MP","UPA","ABIN","SECULT","SAUDE"]);const words=base.split(" ").filter(Boolean);
  if(words.length>1&&known.has(words[0]))return safe(`${words[0]} - ${words.slice(1).join(" ")}`);
  return safe(base||"EMPRESA");
}

export async function editPdf(blob:Blob,pageIndex:number,action:"rotate-left"|"rotate-right"|"delete"|"up"|"down"){
  const source=await PDFDocument.load(await blob.arrayBuffer(),{ignoreEncryption:true});const count=source.getPageCount();
  if(pageIndex<0||pageIndex>=count)throw new Error("Página inválida.");
  if(action==="rotate-left"||action==="rotate-right"){const page=source.getPage(pageIndex);const current=page.getRotation().angle;page.setRotation(degrees((current+(action==="rotate-right"?90:270))%360));return new Blob([await source.save() as BlobPart],{type:"application/pdf"})}
  if(action==="delete"){if(count<=1)throw new Error("O PDF precisa manter pelo menos uma página.");source.removePage(pageIndex);return new Blob([await source.save() as BlobPart],{type:"application/pdf"})}
  const target=action==="up"?pageIndex-1:pageIndex+1;if(target<0||target>=count)return blob;const order=source.getPageIndices();[order[pageIndex],order[target]]=[order[target],order[pageIndex]];const output=await PDFDocument.create();(await output.copyPages(source,order)).forEach(page=>output.addPage(page));return new Blob([await output.save() as BlobPart],{type:"application/pdf"});
}

export async function pdfPageCount(blob:Blob){return (await PDFDocument.load(await blob.arrayBuffer(),{ignoreEncryption:true})).getPageCount()}

export async function insertPdfPage(target:Blob,afterPageIndex:number,source:File,sourcePageIndex:number){const out=await PDFDocument.load(await target.arrayBuffer(),{ignoreEncryption:true});const src=await PDFDocument.load(await source.arrayBuffer(),{ignoreEncryption:true});if(afterPageIndex<0||afterPageIndex>=out.getPageCount())throw new Error("Página do contracheque não encontrada.");const[copied]=await out.copyPages(src,[sourcePageIndex]);out.insertPage(afterPageIndex+1,copied);return new Blob([await out.save() as BlobPart],{type:"application/pdf"})}

export async function rebuildPackage(module:ModuleId,files:GeneratedFile[],rows:ReportRow[],report:string[]){return makeZip(module,files.filter(f=>f.contentType==="application/pdf"),rows,report)}

export async function processDocuments(module: ModuleId, groups: FileGroups): Promise<ProcessResult> {
  const result = module === "va" ? await processVA(groups) : module === "fgts" ? await processFGTS(groups) : await processCC(groups);
  const blob = await makeZip(module, result.outputs, result.rows, result.notes);
  const reportFile=buildReportFile(module,result.rows,result.notes);
  const contractHints = Array.from(new Set([
    ...result.rows.flatMap((row) => [row.Contrato, row.Contracheque, row.Demonstrativo, row["Nota Fiscal"]].filter(Boolean)),
    ...Object.values(groups).flat().map((file) => file.name),
    ...result.outputs.map((output) => output.name),
  ].map(String)));
  return { name: `GWL_${module.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.zip`, blob, total: result.outputs.length, pending: result.rows.filter((r) => String(r.Status).startsWith("Pendente")).length, report: result.notes,reportRows:result.rows, contractHints, generatedFiles: [...result.outputs,reportFile],receiptCandidates:"receiptCandidates" in result?result.receiptCandidates:[] };
}
