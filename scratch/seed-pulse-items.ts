
import { PrismaClient } from '../generated-prisma-client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding premium pulse lounge items...');

  const items = [
    {
      slug: 'pulse-nebula-bg',
      name: 'Nebula Flow',
      description: 'Canlı ve akışkan nebula efektli arka plan. Lounge atmosferini profilinize taşır.',
      type: 'profile_background',
      price: 1500,
      rarity: 'legendary',
      imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
      isActive: true,
    },
    {
      slug: 'pulse-cyber-grid-bg',
      name: 'Cyber Matrix',
      description: 'Fütüristik grid ve veri akışı simülasyonu. Teknoloji tutkunları için.',
      type: 'profile_background',
      price: 1200,
      rarity: 'epic',
      imageUrl: 'https://images.unsplash.com/photo-1635776062127-d379bfcba9f8?auto=format&fit=crop&q=80&w=800',
      isActive: true,
    },
    {
      slug: 'pulse-glass-frost-bg',
      name: 'Frosted Glass',
      description: 'Yumuşak, buzlu cam ve pastel renk geçişleri. Minimalist ve premium bir görünüm.',
      type: 'profile_background',
      price: 800,
      rarity: 'rare',
      imageUrl: 'https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=800',
      isActive: true,
    },
    {
      slug: 'pulse-golden-aura-frame',
      name: 'Lounge Gold Frame',
      description: 'Pulse Lounge üyelerine özel altın varaklı profil çerçevesi.',
      type: 'avatar_frame',
      price: 2500,
      rarity: 'legendary',
      imageUrl: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=800',
      isActive: true,
    }
  ];

  for (const item of items) {
    await prisma.cosmeticItem.upsert({
      where: { slug: item.slug },
      update: item,
      create: item,
    });
    console.log(`Upserted item: ${item.name}`);
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
