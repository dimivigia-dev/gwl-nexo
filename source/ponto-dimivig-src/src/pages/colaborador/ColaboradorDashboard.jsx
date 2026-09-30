import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import MainLayout from '@/components/layout/MainLayout';
import TimeClock from '@/components/colaborador/TimeClock';
import TimesheetSignaturePad from '@/components/colaborador/TimesheetSignaturePad';
import { useAuth } from '@/contexts/AuthContext';
import { AlertCircle, CalendarDays, Camera, CheckCircle2, Clock3, FileCheck2, FileText, PenLine, Printer, Send } from 'lucide-react';
import { createPonto, fileToDataUrl, loadPonto } from '@/services/pontoApi';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { activeOccurrenceNames } from '@/constants/operationalCatalog';
import { buildTimesheets, formatClock, formatMinutes } from '@/utils/timesheetEngine';
import { openTimesheetPrint } from '@/utils/timesheetPrint';

const isoDate = (year, month, day) => { const value = new Date(year, month, day, 12); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; };
const competence = (reference = new Date()) => ({ startDate: isoDate(reference.getFullYear(), reference.getMonth() - 1, 21), endDate: isoDate(reference.getFullYear(), reference.getMonth(), 20) });
const brDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const field = 'w-full rounded-lg border border-gray-700 bg-[#171717] px-3 py-2.5 text-sm text-white outline-none focus:border-[#ff8c00]';

