/**
 * XHR tabanlı dosya yükleme — fetch upload PROGRESS'i desteklemez, bu yüzden XMLHttpRequest
 * kullanır. onProgress ile 0-100 yüzde verir (animasyonlu % bar için). JSON yanıtı parse eder.
 * Client-only (tarayıcı). Kullanım:
 *   const { ok, json } = await uploadWithProgress(url, fd, (p) => setPct(p));
 */
export function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
  method: 'POST' | 'PUT' = 'POST',
): Promise<{ ok: boolean; status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      };
      // Yükleme tamamlanınca (sunucu işlerken) 100'e sabitle.
      xhr.upload.onload = () => onProgress(100);
    }
    xhr.onload = () => {
      let json: unknown = {};
      try { json = JSON.parse(xhr.responseText); } catch { /* boş/JSON olmayan yanıt */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error('Ağ hatası'));
    xhr.ontimeout = () => reject(new Error('Zaman aşımı'));
    xhr.send(formData);
  });
}
