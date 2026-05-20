import type { PrismaClient } from '../generated-prisma-client';
import { DEMO_COSMETICS } from './cosmetic-demos';

export async function upsertDemoCosmetics(prisma: PrismaClient): Promise<number> {
  let n = 0;
  for (const d of DEMO_COSMETICS) {
    await prisma.cosmeticItem.upsert({
      where: { slug: d.slug },
      create: {
        slug: d.slug,
        name: d.name,
        description: d.description ?? null,
        type: d.type,
        price: d.price,
        imageUrl: d.imageUrl,
        rarity: d.rarity,
        isActive: true,
      },
      update: {
        name: d.name,
        description: d.description ?? null,
        type: d.type,
        price: d.price,
        imageUrl: d.imageUrl,
        rarity: d.rarity,
        isActive: true,
      },
    });
    n += 1;
  }
  return n;
}
