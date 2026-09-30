import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { CheckCircle2, ChevronDown, ChevronRight, Clock3, Download, FileSpreadsheet, LayoutList, Printer, RefreshCw, Search, UserRoundSearch, UsersRound, Wrench } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import BackButton from '@/components/common/BackButton';
import TimesheetAdjustmentModal from '@/components/admin/TimesheetAdjustmentModal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { downloadCsv, loadPonto } from '@/services/pontoApi';
import { buildTimesheets, formatClock, formatMinutes } from '@/utils/timesheetEngine';
import { openTimesheetPrint, timesheetExportRows } from '@/utils/timesheetPrint';

const exportHeaders = ['Colaborador', 'Matrícula', 'CPF', 'Posto', 'Data', 'Intrajornada', 'Entrada', 'Saída intervalo', 'Retorno intervalo', 'Saída', 'Horas trabalhadas', 'Saldo', 'Observações'];

function isoDate(year, monthIndex, day) {
  const value = new Date(year, monthIndex, day, 12, 0, 0);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function currentCompetenceRange(reference = new Date()) {
  return {
    startDate: isoDate(reference.getFullYear(), reference.getMonth() - 1, 21),
    endDate: isoDate(reference.getFullYear(), reference.getMonth(), 20),
  };
}

const brDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

function statusStyle(code) {
  if (['absence', 'invalid'].includes(code)) return 'border-red-800/60 bg-red-950/30 text-red-300';
  if (code === 'incomplete') return 'border-amber-700/60 bg-amber-950/30 text-amber-300';
  if (['justified', 'worked-off'].includes(code)) return 'border-blue-700/60 bg-blue-950/30 text-blue-300';
  if (['day-off', 'future', 'disabled', 'unconfigured'].includes(code)) return 'border-gray-700 bg-gray-800/50 text-gray-400';
  return 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300';
}

function intrajornadaLabel(day) {
  if (!day.schedule.required) return '—';
  return day.schedule.expected_break_start && day.schedule.expected_break_end ? 'SIM' : 'NÃO';
}

function TimesheetCard({ sheet, expanded, onToggle, onAdjust, onPrint }) {
  const pending = sheet.summary.absences + sheet.summary.incomplete;
  return (
    <article className="overflow-hidden rounded-2xl border border-gray-800 bg-[#262626] shadow-lg shadow-black/10">
      <button onClick={onToggle} className="flex w-full flex-col gap-4 p-5 text-left transition-colors hover:bg-white/[0.025] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-1 rounded-lg border border-gray-700 bg-[#191919] p-1.5 text-gray-400">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">{sheet.employee.name}</h2>
            <p className="mt-1 text-sm text-gray-400">Matrícula {sheet.employee.registration || '—'} · {sheet.employee.job_title || 'Função não informada'} · {sheet.employee.site_name || 'Sem posto'}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-gray-700 px-2.5 py-1 text-gray-300">{sheet.employee.schedule || 'Escala não definida'}</span>
              {sheet.signature && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1 font-semibold text-emerald-300"><CheckCircle2 className="h-3 w-3" />Assinada</span>}
              {pending > 0 ? <span className="rounded-full border border-amber-700/60 bg-amber-950/30 px-2.5 py-1 font-semibold text-amber-300">{pending} pendência(s)</span> : <span className="rounded-full border border-emerald-800/60 bg-emerald-950/30 px-2.5 py-1 font-semibold text-emerald-300">Folha regular</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-5 pl-10 text-right lg:pl-0">
          <div><span className="block text-xs uppercase tracking-wide text-gray-500">Trabalhadas</span><strong className="text-base text-white">{formatMinutes(sheet.summary.workedMinutes)}</strong></div>
          <div><span className="block text-xs uppercase tracking-wide text-gray-500">Faltas</span><strong className={sheet.summary.absences ? 'text-base text-red-300' : 'text-base text-white'}>{sheet.summary.absences}</strong></div>
          <div><span className="block text-xs uppercase tracking-wide text-gray-500">Saldo</span><strong className={sheet.summary.balanceMinutes < 0 ? 'text-base text-red-300' : 'text-base text-emerald-300'}>{formatMinutes(sheet.summary.balanceMinutes, true)}</strong></div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-800">
          <div className="grid grid-cols-2 gap-px bg-gray-800 text-sm md:grid-cols-4 lg:grid-cols-8">
            {[
              ['Empresa', sheet.employee.company_name || 'DIMIVIG'], ['CPF', sheet.employee.cpf || '—'],
              ['CTPS / Série', [sheet.employee.ctps_number, sheet.employee.ctps_series].filter(Boolean).join(' / ') || '—'], ['Admissão', brDate(sheet.employee.admission_date)],
              ['Início da escala', brDate(sheet.anchor)], ['Dias previstos', sheet.summary.scheduledDays], ['Horas previstas', formatMinutes(sheet.summary.plannedMinutes)],
            ].map(([label, value]) => <div key={label} className="bg-[#202020] px-4 py-3"><span className="block text-[11px] uppercase tracking-wide text-gray-500">{label}</span><strong className="mt-0.5 block truncate text-gray-200" title={String(value)}>{value}</strong></div>)}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-gray-800 bg-[#1e1e1e] px-5 py-3">
            <p className="text-xs text-gray-400">Folha de ponto completa · folgas e dias sem marcação permanecem visíveis</p>
            <Button onClick={() => onPrint(sheet)} variant="outline" className="h-8 border-gray-700 text-gray-300"><Printer className="mr-2 h-3.5 w-3.5" />Imprimir folha</Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-[#181818] text-[11px] uppercase tracking-wide text-gray-500">
                <tr><th className="px-4 py-3">Data</th><th className="px-3 py-3">Intrajornada</th><th className="px-3 py-3">Entrada</th><th className="px-3 py-3">Saída int.</th><th className="px-3 py-3">Retorno</th><th className="px-3 py-3">Saída</th><th className="px-3 py-3">Horas</th><th className="px-3 py-3">Saldo</th><th className="px-3 py-3">Observações</th><th className="px-4 py-3 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sheet.days.map((day) => (
                  <tr key={day.date} className="hover:bg-white/[0.025]">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{brDate(day.date)}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${intrajornadaLabel(day) === 'SIM' ? 'bg-blue-950/40 text-blue-300' : 'bg-gray-800 text-gray-400'}`}>{intrajornadaLabel(day)}</span></td>
                    {['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida'].map((kind) => {
                      const record = day.punches[kind];
                      return <td key={kind} className="px-3 py-3">{record ? <button onClick={() => onAdjust(day)} className="font-semibold text-blue-300 hover:underline" title="Corrigir o dia completo">{formatClock(record.recorded_at)}</button> : <span className="text-gray-600">—</span>}</td>;
                    })}
                    <td className="px-3 py-3 font-medium text-gray-200">{day.workedMinutes === null ? '—' : formatMinutes(day.workedMinutes)}</td>
                    <td className={`px-3 py-3 font-semibold ${day.balanceMinutes < 0 ? 'text-red-300' : day.balanceMinutes > 0 ? 'text-emerald-300' : 'text-gray-400'}`}>{formatMinutes(day.balanceMinutes, true)}</td>
                    <td className="px-3 py-3"><span className={`inline-flex max-w-[250px] rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusStyle(day.code)}`}>{day.observation}</span></td>
                    <td className="px-4 py-3 text-right"><button onClick={() => onAdjust(day)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:border-[#ff8c00] hover:text-[#ff9f2e]"><Wrench className="h-3.5 w-3.5" />Corrigir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}

export default function FolhaPonto() {
  const { toast } = useToast();
  const initial = useMemo(() => currentCompetenceRange(), []);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [data, setData] = useState({ employees: [], records: [], schedules: [], justifications: [], sites: [], signatures: [] });
  const [employeeId, setEmployeeId] = useState('');
  const [company, setCompany] = useState('');
  const [siteId, setSiteId] = useState('');
  const [contract, setContract] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('active');
  const [sheetStatus, setSheetStatus] = useState('');
  const [order, setOrder] = useState('site');
  const [validOnly, setValidOnly] = useState(true);
  const [partial, setPartial] = useState(true);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const [adjustment, setAdjustment] = useState(null);
  const [viewMode, setViewMode] = useState('individual');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [nameSearch, setNameSearch] = useState('');

  const refresh = async (recalculate = false) => {
    if (!startDate || !endDate || startDate > endDate) {
      toast({ title: 'Período inválido', description: 'Confira as datas inicial e final.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const result = await loadPonto({ startDate, endDate, month: endDate.slice(0, 7) });
      setData(result);
      if (recalculate) toast({ title: 'Folhas recalculadas', description: 'Escalas, marcações, faltas e saldos foram processados novamente.' });
    } catch (error) {
      toast({ title: 'Erro ao carregar a folha', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const employees = useMemo(() => (data.employees || []).filter((item) =>
    (!employeeId || String(item.id) === employeeId) &&
    (!company || String(item.company_name || 'DIMIVIG') === company) &&
    (!siteId || String(item.site_id || '') === siteId) &&
    (!contract || item.contract === contract) &&
    (!employmentStatus || item.status === employmentStatus)
  ), [data.employees, employeeId, company, siteId, contract, employmentStatus]);

  const sheets = useMemo(() => {
    let values = buildTimesheets({ employees, records: data.records, schedules: data.schedules, justifications: data.justifications, startDate, endDate, partial, validOnly }).map((sheet) => ({ ...sheet, signature: (data.signatures || []).find((item) => String(item.employee_id) === String(sheet.employee.id) && item.start_date === startDate && item.end_date === endDate) }));
    if (sheetStatus === 'pending') values = values.filter((item) => item.summary.absences + item.summary.incomplete > 0);
    if (sheetStatus === 'regular') values = values.filter((item) => item.summary.absences + item.summary.incomplete === 0);
    values.sort(order === 'site'
      ? (a, b) => String(a.employee.site_name || '').localeCompare(String(b.employee.site_name || ''), 'pt-BR') || String(a.employee.name).localeCompare(String(b.employee.name), 'pt-BR')
      : (a, b) => String(a.employee.name).localeCompare(String(b.employee.name), 'pt-BR'));
    return values;
  }, [employees, data.records, data.schedules, data.justifications, data.signatures, startDate, endDate, partial, validOnly, sheetStatus, order]);

  const groupedSheets = useMemo(() => {
    const groups = new Map();
    sheets.filter((sheet) => !nameSearch.trim() || sheet.employee.name.toLowerCase().includes(nameSearch.trim().toLowerCase())).forEach((sheet) => {
      const key = sheet.employee.site_name || 'Sem posto definido';
      groups.set(key, [...(groups.get(key) || []), sheet]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [sheets, nameSearch]);

  const visibleSheets = useMemo(() => sheets.filter((sheet) => !nameSearch.trim() || sheet.employee.name.toLowerCase().includes(nameSearch.trim().toLowerCase())), [sheets, nameSearch]);
  const selectedSheet = visibleSheets.find((sheet) => String(sheet.employee.id) === String(selectedEmployeeId)) || visibleSheets[0] || null;

  const totals = useMemo(() => visibleSheets.reduce((result, sheet) => ({
    worked: result.worked + sheet.summary.workedMinutes,
    absences: result.absences + sheet.summary.absences,
    incomplete: result.incomplete + sheet.summary.incomplete,
    balance: result.balance + sheet.summary.balanceMinutes,
  }), { worked: 0, absences: 0, incomplete: 0, balance: 0 }), [visibleSheets]);

  const toggle = (id) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandAll = () => setExpanded(expanded.size === sheets.length ? new Set() : new Set(sheets.map((sheet) => sheet.employee.id)));
  const periodFile = `${startDate}-a-${endDate}`;
  const rows = useMemo(() => timesheetExportRows(visibleSheets), [visibleSheets]);

  const exportCsv = () => downloadCsv(`cartoes-ponto-${periodFile}.csv`, [exportHeaders, ...rows]);
  const exportExcel = () => {
    const html = `<meta charset="UTF-8"><table><tr>${exportHeaders.map((value) => `<th>${safe(value)}</th>`).join('')}</tr>${rows.map((row) => `<tr>${row.map((value) => `<td>${safe(value)}</td>`).join('')}</tr>`).join('')}</table>`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    link.download = `cartoes-ponto-${periodFile}.xls`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const openAdjustment = (sheet, day) => setAdjustment({ sheet, day });
  const options = (key, fallback = '') => [...new Set((data.employees || []).map((item) => item[key] || fallback).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));

  return (
    <>
      <Helmet><title>Cartões Ponto - Ponto Dimivig</title></Helmet>
      <MainLayout>
        <div className="space-y-6">
          <BackButton />
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff8c00]">Apuração e fechamento</p><h1 className="mt-1 text-3xl font-bold text-white">Folha de Ponto</h1><p className="mt-1 text-sm text-gray-400">Folha individual completa com escala, folgas, ocorrências, horas e conferência.</p></div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportCsv} variant="outline" className="border-gray-700 text-gray-300"><Download className="mr-2 h-4 w-4" />CSV</Button>
              <Button onClick={exportExcel} variant="outline" className="border-gray-700 text-gray-300"><FileSpreadsheet className="mr-2 h-4 w-4" />Excel</Button>
              <Button onClick={() => openTimesheetPrint(visibleSheets, startDate, endDate)} variant="outline" className="border-gray-700 text-gray-300"><Printer className="mr-2 h-4 w-4" />{siteId ? 'PDF de todo o posto' : 'PDF de todos os filtrados'}</Button>
            </div>
          </div>

          <section className="space-y-4 rounded-2xl border border-gray-800 bg-[#282828] p-5 shadow-xl shadow-black/10">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs font-medium text-gray-400">Período inicial<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-[#181818] px-3 py-2.5 text-sm text-white" /></label>
              <label className="text-xs font-medium text-gray-400">Período final<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-[#181818] px-3 py-2.5 text-sm text-white" /></label>
              <label className="text-xs font-medium text-gray-400">Empresa<select value={company} onChange={(event) => setCompany(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-[#181818] px-3 py-2.5 text-sm text-white"><option value="">Todas</option>{options('company_name', 'DIMIVIG').map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-xs font-medium text-gray-400">Contrato<select value={contract} onChange={(event) => setContract(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-[#181818] px-3 py-2.5 text-sm text-white"><option value="">Todos</option>{options('contract').map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-xs font-medium text-gray-400">Posto / local<select value={siteId} onChange={(event) => setSiteId(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-[#181818] px-3 py-2.5 text-sm text-white"><option value="">Todos</option>{(data.sites || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="text-xs font-medium text-gray-400">Colaborador<select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-[#181818] px-3 py-2.5 text-sm text-white"><option value="">Todos</option>{(data.employees || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="text-xs font-medium text-gray-400">Situação da folha<select value={sheetStatus} onChange={(event) => setSheetStatus(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-[#181818] px-3 py-2.5 text-sm text-white"><option value="">Todas</option><option value="regular">Regulares</option><option value="pending">Com pendências</option></select></label>
              <label className="text-xs font-medium text-gray-400">Ordenação<select value={order} onChange={(event) => setOrder(event.target.value)} className="mt-1 block w-full rounded-lg border border-gray-700 bg-[#181818] px-3 py-2.5 text-sm text-white"><option value="employee">Colaborador</option><option value="site">Posto / colaborador</option></select></label>
            </div>
            <div className="flex flex-col gap-4 border-t border-gray-800 pt-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-5 text-sm text-gray-300">
                <label className="flex items-center gap-2"><input type="checkbox" checked={validOnly} onChange={(event) => setValidOnly(event.target.checked)} className="rounded border-gray-600 bg-[#181818] text-[#ff8c00]" />Somente marcações válidas</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={partial} onChange={(event) => setPartial(event.target.checked)} className="rounded border-gray-600 bg-[#181818] text-[#ff8c00]" />Folha parcial até hoje</label>
                <select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value)} className="rounded-lg border border-gray-700 bg-[#181818] px-3 py-1.5 text-sm text-gray-300"><option value="">Ativos e inativos</option><option value="active">Somente ativos</option><option value="inactive">Somente inativos</option></select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => refresh(false)} disabled={loading} className="bg-blue-600 hover:bg-blue-700"><Search className="mr-2 h-4 w-4" />{loading ? 'Processando...' : 'Pesquisar'}</Button>
                <Button onClick={() => refresh(true)} disabled={loading} className="bg-[#ff8c00] text-black hover:bg-[#ff9f2e]"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Recalcular e pesquisar</Button>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ['Cartões encontrados', visibleSheets.length, 'text-white'], ['Horas trabalhadas', formatMinutes(totals.worked), 'text-blue-300'], ['Faltas', totals.absences, totals.absences ? 'text-red-300' : 'text-white'],
              ['Marcações incompletas', totals.incomplete, totals.incomplete ? 'text-amber-300' : 'text-white'], ['Saldo consolidado', formatMinutes(totals.balance, true), totals.balance < 0 ? 'text-red-300' : 'text-emerald-300'],
            ].map(([label, value, color], index) => <div key={label} className={`rounded-xl border border-gray-800 bg-[#252525] p-4 ${index === 4 ? 'col-span-2 lg:col-span-1' : ''}`}><span className="text-xs uppercase tracking-wide text-gray-500">{label}</span><strong className={`mt-1 block text-xl ${color}`}>{value}</strong></div>)}
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-800 bg-[#222]"><div className="flex flex-col gap-4 border-b border-gray-800 p-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="flex items-center gap-2 text-sm text-gray-400"><Clock3 className="h-4 w-4 text-[#ff8c00]" />{brDate(startDate)} a {brDate(endDate)} · todos os dias permanecem visíveis</p><p className="mt-1 text-xs text-gray-600">Abra uma folha sem perder os filtros ou alterne para a conferência completa por posto.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="flex min-w-[260px] items-center gap-2 rounded-xl border border-gray-700 bg-[#171717] px-3 py-2"><UserRoundSearch className="h-4 w-4 text-gray-500"/><input value={nameSearch} onChange={(event)=>setNameSearch(event.target.value)} placeholder="Buscar colaborador..." className="w-full bg-transparent text-sm text-white outline-none"/></label><div className="grid grid-cols-2 rounded-xl border border-gray-700 bg-[#171717] p-1"><button onClick={()=>setViewMode('individual')} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${viewMode==='individual'?'bg-[#ff8c00] text-black':'text-gray-400'}`}><LayoutList className="h-4 w-4"/>Individual</button><button onClick={()=>setViewMode('postos')} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${viewMode==='postos'?'bg-[#ff8c00] text-black':'text-gray-400'}`}><UsersRound className="h-4 w-4"/>Por posto</button></div></div></div>

            {viewMode === 'individual' ? <div className="grid min-h-[680px] xl:grid-cols-[320px_minmax(0,1fr)]"><aside className="max-h-[780px] overflow-y-auto border-b border-gray-800 bg-[#1b1b1b] p-3 xl:border-b-0 xl:border-r"><div className="mb-2 flex items-center justify-between px-2 py-2"><span className="text-xs font-bold uppercase tracking-[.14em] text-gray-500">Colaboradores</span><b className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-gray-400">{visibleSheets.length}</b></div><div className="space-y-2">{visibleSheets.map((sheet)=>{const pending=sheet.summary.absences+sheet.summary.incomplete;const active=selectedSheet&&sheet.employee.id===selectedSheet.employee.id;return <button key={sheet.employee.id} onClick={()=>setSelectedEmployeeId(String(sheet.employee.id))} className={`w-full rounded-xl border p-3 text-left transition ${active?'border-orange-500 bg-orange-500/10 ring-1 ring-orange-500/20':'border-gray-800 bg-[#222] hover:border-gray-600'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><strong className="block truncate text-sm text-white">{sheet.employee.name}</strong><span className="mt-1 block truncate text-xs text-gray-500">{sheet.employee.site_name||'Sem posto'} · {sheet.employee.registration||'sem matrícula'}</span></div><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${pending?'bg-amber-400':'bg-emerald-400'}`}/></div><div className="mt-3 grid grid-cols-3 gap-1 text-center text-[10px]"><span className="rounded bg-black/20 p-1.5 text-gray-400">{formatMinutes(sheet.summary.workedMinutes)}</span><span className="rounded bg-black/20 p-1.5 text-gray-400">{sheet.summary.absences} falta(s)</span><span className="rounded bg-black/20 p-1.5 text-gray-400">{pending} pend.</span></div></button>})}</div></aside><main className="min-w-0 bg-[#202020] p-4">{selectedSheet?<><div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-800 bg-[#191919] p-3"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#ff9f2e]">Folha selecionada</p><h2 className="text-base font-bold text-white">{selectedSheet.employee.name}</h2></div><Button onClick={()=>openTimesheetPrint([selectedSheet],startDate,endDate)} variant="outline" className="border-gray-700 text-gray-300"><Printer className="mr-2 h-4 w-4"/>PDF individual</Button></div><TimesheetCard sheet={selectedSheet} expanded onToggle={()=>{}} onAdjust={(day)=>openAdjustment(selectedSheet,day)} onPrint={(value)=>openTimesheetPrint([value],startDate,endDate)}/></>:!loading&&<div className="grid h-full min-h-[500px] place-items-center text-center text-gray-500"><div><Clock3 className="mx-auto h-9 w-9"/><h2 className="mt-3 font-semibold text-white">Nenhuma folha encontrada</h2><p className="mt-1 text-sm">Ajuste os filtros para localizar o colaborador.</p></div></div>}</main></div> : <div className="space-y-6 p-4">{groupedSheets.map(([siteName,siteSheets])=><section key={siteName} className="space-y-3"><header className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-[#191919] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#ff9f2e]">Posto / lotação</p><h2 className="mt-0.5 font-semibold text-white">{siteName}</h2><span className="text-xs text-gray-500">{siteSheets.length} colaborador(es) · {siteSheets.filter((item)=>item.signature).length} assinada(s)</span></div><div className="flex gap-2"><button onClick={expandAll} className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-gray-300">{expanded.size===visibleSheets.length&&visibleSheets.length?'Recolher':'Expandir'}</button><Button onClick={()=>openTimesheetPrint(siteSheets,startDate,endDate)} variant="outline" className="border-gray-700 text-gray-300"><Printer className="mr-2 h-4 w-4"/>PDF do posto</Button></div></header>{siteSheets.map((sheet)=><TimesheetCard key={sheet.employee.id} sheet={sheet} expanded={expanded.has(sheet.employee.id)} onToggle={()=>toggle(sheet.employee.id)} onAdjust={(day)=>openAdjustment(sheet,day)} onPrint={(value)=>openTimesheetPrint([value],startDate,endDate)}/>)}</section>)}{!loading&&!visibleSheets.length&&<div className="rounded-2xl border border-dashed border-gray-700 px-6 py-14 text-center text-gray-500">Nenhuma folha encontrada.</div>}</div>}
          </section>
        </div>
      </MainLayout>
      {adjustment && <TimesheetAdjustmentModal sheet={adjustment.sheet} day={adjustment.day} employees={data.employees || []} occurrenceTypes={data.occurrenceTypes || []} onClose={() => setAdjustment(null)} onSaved={() => refresh(true)} toast={toast} />}
    </>
  );
}
