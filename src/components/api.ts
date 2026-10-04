'use client';
export async function api<T = unknown>(
  path: string,
  method = 'GET',
  payload?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch('/api/' + path, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body:
      method === 'GET' || method === 'DELETE'
        ? undefined
        : JSON.stringify({ requestId: crypto.randomUUID(), ...((payload as object) || {}) }),
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Anfrage fehlgeschlagen.');
  return result.data;
}
