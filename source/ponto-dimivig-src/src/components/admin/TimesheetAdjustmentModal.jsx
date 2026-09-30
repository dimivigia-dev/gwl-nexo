import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, CalendarDays, Camera, CheckCircle2, Clock3, Minus, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPonto, fileToDataUrl, updatePonto } from '@/services/pontoApi';
import { activeOccurrenceNames, markKinds } from '@/constants/operationalCatalog';
import { formatClock } from '@/utils/timesheetEngine';

const inputClass = 'w-full rounded-lg border border-gray-700 bg-[#171717] px-3 py-2.5 text-white outline-none focus:border-[#ff8c00]';
const addDays = (date, amount) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + amount); return value.toISOString().slice(0, 10); };
const minutes = (value) => { const [hour, minute] = String(value || '').split(':').map(Number); return Number.isFinite(hour) ? hour * 60 + (minute || 0) : 0; };
const moveTime = (value, amount) => { if (!value) return value; const total = (minutes(value) + amount + 1440) % 1440; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; };

const normalizeTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  let hour = 0; let minute = 0;
  if (digits.length <= 2) hour = Number(digits);
  else { hour = Number(digits.slice(0, -2)); minute = Number(digits.slice(-2)); }
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

function TimeEditor({ label, short, value, original, planned, onChange, autoFocus }) {
  const [draft, setDraft] = useState(value || '');
  const [invalid, setInvalid] = useState(false);
  const ref = useRef(null);
  useEffect(() => { setDraft(value || ''); setInvalid(false); }, [value]);
  const commit = () => { const normalized = normalizeTime(draft); if (normalized === null) { setInvalid(true); return; } setInvalid(false); setDraft(normalized); onChange(normalized); };
  const keyDown = (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); const normalized = normalizeTime(draft) || planned || '00:00'; onChange(moveTime(normalized, event.key === 'ArrowUp' ? 5 : -5)); }
    if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); }
    if (event.key === 'Escape') { setDraft(value || ''); setInvalid(false); event.currentTarget.blur(); }
  };
  return <article className={`rounded-xl border p-3 transition ${invalid ? 'border-red-500 bg-red-950/20' : value ? 'border-emerald-800/50 bg-emerald-950/15' : 'border-gray-700 bg-[#171717]'}`}><div className="flex items-center justify-between"><b className="rounded bg-white/5 px-2 py-1 text-[10px] text-gray-500">{short}</b><span className="text-xs font-semibold text-gray-300">{label}</span></div><div className="mt-3 flex items-center rounded-lg border border-gray-700 bg-black/20 px-2 focus-within:border-[#ff8c00]"><Clock3 className="h-4 w-4 text-gray-600"/><input ref={ref} autoFocus={autoFocus} inputMode="numeric" autoComplete="off" value={draft} onChange={(event)=>{setDraft(event.target.value.replace(/[^0-9:]/g,'').slice(0,5));setInvalid(false);}} onFocus={(event)=>event.currentTarget.select()} onBlur={commit} onKeyDown={keyDown} placeholder="--:--" className="w-full bg-transparent px-2 py-3 text-center text-2xl font-bold tracking-wider text-white outline-none"/><button type="button" onClick={()=>{setDraft('');onChange('');}} className="rounded p-1 text-gray-600 hover:bg-red-500/10 hover:text-red-300" title="Retirar marcação"><Trash2 className="h-4 w-4"/></button></div><div className="mt-2 flex items-center justify-between text-[10px] text-gray-600"><span>Original: <b className="text-gray-400">{original || '—'}</b></span><button type="button" onClick={()=>onChange(planned)} className="text-blue-300 hover:underline">Previsto {planned || '—'}</button></div><div className="mt-2 grid grid-cols-4 gap-1">{[-5,-1,1,5].map((amount)=><button type="button" key={amount} onClick={()=>onChange(moveTime(value || planned || '00:00',amount))} className="rounded bg-white/5 py-1.5 text-[10px] font-semibold text-gray-400 hover:bg-white/10 hover:text-white">{amount>0?'+':''}{amount}m</button>)}</div>{invalid&&<p className="mt-2 text-[10px] text-red-300">Use um horário entre 00:00 e 23:59.</p>}</article>;
}

