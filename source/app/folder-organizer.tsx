"use client";

import { useMemo, useState } from "react";
import type { GeneratedFile, ModuleId } from "../lib/document-engine";

type Dir = any;
type Choice = "skip" | "keep" | "replace";
type Row = { id: string; file: GeneratedFile; folder: string; duplicate: boolean; choice: Choice; status:"ready"|"saving"|"saved"|"failed"; error?:string };

const clean = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const ignored = new Set(["CONTRATO","ALIMENTACAO","FGTS","FECHAMENTO","FINAL","PDF","UNIDADE","EMPRESA","SERVICO","SERVICOS","VIGILANCIA","SEGURANCA","LTDA","EIRELI","S/A","SA","DE","DA","DO","DAS","DOS","E"]);
const aliases: Record<string,string[]> = {
  UFG:["UNIVERSIDADE FEDERAL DE GOIAS"], UFGO:["UNIVERSIDADE FEDERAL DE GOIAS"],
  HEMO:["HEMOCENTRO"], HEMOCENTRO:["HEMO"],
  TST:["TRIBUNAL SUPERIOR DO TRABALHO"], TRT:["TRIBUNAL REGIONAL DO TRABALHO"],
  OAB:["ORDEM DOS ADVOGADOS DO BRASIL"], SEDUC:["SECRETARIA DE ESTADO DA EDUCACAO"],
  EMBRAPA:["EMPRESA BRASILEIRA DE PESQUISA AGROPECUARIA"], UFCAT:["UNIVERSIDADE FEDERAL DE CATALAO"],
  UNIRV:["UNIVERSIDADE DE RIO VERDE"], HGG:["HOSPITAL ESTADUAL DR ALBERTO RASSI"],
};
const words = (v: string) => clean(v).split(" ").filter(x => x.length > 1 && !ignored.has(x));
const acronym = (v:string) => words(v).filter(x=>x.length>2).map(x=>x[0]).join("");
const expanded = (v:string) => {
  const base=clean(v); const additions=words(base).flatMap(w=>aliases[w]||[]);
  return clean([base,...additions].join(" "));
};
const matchScore = (hint: string, folder: string) => {
  const ah=expanded(hint), fh=expanded(folder), a=words(ah), b=words(fh);
  if (!a.length || !b.length) return 0;
  if(ah.includes(fh)||fh.includes(ah))return .98;
  const folderAcronym=acronym(folder), hintAcronym=acronym(hint);
  if(a.some(x=>x.length>=2&&x===folderAcronym)||b.some(x=>x.length>=2&&x===hintAcronym))return .96;
  let hits=0;
  for(const x of a){if(b.some(y=>x===y||(x.length>=4&&y.startsWith(x))||(y.length>=4&&x.startsWith(y))))hits++}
  const coverage=hits/Math.min(a.length,b.length);
  return Math.min(.94,coverage*.82+(hits>=2?.12:0));
};

async function existingPath(root: Dir, folder: string, year: string, monthFolder: string) {
  try {
    const contract = await findDirectory(root,folder,false);
    let yearParent=contract;
    try { yearParent=await findDirectory(contract,"faturamento",false); } catch { /* Sem faturamento: o ano fica diretamente no contrato. */ }
    const yearDir = await findDirectory(yearParent,year,false);
    return await findDirectory(yearDir,monthFolder,false);
  } catch { return null; }
}

async function findDirectory(parent:Dir,wanted:string,create:boolean){for await(const[name,handle]of parent.entries()){if(handle.kind==="directory"&&clean(name)===clean(wanted))return handle}if(create)return parent.getDirectoryHandle(wanted,{create:true});throw new Error(`Pasta ${wanted} não encontrada.`)}

async function isDuplicate(root: Dir, folder: string, year: string, monthFolder: string, name: string) {
  const dir = await existingPath(root, folder, year, monthFolder);
  if (!dir) return false;
  try { await dir.getFileHandle(name); return true; } catch { return false; }
}

