/**
 * QR modül matrisi — `qrcode` kütüphanesinin tek giriş noktası (sunucu + istemci).
 * İstemci bu modülü yalnız dinamik `import()` ile yükler (kütüphane ilk yüklemeye girmez).
 */
import QRCode from 'qrcode';
import type { QrMatrix } from './print-layout';

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H';

/** Metni modül matrisine çevirir. Basılı malzeme için varsayılan düzeltme seviyesi Q (%25). */
export function qrMatrix(text: string, level: QrErrorLevel = 'Q'): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: level });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const rows: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = new Array(size);
    for (let c = 0; c < size; c++) row[c] = data[r * size + c] === 1;
    rows.push(row);
  }
  return { size, rows };
}
