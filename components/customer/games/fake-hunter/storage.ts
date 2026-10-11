/**
 * Sahte Avcısı — oyuncu başına yerel kolaylıklar (öğretici görüldü mü, pratik Elo'su, pratik
 * rekoru). Kritik değil: her erişim try/catch; depolama yoksa varsayılanlarla çalışır.
 * Sıralı skor/rekor SUNUCUDADIR (liderlik tablosu) — burada tutulmaz.
 */
import { ELO_START } from './rules';

const KEY = 'qx:fake-hunter:v1';

export interface FakeHunterLocal {
  tutorialSeen: boolean;
  elo: number;
  bestPractice: number;
}

const DEFAULTS: FakeHunterLocal = { tutorialSeen: false, elo: ELO_START, bestPractice: 0 };

export function readLocal(): FakeHunterLocal {
  try {
    if (typeof window === 'undefined') return { ...DEFAULTS };
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<FakeHunterLocal>;
    return {
      tutorialSeen: p.tutorialSeen === true,
      elo: typeof p.elo === 'number' && Number.isFinite(p.elo) ? p.elo : ELO_START,
      bestPractice: typeof p.bestPractice === 'number' && Number.isFinite(p.bestPractice) ? p.bestPractice : 0,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeLocal(patch: Partial<FakeHunterLocal>): FakeHunterLocal {
  const next = { ...readLocal(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* gizli mod / engelli depolama */
  }
  return next;
}
