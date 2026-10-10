/** Panoya kopyala; başarısızsa `false` (çağıran metni seçili hale getirir). İzin reddi/HTTP'de de doğru sonuç verir. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
