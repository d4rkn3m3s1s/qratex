/**
 * Katmanlı rastgele örnekleme (saf). Eski iş "en yeni 200'ün ilk 100'ü"nü alıyordu (yanlı:
 * hacimli bayi + hafta sonu baskın, nadir niyetler temsil edilmiyordu).
 *
 * Katman = duygu × niyet. Her katman payı oranında kota alır; boş kalmasın diye her katmana en
 * az 1 yer ayrılır (örneklem boyutu katman sayısından küçükse en büyük katmanlar önce). Katman
 * içi seçim Fisher–Yates ile; `rng` enjekte edilir (test belirlenimci).
 */
export interface SampleCandidate {
  id: string;
  sentiment: string | null;
  intent: string | null;
}

export type Rng = () => number;

export function stratumKey(c: Pick<SampleCandidate, 'sentiment' | 'intent'>): string {
  return `${c.sentiment ?? '?'}|${c.intent ?? '?'}`;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function stratifiedSample(candidates: readonly SampleCandidate[], size: number, rng: Rng = Math.random): { ids: string[]; strata: number } {
  if (size <= 0 || candidates.length === 0) return { ids: [], strata: 0 };
  const groups = new Map<string, SampleCandidate[]>();
  for (const c of candidates) {
    const k = stratumKey(c);
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  if (candidates.length <= size) return { ids: shuffle(candidates.map((c) => c.id), rng), strata: groups.size };

  // Büyükten küçüğe; eşitlikte anahtar sırası (belirlenimci).
  const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const total = candidates.length;
  const quota = new Map<string, number>();
  let assigned = 0;
  for (const [k, g] of entries) {
    if (assigned >= size) break;
    const q = Math.min(g.length, Math.max(1, Math.floor((g.length / total) * size)));
    quota.set(k, q);
    assigned += q;
  }
  // Fazla atandıysa en büyük katmanlardan geri al (her katmanda en az 1 kalsın).
  for (const [k] of entries) {
    if (assigned <= size) break;
    const q = quota.get(k) ?? 0;
    if (q > 1) {
      const cut = Math.min(q - 1, assigned - size);
      quota.set(k, q - cut);
      assigned -= cut;
    }
  }
  // Eksik kaldıysa kapasitesi olan katmanlara oransal sırayla dağıt.
  while (assigned < size) {
    let progressed = false;
    for (const [k, g] of entries) {
      if (assigned >= size) break;
      const q = quota.get(k) ?? 0;
      if (q < g.length) {
        quota.set(k, q + 1);
        assigned += 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  const ids: string[] = [];
  for (const [k, g] of entries) {
    const q = quota.get(k) ?? 0;
    if (q > 0) ids.push(...shuffle(g, rng).slice(0, q).map((c) => c.id));
  }
  return { ids: shuffle(ids, rng).slice(0, size), strata: groups.size };
}
