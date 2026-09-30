const STORAGE_KEY = 'dimivig_ponto_pending_queue';
const safeParse = (raw) => { try { const value = JSON.parse(raw || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
export const getRegistrosPonto = () => typeof window === 'undefined' ? [] : safeParse(localStorage.getItem(STORAGE_KEY));
export const saveRegistrosPonto = (items) => { if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); };
export const addRegistroPonto = async (payload) => {
  const item = { id: crypto.randomUUID?.() || String(Date.now()), payload, queuedAt: new Date().toISOString() };
  saveRegistrosPonto([...getRegistrosPonto(), item]);
  window.dispatchEvent(new Event('dimivig:ponto-updated'));
  return item;
};
export const getPendingRegistrosPonto = getRegistrosPonto;
export const getPendingRegistrosCount = () => getRegistrosPonto().length;
export const markPendingRegistrosAsSynced = (ids = []) => {
  const done = new Set(ids.map(String));
  const remaining = getRegistrosPonto().filter((item) => !done.has(String(item.id)));
  saveRegistrosPonto(remaining);
  return remaining;
};
