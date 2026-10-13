'use client';
/**
 * 비밀번호 잠금 글 — 본문을 비밀번호로 **암호화해서** 저장한다.
 *
 * 화면에서만 가리면 API를 직접 부르는 사람에게는 본문이 그대로 보인다(게시판 글은 공개 행이다).
 * 그래서 본문 자체를 브라우저에서 AES-GCM으로 잠그고, 열쇠는 비밀번호에서 PBKDF2로 만든다.
 * 서버에는 암호문만 올라가므로 비밀번호를 모르면 관리자도 DB에서 본문을 읽을 수 없다.
 */

export interface PostLock {
  salt: string;   // base64
  iv: string;     // base64
  ct: string;     // base64 — 암호화된 본문
}

const ITER = 150_000;

const toB64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function deriveKey(pw: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw) as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function lockBody(body: string, pw: string): Promise<PostLock> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pw, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(body) as BufferSource);
  return { salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

/** 비밀번호가 틀리면 null */
export async function unlockBody(lock: PostLock, pw: string): Promise<string | null> {
  try {
    const key = await deriveKey(pw, fromB64(lock.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(lock.iv) as BufferSource }, key, fromB64(lock.ct) as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/* 상세 화면에서 연 본문을 수정 화면이 이어받는다 — 이 탭에서만, 창을 닫으면 사라진다 */
const OPENED = 'ohome.lock.opened.';
export function rememberOpened(id: string, body: string) {
  try { sessionStorage.setItem(OPENED + id, body); } catch { /* 무시 */ }
}
export function openedBody(id: string): string | null {
  try { return sessionStorage.getItem(OPENED + id); } catch { return null; }
}
