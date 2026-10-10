/**
 * Sunucu tarafı oyun modülleri (doğrulayıcılar) — YALNIZ sunucu (route/lib) içe aktarır.
 * Etiketli içerik buradan zincirlenir; istemci paketine girerse etiketler sızar. Bu yüzden
 * tarayıcıda yüklenirse modül yüklenirken hata fırlatır (yüksek sesle başarısız ol).
 *
 * `./index`'i (bileşen yükleyicileri) BİLEREK içe aktarmaz: route handler paketine istemci
 * bileşen parçaları girmesin. Anahtarlar sunucu anahtarıdır (`gameType`); kayıt defteriyle
 * hizası `__tests__/lib/games-registry.test.ts`'te denetlenir.
 */
import type { AnyGameVerifier, GameServerModule } from '@/lib/games/verify/types';
import { serverModule as fakeHunter } from './fake-hunter.server';
import { serverModule as mindThief } from './mind-thief.server';
import { serverModule as coreDefense } from './core-defense.server';
import { serverModule as frostCatcher } from './frost-catcher.server';
import { serverModule as starHunt } from './star-hunt.server';
import { serverModule as dataSnake } from './data-snake.server';
import { serverModule as reviewStack } from './review-stack.server';
import { serverModule as spamBreaker } from './spam-breaker.server';
import { serverModule as trustMerge } from './trust-merge.server';
import { serverModule as signalPipe } from './signal-pipe.server';
import { serverModule as dailyWord } from './daily-word.server';
import { serverModule as matchThree } from './match-three.server';
import { serverModule as venueQuiz } from './venue-quiz.server';

if (typeof window !== 'undefined') {
  throw new Error('lib/games/registry/server yalnız sunucuda içe aktarılabilir (etiketli içerik sızar).');
}

/** Sunucu anahtarı (`gameType`) → sunucu modülü. Yıldız Avı'nın anahtarı tarihsel olarak 'pacman'. */
export const SERVER_GAME_MODULES: Readonly<Record<string, GameServerModule | null>> = {
  'fake-hunter': fakeHunter,
  'mind-thief': mindThief,
  'core-defense': coreDefense,
  'frost-catcher': frostCatcher,
  pacman: starHunt,
  'data-snake': dataSnake,
  'review-stack': reviewStack,
  'spam-breaker': spamBreaker,
  'trust-merge': trustMerge,
  'signal-pipe': signalPipe,
  'daily-word': dailyWord,
  'match-three': matchThree,
  'venue-quiz': venueQuiz,
};

/** Sunucu anahtarına (`gameType`) göre doğrulayıcı; tanımsızsa null (yalnız ortak makullük). */
export function getVerifierForGameType(gameType: string): AnyGameVerifier | null {
  if (!Object.prototype.hasOwnProperty.call(SERVER_GAME_MODULES, gameType)) return null;
  return SERVER_GAME_MODULES[gameType]?.verifier ?? null;
}
