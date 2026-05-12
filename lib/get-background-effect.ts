import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  parseBackgroundEffectFromDb,
  type BackgroundEffectValue,
} from '@/lib/background-effect-shared';

export type { BackgroundEffectValue };
export { parseBackgroundEffectFromDb } from '@/lib/background-effect-shared';

async function getBackgroundEffectUncached(): Promise<BackgroundEffectValue> {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: 'backgroundEffect' },
      select: { value: true },
    });
    return parseBackgroundEffectFromDb(setting?.value);
  } catch {
    return 'original';
  }
}

/** Server-only: read background effect from DB (cached 60s). */
export async function getBackgroundEffect(): Promise<BackgroundEffectValue> {
  return unstable_cache(getBackgroundEffectUncached, ['background-effect'], { revalidate: 60, tags: ['settings'] })();
}
