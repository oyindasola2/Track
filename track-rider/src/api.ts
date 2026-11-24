import { BASE_URL, PUBLIC_KEY } from './config';

export type ApiResult = {
  /** 0 = no connection / timeout */
  status: number;
  json: any;
  retryAfter: number;
};

/** POST to a Supabase Edge Function with the public key. Never throws. */
export async function postFn(fn: string, body: object, timeoutMs = 20000): Promise<ApiResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE_URL + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PUBLIC_KEY,
        Authorization: `Bearer ${PUBLIC_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, retryAfter: Number(res.headers.get('Retry-After')) || 0 };
  } catch {
    return { status: 0, json: null, retryAfter: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/** Error code from a response body, whichever field the server used. */
export function errCode(json: any): string | undefined {
  const v = json?.error ?? json?.code ?? json?.reason;
  if (typeof v === 'string') return v;
  if (typeof v?.code === 'string') return v.code;
  return undefined;
}
