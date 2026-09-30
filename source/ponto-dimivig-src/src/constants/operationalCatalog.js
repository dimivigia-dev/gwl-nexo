export const fallbackOccurrenceTypes = [
  'Ajuste de ponto', 'Permuta', 'Troca de escala', 'Atestado médico', 'Atestado de acompanhamento',
  'Declaração de comparecimento', 'Licença médica', 'Acidente de trabalho', 'Afastamento pelo INSS',
  'Falta justificada', 'Falta injustificada', 'Esquecimento de marcação', 'Problema no aplicativo',
  'Problema no equipamento', 'Trabalho externo', 'Home office', 'Treinamento / capacitação',
  'Reunião externa', 'Viagem a serviço', 'Hora extra autorizada', 'Banco de horas — crédito',
  'Banco de horas — débito', 'Folga autorizada', 'Folga compensatória', 'Folga trabalhada',
  'Feriado trabalhado', 'Férias', 'Licença-maternidade', 'Licença-paternidade',
  'Licença casamento (gala)', 'Licença luto (nojo)', 'Doação de sangue', 'Comparecimento à Justiça',
  'Alistamento eleitoral ou militar', 'Acompanhamento familiar', 'Saída autorizada', 'Convocação',
  'Sobreaviso', 'Suspensão', 'Outro',
];

export const scheduleTemplates = [
  { id: '12x36-dia-06', name: '12x36 · Diurna 06h–18h', cycle: '12x36', shift: '12x36 Diurna', start: '06:00', breakStart: '12:00', breakEnd: '13:00', end: '18:00', days: [0,1,2,3,4,5,6] },
  { id: '12x36-noite-18', name: '12x36 · Noturna 18h–06h', cycle: '12x36', shift: '12x36 Noturna', start: '18:00', breakStart: '00:00', breakEnd: '01:00', end: '06:00', days: [0,1,2,3,4,5,6] },
  { id: '12x36-dia-07', name: '12x36 · Diurna 07h–19h', cycle: '12x36', shift: '12x36 Diurna', start: '07:00', breakStart: '12:00', breakEnd: '13:00', end: '19:00', days: [0,1,2,3,4,5,6] },
  { id: '12x36-noite-19', name: '12x36 · Noturna 19h–07h', cycle: '12x36', shift: '12x36 Noturna', start: '19:00', breakStart: '00:00', breakEnd: '01:00', end: '07:00', days: [0,1,2,3,4,5,6] },
  { id: '44h', name: '44 horas semanais · Seg–Sáb', cycle: '44h', shift: '44h Semanais', start: '08:00', breakStart: '12:00', breakEnd: '13:00', end: '17:00', days: [1,2,3,4,5,6] },
  { id: '5x2', name: '5x2 · Segunda a sexta', cycle: '5x2', shift: '5x2', start: '08:00', breakStart: '12:00', breakEnd: '13:00', end: '17:48', days: [1,2,3,4,5] },
  { id: '6x1', name: '6x1 · Ciclo contínuo', cycle: '6x1', shift: '6x1', start: '07:00', breakStart: '12:00', breakEnd: '13:00', end: '15:20', days: [0,1,2,3,4,5,6] },
  { id: 'personalizada', name: 'Personalizada · Escolher dias', cycle: 'personalizada', shift: 'Personalizada', start: '08:00', breakStart: '12:00', breakEnd: '13:00', end: '17:00', days: [1,2,3,4,5] },
];

export const markKinds = [
  { id: 'entrada', label: 'Entrada', short: 'ENT' },
  { id: 'saida_intervalo', label: 'Saída intervalo', short: 'S. INT' },
  { id: 'retorno_intervalo', label: 'Retorno intervalo', short: 'R. INT' },
  { id: 'saida', label: 'Saída', short: 'SAÍDA' },
];

export function activeOccurrenceNames(data) {
  const rows = (data?.occurrenceTypes || []).filter((item) => item.status === 'active');
  return rows.length ? rows.map((item) => item.name) : fallbackOccurrenceTypes;
}
