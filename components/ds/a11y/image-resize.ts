/**
 * İstemci tarafı fotoğraf küçültme (canvas). Yükleme boyutunu ve süresini düşürür,
 * yeniden kodlama sayesinde EXIF meta verisini (GPS konumu dahil) SİLER — müşteri
 * fotoğraflarında gizlilik için önemlidir.
 */

export type ResizeOptions = {
  /** Uzun kenar üst sınırı (px). Varsayılan 1600. */
  maxDimension?: number;
  /** 0–1 kalite (jpeg/webp). Varsayılan 0.82. */
  quality?: number;
  /** Çıktı türü. Varsayılan `image/jpeg` (her tarayıcıda kodlanır). */
  type?: 'image/jpeg' | 'image/webp';
  /** Çıktı bu boyutu aşarsa kalite, sonra boyut kademeli düşürülür (bayt). */
  maxBytes?: number;
};

export type ResizedImage = {
  file: File;
  width: number;
  height: number;
};

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      // `from-image`: EXIF yönünü uygular (dik çekilmiş telefon fotoğrafı yan dönmez).
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      /* bazı tarayıcılar seçeneği desteklemez → <img> yolu */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob boş döndü'))), type, quality);
  });
}

function renameWithExtension(name: string, type: string): string {
  const ext = type === 'image/webp' ? 'webp' : 'jpg';
  const base = name.replace(/\.[^./\\]+$/, '') || 'foto';
  return `${base}.${ext}`;
}

/**
 * Fotoğrafı uzun kenarı `maxDimension`'ı geçmeyecek şekilde küçültür ve yeniden kodlar.
 * `maxBytes` verilirse sığana kadar kaliteyi (0.82 → 0.5), sonra boyutu (×0.8) düşürür;
 * yine sığmazsa son sonucu döndürür — çağıran boyutu kontrol etmelidir.
 * Çözülemeyen biçimde (ör. Chrome'da HEIC) hata fırlatır.
 */
export async function resizeImage(file: Blob & { name?: string }, options: ResizeOptions = {}): Promise<ResizedImage> {
  const type = options.type ?? 'image/jpeg';
  const startQuality = Math.min(1, Math.max(0.3, options.quality ?? 0.82));
  let maxDimension = Math.max(64, options.maxDimension ?? 1600);
  const decoded = await decode(file);
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas bağlamı alınamadı');

    let result: Blob | null = null;
    let width = decoded.width;
    let height = decoded.height;

    for (let pass = 0; pass < 4; pass += 1) {
      const scale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height));
      width = Math.max(1, Math.round(decoded.width * scale));
      height = Math.max(1, Math.round(decoded.height * scale));
      canvas.width = width;
      canvas.height = height;
      if (type === 'image/jpeg') {
        // Saydam PNG'ler JPEG'de siyaha dönmesin.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(decoded.source, 0, 0, width, height);

      for (let q = startQuality; q >= 0.5 - 1e-9; q -= 0.1) {
        result = await toBlob(canvas, type, Number(q.toFixed(2)));
        if (!options.maxBytes || result.size <= options.maxBytes) break;
      }
      if (!options.maxBytes || (result && result.size <= options.maxBytes)) break;
      maxDimension = Math.round(maxDimension * 0.8);
    }

    if (!result) throw new Error('Görsel kodlanamadı');
    const outType = result.type || type;
    const file2 = new File([result], renameWithExtension(file.name ?? 'foto', outType), {
      type: outType,
      lastModified: Date.now(),
    });
    return { file: file2, width, height };
  } finally {
    decoded.release();
  }
}
