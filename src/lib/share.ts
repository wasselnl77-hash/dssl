/* Share links: the playground source lives in the URL hash, never on a server.
 *
 *   https://dssl-sable.vercel.app/playground#s=zH4sIAAAA...
 *
 * The first character says how the rest is packed: "z" is gzip (when the
 * browser has CompressionStream, which is nearly all of them), "p" is plain
 * UTF-8. Both are base64url, so the link survives chat apps and email. */

const toB64 = (bytes: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64 = (s: string): Uint8Array => {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  void w.write(bytes as unknown as BufferSource);
  void w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

/** pack text for the URL hash */
export async function encodeShare(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream !== "undefined") {
    try { return "z" + toB64(await pipe(bytes, new CompressionStream("gzip"))); } catch { /* fall through to plain */ }
  }
  return "p" + toB64(bytes);
}

/** unpack what encodeShare made; null when it is not ours or is damaged */
export async function decodeShare(packed: string): Promise<string | null> {
  try {
    const kind = packed[0];
    const bytes = fromB64(packed.slice(1));
    if (kind === "p") return new TextDecoder().decode(bytes);
    if (kind === "z" && typeof DecompressionStream !== "undefined") return new TextDecoder().decode(await pipe(bytes, new DecompressionStream("gzip")));
  } catch { /* damaged link */ }
  return null;
}

/** the share payload in a location hash like "#s=zABC", or null */
export function shareFromHash(hash: string): string | null {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1] : null;
}

/** a browser URL length that every chat app and server will accept */
export const MAX_SHARE_URL = 8000;