export default function ColaboradorDashboard() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const period = useMemo(() => competence(), []);
  const [tab, setTab] = useState('clock');
  const [data, setData] = useState({ employees: [], records: [], schedules: [], justifications: [], occurrenceTypes: [], signatures: [] });
  const [request, setRequest] = useState({ occurrenceDate: new Date().toISOString().slice(0, 10), endDate: '', startTime: '', endTime: '', kind: 'Falta justificada', reason: '', relatedDate: '' });
  const [attachment, setAttachment] = useState(null);
  const [saving, setSaving] = useState(false);
  const refresh = async () => { try { setData(await loadPonto({ ...period, month: period.endDate.slice(0, 7) })); } catch (error) { toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' }); } };
  useEffect(() => { refresh(); const listener = () => refresh(); window.addEventListener('dimivig:ponto-updated', listener); return () => window.removeEventListener('dimivig:ponto-updated', listener); }, []);

  const employee = (data.employees || []).find((item) => String(item.id) === String(userProfile?.employeeId)) || data.employees?.[0];
  const types = useMemo(() => activeOccurrenceNames(data.occurrenceTypes), [data.occurrenceTypes]);
  const [sheet] = useMemo(() => employee ? buildTimesheets({ employees: [employee], records: data.records, schedules: data.schedules, justifications: data.justifications, startDate: period.startDate, endDate: period.endDate, partial: true, validOnly: true }) : [], [employee, data.records, data.schedules, data.justifications, period]);
  const ownRequests = (data.justifications || []).filter((item) => String(item.employee_id) === String(employee?.id));
  const signature = (data.signatures || []).find((item) => String(item.employee_id) === String(employee?.id) && item.start_date === period.startDate && item.end_date === period.endDate);
  const isPermuta = request.kind.toLowerCase() === 'permuta';

  const submitRequest = async () => {
    if (!employee?.id || !request.reason.trim()) return;
    if (isPermuta && !attachment) return toast({ title: 'Foto obrigatória', description: 'Fotografe a escala ou autorização da permuta.', variant: 'destructive' });
    setSaving(true);
    try {
      await createPonto('justification', { ...request, employeeId: employee.id, attachmentDataUrl: attachment ? await fileToDataUrl(attachment) : '', attachmentName: attachment?.name || '' });
      setRequest({ ...request, reason: '', endDate: '', startTime: '', endTime: '', relatedDate: '' });
      setAttachment(null);
      await refresh();
      toast({ title: 'Solicitação enviada', description: 'A gestão poderá conferir o motivo e o comprovante.' });
    } catch (error) { toast({ title: 'Não foi possível enviar', description: error.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const signSheet = async (signatureDataUrl, signedName) => {
    setSaving(true);
    try {
      await createPonto('timesheetSignature', { employeeId: employee.id, ...period, signedName, signatureDataUrl });
      await refresh();
      toast({ title: 'Folha assinada', description: 'A assinatura foi vinculada ao período e já aparecerá no PDF.' });
    } catch (error) { toast({ title: 'Não foi possível assinar', description: error.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const tabs = [
    { id: 'clock', label: 'Registrar ponto', icon: Clock3 },
    { id: 'requests', label: 'Justificativas', icon: FileText, badge: ownRequests.filter((item) => item.status === 'pending').length },
    { id: 'sheet', label: 'Minha folha', icon: CalendarDays, badge: signature ? '✓' : '' },
  ];

  return <><Helmet><title>Meu Ponto - Ponto Dimivig</title></Helmet><MainLayout><div className="space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[.2em] text-[#ff9f2e]">Portal do colaborador</p><h1 className="mt-1 text-3xl font-bold text-white">Olá, {userProfile?.nome?.split(' ')[0]}</h1><p className="mt-1 text-sm text-gray-400">Registre o ponto, envie documentos, acompanhe solicitações e assine sua folha.</p></header>
    <nav className="grid grid-cols-1 gap-2 rounded-2xl border border-gray-800 bg-[#252525] p-2 sm:grid-cols-3">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${tab === item.id ? 'bg-[#ff8c00] text-black shadow-lg' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}><item.icon className="h-4 w-4" />{item.label}{item.badge !== '' && item.badge !== undefined && <b className={`rounded-full px-2 py-0.5 text-[10px] ${tab === item.id ? 'bg-black/15' : 'bg-white/10'}`}>{item.badge}</b>}</button>)}</nav>

    {employee && sheet && <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><article className="rounded-xl border border-gray-800 bg-[#252525] p-4"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-gray-500">Meu posto</span><strong className="mt-1 block truncate text-sm text-white">{employee.site_name || 'Não vinculado'}</strong><small className="mt-1 block text-gray-500">{employee.registration || 'Sem matrícula'}</small></article><article className="rounded-xl border border-gray-800 bg-[#252525] p-4"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-gray-500">Minha jornada</span><strong className="mt-1 block text-sm text-white">{employee.schedule || 'Não definida'}</strong><small className="mt-1 block text-gray-500">{employee.expected_start || '—'} às {employee.expected_end || '—'}</small></article><article className="rounded-xl border border-gray-800 bg-[#252525] p-4"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-gray-500">Competência</span><strong className="mt-1 block text-sm text-white">{brDate(period.startDate)} a {brDate(period.endDate)}</strong><small className="mt-1 block text-gray-500">{formatMinutes(sheet.summary.workedMinutes)} trabalhadas</small></article><article className="rounded-xl border border-gray-800 bg-[#252525] p-4"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-gray-500">Situação</span><strong className={`mt-1 block text-sm ${sheet.summary.absences + sheet.summary.incomplete ? 'text-amber-300' : 'text-emerald-300'}`}>{sheet.summary.absences + sheet.summary.incomplete ? `${sheet.summary.absences + sheet.summary.incomplete} pendência(s)` : 'Folha regular'}</strong><small className="mt-1 block text-gray-500">{ownRequests.filter((item)=>item.status==='pending').length} solicitação(ões) em análise</small></article></section>}

    {tab === 'clock' && <TimeClock />}

    {tab === 'requests' && <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-2xl border border-gray-800 bg-[#252525] p-5"><div className="flex items-start gap-3"><span className="rounded-lg bg-orange-500/10 p-2 text-[#ff9f2e]"><Send className="h-5 w-5" /></span><div><h2 className="font-semibold text-white">Nova justificativa</h2><p className="mt-1 text-xs text-gray-400">Informe o motivo da falta, ajuste, licença ou permuta e anexe o comprovante.</p></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs text-gray-400">Data inicial<input type="date" value={request.occurrenceDate} onChange={(event) => setRequest({ ...request, occurrenceDate: event.target.value })} className={`mt-1 ${field}`} /></label><label className="text-xs text-gray-400">Data final (opcional)<input type="date" min={request.occurrenceDate} value={request.endDate} onChange={(event) => setRequest({ ...request, endDate: event.target.value })} className={`mt-1 ${field}`} /></label><label className="sm:col-span-2 text-xs text-gray-400">Tipo<select value={request.kind} onChange={(event) => setRequest({ ...request, kind: event.target.value })} className={`mt-1 ${field}`}>{types.map((name) => <option key={name}>{name}</option>)}</select></label>{!isPermuta && <><label className="text-xs text-gray-400">Horário inicial (opcional)<input type="time" value={request.startTime} onChange={(event) => setRequest({ ...request, startTime: event.target.value })} className={`mt-1 ${field}`} /></label><label className="text-xs text-gray-400">Horário final (opcional)<input type="time" value={request.endTime} onChange={(event) => setRequest({ ...request, endTime: event.target.value })} className={`mt-1 ${field}`} /></label></>}{isPermuta && <label className="sm:col-span-2 text-xs text-gray-400">Outra data da troca (opcional)<input type="date" value={request.relatedDate} onChange={(event) => setRequest({ ...request, relatedDate: event.target.value })} className={`mt-1 ${field}`} /></label>}<label className="sm:col-span-2 text-xs text-gray-400">Justificativa<textarea rows="4" value={request.reason} onChange={(event) => setRequest({ ...request, reason: event.target.value })} placeholder="Explique o ocorrido com detalhes" className={`mt-1 resize-none ${field}`} /></label><label className="sm:col-span-2 text-xs text-gray-400">{isPermuta ? 'Foto obrigatória' : 'Comprovante (imagem ou PDF)'}<input type="file" accept={isPermuta ? 'image/*' : 'image/*,.pdf'} capture={isPermuta ? 'environment' : undefined} onChange={(event) => setAttachment(event.target.files?.[0] || null)} className={`mt-1 ${field}`} />{isPermuta && <span className="mt-2 flex items-center gap-2 text-xs text-orange-300"><Camera className="h-4 w-4" />O substituto não é obrigatório; a gestão poderá defini-lo depois.</span>}</label></div><Button onClick={submitRequest} disabled={saving || !request.reason.trim()} className="mt-4 w-full bg-[#ff8c00] font-semibold text-black hover:bg-[#ff9f2e]"><Send className="mr-2 h-4 w-4" />{saving ? 'Enviando...' : 'Enviar para análise'}</Button></section>
      <section className="overflow-hidden rounded-2xl border border-gray-800 bg-[#252525]"><header className="border-b border-gray-800 p-5"><h2 className="font-semibold text-white">Minhas solicitações</h2><p className="mt-1 text-xs text-gray-400">Acompanhe aprovações, recusas e comprovantes enviados.</p></header><div className="max-h-[630px] space-y-2 overflow-y-auto p-4">{ownRequests.map((item) => <article key={item.id} className="rounded-xl border border-gray-700 bg-[#1c1c1c] p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm text-white">{item.kind}</strong><p className="mt-1 text-xs text-gray-400">{brDate(item.occurrence_date)}{item.end_date ? ` a ${brDate(item.end_date)}` : ''}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.status === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : item.status === 'rejected' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>{item.status === 'approved' ? 'APROVADA' : item.status === 'rejected' ? 'RECUSADA' : 'EM ANÁLISE'}</span></div><p className="mt-3 text-sm leading-relaxed text-gray-300">{item.reason}</p>{item.attachment_key && <a href={`/api/ponto?entity=justification-evidence&id=${item.id}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-blue-300 hover:underline"><FileCheck2 className="h-4 w-4" />Abrir comprovante</a>}</article>)}{!ownRequests.length && <div className="py-16 text-center text-sm text-gray-500"><FileText className="mx-auto mb-3 h-8 w-8" />Nenhuma solicitação enviada.</div>}</div></section>
    </div>}

    {tab === 'sheet' && sheet && <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-gray-800 bg-[#252525]"><header className="flex flex-col gap-3 border-b border-gray-800 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#ff9f2e]">Folha de Ponto</p><h2 className="mt-1 text-xl font-bold text-white">{brDate(period.startDate)} a {brDate(period.endDate)}</h2><p className="mt-1 text-xs text-gray-400">{employee?.name} · {employee?.site_name || 'Sem posto'}</p></div><Button onClick={() => openTimesheetPrint([{ ...sheet, signature }], period.startDate, period.endDate)} variant="outline" className="border-gray-700 text-gray-300"><Printer className="mr-2 h-4 w-4" />Abrir Folha de Ponto</Button></header><div className="grid grid-cols-2 gap-px bg-gray-800 sm:grid-cols-4"><div className="bg-[#1c1c1c] p-4"><span className="text-[10px] uppercase text-gray-500">Horas</span><strong className="mt-1 block text-lg text-white">{formatMinutes(sheet.summary.workedMinutes)}</strong></div><div className="bg-[#1c1c1c] p-4"><span className="text-[10px] uppercase text-gray-500">Faltas</span><strong className="mt-1 block text-lg text-red-300">{sheet.summary.absences}</strong></div><div className="bg-[#1c1c1c] p-4"><span className="text-[10px] uppercase text-gray-500">Pendências</span><strong className="mt-1 block text-lg text-amber-300">{sheet.summary.incomplete}</strong></div><div className="bg-[#1c1c1c] p-4"><span className="text-[10px] uppercase text-gray-500">Saldo</span><strong className="mt-1 block text-lg text-blue-300">{formatMinutes(sheet.summary.balanceMinutes, true)}</strong></div></div><div className="max-h-[560px] overflow-auto"><table className="w-full min-w-[780px] text-left text-xs"><thead className="sticky top-0 bg-[#171717] uppercase text-gray-500"><tr><th className="px-4 py-3">Data</th><th>Intrajornada</th><th>Entrada</th><th>Intervalo</th><th>Retorno</th><th>Saída</th><th>Observação</th></tr></thead><tbody className="divide-y divide-gray-800">{sheet.days.map((day) => <tr key={day.date}><td className="px-4 py-3 text-white">{brDate(day.date)}</td><td className="text-gray-400">{day.schedule.required ? (day.schedule.expected_break_start && day.schedule.expected_break_end ? 'SIM' : 'NÃO') : '—'}</td>{['entrada','saida_intervalo','retorno_intervalo','saida'].map((kind) => <td key={kind} className="text-gray-300">{formatClock(day.punches[kind]?.recorded_at)}</td>)}<td className="max-w-56 py-3 pr-4 text-gray-400">{day.observation}</td></tr>)}</tbody></table></div></section>
      {signature ? <section className="flex items-start gap-3 rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-5"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" /><div><h3 className="font-semibold text-emerald-200">Folha assinada</h3><p className="mt-1 text-sm text-emerald-200/70">Assinada por {signature.signed_name} em {new Date(signature.signed_at).toLocaleString('pt-BR')}.</p><a href={`/api/ponto?entity=signature&id=${signature.id}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-emerald-300 hover:underline"><PenLine className="h-4 w-4" />Visualizar assinatura</a></div></section> : <TimesheetSignaturePad defaultName={employee?.name || userProfile?.nome} periodLabel={`${brDate(period.startDate)} a ${brDate(period.endDate)}`} onSave={signSheet} saving={saving} />}
    </div>}

    {!employee && <div className="rounded-2xl border border-amber-800/50 bg-amber-950/20 p-5 text-amber-200"><AlertCircle className="mr-2 inline h-5 w-5" />Seu acesso ainda não está vinculado a um cadastro de colaborador.</div>}
  </div></MainLayout></>;
}
