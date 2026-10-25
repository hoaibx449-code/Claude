// What the browser and the phone show for the site: the installed-app manifest (name, colours, icons) and the
// SVG icon, made from Quản trị → Trang chủ & nội dung (brand name, logo, colours) instead of fixed files.
// The PNG icons phones need are drawn by the admin page when settings are saved (site.appIcon).
import { siteColors, type Config } from './settings.ts';

const ICONS: Record<string, string> = {
  pen: '<path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="M13 7l4 4"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="4"/><path d="M12 4v4"/><circle cx="12" cy="3.5" r="1.2"/><path d="M9.5 13h.01M14.5 13h.01"/>',
  spark: '<path d="M12 3l2.2 6.3L20.5 12l-6.3 2.2L12 20.5l-2.2-6.3L3.5 12l6.3-2.7z"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  brush: '<path d="M18 3l3 3-9 9-3-3z"/><path d="M9 12c-3 0-5 2-5 5 0 1.5-1 2.5-2 3 4 1 9 0 9-5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
};
const FILL: Record<string, [string, string]> = { sunset: ['#ff7a00', '#ff2d75'], ocean: ['#06b6d4', '#2563eb'], forest: ['#22c55e', '#0d9488'] };
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const siteUrl = (v: string) => (v.startsWith('site:') ? '/api/site/' + v.slice(5) : v);
export const brandName = (c: Config) => [c.brand.name, c.brand.accent].filter(Boolean).join(' ');

/** The logo as a square SVG: the drawn icon (or the first letter) on the logo's background. */
export function appSvg(c: Config) {
  const logo = c.site.logo, k = siteColors(c.site);
  const [a, b] = FILL[logo.bg] || (logo.bg === 'night' ? ['#1e1b4b', k.primary] : /^#/.test(logo.bg) ? [logo.bg, logo.bg] : [k.primary, k.second]);
  const mark = logo.icon === 'letter'
    ? `<text x="12" y="16.5" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="12" fill="#fff">${esc((c.brand.name || 'F').trim().charAt(0).toUpperCase())}</text>`
    : `<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[logo.icon] || ICONS.pen}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="24" height="24" rx="5" fill="url(#g)"/><g transform="translate(4.2 4.2) scale(.65)">${mark}</g></svg>`;
}

/** Where the small icon of the site is: the uploaded logo picture, otherwise the drawn one. */
export const faviconUrl = (c: Config) => (c.site.logo.image ? siteUrl(c.site.logo.image) : '/icons/app.svg');
/** The icon a phone puts on its home screen (iOS takes a PNG only). */
export const touchIconUrl = (c: Config) => (c.site.appIcon?.i192 ? siteUrl(c.site.appIcon.i192) : '/icons/icon-192.png');

export function appManifest(c: Config) {
  const k = siteColors(c.site), name = brandName(c) || 'FACIUP', a = c.site.appIcon;
  const icons = a?.i192 && a?.i512
    ? [{ src: siteUrl(a.i192), sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: siteUrl(a.i512), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: siteUrl(a.i512), sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
    : [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }];
  return {
    name, short_name: (c.brand.name || name).slice(0, 12), description: c.brand.tagline || name, lang: 'vi', start_url: '/', scope: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#ffffff', theme_color: k.primary, icons: [...icons, { src: '/icons/app.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
