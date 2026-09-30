const DAY_MS = 86400000;
const MAX_SHIFT_MS = 20 * 60 * 60 * 1000;

const pad = (value) => String(value).padStart(2, '0');

export function localDateKey(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateRange(startDate, endDate) {
  const values = [];
  const current = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (current <= end && values.length < 63) {
    values.push(localDateKey(current));
    current.setDate(current.getDate() + 1);
  }
  return values;
}

export function formatClock(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 16) || '—';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatMinutes(value, signed = false) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const minutes = Math.round(Number(value));
  const sign = minutes < 0 ? '−' : signed && minutes > 0 ? '+' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

function clockMinutes(value) {
  const [hours, minutes] = String(value || '').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function expectedMinutes(schedule) {
  const start = clockMinutes(schedule.expected_start);
  let end = clockMinutes(schedule.expected_end);
  const breakStart = clockMinutes(schedule.expected_break_start);
  let breakEnd = clockMinutes(schedule.expected_break_end);
  if (start === null || end === null) return 0;
  if (end <= start) end += 1440;
  let breakDuration = 0;
  if (breakStart !== null && breakEnd !== null) {
    if (breakEnd < breakStart) breakEnd += 1440;
    breakDuration = Math.max(0, breakEnd - breakStart);
  }
  return Math.max(0, end - start - breakDuration);
}

function dayDifference(start, end) {
  return Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY_MS);
}

function groupEmployeeRecords(records) {
  const groups = new Map();
  let activeDate = '';
  let activeStart = 0;
  [...records].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)).forEach((record) => {
    const timestamp = new Date(record.recorded_at).getTime();
    if (record.kind === 'entrada') {
      activeDate = localDateKey(record.recorded_at);
      activeStart = timestamp;
    }
    const date = activeDate && timestamp - activeStart <= MAX_SHIFT_MS ? activeDate : localDateKey(record.recorded_at);
    groups.set(date, [...(groups.get(date) || []), record]);
    if (record.kind === 'saida') {
      activeDate = '';
      activeStart = 0;
    }
  });
  return groups;
}

function actualMinutes(punches) {
  const entry = punches.entrada ? new Date(punches.entrada.recorded_at).getTime() : NaN;
  const exit = punches.saida ? new Date(punches.saida.recorded_at).getTime() : NaN;
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || exit <= entry) return null;
  let total = (exit - entry) / 60000;
  if (punches.saida_intervalo && punches.retorno_intervalo) {
    const breakStart = new Date(punches.saida_intervalo.recorded_at).getTime();
    const breakEnd = new Date(punches.retorno_intervalo.recorded_at).getTime();
    if (breakEnd > breakStart) total -= (breakEnd - breakStart) / 60000;
  }
  return Math.max(0, Math.round(total));
}

function inferredSchedule(employee, date, explicit, anchor, hasRecords) {
  if (explicit) return { ...explicit, required: Number(explicit.required) !== 0, inferred: false, configured: true };
  const defaults = {
    shift: employee.schedule || 'Personalizada',
    expected_start: employee.expected_start || '06:00',
    expected_break_start: employee.expected_break_start || '12:00',
    expected_break_end: employee.expected_break_end || '13:00',
    expected_end: employee.expected_end || '18:00',
    inferred: true,
    configured: true,
  };
  if (Number(employee.registers_point) === 0) return { ...defaults, required: false, configured: true, disabled: true };
  const shift = String(employee.schedule || '').toLowerCase();
  if (shift.includes('12x36')) {
    if (!anchor) return { ...defaults, required: hasRecords, configured: false };
    return { ...defaults, required: Math.abs(dayDifference(anchor, date)) % 2 === 0 };
  }
  if (shift.includes('44')) {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    return { ...defaults, required: weekday !== 0 };
  }
  return { ...defaults, required: hasRecords, configured: false };
}

function recordPunches(records) {
  const punches = {};
  records.forEach((record) => {
    if (!punches[record.kind]) punches[record.kind] = record;
  });
  return punches;
}

function approvedJustification(items) {
  return items.find((item) => item.status === 'approved');
}

