/** URL → liste sorgu dizgisi (sunucu sayfası ve istemci sekmeleri aynı anahtarı üretir). */
type Get = (k: string) => string | null;

export function keyQs(get: Get): string {
  const p = new URLSearchParams();
  p.set('status', get('kstatus') || 'active');
  const q = get('kq');
  if (q) p.set('q', q);
  p.set('page', get('kpage') || '1');
  p.set('size', get('ksize') || '25');
  return p.toString();
}

export function webhookQs(get: Get): string {
  const p = new URLSearchParams();
  p.set('status', get('wstatus') || 'active');
  const q = get('wq');
  if (q) p.set('q', q);
  return p.toString();
}

export function partnerQs(get: Get): string {
  const p = new URLSearchParams();
  p.set('status', get('pstatus') || 'active');
  const q = get('pq');
  if (q) p.set('q', q);
  const t = get('ptype');
  if (t) p.set('type', t);
  return p.toString();
}
