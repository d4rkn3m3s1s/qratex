import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const results: string[] = [];

    // Clear existing items and seed
    await prisma.cosmeticItem.deleteMany({});
    results.push('Deleted all existing cosmetic items');

    await prisma.cosmeticItem.createMany({
      data: [
        {
          slug: "hellfire-frame",
          name: "Hellfire Frame",
          description: "Profilinin etrafında cehennem ateşleri yansın.",
          price: 5000,
          type: "avatar_frame",
          rarity: "legendary",
          imageUrl: "fire_effect",
          isActive: true
        },
        {
          slug: "cosmic-space-frame",
          name: "Cosmic Space Frame",
          description: "Derin uzayın gizemi ve kayan yıldızlar.",
          price: 7500,
          type: "avatar_frame",
          rarity: "legendary",
          imageUrl: "space_effect",
          isActive: true
        },
        {
          slug: "cyberpunk-neon-frame",
          name: "Cyberpunk Neon",
          description: "Geleceğin sokaklarından gelen neon yansımalar.",
          price: 3000,
          type: "avatar_frame",
          rarity: "epic",
          imageUrl: "cyberpunk_effect",
          isActive: true
        },
        {
          slug: "golden-crown-frame",
          name: "Golden Crown",
          description: "Sadece gerçek krallara ve kraliçelere özel.",
          price: 10000,
          type: "avatar_frame",
          rarity: "legendary",
          imageUrl: "crown_effect",
          isActive: true
        },
        {
          slug: "diamond-sponsor-badge",
          name: "Diamond Sponsor Badge",
          description: "İşletmenin en değerli destekçisi rozeti.",
          price: 2000,
          type: "profile_badge",
          rarity: "epic",
          imageUrl: "diamond_badge",
          isActive: true
        },
        {
          slug: "glitch-matrix-frame",
          name: "Glitch Matrix",
          description: "Sistemi hackle, gerçekliği bük.",
          price: 6000,
          type: "avatar_frame",
          rarity: "epic",
          imageUrl: "glitch_effect",
          isActive: true
        },
        {
          slug: "toxic-slime-frame",
          name: "Toxic Slime",
          description: "Tehlikeli ve asidik bir aura.",
          price: 4500,
          type: "avatar_frame",
          rarity: "rare",
          imageUrl: "toxic_effect",
          isActive: true
        },
        {
          slug: "ruby-heart-badge",
          name: "Ruby Heart Badge",
          description: "Sevgi dolu bir destekçi.",
          price: 1500,
          type: "profile_badge",
          rarity: 'rare',
          imageUrl: "ruby_badge",
          isActive: true
        }
      ]
    });
    results.push('Seeded premium items to database successfully');

    const check = await prisma.cosmeticItem.findMany();

    return NextResponse.json({ success: true, results, dbItemsCount: check.length, items: check });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
