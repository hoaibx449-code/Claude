// QR codes for links shown in the video (affiliate products, landing pages).
import qrcode from 'qrcode-generator';

export function qrCells(text: string): boolean[][] | null {
  try {
    const q = qrcode(0, 'M');
    q.addData(String(text).slice(0, 300));
    q.make();
    const n = q.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
  } catch {
    return null;
  }
}
