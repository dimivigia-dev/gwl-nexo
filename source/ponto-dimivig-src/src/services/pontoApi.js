const API = '/api/ponto';

async function request(url = '', options = {}) {
  const response = await fetch(`${API}${url}`, {
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

export const loadPonto = (scope = new Date().toISOString().slice(0, 7)) => {
  if (scope && typeof scope === 'object') {
    const params = new URLSearchParams();
    if (scope.month) params.set('month', scope.month);
    if (scope.startDate) params.set('startDate', scope.startDate);
    if (scope.endDate) params.set('endDate', scope.endDate);
    return request(`?${params.toString()}`);
  }
  return request(`?month=${encodeURIComponent(scope)}`);
};

export const createPonto = (entity, values) =>
  request('', { method: 'POST', body: JSON.stringify({ entity, ...values }) });

export const updatePonto = (entity, id, values) =>
  request('', { method: 'PATCH', body: JSON.stringify({ entity, id, ...values }) });

export const deletePonto = (entity, id) =>
  request(`?entity=${encodeURIComponent(entity)}&id=${Number(id)}`, { method: 'DELETE' });

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  if (!file) return resolve('');
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
  reader.readAsDataURL(file);
});

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export const displayDate = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
export const displayDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR') : '—';