export default function FolderOrganizer({ module, files, initialMonth, close }: { module: ModuleId | "mix"; files: GeneratedFile[]; initialMonth?:string; close: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(initialMonth||`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`);
  const [root, setRoot] = useState<Dir | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [year, mm] = month.split("-");
  const monthFolder = `${mm}-${year}`;
  const mapped = rows.filter(r => r.folder && r.choice !== "skip" && r.status!=="saved").length;
  const destination = useMemo(() => `[faturamento, quando existir] / ${year} / ${monthFolder}`, [year, monthFolder]);

  async function inspect() {
    setError(""); setMessage("");
    if (!("showDirectoryPicker" in window)) { setError("Este recurso funciona no Chrome ou Edge no computador."); return; }
    setBusy(true);
    try {
      const picked = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      if(picked.requestPermission&&await picked.requestPermission({mode:"readwrite"})!=="granted")throw new Error("A permissão para gravar na pasta não foi concedida.");
      let selectedRoot=picked;
      const firstLevel:Array<{name:string;handle:Dir}>=[];
      for await(const[name,handle]of picked.entries())if(handle.kind==="directory")firstLevel.push({name,handle});
      const contractsContainer=firstLevel.find(x=>clean(x.name)==="CONTRATOS");
      if(contractsContainer)selectedRoot=contractsContainer.handle;
      const names: string[] = [];
      for await (const [name, handle] of selectedRoot.entries()) if (handle.kind === "directory") names.push(name);
      if(names.some(name=>clean(name)==="FATURAMENTO")&&names.length<6)throw new Error("Foi selecionada a pasta de um contrato. Selecione a pasta principal CONTRATOS, que contém todos os contratos.");
      if(!names.length)throw new Error("Nenhuma pasta de contrato foi encontrada. Selecione a pasta principal CONTRATOS.");
      names.sort((a,b)=>a.localeCompare(b,"pt-BR"));
      const next: Row[] = [];
      for (let i=0;i<files.length;i++) {
        const file=files[i]; const hint=file.contractHint || "";
        const ranked=names.map(name=>({name,score:matchScore(hint,name)})).sort((a,b)=>b.score-a.score);
        const folder=hint && ranked[0]?.score >= .55 && ranked[0].score >= (ranked[1]?.score || 0)+.08 ? ranked[0].name : "";
        const duplicate=folder ? await isDuplicate(selectedRoot,folder,year,monthFolder,file.name) : false;
        next.push({id:`${i}-${file.name}`,file,folder,duplicate,choice:"keep",status:"ready"});
      }
      setRoot(selectedRoot); setFolders(names); setRows(next);
      const found=next.filter(r=>r.folder).length;
      setMessage(`${found} de ${next.length} arquivo(s) identificado(s) automaticamente em ${names.length} pasta(s). Confira todos os destinos antes de autorizar.`);
    } catch (e:any) { if (e?.name !== "AbortError") setError(e instanceof Error?e.message:"Não foi possível acessar a pasta selecionada."); }
    finally { setBusy(false); }
  }

  async function selectFolder(id: string, folder: string) {
    if (!root) return;
    const row=rows.find(r=>r.id===id); if(!row)return;
    const duplicate=folder ? await isDuplicate(root,folder,year,monthFolder,row.file.name) : false;
    setRows(old=>old.map(r=>r.id===id?{...r,folder,duplicate,choice:"keep",status:"ready",error:undefined}:r));
  }

  async function uniqueName(dir: Dir, name: string) {
    const dot=name.lastIndexOf("."); const base=dot>0?name.slice(0,dot):name; const ext=dot>0?name.slice(dot):"";
    for(let n=2;n<1000;n++){const candidate=`${base} (${n})${ext}`;try{await dir.getFileHandle(candidate)}catch{return candidate}}
    return `${base} - copia${ext}`;
  }

  async function authorize() {
    if(!root || !mapped)return;
    setBusy(true); setError("");
    let saved=0, failed=0;const targets=rows.filter(r=>r.folder&&r.choice!=="skip"&&r.status!=="saved");let cursor=0;
    const workers=Array.from({length:Math.min(3,targets.length)},async()=>{while(cursor<targets.length){const row=targets[cursor++];setRows(old=>old.map(r=>r.id===row.id?{...r,status:"saving"}:r));
      try{
        const contract=await findDirectory(root,row.folder,false);
        let yearParent=contract;
        try { yearParent=await findDirectory(contract,"faturamento",false); } catch { /* Procura/cria o ano diretamente no contrato. */ }
        const yearDir=await findDirectory(yearParent,year,true);
        const monthDir=await findDirectory(yearDir,monthFolder,true);
        let name=row.file.name;
        if(row.duplicate&&row.choice==="keep")name=await uniqueName(monthDir,name);
        const handle=await monthDir.getFileHandle(name,{create:true});
        const writable=await handle.createWritable(); await writable.write(row.file.blob); await writable.close(); saved++;setRows(old=>old.map(r=>r.id===row.id?{...r,status:"saved",error:undefined}:r));
      }catch(e){failed++;setRows(old=>old.map(r=>r.id===row.id?{...r,status:"failed",error:e instanceof Error?e.message:"Falha ao gravar"}:r))}
    }});await Promise.all(workers);
    setBusy(false); setDone(failed===0); setMessage(`${saved} arquivo(s) salvo(s) em ${monthFolder}.${failed?` ${failed} falharam; confira as linhas em vermelho e tente novamente.`:" Todos os arquivos foram confirmados."}`);
  }

  return <div className="modal-backdrop"><div className="folder-modal">
    <header><div><span>ORGANIZADOR DE FATURAMENTO</span><h2>Salvar nas pastas dos contratos</h2><p>O GWL Flow primeiro confere os destinos. Nenhum arquivo é gravado sem sua autorização final.</p></div><button onClick={close}>×</button></header>
    <div className="folder-toolbar"><label>Competência<input type="month" value={month} disabled={!!root} onChange={e=>setMonth(e.target.value)}/><small>A pasta será <b>{monthFolder}</b></small></label><div><span>Destino padrão</span><strong>CONTRATOS / [Contrato] / {destination}</strong></div><button onClick={inspect} disabled={busy}>{root?"Escolher outra pasta CONTRATOS":"Selecionar pasta CONTRATOS"}</button></div>
    {error&&<div className="folder-alert error-message">{error}</div>}
    {message&&<div className={`folder-alert ${done?"folder-success":""}`}>{done?"✓ ":"ⓘ "}{message}</div>}
    {root&&<section className="folder-review"><div className="folder-review-title"><div><strong>Revisão antes de salvar</strong><small>{rows.length} arquivo(s) {module==="mix"?"de diferentes automações":`do módulo ${module.toUpperCase()}`}</small></div><b>{mapped} pronto(s)</b></div>
      <div className="folder-table"><div className="folder-table-head"><span>Arquivo final</span><span>Pasta do contrato</span><span>Se já existir</span></div>{rows.map(row=><div className={`folder-row ${!row.folder?"needs-review":""} ${row.status}`} key={row.id}><div><strong>{row.status==="saved"?"✓ ":row.status==="failed"?"⚠ ":""}{row.file.name}</strong><small>{row.error||(!row.folder?"Selecione o contrato manualmente":row.file.contractHint?`Identificado por: ${row.file.contractHint}`:"Destino selecionado manualmente")}</small></div><select disabled={busy||row.status==="saved"} value={row.folder} onChange={e=>selectFolder(row.id,e.target.value)}><option value="">Selecione a pasta...</option>{folders.map(f=><option key={f}>{f}</option>)}</select><select disabled={busy||row.status==="saved"||!row.folder||!row.duplicate} value={row.duplicate?row.choice:"keep"} onChange={e=>setRows(old=>old.map(r=>r.id===row.id?{...r,choice:e.target.value as Choice}:r))}>{!row.duplicate&&<option value="keep">Arquivo novo</option>}<option value="skip">Não salvar</option><option value="keep">Manter os dois</option><option value="replace">Substituir</option></select></div>)}</div>
      <p className="folder-safety">🔒 Se existir <b>faturamento</b>, o destino será <b>faturamento / {year} / {monthFolder}</b>. Se não existir, o sistema procurará ou criará <b>{year} / {monthFolder}</b> diretamente dentro do contrato. Nada será gravado antes da autorização.</p>
    </section>}
    <footer><button onClick={close}>{done?"Concluir":"Cancelar"}</button>{root&&!done&&<button className="primary-button" disabled={busy||!mapped} onClick={authorize}>{busy?"Salvando...":`Autorizar e salvar ${mapped} arquivo(s)`}</button>}</footer>
  </div></div>;
}