function justificationAbatesDebit(item) {
  if (!item) return false;
  const kind = String(item.kind || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return !(/FALTA INJUSTIFICADA|SUSPENSAO|BANCO DE HORAS.*DEBITO/.test(kind));
}

function calculateDay({ employee, date, records, schedule, justifications, today, partial }) {
  const punches = recordPunches(records);
  const plannedMinutes = schedule.required ? expectedMinutes(schedule) : 0;
  const workedMinutes = actualMinutes(punches);
  const approved = approvedJustification(justifications);
  const approvedWithCredit = approved && justificationAbatesDebit(approved) ? approved : null;
  const pending = justifications.find((item) => item.status === 'pending');
  const invalid = records.some((record) => record.status === 'invalid');
  const hasRecords = records.length > 0;
  const hasExpectedBreak = Boolean(schedule.expected_break_start && schedule.expected_break_end);
  const complete = Boolean(punches.entrada && punches.saida && (!hasExpectedBreak || (punches.saida_intervalo && punches.retorno_intervalo)));
  const future = partial && date > today;
  let code = 'ok';
  let observation = 'JORNADA COMPLETA';
  let balanceMinutes = workedMinutes === null ? 0 : workedMinutes - plannedMinutes;

  if (schedule.disabled) {
    code = 'disabled';
    observation = 'NÃO REGISTRA PONTO';
    balanceMinutes = 0;
  } else if (future) {
    code = 'future';
    observation = 'AGUARDANDO PERÍODO';
    balanceMinutes = 0;
  } else if (!hasRecords && !schedule.required) {
    code = schedule.configured ? 'day-off' : 'unconfigured';
    observation = schedule.notes || (schedule.configured ? 'FOLGA ESCALA' : 'ESCALA NÃO CONFIGURADA');
    balanceMinutes = 0;
  } else if (!hasRecords && schedule.required && approvedWithCredit) {
    code = 'justified';
    observation = `${approvedWithCredit.kind || 'JUSTIFICADO'} — ${approvedWithCredit.reason}`;
    balanceMinutes = 0;
  } else if (!hasRecords && schedule.required && approved) {
    code = 'absence';
    observation = `${approved.kind || 'FALTA'} — ${approved.reason}`;
    balanceMinutes = -plannedMinutes;
  } else if (!hasRecords && schedule.required) {
    code = 'absence';
    observation = pending ? `FALTA — JUSTIFICATIVA PENDENTE: ${pending.kind}` : 'FALTA';
    balanceMinutes = -plannedMinutes;
  } else if (!complete) {
    code = 'incomplete';
    observation = approvedWithCredit ? `MARCAÇÃO INCOMPLETA — ${approvedWithCredit.kind}` : 'MARCAÇÃO INCOMPLETA';
  } else if (!schedule.required) {
    code = 'worked-off';
    observation = 'REGISTRO EM FOLGA';
  } else if (invalid) {
    code = 'invalid';
    observation = 'CONTÉM MARCAÇÃO INVALIDADA';
  } else {
    const alerts = [];
    const plannedStart = clockMinutes(schedule.expected_start);
    const actualStart = punches.entrada ? new Date(punches.entrada.recorded_at) : null;
    if (plannedStart !== null && actualStart) {
      const actualStartMinutes = actualStart.getHours() * 60 + actualStart.getMinutes();
      if (actualStartMinutes - plannedStart > 5) alerts.push(`ATRASO ${formatMinutes(actualStartMinutes - plannedStart)}`);
    }
    if (balanceMinutes > 5) alerts.push(`EXTRA ${formatMinutes(balanceMinutes)}`);
    else if (balanceMinutes < -5) alerts.push(`DÉBITO ${formatMinutes(balanceMinutes)}`);
    observation = alerts.length ? alerts.join(' · ') : 'JORNADA COMPLETA';
  }

  return {
    date,
    weekday: new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase(),
    records,
    punches,
    schedule,
    justifications,
    plannedMinutes,
    workedMinutes,
    balanceMinutes,
    complete,
    code,
    observation,
  };
}

export function buildTimesheets({ employees = [], records = [], schedules = [], justifications = [], startDate, endDate, partial = false, validOnly = false }) {
  const dates = dateRange(startDate, endDate);
  const today = localDateKey(new Date());
  const recordsByEmployee = new Map();
  records.filter((record) => !validOnly || record.status !== 'invalid').forEach((record) => {
    const key = String(record.employee_id);
    recordsByEmployee.set(key, [...(recordsByEmployee.get(key) || []), record]);
  });
  const schedulesByKey = new Map(schedules.map((item) => [`${item.employee_id}:${item.work_date}`, item]));
  const justificationsByKey = new Map();
  justifications.forEach((item) => {
    const end = item.end_date && item.end_date >= item.occurrence_date ? item.end_date : item.occurrence_date;
    dateRange(item.occurrence_date, end).forEach((date) => {
      const key = `${item.employee_id}:${date}`;
      justificationsByKey.set(key, [...(justificationsByKey.get(key) || []), item]);
    });
  });

  return employees.map((employee) => {
    const employeeRecords = recordsByEmployee.get(String(employee.id)) || [];
    const grouped = groupEmployeeRecords(employeeRecords);
    const explicitDates = schedules.filter((item) => String(item.employee_id) === String(employee.id)).map((item) => item.work_date).sort();
    const recordDates = [...grouped.keys()].sort();
    const anchor = employee.journey_start_date || employee.admission_date || explicitDates[0] || recordDates[0] || '';
    const days = dates.map((date) => {
      const dayRecords = grouped.get(date) || [];
      const schedule = inferredSchedule(employee, date, schedulesByKey.get(`${employee.id}:${date}`), anchor, dayRecords.length > 0);
      return calculateDay({ employee, date, records: dayRecords, schedule, justifications: justificationsByKey.get(`${employee.id}:${date}`) || [], today, partial });
    });
    const summary = days.reduce((result, day) => {
      if (day.schedule.required) result.scheduledDays += 1;
      if (day.workedMinutes !== null) result.workedDays += 1;
      if (day.code === 'absence') result.absences += 1;
      if (day.code === 'incomplete') result.incomplete += 1;
      if (day.code === 'justified') result.justified += 1;
      result.plannedMinutes += day.plannedMinutes;
      result.workedMinutes += day.workedMinutes || 0;
      if (!['day-off', 'future', 'disabled', 'justified'].includes(day.code)) {
        if (day.balanceMinutes > 0) result.overtimeMinutes += day.balanceMinutes;
        if (day.balanceMinutes < 0) result.debitMinutes += Math.abs(day.balanceMinutes);
      }
      return result;
    }, { scheduledDays: 0, workedDays: 0, absences: 0, incomplete: 0, justified: 0, plannedMinutes: 0, workedMinutes: 0, overtimeMinutes: 0, debitMinutes: 0 });
    summary.balanceMinutes = summary.overtimeMinutes - summary.debitMinutes;
    return { employee, anchor, days, summary };
  });
}
