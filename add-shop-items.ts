import { PrismaClient } from './generated-prisma-client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting shop items seed...');
  
  try {
    const { upsertDemoCosmetics } = await import('./lib/cosmetic-seed-server');
    const demoN = await upsertDemoCosmetics(prisma);
    console.log(`✅ Demo cosmetics seeded/updated: ${demoN} items`);
       const cosmeticItems = [
      {
        slug: 'hellfire-frame',
        name: 'Hellfire Frame',
        description: 'Profilinin etrafında cehennem ateşleri yansın.',
        price: 5000,
        type: 'avatar_frame',
        rarity: 'legendary',
        imageUrl: 'fire_effect',
        isActive: true,
      },
      {
        slug: 'cosmic-space-frame',
        name: 'Cosmic Space Frame',
        description: 'Derin uzayın gizemi ve kayan yıldızlar.',
        price: 7500,
        type: 'avatar_frame',
        rarity: 'legendary',
        imageUrl: 'space_effect',
        isActive: true,
      },
      {
        slug: 'cyberpunk-neon-frame',
        name: 'Cyberpunk Neon',
        description: 'Geleceğin sokaklarından gelen neon yansımalar.',
        price: 3000,
        type: 'avatar_frame',
        rarity: 'epic',
        imageUrl: 'cyberpunk_effect',
        isActive: true,
      },
      {
        slug: 'golden-crown-frame',
        name: 'Golden Crown',
        description: 'Sadece gerçek krallara ve kraliçelere özel.',
        price: 10000,
        type: 'avatar_frame',
        rarity: 'legendary',
        imageUrl: 'crown_effect',
        isActive: true,
      },
      {
        slug: 'glitch-matrix-frame',
        name: 'Glitch Matrix',
        description: 'Sistemi hackle, gerçekliği bük.',
        price: 6000,
        type: 'avatar_frame',
        rarity: 'epic',
        imageUrl: 'glitch_effect',
        isActive: true,
      },
      {
        slug: 'toxic-slime-frame',
        name: 'Toxic Slime',
        description: 'Tehlikeli ve asidik bir aura.',
        price: 4500,
        type: 'avatar_frame',
        rarity: 'rare',
        imageUrl: 'toxic_effect',
        isActive: true,
      },
      {
        slug: 'diamond-sponsor-badge',
        name: 'Diamond Sponsor Badge',
        description: 'İşletmenin en değerli destekçisi rozeti.',
        price: 2000,
        type: 'profile_badge',
        rarity: 'epic',
        imageUrl: 'diamond_badge',
        isActive: true,
      },
      {
        slug: 'ruby-heart-badge',
        name: 'Ruby Heart Badge',
        description: 'Sevgi dolu bir destekçi.',
        price: 1500,
        type: 'profile_badge',
        rarity: 'rare',
        imageUrl: 'ruby_badge',
        isActive: true,
      }
    ];

    // Clean up any old/removed cosmetic items (including those with null slugs)
    const cosmeticSlugs = cosmeticItems.map(item => item.slug);
    await prisma.cosmeticItem.deleteMany({
      where: {
        OR: [
          { slug: null },
          {
            slug: {
              notIn: cosmeticSlugs,
            },
          },
        ],
      },
    });

    for (const item of cosmeticItems) {
      await prisma.cosmeticItem.upsert({
        where: { slug: item.slug },
        update: item,
        create: item,
      });
    }

    console.log('✅ Additional cosmetic items seeded:', cosmeticItems.length);
  } catch (error) {
      console.error('Error seeding shop items:', error);
  } finally {
      await prisma.$disconnect();
  }
}

main();
