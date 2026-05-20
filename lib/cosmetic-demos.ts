/**
 * Demo kozmetik vitrin verisi — slug ile upsert edilir (admin “demo yükle” ve prisma seed).
 * Görseller Dicebear; next.config.js remotePatterns içinde api.dicebear.com tanımlı olmalı.
 */
export type DemoCosmeticInput = {
  slug: string;
  name: string;
  description?: string;
  type: 'avatar_frame' | 'profile_badge' | 'profile_background';
  price: number;
  imageUrl: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
};

const DICE = 'https://api.dicebear.com/7.x';

export const DEMO_COSMETICS: DemoCosmeticInput[] = [
  {
    slug: 'hellfire-frame',
    name: 'Hellfire Frame',
    description: 'Profilinin etrafında cehennem ateşleri yansın.',
    price: 5000,
    type: 'avatar_frame',
    rarity: 'legendary',
    imageUrl: 'fire_effect',
  },
  {
    slug: 'cosmic-space-frame',
    name: 'Cosmic Space Frame',
    description: 'Derin uzayın gizemi ve kayan yıldızlar.',
    price: 7500,
    type: 'avatar_frame',
    rarity: 'legendary',
    imageUrl: 'space_effect',
  },
  {
    slug: 'cyberpunk-neon-frame',
    name: 'Cyberpunk Neon',
    description: 'Geleceğin sokaklarından gelen neon yansımalar.',
    price: 3000,
    type: 'avatar_frame',
    rarity: 'epic',
    imageUrl: 'cyberpunk_effect',
  },
  {
    slug: 'golden-crown-frame',
    name: 'Golden Crown',
    description: 'Sadece gerçek krallara ve kraliçelere özel.',
    price: 10000,
    type: 'avatar_frame',
    rarity: 'legendary',
    imageUrl: 'crown_effect',
  },
  {
    slug: 'glitch-matrix-frame',
    name: 'Glitch Matrix',
    description: 'Sistemi hackle, gerçekliği bük.',
    price: 6000,
    type: 'avatar_frame',
    rarity: 'epic',
    imageUrl: 'glitch_effect',
  },
  {
    slug: 'toxic-slime-frame',
    name: 'Toxic Slime',
    description: 'Tehlikeli ve asidik bir aura.',
    price: 4500,
    type: 'avatar_frame',
    rarity: 'rare',
    imageUrl: 'toxic_effect',
  },
  {
    slug: 'diamond-sponsor-badge',
    name: 'Diamond Sponsor Badge',
    description: 'İşletmenin en değerli destekçisi rozeti.',
    price: 2000,
    type: 'profile_badge',
    rarity: 'epic',
    imageUrl: 'diamond_badge',
  },
  {
    slug: 'ruby-heart-badge',
    name: 'Ruby Heart Badge',
    description: 'Sevgi dolu bir destekçi.',
    price: 1500,
    type: 'profile_badge',
    rarity: 'rare',
    imageUrl: 'ruby_badge',
  },
];
