// Voices for Ink Studio when the whole video is made in the user's browser: the free Microsoft neural voices
// (the same service the edge-tts library uses on the render machines) and EverAI. The website reads the text and
// returns the MP3 with the time of every word, so the browser can draw in step with the voice.
//
// The Microsoft service wants a token derived from the clock (Sec-MS-GEC). Its algorithm is copied from
// edge-tts 7.x (drm.py): a SHA-256 with its own constants plus a 64-bit checksum. When Microsoft changes it,
// edge-tts changes first: update the constants here from edge_tts/drm.py and constants.py.

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM = '143.0.3650.75';
export const SEC_MS_GEC_VERSION = '2-' + CHROMIUM;
const WSS = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=' + TRUSTED_CLIENT_TOKEN;
const MAJOR = CHROMIUM.split('.')[0];
const WSS_HEADERS: Record<string, string> = {
  Pragma: 'no-cache', 'Cache-Control': 'no-cache', Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Safari/537.36 Edg/${MAJOR}.0.0.0`,
  'Accept-Encoding': 'gzip, deflate, br, zstd', 'Accept-Language': 'en-US,en;q=0.9',
};

// ---------------------------------------------------------------- Sec-MS-GEC (edge_tts/drm.py)
const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const STATE = [0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab, 0xfeb0a7e4, 0x03effbd2];
const SCHEDULE = [0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491, 0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33, 0xd258b060, 0x72766564];
const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
const ADJ = 0xc9dc06a7, BLOCK_K = [...K.slice(0, 14), ADJ, ...K.slice(15)];
const SIGMA0_ADJ = 0x059c0b80, SIGMA1_ADJ = 0x000b92c0;
const CS64_COEF = [[0xe82e91b1, 0xb32700d0], [0x44de24c6, 0x88dff51d], [0x3beb65bc, 0x29514038], [0xc89c5933, 0xb328cbdf], [0x8d1ec211, 0xd405b4d5], [0x314ef5d5, 0x26e55f3c], [0xe92491b1, 0x607801c6], [0xf0a5b9d5, 0x82b2c1fb], [0x06064cf3, 0xfa51a3da], [0xda79fa60, 0x207cc464], [0xbed20560, 0x3c3c74f3], [0x89f9c9f8, 0xd2d14b61], [0x35fa38c6, 0xbb04a2c1], [0xcb49e3c6, 0xc5626167]];
const CS64_FACTOR = 0x82893933, CS64_ADJ0 = 0xf2f90b1a, CS64_ADJ1 = 0x0b1a0000;

const u = (x: number) => x >>> 0;
const rotr = (x: number, n: number) => u((x >>> n) | (x << (32 - n)));
const rol16 = (x: number) => u((x << 16) | (x >>> 16));
const mul = (a: number, b: number) => u(Math.imul(a, b));
const sigma0 = (x: number) => u(rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3));
const sigma1 = (x: number) => u(rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10));

function rounds(state: number[], w: number[], first = 0) {
  let [a, b, c, d, e, f, g, h] = state; const k = first === 14 ? BLOCK_K : K;
  for (let i = first; i < 64; i++) {
    const t1 = u(h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + (g ^ (e & (f ^ g))) + k[i] + w[i]);
    const t2 = u((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) | (c & (a | b))));
    h = g; g = f; f = e; e = u(d + t1); d = c; c = b; b = a; a = u(t1 + t2);
  }
  return [a, b, c, d, e, f, g, h];
}
function expand(w: number[], first = 16) { for (let i = first; i < 64; i++) w.push(u(sigma1(w[i - 2]) + w[i - 7] + sigma0(w[i - 15]) + w[i - 16])); }
const be = (b: Uint8Array, o: number, n: number) => { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + (b[o + i] || 0); return v; };

function shaInit(data: Uint8Array) {
  const w = [...Array(14).fill(0), be(data, 0, 3), be(data, 3, 4)];
  for (let i = 16; i < 30; i++) {
    let v = SCHEDULE[i - 16];
    if (i - 2 >= 14) v += i === 16 ? u(sigma1(w[i - 2]) ^ SIGMA1_ADJ) : sigma1(w[i - 2]);
    if (i - 7 >= 14) v += w[i - 7];
    if (i - 15 >= 14) v += i === 29 ? u(sigma0(w[i - 15]) ^ SIGMA0_ADJ) : sigma0(w[i - 15]);
    w.push(u(v));
  }
  w.push(u(sigma1(w[28]) + w[23] + sigma0(w[15]) + w[14] + ADJ - K[14]));
  expand(w, 31);
  const r = rounds(STATE, w, 14);
  return INITIAL.map((x, i) => u(x + r[i]));
}
function shaDigest(data: Uint8Array) {
  const length = 57 + data.length, pad = (((55 - length) % 64) + 64) % 64;
  const rest = new Uint8Array(data.length - 7 + 1 + pad + 8);
  rest.set(data.subarray(7)); rest[data.length - 7] = 0x80;
  const bits = length * 8; const view = new DataView(rest.buffer);
  view.setUint32(rest.length - 8, Math.floor(bits / 2 ** 32)); view.setUint32(rest.length - 4, bits >>> 0);
  let state = shaInit(data);
  for (let o = 0; o < rest.length; o += 64) {
    const w: number[] = []; for (let i = 0; i < 16; i++) w.push(view.getUint32(o + 4 * i)); expand(w);
    const r = rounds(state, w); state = state.map((x, i) => u(x + r[i]));
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer); state.forEach((x, i) => ov.setUint32(4 * i, x)); return out;
}
function cs64(data: Uint8Array, digest: Uint8Array): [number, number] {
  const dv = new DataView(digest.buffer, digest.byteOffset);
  const ka = u(dv.getUint32(0, true) | 1), kb = u(dv.getUint32(4, true) | 1);
  const factors = [mul(ka, CS64_FACTOR), mul(kb, CS64_FACTOR)];
  const terms = CS64_COEF.map(([c], i) => mul(c, factors[i % 2])), offsets = CS64_COEF.map(([, o]) => o);
  const src = new Uint8Array(data.length + 1); src.set(data, 1);
  const padded = new Uint8Array(Math.ceil(src.length / 4) * 4); padded.set(src);
  const pv = new DataView(padded.buffer); const words: number[] = [];
  for (let i = 0; i < padded.length; i += 4) words.push(pv.getUint32(i, true));
  if (words.length % 2) words.push(0);
  words.forEach((word, i) => {
    let term = mul(word, i % 2 === 0 ? ka : kb), off = mul(rol16(word), i % 2 === 0 ? 0xef0569fb : 0xc31713db);
    if (i === 0) { term = u(term + mul(CS64_ADJ0, factors[0])); off = u(off + CS64_ADJ1); }
    terms.push(term); offsets.push(off);
  });
  let swapAcc = 0, swapLast = 0, state = 0, acc = 0;
  for (let i = 0; i < terms.length; i += 2) {
    const x = terms[i], y = terms[i + 1];
    let t = rol16(u(offsets[i] + x)), q = mul(t, 0x76f50f34);
    swapAcc += u(mul(rol16(q), 0xc3efea97) + q);
    t = rol16(u(offsets[i + 1] + y)); q = mul(t, 0x1881ce3c);
    swapLast = u(mul(rol16(q), 0x35bd1ec9) + q);
    swapAcc = u(swapAcc + swapLast);
    state = u(mul(state, ka) + x);
    state = mul(rol16(state), 0xcf98b111); state = mul(rol16(state), 0x87085b9f); state = mul(rol16(state), 0x12ceb96d); state = mul(rol16(state), 0x257e1d83);
    acc += state;
    let s2 = u(mul(state, kb) + y);
    s2 = mul(rol16(s2), 0xa27416f5); s2 = mul(rol16(s2), 0xd38396ff);
    state = mul(rol16(mul(rol16(s2), 0x7c932b89)), 0xbfa49f69);
    acc = u(acc + state);
  }
  return [u(swapLast ^ state), u(swapAcc ^ acc)];
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

/** the Sec-MS-GEC token for a moment (seconds since 1970) */
export function secMsGec(unix = Date.now() / 1000) {
  let ticks = unix + 11644473600; ticks -= ticks % 300;
  const s = BigInt(Math.round(ticks)) * 10_000_000n; // whole 5-minute steps: exact in integers
  const data = new TextEncoder().encode(s.toString() + TRUSTED_CLIENT_TOKEN);
  const digest = shaDigest(data), [a, b] = cs64(data, digest);
  const c = new Uint8Array(8); const v = new DataView(c.buffer); v.setUint32(0, a, true); v.setUint32(4, b, true);
  return hex(c) + '-' + hex(digest);
}

// ---------------------------------------------------------------- the conversation with the service
export interface Socket { send(data: string): void; close(): void; onMessage(fn: (data: string | ArrayBuffer) => void): void; onClose(fn: (why: string) => void): void }
export type Open = (url: string, headers: Record<string, string>) => Promise<Socket>;

/** Cloudflare Workers: an outgoing WebSocket is a fetch with an Upgrade header */
export const workerSocket: Open = async (url, headers) => {
  const res = await fetch(url, { headers: { ...headers, Upgrade: 'websocket' } });
  const ws = (res as any).webSocket as WebSocket | null;
  if (!ws) throw new Error(`Microsoft từ chối kết nối giọng (HTTP ${res.status})`);
  (ws as any).accept();
  return { send: (d) => ws.send(d), close: () => { try { ws.close(); } catch { /* closed */ } },
    onMessage: (fn) => ws.addEventListener('message', (e: MessageEvent) => fn(e.data as any)), onClose: (fn) => ws.addEventListener('close', (e: CloseEvent) => fn(`đóng ${e.code} ${e.reason || ''}`)) };
};

const xml = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const uuid = () => crypto.randomUUID().replace(/-/g, '');
const jsDate = () => new Date().toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) /, '$1 $3 $2 $4 ') + '+0000 (Coordinated Universal Time)';
/** pieces of at most ~3000 bytes, cut at a sentence or a space */
function pieces(text: string, limit = 3000) {
  const out: string[] = []; let rest = text.trim();
  while (new TextEncoder().encode(rest).length > limit) {
    let cut = rest.slice(0, limit / 3); const at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('\n'));
    cut = at > 200 ? rest.slice(0, at + 1) : rest.slice(0, Math.max(1, cut.lastIndexOf(' ')));
    out.push(cut.trim()); rest = rest.slice(cut.length).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export interface Spoken { audio: Uint8Array; words: [string, number, number][] }

/** read `text` with a Microsoft neural voice: the MP3 (24 kHz, 48 kbit/s mono) and every word's start/end in seconds */
export async function microsoftSpeak(text: string, voice: string, rate = '+8%', open: Open = workerSocket): Promise<Spoken> {
  const parts: Uint8Array[] = [], words: [string, number, number][] = []; let offset = 0;
  for (const piece of pieces(text)) {
    const url = `${WSS}&ConnectionId=${uuid()}&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
    const ws = await open(url, { ...WSS_HEADERS, Cookie: `muid=${uuid().toUpperCase()};` });
    let bytes = 0;
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(() => { ws.close(); fail(new Error('Giọng Microsoft quá thời gian chờ')); }, 60_000);
      ws.onClose((why) => { clearTimeout(timer); fail(new Error('Giọng Microsoft ngắt kết nối: ' + why)); });
      ws.onMessage((data) => {
        if (typeof data === 'string') {
          const cut = data.indexOf('\r\n\r\n'), head = data.slice(0, cut), body = data.slice(cut + 4);
          const path = /Path:([^\r\n]+)/.exec(head)?.[1]?.trim();
          if (path === 'audio.metadata') {
            try {
              for (const m of JSON.parse(body).Metadata || []) if (m.Type === 'WordBoundary') {
                const s = m.Data.Offset / 1e7 + offset; words.push([m.Data.text?.Text || '', s, s + m.Data.Duration / 1e7]);
              }
            } catch { /* a metadata frame we do not need */ }
          } else if (path === 'turn.end') { clearTimeout(timer); ws.close(); done(); }
        } else {
          const b = new Uint8Array(data), hl = (b[0] << 8) | b[1];
          const head = new TextDecoder().decode(b.subarray(2, 2 + hl));
          if (/Path:audio/.test(head) && b.length > hl + 2) { const chunk = b.slice(hl + 2); parts.push(chunk); bytes += chunk.length; }
        }
      });
      ws.send(`X-Timestamp:${jsDate()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n');
      ws.send(`X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${jsDate()}Z\r\nPath:ssml\r\n\r\n` +
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>${xml(piece)}</prosody></voice></speak>`);
    });
    offset += bytes * 8 / 48000; // constant 48 kbit/s: the next piece starts where this audio ends
  }
  if (!parts.length) throw new Error('Giọng Microsoft không trả về âm thanh');
  const audio = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { audio.set(p, o); o += p.length; }
  return { audio, words };
}
