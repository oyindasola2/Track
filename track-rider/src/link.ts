import * as SecureStore from 'expo-secure-store';

export type RiderLink = { code: string; key: string };

export type ParseResult =
  | { ok: true; link: RiderLink }
  | { ok: false; reason: 'empty' | 'not_a_link' | 'missing_key' };

const K_CODE = 'track_rider_code';
const K_KEY = 'track_rider_key';

const SAFE = /^[A-Za-z0-9._~-]+$/;

function decode(v: string) {
  try {
    return decodeURIComponent(v).trim();
  } catch {
    return v.trim();
  }
}

function readKey(text: string): string | null {
  const m = text.match(/[?&#]key=([^&#\s]+)/i);
  return m ? decode(m[1]) : null;
}

/**
 * Accepts:
 *  - https://usetracktech.com/track/ABC123?role=rider&key=XYZ   (App Link / pasted)
 *  - usetracktech.com/track/ABC123?key=XYZ                      (pasted without https)
 *  - ABC123?key=XYZ
 *  - ABC123 XYZ                                                 (code and key separated by a space)
 * Code = path segment after /track/. Key = ?key= param.
 */
export function parseRiderLink(input: string | null | undefined): ParseResult {
  const text = (input ?? '').trim();
  if (!text) return { ok: false, reason: 'empty' };

  const track = text.match(/\/track\/([^/?#\s]+)/i);
  if (track) {
    const code = decode(track[1]);
    const key = readKey(text);
    if (!code) return { ok: false, reason: 'not_a_link' };
    if (!key) return { ok: false, reason: 'missing_key' };
    return { ok: true, link: { code, key } };
  }

  const short = text.match(/^([A-Za-z0-9._~-]+)\?/);
  if (short) {
    const key = readKey(text);
    if (!key) return { ok: false, reason: 'missing_key' };
    return { ok: true, link: { code: decode(short[1]), key } };
  }

  const parts = text.split(/\s+/);
  if (parts.length === 2 && SAFE.test(parts[0]) && SAFE.test(parts[1]) && parts[1].length >= 8) {
    return { ok: true, link: { code: parts[0], key: parts[1] } };
  }

  return { ok: false, reason: 'not_a_link' };
}

export const parseErrorMessage: Record<Exclude<ParseResult, { ok: true }>['reason'], string> = {
  empty: 'Paste the rider link your seller sent you.',
  not_a_link: "That doesn't look like a rider link. It should start with usetracktech.com/track/",
  missing_key:
    'This link has no rider key. It may be the customer link. Ask your seller for the rider link.',
};

export async function saveRiderLink(link: RiderLink) {
  await SecureStore.setItemAsync(K_CODE, link.code);
  await SecureStore.setItemAsync(K_KEY, link.key);
}

export async function loadRiderLink(): Promise<RiderLink | null> {
  const [code, key] = await Promise.all([
    SecureStore.getItemAsync(K_CODE),
    SecureStore.getItemAsync(K_KEY),
  ]);
  return code && key ? { code, key } : null;
}

export async function clearRiderLink() {
  await Promise.all([SecureStore.deleteItemAsync(K_CODE), SecureStore.deleteItemAsync(K_KEY)]);
}

export const sameLink = (a: RiderLink | null, b: RiderLink | null) =>
  !!a && !!b && a.code === b.code && a.key === b.key;
