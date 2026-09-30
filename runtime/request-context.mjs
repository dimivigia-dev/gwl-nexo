import { AsyncLocalStorage } from 'node:async_hooks';
const context = new AsyncLocalStorage();
export function withRequest(request, fn) { return context.run(request, fn); }
export async function headers() { return context.getStore()?.headers || new Headers(); }
