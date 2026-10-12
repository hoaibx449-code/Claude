import type { Ctx, ToolKind } from './types.ts';

// Each tool is drawn along +x with its tip at (0,0), sized for a pen ~23px wide.
// The caller scales it to the hand photo's pen width.

export const TOOL_NAMES: Record<ToolKind, string> = {
  marker: 'Bút dạ bảng', chalk: 'Phấn', fountain: 'Bút máy', colormarker: 'Bút dạ màu',
  pencil: 'Bút chì', technical: 'Bút kỹ thuật', brush: 'Bút lông',
};

function grad(c: Ctx, h: number, cols: string[]) {
  const g = c.createLinearGradient(0, -h, 0, h);
  cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
  return g;
}
function cyl(c: Ctx, x0: number, x1: number, h: number, cols: string[]) {
  c.fillStyle = grad(c, h, cols); c.beginPath(); c.roundRect(x0, -h, x1 - x0, 2 * h, Math.min(3, h)); c.fill();
}
function cone(c: Ctx, x0: number, x1: number, h0: number, h1: number, cols: string[]) {
  c.fillStyle = grad(c, h1, cols); c.beginPath();
  c.moveTo(x0, -h0); c.lineTo(x1, -h1); c.lineTo(x1, h1); c.lineTo(x0, h0); c.closePath(); c.fill();
}
function endCap(c: Ctx, x: number, h: number, cols: string[]) {
  c.fillStyle = grad(c, h, cols); c.beginPath();
  c.moveTo(x, -h); c.lineTo(x + h * 0.9, -h); c.quadraticCurveTo(x + h * 1.9, -h, x + h * 1.9, 0);
  c.quadraticCurveTo(x + h * 1.9, h, x + h * 0.9, h); c.lineTo(x, h); c.closePath(); c.fill();
}

export function drawTool(c: Ctx, kind: ToolKind, ink: string) {
  const white = ['#ffffff', '#f4f4f6', '#d2d3d9', '#a9abb4'];
  switch (kind) {
    case 'marker':
    case 'colormarker': {
      const body = kind === 'marker' ? white : ['#ff9a7a', '#e2694a', '#c4502f', '#97381c'];
      cone(c, 0, 7, 3, 5, [ink, ink]);
      c.fillStyle = ink; c.beginPath(); c.ellipse(1.5, 0, 2.6, 3.2, 0, 0, Math.PI * 2); c.fill();
      cone(c, 7, 22, 6, 11.5, ['#5a5a5f', '#2c2c30', '#141416']);
      cyl(c, 22, 205, 12.5, body);
      if (kind === 'marker') cyl(c, 40, 56, 12.6, [ink, ink, '#000']);
      c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(26, -9.5, 170, 2.2);
      endCap(c, 205, 13, [ink, ink, '#000']);
      break;
    }
    case 'chalk': {
      c.fillStyle = '#f4f2ea'; c.beginPath();
      c.moveTo(1, -5); c.lineTo(5, -8.5); c.lineTo(108, -8.5); c.quadraticCurveTo(113, 0, 108, 8.5);
      c.lineTo(4, 8.5); c.lineTo(0, 3); c.closePath(); c.fill();
      const g = c.createLinearGradient(0, -8.5, 0, 8.5);
      g.addColorStop(0, 'rgba(255,255,255,.6)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.18)');
      c.fillStyle = g; c.fill();
      c.fillStyle = 'rgba(120,110,90,.18)';
      for (let i = 0; i < 40; i++) c.fillRect(6 + ((i * 37) % 100), -7 + ((i * 53) % 14), 1.3, 1.3);
      break;
    }
    case 'fountain': {
      c.fillStyle = '#d9ad45'; c.beginPath(); c.moveTo(0, 0); c.lineTo(22, -7); c.lineTo(22, 7); c.closePath(); c.fill();
      c.strokeStyle = '#6b4f12'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(2, 0); c.lineTo(14, 0); c.stroke();
      c.fillStyle = '#6b4f12'; c.beginPath(); c.arc(14, 0, 1.2, 0, Math.PI * 2); c.fill();
      cone(c, 22, 40, 7, 9, ['#3a3a3e', '#121214', '#000']);
      cyl(c, 40, 214, 10.5, ['#8f78e8', '#4b2bb3', '#2f1a7a', '#1c0f4f']);
      cyl(c, 118, 124, 10.7, ['#f5d47a', '#c79a2e', '#8a6514']);
      endCap(c, 214, 10.5, ['#8f78e8', '#4b2bb3', '#1c0f4f']);
      c.fillStyle = '#e2b850'; c.fillRect(150, -12.5, 66, 3); c.beginPath(); c.arc(150, -11, 2.4, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'pencil': {
      c.fillStyle = '#2b2b2b'; c.beginPath(); c.moveTo(0, 0); c.lineTo(8, -2.6); c.lineTo(8, 2.6); c.closePath(); c.fill();
      cone(c, 8, 28, 2.6, 10, ['#f3d3a8', '#e2b27e', '#b9844f']);
      c.fillStyle = '#f2c230'; c.beginPath();
      c.moveTo(28, -10); c.lineTo(31, -6); c.lineTo(34, -10); c.lineTo(37, -6); c.lineTo(40, -10); c.lineTo(40, 10); c.lineTo(28, 10);
      c.closePath(); c.fill();
      cyl(c, 36, 232, 10, ['#ffe27a', '#f2c230', '#f2c230', '#d9a51a', '#b8860b']);
      c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(38, -3.5, 194, 1.2); c.fillRect(38, 3.5, 194, 1.2);
      cyl(c, 232, 250, 10.4, ['#f2f2f2', '#bdbdbd', '#8a8a8a']);
      c.fillStyle = 'rgba(0,0,0,.2)'; for (const x of [236, 241, 246]) c.fillRect(x, -10.4, 1, 20.8);
      endCap(c, 250, 10, ['#f7a8b8', '#e48aa0', '#b85d74']);
      break;
    }
    case 'technical': {
      c.strokeStyle = '#cfd3da'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 0); c.stroke();
      cone(c, 10, 26, 2, 8, ['#f2f4f7', '#b8bec8', '#7d8590']);
      cyl(c, 26, 44, 8.5, ['#e8ebf0', '#a9b0bb', '#6c7380']);
      cyl(c, 44, 222, 10, ['#4a4f58', '#24272d', '#111317', '#000']);
      cyl(c, 90, 95, 10.2, ['#e8ebf0', '#a9b0bb', '#6c7380']);
      endCap(c, 222, 10, ['#4a4f58', '#24272d', '#000']);
      break;
    }
    case 'brush': {
      c.fillStyle = '#0d0d0d'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(12, -7.5, 36, -8); c.lineTo(36, 8);
      c.quadraticCurveTo(12, 7.5, 0, 0); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1; c.beginPath(); c.moveTo(6, -1.5); c.quadraticCurveTo(18, -5, 34, -5.5); c.stroke();
      cyl(c, 36, 50, 8.6, ['#6a5a40', '#3d3324', '#211a10']);
      cyl(c, 50, 262, 7.4, ['#e9d29b', '#c9a46a', '#a17c43', '#7a5a2b']);
      for (const x of [112, 190]) cyl(c, x, x + 4, 7.8, ['#b08a50', '#7a5a2b', '#5a4120']);
      endCap(c, 262, 7.4, ['#e9d29b', '#a17c43', '#7a5a2b']);
      c.strokeStyle = '#8a2b1f'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(282, 0, 6, 4, 0, 0, Math.PI * 2); c.stroke();
      break;
    }
  }
}
