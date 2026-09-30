import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, Import, ShieldCheck, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPonto } from '@/services/pontoApi';
import * as XLSX from 'xlsx';

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const valueOf = (row, ...aliases) => { for (const alias of aliases) { const value = row[normalize(alias)]; if (value !== undefined && String(value).trim()) return String(value).trim(); } return ''; };
const yes = (value, fallback = true) => { const text = normalize(value); if (!text) return fallback; return ['sim', 's', 'true', '1', 'ativo'].includes(text); };
const isoDate = (value) => { const text = String(value || '').trim(); const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''; };
const scheduleTimes = (value) => { const times = [...String(value || '').matchAll(/(?:^|\D)([01]?\d|2[0-3])[:h]([0-5]\d)(?!\d)/gi)].map((match) => `${match[1].padStart(2, '0')}:${match[2]}`); return times.length >= 4 ? { expectedStart: times[0], expectedBreakStart: times[1], expectedBreakEnd: times[2], expectedEnd: times[3] } : times.length >= 2 ? { expectedStart: times[0], expectedBreakStart: '', expectedBreakEnd: '', expectedEnd: times[1] } : {}; };

function parseCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(value); value = '';
      if (row.some((cell) => String(cell).trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value); if (row.some((cell) => String(cell).trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalize);
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
}

async function parseFile(file) {
  if (file.name.toLowerCase().endsWith('.csv')) return parseCsv(await file.text());
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), value])));
}

function mapRows(rows, kind) {
  if (kind === 'sites') return rows.map((row) => ({
    sourceSystem: valueOf(row, 'id') ? 'tirvu' : '', sourceId: valueOf(row, 'id'),
    name: valueOf(row, 'posto', 'nome do posto', 'nome / apelido', 'apelido', 'lotacao', 'local'),
    contract: valueOf(row, 'contrato', 'razao', 'razao lotacao', 'razao social'),
    company: valueOf(row, 'empresa', 'razao social'),
    cnpj: valueOf(row, 'cnpj'), city: valueOf(row, 'cidade', 'municipio'), responsible: valueOf(row, 'responsavel'),
    phone: valueOf(row, 'telefone'), email: valueOf(row, 'email', 'e-mail'), zipCode: valueOf(row, 'cep'), address: valueOf(row, 'logradouro', 'endereco'), addressNumber: valueOf(row, 'numero'), notes: valueOf(row, 'observacoes'),
    latitude: valueOf(row, 'latitude', 'lat'), longitude: valueOf(row, 'longitude', 'long', 'lng'), radiusMeters: Math.round((Number(String(valueOf(row, 'cerca (km)', 'cerca km')).replace(',', '.')) || 0) * 1000) || Number(valueOf(row, 'raio', 'cerca', 'radius')) || 300,
    requirePhoto: yes(valueOf(row, 'registra foto'), true), requireGeo: yes(valueOf(row, 'registra geo'), true), status: yes(valueOf(row, 'ativo/inativo'), true) ? 'active' : 'inactive',
  })).filter((row) => row.name);
  return rows.map((row) => {
    const schedule = valueOf(row, 'escala', 'jornada', 'jornada de trabalho');
    return ({
    sourceSystem: valueOf(row, 'id') ? 'tirvu' : '', sourceId: valueOf(row, 'id'),
    name: valueOf(row, 'colaborador', 'nome', 'nome completo', 'funcionario'),
    registration: valueOf(row, 'matricula', 'codigo', 'id colaborador'),
    cpf: valueOf(row, 'cpf'), jobTitle: valueOf(row, 'cargo', 'funcao'), siteName: valueOf(row, 'posto', 'lotacao', 'local'), company: valueOf(row, 'empresa', 'razao social'),
    schedule, admissionDate: isoDate(valueOf(row, 'admissao', 'data admissao')), journeyStartDate: isoDate(valueOf(row, 'inicio jornada', 'inicio escala', 'inicio na jornada')),
    ...scheduleTimes(schedule),
    expectedStart: valueOf(row, 'entrada', 'horario entrada') || scheduleTimes(schedule).expectedStart, expectedBreakStart: valueOf(row, 'saida intervalo', 'inicio intervalo') || scheduleTimes(schedule).expectedBreakStart, expectedBreakEnd: valueOf(row, 'retorno intervalo', 'fim intervalo') || scheduleTimes(schedule).expectedBreakEnd, expectedEnd: valueOf(row, 'saida', 'horario saida') || scheduleTimes(schedule).expectedEnd,
    email: valueOf(row, 'email', 'e mail'), phone: valueOf(row, 'telefone', 'celular', 'whatsapp'),
    registersPoint: yes(valueOf(row, 'registra ponto?', 'registra ponto'), true), requirePhoto: !yes(valueOf(row, 'registros sem foto?'), false), requireGeo: !yes(valueOf(row, 'sem geo?', 'registros sem geo?'), false), status: valueOf(row, 'demissao') ? 'inactive' : 'active',
  }); }).filter((row) => row.name && row.registration);
}

