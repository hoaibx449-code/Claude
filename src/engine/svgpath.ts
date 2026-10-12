// SVG path data → polylines, so line-art icons can be drawn stroke by stroke like everything else.
type P = [number, number];

/** Flatten an SVG path `d` string into polylines (one per subpath). */
export function flatten(d: string, step = 0.6): P[][] {
  const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) || [];
  const out: P[][] = [];
  let cur: P[] = [], i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0, prev = '';
  const num = () => Number(toks[i++]);
  const flag = () => { // arc flags may be written without separators ("a1 1 0 0 1 2 2" or "a1 1 0 012 2")
    const t = toks[i];
    if (t.length > 1 && (t[0] === '0' || t[0] === '1') && !t.includes('.')) { toks[i] = t.slice(1); return Number(t[0]); }
    i++; return Number(t);
  };
  const lineTo = (nx: number, ny: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / step));
    for (let k = 1; k <= n; k++) cur.push([x + ((nx - x) * k) / n, y + ((ny - y) * k) / n]);
    x = nx; y = ny;
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.ceil((Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(nx - x2, ny - y2)) / step));
    const x0 = x, y0 = y;
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      cur.push([u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * nx, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ny]);
    }
    x = nx; y = ny; cx = x2; cy = y2;
  };
  const quad = (x1: number, y1: number, nx: number, ny: number) => {
    const n = Math.max(2, Math.ceil((Math.hypot(x1 - x, y1 - y) + Math.hypot(nx - x1, ny - y1)) / step));
    const x0 = x, y0 = y;
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; cur.push([u * u * x0 + 2 * u * t * x1 + t * t * nx, u * u * y0 + 2 * u * t * y1 + t * t * ny]); }
    x = nx; y = ny; qx = x1; qy = y1;
  };
  const arc = (rx: number, ry: number, rot: number, large: number, sweep: number, nx: number, ny: number) => {
    if (!rx || !ry) return lineTo(nx, ny);
    const phi = (rot * Math.PI) / 180, cs = Math.cos(phi), sn = Math.sin(phi);
    const dx = (x - nx) / 2, dy = (y - ny) / 2, x1 = cs * dx + sn * dy, y1 = -sn * dx + cs * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num2 / (den || 1)));
    const cxp = (co * rx * y1) / ry, cyp = (-co * ry * x1) / rx;
    const ccx = cs * cxp - sn * cyp + (x + nx) / 2, ccy = sn * cxp + cs * cyp + (y + ny) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sweep && dt > 0) dt -= Math.PI * 2; else if (sweep && dt < 0) dt += Math.PI * 2;
    const n = Math.max(2, Math.ceil((Math.abs(dt) * Math.max(rx, ry)) / step));
    for (let k = 1; k <= n; k++) {
      const a = t1 + (dt * k) / n;
      cur.push([ccx + cs * rx * Math.cos(a) - sn * ry * Math.sin(a), ccy + sn * rx * Math.cos(a) + cs * ry * Math.sin(a)]);
    }
    x = nx; y = ny;
  };
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (C) {
      case 'M': {
        if (cur.length > 1) out.push(cur);
        x = num() + ox; y = num() + oy; sx = x; sy = y; cur = [[x, y]];
        cmd = rel ? 'l' : 'L'; // following pairs are line-tos
        break;
      }
      case 'L': lineTo(num() + ox, num() + oy); break;
      case 'H': lineTo(num() + (rel ? x : 0), y); break;
      case 'V': lineTo(x, num() + (rel ? y : 0)); break;
      case 'C': { const a = num() + ox, b = num() + oy, c2 = num() + ox, d2 = num() + oy, e = num() + ox, f = num() + oy; cubic(a, b, c2, d2, e, f); break; }
      case 'S': {
        const r1x = /[CS]/i.test(prev) ? 2 * x - cx : x, r1y = /[CS]/i.test(prev) ? 2 * y - cy : y;
        const c2 = num() + ox, d2 = num() + oy, e = num() + ox, f = num() + oy; cubic(r1x, r1y, c2, d2, e, f); break;
      }
      case 'Q': { const a = num() + ox, b = num() + oy, e = num() + ox, f = num() + oy; quad(a, b, e, f); break; }
      case 'T': {
        const a = /[QT]/i.test(prev) ? 2 * x - qx : x, b = /[QT]/i.test(prev) ? 2 * y - qy : y;
        quad(a, b, num() + ox, num() + oy); break;
      }
      case 'A': { const rx = num(), ry = num(), rot = num(), la = flag(), sw = flag(); arc(rx, ry, rot, la, sw, num() + ox, num() + oy); break; }
      case 'Z': lineTo(sx, sy); if (cur.length > 1) out.push(cur); cur = [[x, y]]; break;
      default: i++; // unknown token: skip
    }
    prev = C;
    if (C === 'Z' && isNum()) cmd = 'L';
  }
  if (cur.length > 1) out.push(cur);
  return out;
}
