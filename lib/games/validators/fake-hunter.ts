/**
 * Sahte Avcısı — SUNUCU doğrulayıcısı (sınıflandırma ailesi). Yalnız
 * `lib/games/registry/fake-hunter.server.ts` içe aktarır; etiketli içerik buradan okunur.
 *
 * Sıralı tur: dört mod × 3 öğe (Kaydır → Dosya → Kelime → Profil), her aşamada zorluk artar.
 * İkili modlarda (gerçek/sahte) her aşamada her etiketten en az 1 öğe vardır — "hep sahte de"
 * stratejisi işe yaramaz. Tur tohumdan deterministik kurulur; `why` açıklaması sıralıda SİLİNİR
 * (etiketi ele verir), pratik turunda gider (anında öğretici geri bildirim).
 *
 * Pratik turu ayrı havuzdan (kimlik karmasıyla %25) gelir; istemci oradan Elo'ya göre seçer.
 */
import { classificationVerifier, type ClassificationVerifierConfig } from '@/lib/games/verify';
import type { ClassificationRound, PublicContentItem } from '@/lib/games/verify/types';
import { drawRound, splitPools } from '@/lib/games/content/pool';
import { FAKE_HUNTER_BANK, type FakeHunterItem } from '@/lib/games/content/fake-hunter.server';
import { MODE_ORDER, RANKED_PER_MODE, scoreAnswer } from '@/components/customer/games/fake-hunter/rules';

export const FAKE_HUNTER_POOLS = splitPools(FAKE_HUNTER_BANK);

function stagedRound(
  pool: readonly FakeHunterItem[],
  seed: string,
  perMode: number,
  opts: { keepWhy: boolean }
): ClassificationRound {
  const items: PublicContentItem[] = [];
  const answerKey: Record<string, string> = {};
  for (const mode of MODE_ORDER) {
    const binary = mode !== 'kelime';
    const r = drawRound(pool, seed, {
      count: perMode,
      stream: `fh:${mode}`,
      filter: (it) => it.payload.mode === mode,
      minPerLabel: binary ? 1 : 0,
    });
    // Aşama içinde zorluk eğrisi: kolaydan zora (eşitlikte çekiliş sırası korunur).
    const staged = r.items
      .map((it, i) => ({ it, i }))
      .sort((a, b) => Number(a.it.difficulty ?? 2) - Number(b.it.difficulty ?? 2) || a.i - b.i);
    for (const { it } of staged) {
      const qid = `q${items.length}`;
      const { why, ...rest } = it as PublicContentItem & { why?: string };
      items.push({ ...rest, ...(opts.keepWhy && why ? { why } : {}), id: qid });
      answerKey[qid] = r.answerKey[it.id];
    }
  }
  return { items, answerKey };
}

export function buildRankedRound(seed: string): ClassificationRound {
  return stagedRound(FAKE_HUNTER_POOLS.ranked, seed, RANKED_PER_MODE, { keepWhy: false });
}

/** Pratik: pratik havuzunun tamamı aşamalı sırada (istemci Elo'ya göre içinden seçer). */
export function buildPracticeRound(seed: string): ClassificationRound {
  return stagedRound(FAKE_HUNTER_POOLS.practice, seed, 64, { keepWhy: true });
}

export const fakeHunterVerifierConfig: ClassificationVerifierConfig = {
  buildRound: (seed) => buildRankedRound(seed),
  practiceRound: (seed) => buildPracticeRound(seed),
  // Kart okumak en az ~0,4 sn sürer; ikiden fazla daha hızlı cevap → betik.
  minAnswerGapMs: 400,
  maxFastAnswers: 2,
  scoreAnswer: ({ correct, streak }) => scoreAnswer({ correct, streak }),
};

export const fakeHunterVerifier = classificationVerifier(fakeHunterVerifierConfig);
