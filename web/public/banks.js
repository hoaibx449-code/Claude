// Vietnamese banks for VietQR: BIN (used in the QR code), short code (logo), name.
// Logos come from VietQR's public image host; a coloured badge stands in if one fails.
'use strict';
const BANKS = [
  ['970436', 'VCB', 'Vietcombank'], ['970415', 'ICB', 'VietinBank'], ['970418', 'BIDV', 'BIDV'], ['970405', 'VBA', 'Agribank'],
  ['970422', 'MB', 'MB Bank'], ['970407', 'TCB', 'Techcombank'], ['970416', 'ACB', 'ACB'], ['970432', 'VPB', 'VPBank'],
  ['970423', 'TPB', 'TPBank'], ['970403', 'STB', 'Sacombank'], ['970437', 'HDB', 'HDBank'], ['970441', 'VIB', 'VIB'],
  ['970443', 'SHB', 'SHB'], ['970431', 'EIB', 'Eximbank'], ['970426', 'MSB', 'MSB'], ['970448', 'OCB', 'OCB'],
  ['970440', 'SEAB', 'SeABank'], ['970449', 'LPB', 'LPBank'], ['970428', 'NAB', 'Nam A Bank'], ['970425', 'ABB', 'ABBANK'],
  ['970409', 'BAB', 'Bac A Bank'], ['970454', 'VCCB', 'BVBank'], ['970430', 'PGB', 'PGBank'], ['970452', 'KLB', 'KienlongBank'],
  ['970427', 'VAB', 'VietABank'], ['970419', 'NCB', 'NCB'], ['970400', 'SGICB', 'Saigonbank'], ['970438', 'BVB', 'BaoViet Bank'],
  ['970433', 'VIETBANK', 'Vietbank'], ['970412', 'PVCB', 'PVcomBank'], ['970414', 'OCEANBANK', 'OceanBank'], ['970408', 'GPB', 'GPBank'],
  ['970429', 'SCB', 'SCB'], ['970406', 'DOB', 'DongA Bank'], ['970424', 'SHBVN', 'Shinhan Bank'], ['970457', 'WVN', 'Woori Bank'],
  ['546034', 'CAKE', 'CAKE by VPBank'], ['546035', 'UBANK', 'Ubank by VPBank'], ['963388', 'TIMO', 'Timo'], ['458761', 'HSBC', 'HSBC'],
].map(([bin, code, name]) => ({ bin, code, name, logo: `https://api.vietqr.io/img/${code}.png` }));
const bankOf = (bin) => BANKS.find((b) => b.bin === bin) || { bin, code: bin, name: 'Ngân hàng ' + bin, logo: '' };
/** Logo with a text badge fallback. */
function bankLogo(b, size = 40) {
  const badge = h('span', { class: 'banklogo', style: `width:${size}px;height:${size}px` }, b.code.slice(0, 4));
  if (!b.logo) return badge;
  const img = h('img', { class: 'banklogo', src: b.logo, alt: b.name, width: size, height: size, loading: 'lazy', style: `width:${size}px;height:${size}px` });
  img.addEventListener('error', () => img.replaceWith(badge), { once: true });
  return img;
}