export default function TimesheetAdjustmentModal({ sheet, day, employees = [], occurrenceTypes = [], onClose, onSaved, toast }) {
  const initialTimes = useMemo(() => Object.fromEntries(markKinds.map(({ id }) => [id, day.punches[id] ? formatClock(day.punches[id].recorded_at) : ''])), [day]);
  const plannedTimes = useMemo(() => ({
    entrada: day.schedule.expected_start || '', saida_intervalo: day.schedule.expected_break_start || '',
    retorno_intervalo: day.schedule.expected_break_end || '', saida: day.schedule.expected_end || '',
  }), [day]);
  const [mode, setMode] = useState('marks');
  const [times, setTimes] = useState(initialTimes);
  const [reason, setReason] = useState('Ajuste administrativo conferido pela gestão');
  const names = useMemo(() => activeOccurrenceNames({ occurrenceTypes }), [occurrenceTypes]);
  const [kind, setKind] = useState(names[0] || 'Ajuste de ponto');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [relatedEmployeeId, setRelatedEmployeeId] = useState('');
  const [relatedDate, setRelatedDate] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [saving, setSaving] = useState(false);
  const isPermuta = kind.toLowerCase() === 'permuta';
  const overnight = minutes(day.schedule.expected_end) <= minutes(day.schedule.expected_start);

  useEffect(() => { const close = (event) => { if (event.key === 'Escape' && event.target?.tagName !== 'INPUT') onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);

  const recordDateTime = (markKind, time) => {
    const existing = day.punches[markKind];
    if (existing) {
      const existingDate = String(existing.recorded_at).slice(0, 10);
      return `${existingDate}T${time}:00`;
    }
    const nextDay = overnight && markKind !== 'entrada' && minutes(time) < minutes(day.schedule.expected_start);
    return `${nextDay ? addDays(day.date, 1) : day.date}T${time}:00`;
  };

  const saveMarks = async () => {
    if (!reason.trim()) throw new Error('Informe o motivo da correção para manter a auditoria.');
    const actions = markKinds.map(async ({ id }) => {
      const existing = day.punches[id];
      const time = times[id];
      if (existing && !time) return updatePonto('record', existing.id, { status: 'invalid', notes: `${reason} · Marcação retirada do cálculo` });
      if (existing && time) return updatePonto('record', existing.id, { recordedAt: recordDateTime(id, time), status: 'valid', notes: reason });
      if (!existing && time) return createPonto('record', { employeeId: sheet.employee.id, kind: id, recordedAt: recordDateTime(id, time), source: 'manual', notes: reason });
      return null;
    });
    await Promise.all(actions);
  };

  const saveOccurrence = async () => {
    if (!reason.trim()) throw new Error('Descreva o motivo ou documento que comprova o lançamento.');
    if (isPermuta && !attachment) throw new Error('Adicione a foto obrigatória para registrar a permuta.');
    if (isPermuta && relatedEmployeeId && !relatedDate) throw new Error('Informe a data correspondente quando houver substituto.');
    await createPonto('justification', {
      employeeId: sheet.employee.id, occurrenceDate: day.date, endDate, startTime, endTime,
      kind, reason, relatedEmployeeId: isPermuta ? relatedEmployeeId : '', relatedDate: isPermuta ? relatedDate : '',
      attachmentDataUrl: attachment ? await fileToDataUrl(attachment) : '', attachmentName: attachment?.name || '',
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      if (mode === 'marks') await saveMarks(); else await saveOccurrence();
      toast({ title: mode === 'marks' ? 'Horários ajustados' : isPermuta ? 'Permuta enviada para aprovação' : 'Justificativa registrada', description: 'A folha será recalculada e o histórico permanecerá disponível para auditoria.' });
      await onSaved();
      onClose();
    } catch (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[96vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-gray-700 bg-[#232323] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-700 bg-[#232323]/95 p-5 backdrop-blur">
          <div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#ff9f2e]">Tratamento da folha</p><h2 className="mt-1 text-xl font-bold text-white">{sheet.employee.name}</h2><p className="mt-1 text-sm text-gray-400">{new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')} · {sheet.employee.site_name || 'Sem posto'} · {sheet.employee.schedule}</p></div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 rounded-xl border border-gray-700 bg-[#171717] p-1">
            <button onClick={() => setMode('marks')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${mode === 'marks' ? 'bg-[#ff8c00] text-black' : 'text-gray-400'}`}><Clock3 className="h-4 w-4" />Corrigir horários</button>
            <button onClick={() => setMode('occurrence')} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ${mode === 'occurrence' ? 'bg-[#ff8c00] text-black' : 'text-gray-400'}`}><CalendarDays className="h-4 w-4" />Justificar / Permuta</button>
          </div>

          {mode === 'marks' ? <>
            <section className="rounded-xl border border-gray-700 bg-[#1c1c1c] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-white">Marcações do dia</h3><p className="mt-1 text-xs text-gray-500">Edite os quatro horários de uma vez. Campos vazios são retirados do cálculo sem apagar o histórico.</p></div><div className="flex gap-2"><button onClick={() => setTimes(plannedTimes)} className="rounded-lg border border-blue-800/60 bg-blue-950/30 px-3 py-2 text-xs font-semibold text-blue-300">Usar jornada prevista</button><button onClick={() => setTimes(initialTimes)} className="rounded-lg border border-gray-700 px-3 py-2 text-xs text-gray-300"><RotateCcw className="mr-1 inline h-3.5 w-3.5" />Restaurar</button></div></div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{markKinds.map(({ id, label, short }, index) => <TimeEditor key={id} label={label} short={short} value={times[id]} original={initialTimes[id]} planned={plannedTimes[id]} autoFocus={index===0} onChange={(value)=>setTimes((current)=>({...current,[id]:value}))}/>)}</div>
              <div className="mt-3 rounded-lg border border-gray-800 bg-black/20 p-3 text-xs leading-relaxed text-gray-400"><strong className="text-gray-200">Digitação rápida:</strong> escreva <b>830</b> para 08:30, use ↑/↓ para avançar 5 minutos e Tab para seguir ao próximo horário.</div>
              {overnight && <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-950/25 p-3 text-xs text-blue-200"><CheckCircle2 className="h-4 w-4" />Jornada noturna detectada: horários após a meia-noite serão vinculados ao dia seguinte automaticamente.</div>}
            </section>
          </> : <section className="space-y-4 rounded-xl border border-gray-700 bg-[#1c1c1c] p-4">
            <div><h3 className="font-semibold text-white">Motivo do lançamento</h3><p className="mt-1 text-xs text-gray-500">O catálogo administrativo reúne ausências, licenças, compensações, ajustes e permutas.</p></div>
            <label className="block text-sm text-gray-300">Tipo<select value={kind} onChange={(event) => setKind(event.target.value)} className={`mt-1 ${inputClass}`}>{names.map((name) => <option key={name}>{name}</option>)}</select></label>
            {isPermuta ? <div className="rounded-xl border border-orange-800/50 bg-orange-950/15 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-orange-200"><ArrowRightLeft className="h-4 w-4" />Configurar permuta de escala</div><p className="mt-1 text-xs leading-relaxed text-orange-200/70">A foto é obrigatória. O substituto pode ficar em branco e ser definido posteriormente pela gestão.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm text-gray-300">Substituto (opcional)<select value={relatedEmployeeId} onChange={(event) => setRelatedEmployeeId(event.target.value)} className={`mt-1 ${inputClass}`}><option value="">Ainda não definido</option>{employees.filter((item) => String(item.id) !== String(sheet.employee.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.site_name || 'Sem posto'}</option>)}</select></label><label className="text-sm text-gray-300">Data correspondente {relatedEmployeeId ? '' : '(opcional)'}<input type="date" value={relatedDate} onChange={(event) => setRelatedDate(event.target.value)} className={`mt-1 ${inputClass}`} /></label><label className="sm:col-span-2 text-sm text-gray-300">Foto obrigatória<input type="file" accept="image/*" capture="environment" onChange={(event) => setAttachment(event.target.files?.[0] || null)} className={`mt-1 ${inputClass}`} /><span className="mt-2 flex items-center gap-2 text-xs text-orange-200"><Camera className="h-4 w-4" />{attachment ? attachment.name : 'Fotografe a escala, autorização ou documento da permuta'}</span></label></div></div> : <><div className="grid gap-3 sm:grid-cols-3"><label className="text-sm text-gray-300">Até a data (opcional)<input type="date" min={day.date} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={`mt-1 ${inputClass}`} /></label><label className="text-sm text-gray-300">Início (opcional)<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={`mt-1 ${inputClass}`} /></label><label className="text-sm text-gray-300">Fim (opcional)<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className={`mt-1 ${inputClass}`} /></label></div><label className="block text-sm text-gray-300">Comprovante (opcional)<input type="file" accept="image/*,.pdf" onChange={(event) => setAttachment(event.target.files?.[0] || null)} className={`mt-1 ${inputClass}`} /></label></>}
          </section>}

          <label className="block text-sm text-gray-300">Motivo, documento ou conferência<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows="3" className={`mt-1 resize-none ${inputClass}`} placeholder="Descreva o ajuste para a auditoria" /></label>
          <div className="flex items-start gap-2 rounded-xl border border-amber-800/40 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Alterações manuais e aprovações ficam identificadas no histórico com usuário, data, valor anterior e valor novo.</div>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-700 bg-[#232323]/95 p-5 backdrop-blur"><Button variant="outline" onClick={onClose} className="border-gray-600 text-gray-200">Cancelar</Button><Button onClick={save} disabled={saving} className="bg-[#ff8c00] font-semibold text-black hover:bg-[#ff9f2e]">{saving ? 'Salvando...' : mode === 'marks' ? 'Salvar horários e recalcular' : 'Enviar lançamento'}</Button></footer>
      </div>
    </div>
  );
}
