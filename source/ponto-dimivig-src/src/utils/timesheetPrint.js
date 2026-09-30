import { formatClock, formatMinutes } from './timesheetEngine';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const brDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const intrajornadaText = (day) => day.schedule.required
  ? (day.schedule.expected_break_start && day.schedule.expected_break_end ? 'SIM' : 'NÃO')
  : '—';

function sheetHtml(sheet, startDate, endDate) {
  const employee = sheet.employee;
  const signature = sheet.signature;
  const rows = sheet.days.map((day) => `
    <tr class="${['absence', 'incomplete', 'invalid'].includes(day.code) ? 'attention' : ''}">
      <td>${brDate(day.date)}</td><td>${escapeHtml(employee.site_name || '—')}</td>
      <td>${intrajornadaText(day)}</td>
      <td>${escapeHtml(formatClock(day.punches.entrada?.recorded_at))}</td>
      <td>${escapeHtml(formatClock(day.punches.saida_intervalo?.recorded_at))}</td>
      <td>${escapeHtml(formatClock(day.punches.retorno_intervalo?.recorded_at))}</td>
      <td>${escapeHtml(formatClock(day.punches.saida?.recorded_at))}</td>
      <td>${escapeHtml(day.workedMinutes === null ? '—' : formatMinutes(day.workedMinutes))}</td>
      <td>${escapeHtml(day.observation)}</td>
    </tr>`).join('');
  return `
    <section class="sheet">
      <header><div><span class="eyebrow">PONTO DIMIVIG</span><h1>FOLHA DE PONTO</h1></div><div class="period">Período<br><strong>${brDate(startDate)} a ${brDate(endDate)}</strong></div></header>
      <div class="identity">
        <div class="wide"><small>Empresa</small><strong>${escapeHtml(employee.company_name || 'DIMIVIG')}</strong></div>
        <div class="wide"><small>Colaborador</small><strong>${escapeHtml(employee.name)}</strong></div><div><small>Matrícula</small><strong>${escapeHtml(employee.registration || '—')}</strong></div>
        <div><small>CPF</small><strong>${escapeHtml(employee.cpf || '—')}</strong></div><div><small>CTPS / Série</small><strong>${escapeHtml([employee.ctps_number, employee.ctps_series].filter(Boolean).join(' / ') || '—')}</strong></div>
        <div><small>Função</small><strong>${escapeHtml(employee.job_title || '—')}</strong></div><div><small>Admissão</small><strong>${brDate(employee.admission_date)}</strong></div>
        <div class="wide"><small>Posto / Lotação</small><strong>${escapeHtml(employee.site_name || '—')}</strong></div><div><small>Jornada</small><strong>${escapeHtml(employee.schedule || '—')}</strong></div>
      </div>
      <table><thead><tr><th>Data</th><th>Posto</th><th>Intrajornada</th><th>Entrada</th><th>Saída int.</th><th>Retorno</th><th>Saída</th><th>Horas</th><th>Observações</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><span>Previstas <strong>${formatMinutes(sheet.summary.plannedMinutes)}</strong></span><span>Trabalhadas <strong>${formatMinutes(sheet.summary.workedMinutes)}</strong></span><span>Faltas <strong>${sheet.summary.absences}</strong></span><span>Incompletas <strong>${sheet.summary.incomplete}</strong></span><span>Saldo <strong>${formatMinutes(sheet.summary.balanceMinutes, true)}</strong></span></div>
      <div class="signatures"><div class="signature-slot">${signature ? `<img src="/api/ponto?entity=signature&id=${Number(signature.id)}" alt="Assinatura do colaborador"><strong>${escapeHtml(signature.signed_name)}</strong><small>Assinado eletronicamente em ${escapeHtml(new Date(signature.signed_at).toLocaleString('pt-BR'))}</small>` : '<span>Assinatura do colaborador</span>'}</div><div class="signature-slot"><span>Assinatura do responsável / empresa</span></div></div>
      <footer>Documento emitido pelo Ponto Dimivig em ${new Date().toLocaleString('pt-BR')} · Conferir ajustes e justificativas antes do fechamento.</footer>
    </section>`;
}

export function openTimesheetPrint(sheets, startDate, endDate) {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Folha de Ponto ${startDate} a ${endDate}</title><style>
    *{box-sizing:border-box}body{margin:0;background:#e7ebf0;color:#0e1b2b;font-family:Arial,sans-serif}.sheet{width:297mm;min-height:200mm;margin:8mm auto;padding:9mm;background:#fff;page-break-after:always;box-shadow:0 3px 18px #0002}.sheet:last-child{page-break-after:auto}header{display:flex;align-items:flex-end;justify-content:space-between;border-bottom:3px solid #f28c18;padding-bottom:7px;margin-bottom:8px}.eyebrow{font-size:8px;font-weight:800;letter-spacing:2px;color:#e67800}h1{margin:2px 0 0;font-size:24px;color:#13253e}.period{text-align:right;font-size:9px;color:#607086}.period strong{font-size:12px;color:#13253e}.identity{display:grid;grid-template-columns:2fr 1fr 1fr;gap:1px;background:#b9c2ce;border:1px solid #b9c2ce;margin-bottom:8px}.identity div{background:#f6f8fa;padding:5px 7px;min-height:34px}.identity .wide{grid-column:span 2}.identity small{display:block;text-transform:uppercase;color:#66758a;font-size:7px;font-weight:700}.identity strong{font-size:9px}table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#13253e;color:#fff;padding:5px 3px;font-size:7px;text-transform:uppercase}td{border:1px solid #cfd5dd;padding:3px;font-size:7px;text-align:center;white-space:normal}td:last-child{text-align:left}.attention td{background:#fff4e8}.totals{display:flex;justify-content:flex-end;gap:14px;margin-top:7px;padding:6px 8px;background:#eef2f6;font-size:8px}.totals strong{color:#13253e}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:30mm;margin:10mm 12mm 6mm}.signature-slot{min-height:18mm;border-top:1px solid #526276;text-align:center;padding-top:4px;font-size:8px;color:#526276;position:relative}.signature-slot img{display:block;max-width:55mm;max-height:14mm;margin:-14mm auto 1mm}.signature-slot strong,.signature-slot small{display:block}.signature-slot small{font-size:6px;margin-top:1px}footer{text-align:center;border-top:1px solid #d7dce2;padding-top:4px;font-size:6.5px;color:#6c7888}@page{size:A4 landscape;margin:5mm}@media print{body{background:#fff}.sheet{width:auto;min-height:190mm;margin:0;padding:5mm;box-shadow:none}}
  </style></head><body>${sheets.map((sheet) => sheetHtml(sheet, startDate, endDate)).join('')}<script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
  return true;
}

export function timesheetExportRows(sheets) {
  return sheets.flatMap((sheet) => sheet.days.map((day) => [
    sheet.employee.name,
    sheet.employee.registration,
    sheet.employee.cpf,
    sheet.employee.site_name,
    day.date,
    intrajornadaText(day),
    formatClock(day.punches.entrada?.recorded_at),
    formatClock(day.punches.saida_intervalo?.recorded_at),
    formatClock(day.punches.retorno_intervalo?.recorded_at),
    formatClock(day.punches.saida?.recorded_at),
    day.workedMinutes === null ? '' : formatMinutes(day.workedMinutes),
    formatMinutes(day.balanceMinutes, true),
    day.observation,
  ]));
}
