/** Deterministic VA matching. Names never authenticate a document. */
export type VAFacts={value:string;orders:string[];contracts:string[];department?:string;error:string};
export type VADocument={id:string;kind:'nfse'|'debito'|'relatorio';name:string;facts:VAFacts};
const plain=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\u00a0/g,' ');
const amount='(?:\\d{1,3}(?:[. ]\\d{3})+|\\d+),\\d{2}';
const unique=(values:string[])=>[...new Set(values)];
function valuesAfter(text:string,label:string){
 return unique([...text.matchAll(new RegExp('\\b(?:'+label+')\\s*(?:\\([^)]{0,30}\\))?\\s*[:=\\-]?\\s*(?:R\\s*\\$\\s*)?('+amount+')(?!\\d)','g'))].map(m=>String(BigInt(m[1].replace(/\D/g,'')))));
}
function identifiers(text:string,label:string){
 const re=new RegExp('\\b'+label+'\\s*(?:(?:ENVIADO|WEB)\\s*)?(?:(?:N[UÚ]MERO|NUM\\.?|N[Oº°.]?|#)\\s*)?[:=\\-]?\\s*([A-Z0-9]+(?:[./-][A-Z0-9]+)*)','g');
 return unique([...text.matchAll(re)].map(m=>m[1]).filter(v=>/\d/.test(v)).map(v=>v.split(/[./-]/).map(p=>/^\d+$/.test(p)?String(BigInt(p)):p).join('/')));
}
export function extractVAFacts(raw:string):VAFacts{
 const text=plain(raw);
 // Benefit amount is authoritative; invoice charges/taxes must not replace it.
 const benefit=valuesAfter(text,'VALOR\\s+(?:(?:TOTAL|DO|DOS|DE)\\s+)*(?:BENEFICIO[S]?|BENEFICIOS)|TOTAL\\s+(?:(?:DO|DOS|DE)\\s+)?BENEFICIOS?');
 const total=valuesAfter(text,'VALOR\\s+TOTAL(?:\\s+(?:DO\\s+PEDIDO|DOS\\s+BENEFICIOS|DOS\\s+SERVICOS|DA\\s+NOTA))?|TOTAL\\s+(?:DO\\s+PEDIDO|DOS\\s+BENEFICIOS)|TOTAL\\s+GERAL');
 const inclusion=unique([...text.matchAll(new RegExp('INCLUSAO\\s+DE\\s+BENEFICIO[^\\n]{0,110}?\\bQTD\\s+\\d+\\s+R\\s*\\$\\s*('+amount+')(?!\\d)','g'))].map(m=>String(BigInt(m[1].replace(/\D/g,'')))));
 const preferred=benefit.length?benefit:inclusion;
 const values=preferred.length?preferred:total;
 const value=values.length===1&&values[0]!=='0'?values[0]:'';
 const department=text.match(/\bDEPARTAMENTO\s*:\s*([^\n]+?)(?=\s{2,}|\s+METODO\s+PAGAMENTO|$)/m)?.[1]?.trim()||'';
 return {value,department,orders:identifiers(text,'PEDIDO'),contracts:identifiers(text,'CONTRATO'),error:!text.trim()?'PDF sem texto legível; é necessário OCR.':values.length>1?'Mais de um valor do benefício/total identificado; separe os documentos ou confira os valores.':!value?'Valor do benefício ou valor total não identificado de forma inequívoca.':''};
}
export function planVA(documents:VADocument[]){
 const groups=new Map<string,VADocument[]>();
 const plans:Array<{value:string;documents:VADocument[];parts:VADocument[];error:string;warnings:string[];contract:string;order:string}>=[];
 for(const doc of documents){if(doc.facts.error||!doc.facts.value){plans.push({value:'',documents:[doc],parts:[],error:doc.facts.error||'Valor não identificado.',warnings:[],contract:'',order:''});continue}const list=groups.get(doc.facts.value)||[];list.push(doc);groups.set(doc.facts.value,list)}
 for(const [value,list] of groups){
  const kinds=['nfse','debito','relatorio'] as const;
  const labels={nfse:'nota fiscal',debito:'nota de débito',relatorio:'relatório'};
  const problems=kinds.flatMap(kind=>{const count=list.filter(d=>d.kind===kind).length;return count===1?[]:[count===0?`Falta ${labels[kind]}.`:`Há ${count} documentos de ${labels[kind]} com o mesmo valor; associação ambígua.`]});
  const warnings:string[]=[];
  for(const key of ['orders','contracts'] as const){const sets=list.map(d=>d.facts[key]);const known=sets.filter(s=>s.length);const label=key==='orders'?'pedido':'contrato';
   if(known.length&&known.some(s=>s.length!==1)||known.length>1&&unique(known.flat()).length>1)problems.push(`Números de ${label} conflitantes ou múltiplos.`);
   if(sets.some(s=>!s.length))warnings.push(`Número de ${label} ausente em um ou mais documentos; associação pelo valor exclusivo.`);
  }
  plans.push({value,documents:list,parts:problems.length?[]:kinds.map(k=>list.find(d=>d.kind===k)!),error:problems.join(' '),warnings,contract:unique(list.flatMap(d=>d.facts.contracts)).join(', '),order:unique(list.flatMap(d=>d.facts.orders)).join(', ')});
 }
 return plans;
}
