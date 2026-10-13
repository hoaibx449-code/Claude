// Which free Google voice reads in place of a voice that cannot be used (no key, service down),
// shared by the render machine and the site's "listen" button so both sound the same.
// The stand-in keeps the gender and, as far as Google's Vietnamese voices allow, the character.

export interface StandIn { name: string; pitch: number; rate: number }

const GOOGLE_VI: Record<string, 'nam' | 'nu'> = {
  'vi-VN-Neural2-A': 'nu', 'vi-VN-Neural2-D': 'nam', 'vi-VN-Wavenet-A': 'nu', 'vi-VN-Wavenet-B': 'nam', 'vi-VN-Wavenet-C': 'nu', 'vi-VN-Wavenet-D': 'nam',
  'vi-VN-Standard-A': 'nu', 'vi-VN-Standard-B': 'nam', 'vi-VN-Standard-C': 'nu', 'vi-VN-Standard-D': 'nam',
};
export const googleGender = (name: string) => GOOGLE_VI[name];

function hash(s: string) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; }

/** Gender of any voice code we know ("vi_male_minhtriet_mb", "free-male", "vi-VN-Neural2-D"). */
export function genderOf(code = ''): 'nam' | 'nu' {
  if (GOOGLE_VI[code]) return GOOGLE_VI[code];
  return /(^|[_-])(male|nam)([_-]|$)/i.test(code) && !/female/i.test(code) ? 'nam' : 'nu';
}

/** Free Google voice standing in for `code`, with a small fixed pitch/rate shift per voice. */
export function standIn(code = ''): StandIn {
  if (GOOGLE_VI[code]) return { name: code, pitch: 0, rate: 1 };
  if (code === 'free-male') return { name: 'vi-VN-Neural2-D', pitch: 0, rate: 1 };
  if (code === 'free-female' || !code) return { name: 'vi-VN-Neural2-A', pitch: 0, rate: 1 };
  const male = genderOf(code) === 'nam', south = /_mn$/.test(code);
  const name = male ? (south ? 'vi-VN-Wavenet-B' : 'vi-VN-Neural2-D') : (south ? 'vi-VN-Wavenet-C' : 'vi-VN-Neural2-A');
  // different people of the same stand-in voice still sound a little different
  const h = hash(code);
  return { name, pitch: ((h % 5) - 2) * 0.8, rate: 0.96 + ((h >> 4) % 5) * 0.02 };
}
