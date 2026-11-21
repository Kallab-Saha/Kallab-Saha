let memoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  memoryToken = token;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (memoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memoryToken}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data;
}
