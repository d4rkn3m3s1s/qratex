/**
 * Mekân Bilgi Yarışması — oyuncu başına yerel kolaylıklar (öğretici görüldü mü, pratik
 * rekorları). Kritik değil: her erişim try/catch; depolama yoksa varsayılanlarla çalışır.
 * Sıralı skor SUNUCUDADIR (liderlik tablosu) — burada tutulmaz.
 */
const KEY = 'qx:venue-quiz:v1';

export interface VenueQuizLocal {
  tutorialSeen: boolean;
  /** Kategori (ya da 'karisik') → en iyi pratik skoru. */
  best: Record<string, number>;
}

const DEFAULTS: VenueQuizLocal = { tutorialSeen: false, best: {} };

export function readLocal(): VenueQuizLocal {
  try {
    if (typeof window === 'undefined') return { ...DEFAULTS, best: {} };
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, best: {} };
    const p = JSON.parse(raw) as Partial<VenueQuizLocal>;
    const best: Record<string, number> = {};
    if (p.best && typeof p.best === 'object') {
      for (const [k, v] of Object.entries(p.best)) if (typeof v === 'number' && Number.isFinite(v)) best[k] = v;
    }
    return { tutorialSeen: p.tutorialSeen === true, best };
  } catch {
    return { ...DEFAULTS, best: {} };
  }
}

export function writeLocal(patch: Partial<VenueQuizLocal>): VenueQuizLocal {
  const next = { ...readLocal(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* gizli mod / engelli depolama */
  }
  return next;
}