export default function ImportDataPanel({ onImported, toast }) {
  const [kind, setKind] = useState('employees');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const mapped = useMemo(() => mapRows(rows, kind), [rows, kind]);
  const read = async (file) => {
    if (!file) return;
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return toast({ title: 'Arquivo não reconhecido', description: 'Selecione a exportação CSV ou Excel do Tirvu.', variant: 'destructive' });
    setFileName(file.name);
    setRows(await parseFile(file));
  };
  const submit = async () => {
    if (!mapped.length) return;
    setSaving(true);
    try {
      const size = kind === 'sites' ? 100 : 250;
      const total = { importedSites: 0, updatedSites: 0, importedEmployees: 0, updatedEmployees: 0, skipped: 0 };
      for (let index = 0; index < mapped.length; index += size) {
        const chunk = mapped.slice(index, index + size);
        const result = await createPonto('importBatch', kind === 'sites' ? { sites: chunk, employees: [] } : { employees: chunk, sites: [] });
        Object.keys(total).forEach((key) => { total[key] += Number(result[key] || 0); });
      }
      toast({ title: 'Importação concluída', description: `${total.importedSites} posto(s) e ${total.importedEmployees} colaborador(es) adicionados; ${total.updatedSites + total.updatedEmployees} atualizado(s); ${total.skipped} ignorado(s).` });
      setRows([]); setFileName(''); await onImported();
    } catch (error) { toast({ title: 'Falha na importação', description: error.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  return <section className="overflow-hidden rounded-2xl border border-gray-800 bg-[#252525]"><header className="border-b border-gray-800 p-5"><div className="flex items-start gap-3"><span className="rounded-lg bg-blue-500/10 p-2 text-blue-300"><Import className="h-5 w-5" /></span><div><h2 className="font-semibold text-white">Importar dados do sistema anterior</h2><p className="mt-1 text-sm text-gray-400">Traga postos e colaboradores diretamente pela exportação CSV ou Excel, sem compartilhar senha.</p></div></div></header><div className="space-y-5 p-5"><div className="grid gap-3 md:grid-cols-2"><button onClick={() => { setKind('sites'); setRows([]); }} className={`rounded-xl border p-4 text-left ${kind === 'sites' ? 'border-[#ff8c00] bg-orange-500/10' : 'border-gray-700 bg-[#1b1b1b]'}`}><strong className="text-white">1. Importar empresas e postos</strong><p className="mt-1 text-xs text-gray-400">Nome, contrato, empresa, CNPJ, endereço, cerca e coordenadas.</p></button><button onClick={() => { setKind('employees'); setRows([]); }} className={`rounded-xl border p-4 text-left ${kind === 'employees' ? 'border-[#ff8c00] bg-orange-500/10' : 'border-gray-700 bg-[#1b1b1b]'}`}><strong className="text-white">2. Importar colaboradores</strong><p className="mt-1 text-xs text-gray-400">Nome, matrícula, CPF, posto, cargo, escala, horários e regras de ponto.</p></button></div><label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-600 bg-[#191919] px-5 py-10 text-center hover:border-[#ff8c00]"><UploadCloud className="h-9 w-9 text-[#ff9f2e]" /><strong className="mt-3 text-white">Selecionar arquivo CSV ou Excel</strong><span className="mt-1 text-xs text-gray-500">{fileName || 'Exportado do Tirvu ou de outra planilha'}</span><input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => read(event.target.files?.[0])} className="hidden" /></label>{rows.length > 0 && <div className="rounded-xl border border-gray-700 bg-[#1a1a1a] p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-white"><FileSpreadsheet className="h-4 w-4 text-emerald-300" />Prévia da leitura</span><b className="text-sm text-[#ff9f2e]">{mapped.length} registro(s) válido(s)</b></div><div className="mt-3 overflow-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="text-gray-500"><tr><th className="py-2">Nome</th><th>Matrícula/contrato</th><th>Posto/empresa</th><th>Escala/cidade</th></tr></thead><tbody className="divide-y divide-gray-800">{mapped.slice(0, 8).map((row, index) => <tr key={index}><td className="py-2 text-white">{row.name}</td><td className="text-gray-400">{row.registration || row.contract || '—'}</td><td className="text-gray-400">{row.siteName || row.company || '—'}</td><td className="text-gray-400">{row.schedule || row.city || '—'}</td></tr>)}</tbody></table></div>{mapped.length > 8 && <p className="mt-2 text-xs text-gray-500">Mais {mapped.length - 8} registro(s) serão importados.</p>}</div>}<div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-800/30 bg-emerald-950/15 p-4"><p className="flex items-start gap-2 text-xs leading-relaxed text-emerald-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />O identificador original do Tirvu evita duplicação e mantém colaboradores com a mesma matrícula em empresas diferentes. Depois da importação, confira os postos sem coordenadas antes de liberar a cerca geográfica.</p><Button onClick={submit} disabled={saving || !mapped.length} className="shrink-0 bg-[#ff8c00] font-semibold text-black hover:bg-[#ff9f2e]">{saving ? 'Importando...' : 'Importar agora'}</Button></div></div></section>;
}
