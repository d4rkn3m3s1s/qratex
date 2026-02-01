import { PrismaClient, Role, CardStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Güvenli token üretici
function generateCardToken(prefix?: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const tokenLength = 21;
  let token = '';
  for (let i = 0; i < tokenLength; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return prefix ? `${prefix}_${token}` : token;
}

async function main() {
  console.log('🌱 Seeding database...');

  // ─────────────────────────────────────────────────────────────
  // CREATE ADMIN USER
  // ─────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@qratex.com' },
    update: {},
    create: {
      email: 'admin@qratex.com',
      name: 'Admin User',
      password: adminPassword,
      role: Role.ADMIN,
      emailVerified: new Date(),
      image: '/images/avatar/AVATAR ERKEK 1.svg',
      points: 10000,
      level: 99,
      xp: 999999,
    },
  });

  console.log('✅ Admin user created:', admin.email);

  // ─────────────────────────────────────────────────────────────
  // CREATE DEMO DEALER
  // ─────────────────────────────────────────────────────────────
  const dealerPassword = await bcrypt.hash('Dealer123!', 12);
  
  const dealer = await prisma.user.upsert({
    where: { email: 'dealer@qratex.com' },
    update: {},
    create: {
      email: 'dealer@qratex.com',
      name: 'Demo Dealer',
      password: dealerPassword,
      role: Role.DEALER,
      emailVerified: new Date(),
      image: '/images/avatar/COFFFE.svg',
      businessName: 'Demo Cafe',
      businessDesc: 'En iyi kahve deneyimi',
      businessLogo: '/logo/logo.png',
      points: 500,
      level: 5,
      xp: 2500,
    },
  });

  console.log('✅ Dealer user created:', dealer.email);

  // ─────────────────────────────────────────────────────────────
  // CREATE DEMO CUSTOMER
  // ─────────────────────────────────────────────────────────────
  const customerPassword = await bcrypt.hash('Customer123!', 12);
  
  const customer = await prisma.user.upsert({
    where: { email: 'customer@qratex.com' },
    update: {},
    create: {
      email: 'customer@qratex.com',
      name: 'Demo Customer',
      password: customerPassword,
      role: Role.CUSTOMER,
      emailVerified: new Date(),
      image: '/images/avatar/AVATAR KADIN 1.svg',
      points: 150,
      level: 2,
      xp: 350,
    },
  });

  console.log('✅ Customer user created:', customer.email);

  // ─────────────────────────────────────────────────────────────
  // CREATE BADGES WITH REAL SVG ICONS
  // ─────────────────────────────────────────────────────────────
  const badges = await Promise.all([
    prisma.badge.upsert({
      where: { id: 'badge-first-feedback' },
      update: {},
      create: {
        id: 'badge-first-feedback',
        name: 'İlk Adım',
        description: 'İlk geri bildiriminizi gönderdiniz!',
        icon: '/images/badges/YENİ SES.svg',
        category: 'feedback',
        rarity: 'common',
        requirement: { type: 'feedback_count', value: 1 },
      },
    }),
    prisma.badge.upsert({
      where: { id: 'badge-feedback-master' },
      update: {},
      create: {
        id: 'badge-feedback-master',
        name: 'Yorum Ustası',
        description: '50 geri bildirim gönderdiniz!',
        icon: '/images/badges/USTA YORUMCU.svg',
        category: 'feedback',
        rarity: 'epic',
        requirement: { type: 'feedback_count', value: 50 },
      },
    }),
    prisma.badge.upsert({
      where: { id: 'badge-early-bird' },
      update: {},
      create: {
        id: 'badge-early-bird',
        name: 'Erken Kuş',
        description: 'Platformun ilk kullanıcılarından biri oldunuz!',
        icon: '/images/badges/EFSANE.svg',
        category: 'special',
        rarity: 'legendary',
        requirement: { type: 'early_adopter', value: true },
      },
    }),
    prisma.badge.upsert({
      where: { id: 'badge-helpful' },
      update: {},
      create: {
        id: 'badge-helpful',
        name: 'Yardımsever',
        description: '10 detaylı geri bildirim yazdınız!',
        icon: '/images/badges/İLHAM KAYNAĞI.svg',
        category: 'feedback',
        rarity: 'rare',
        requirement: { type: 'detailed_feedback_count', value: 10 },
      },
    }),
    prisma.badge.upsert({
      where: { id: 'badge-loyal' },
      update: {},
      create: {
        id: 'badge-loyal',
        name: 'Sadık Müşteri',
        description: '30 gün boyunca aktif kaldınız!',
        icon: '/images/badges/MÜCEVHER.svg',
        category: 'engagement',
        rarity: 'epic',
        requirement: { type: 'active_days', value: 30 },
      },
    }),
    prisma.badge.upsert({
      where: { id: 'badge-word-wizard' },
      update: {},
      create: {
        id: 'badge-word-wizard',
        name: 'Kelime Büyücüsü',
        description: 'Uzun ve detaylı yorumlar yazdınız!',
        icon: '/images/badges/KELİME BÜYÜCÜSÜ.svg',
        category: 'feedback',
        rarity: 'rare',
        requirement: { type: 'long_feedback_count', value: 5 },
      },
    }),
    prisma.badge.upsert({
      where: { id: 'badge-perfectionist' },
      update: {},
      create: {
        id: 'badge-perfectionist',
        name: 'Mükemmeliyetçi',
        description: 'Her zaman 5 yıldız verdiniz!',
        icon: '/images/badges/MÜKEMMELLİYETÇİ.svg',
        category: 'rating',
        rarity: 'rare',
        requirement: { type: 'five_star_count', value: 10 },
      },
    }),
    prisma.badge.upsert({
      where: { id: 'badge-explorer' },
      update: {},
      create: {
        id: 'badge-explorer',
        name: 'Kaşif',
        description: '10 farklı işletmeyi ziyaret ettiniz!',
        icon: '/images/badges/TUR REHBERİ.svg',
        category: 'exploration',
        rarity: 'rare',
        requirement: { type: 'unique_businesses', value: 10 },
      },
    }),
    prisma.badge.upsert({
      where: { id: 'badge-gourmet' },
      update: {},
      create: {
        id: 'badge-gourmet',
        name: 'Gurme',
        description: 'Yemek kategorisinde uzman oldunuz!',
        icon: '/images/badges/gurme.svg',
        category: 'expertise',
        rarity: 'epic',
        requirement: { type: 'food_category_count', value: 20 },
      },
    }),
    prisma.badge.upsert({
      where: { id: 'badge-flash' },
      update: {},
      create: {
        id: 'badge-flash',
        name: 'Hızlı',
        description: 'Çok hızlı geri bildirim gönderdiniz!',
        icon: '/images/badges/FLASH.svg',
        category: 'speed',
        rarity: 'common',
        requirement: { type: 'quick_feedback', value: 5 },
      },
    }),
  ]);

  console.log('✅ Badges created:', badges.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE QUESTS
  // ─────────────────────────────────────────────────────────────
  const quests = await Promise.all([
    prisma.quest.upsert({
      where: { id: 'quest-daily-feedback' },
      update: {},
      create: {
        id: 'quest-daily-feedback',
        name: 'Günlük Geri Bildirim',
        description: 'Bugün 1 geri bildirim gönderin',
        icon: '/images/badges/YORUM MAKİNESİ.svg',
        type: 'daily',
        requirement: { type: 'give_feedback', count: 1 },
        reward: { points: 50, xp: 25 },
      },
    }),
    prisma.quest.upsert({
      where: { id: 'quest-weekly-explorer' },
      update: {},
      create: {
        id: 'quest-weekly-explorer',
        name: 'Haftalık Kaşif',
        description: 'Bu hafta 5 farklı işletmeyi ziyaret edin',
        icon: '/images/badges/TUR REHBERİ.svg',
        type: 'weekly',
        requirement: { type: 'visit_businesses', count: 5 },
        reward: { points: 200, xp: 100 },
      },
    }),
    prisma.quest.upsert({
      where: { id: 'quest-photo-feedback' },
      update: {},
      create: {
        id: 'quest-photo-feedback',
        name: 'Fotoğraflı Geri Bildirim',
        description: 'Fotoğraf içeren bir geri bildirim gönderin',
        icon: '/images/badges/EMOJİ USTASI.svg',
        type: 'daily',
        requirement: { type: 'feedback_with_photo', count: 1 },
        reward: { points: 75, xp: 40 },
      },
    }),
    prisma.quest.upsert({
      where: { id: 'quest-detailed-review' },
      update: {},
      create: {
        id: 'quest-detailed-review',
        name: 'Detaylı Değerlendirme',
        description: '100+ karakter uzunluğunda yorum yazın',
        icon: '/images/badges/KELİME BÜYÜCÜSÜ.svg',
        type: 'daily',
        requirement: { type: 'detailed_feedback', count: 1 },
        reward: { points: 100, xp: 50 },
      },
    }),
  ]);

  console.log('✅ Quests created:', quests.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE REWARDS
  // ─────────────────────────────────────────────────────────────
  const rewards = await Promise.all([
    prisma.reward.upsert({
      where: { id: 'reward-coffee-coupon' },
      update: {},
      create: {
        id: 'reward-coffee-coupon',
        name: 'Ücretsiz Kahve',
        description: 'Anlaşmalı kafelerde ücretsiz kahve kuponu',
        icon: '/images/avatar/COFFFE.svg',
        cost: 500,
        type: 'coupon',
        stock: 100,
      },
    }),
    prisma.reward.upsert({
      where: { id: 'reward-discount-10' },
      update: {},
      create: {
        id: 'reward-discount-10',
        name: '%10 İndirim',
        description: 'Bir sonraki alışverişinizde %10 indirim',
        icon: '/images/badges/sürpriz kutusu.svg',
        cost: 300,
        type: 'coupon',
        stock: -1,
      },
    }),
    prisma.reward.upsert({
      where: { id: 'reward-vip-badge' },
      update: {},
      create: {
        id: 'reward-vip-badge',
        name: 'VIP Rozet',
        description: 'Profilinizde VIP rozeti kazanın',
        icon: '/images/badges/TAHT SAHİBİ.svg',
        cost: 1000,
        type: 'digital',
        stock: -1,
      },
    }),
    prisma.reward.upsert({
      where: { id: 'reward-donut' },
      update: {},
      create: {
        id: 'reward-donut',
        name: 'Ücretsiz Tatlı',
        description: 'Anlaşmalı pastanelerde ücretsiz tatlı',
        icon: '/images/avatar/DONUT.svg',
        cost: 400,
        type: 'coupon',
        stock: 50,
      },
    }),
  ]);

  console.log('✅ Rewards created:', rewards.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE QR CODES FOR DEALER
  // ─────────────────────────────────────────────────────────────
  const qrCodes = await Promise.all([
    prisma.qRCode.upsert({
      where: { id: 'qr-demo-1' },
      update: {},
      create: {
        id: 'qr-demo-1',
        code: 'DEMO-CAFE-001',
        name: 'Ana Masa QR',
        description: 'Ana girişteki masa için QR kod',
        dealerId: dealer.id,
        scanCount: 42,
      },
    }),
    prisma.qRCode.upsert({
      where: { id: 'qr-demo-2' },
      update: {},
      create: {
        id: 'qr-demo-2',
        code: 'DEMO-CAFE-002',
        name: 'Teras QR',
        description: 'Teras alanı için QR kod',
        dealerId: dealer.id,
        scanCount: 28,
      },
    }),
  ]);

  console.log('✅ QR Codes created:', qrCodes.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE SAMPLE FEEDBACKS
  // ─────────────────────────────────────────────────────────────
  const feedbacks = await Promise.all([
    prisma.feedback.create({
      data: {
        qrCodeId: qrCodes[0].id,
        userId: customer.id,
        rating: 5,
        text: 'Harika bir deneyimdi! Kahveler çok lezzetli ve personel çok ilgiliydi.',
        sentiment: 'positive',
        emotions: { happy: 0.9, satisfied: 0.85 },
        topics: ['service', 'quality', 'staff'],
      },
    }),
    prisma.feedback.create({
      data: {
        qrCodeId: qrCodes[0].id,
        rating: 4,
        text: 'Ortam güzel ama biraz kalabalıktı.',
        sentiment: 'positive',
        emotions: { satisfied: 0.7, neutral: 0.3 },
        topics: ['atmosphere', 'crowded'],
      },
    }),
    prisma.feedback.create({
      data: {
        qrCodeId: qrCodes[1].id,
        rating: 3,
        text: 'Beklentilerimi tam olarak karşılamadı.',
        sentiment: 'neutral',
        emotions: { neutral: 0.6, disappointed: 0.3 },
        topics: ['expectations'],
      },
    }),
  ]);

  console.log('✅ Feedbacks created:', feedbacks.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE SETTINGS
  // ─────────────────────────────────────────────────────────────
  const settings = await Promise.all([
    prisma.settings.upsert({
      where: { key: 'site_name' },
      update: {},
      create: {
        key: 'site_name',
        value: { value: 'QRATEX' },
        category: 'general',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'site_description' },
      update: {},
      create: {
        key: 'site_description',
        value: { value: 'QR Tabanlı Geri Bildirim ve Gamification Platformu' },
        category: 'general',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'header_config' },
      update: {},
      create: {
        key: 'header_config',
        value: {
          logo: '/logo/logo.png',
          logoLight: '/logo/logo-light.png',
          menuItems: [
            { label: 'Ana Sayfa', href: '/' },
            { label: 'Özellikler', href: '/#features' },
            { label: 'Fiyatlandırma', href: '/#pricing' },
            { label: 'İletişim', href: '/contact' },
          ],
          ctaButton: { label: 'Başla', href: '/auth/register' },
        },
        category: 'layout',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'footer_config' },
      update: {},
      create: {
        key: 'footer_config',
        value: {
          columns: [
            {
              title: 'Ürün',
              links: [
                { label: 'Özellikler', href: '/#features' },
                { label: 'Fiyatlandırma', href: '/#pricing' },
                { label: 'API', href: '/api-docs' },
              ],
            },
            {
              title: 'Şirket',
              links: [
                { label: 'Hakkımızda', href: '/about' },
                { label: 'Blog', href: '/blog' },
                { label: 'Kariyer', href: '/careers' },
              ],
            },
            {
              title: 'Destek',
              links: [
                { label: 'Yardım Merkezi', href: '/help' },
                { label: 'İletişim', href: '/contact' },
                { label: 'SSS', href: '/faq' },
              ],
            },
          ],
          socialLinks: [
            { platform: 'twitter', href: 'https://twitter.com/qratex' },
            { platform: 'linkedin', href: 'https://linkedin.com/company/qratex' },
            { platform: 'instagram', href: 'https://instagram.com/qratex' },
          ],
          legalText: '© 2024 QRATEX. Tüm hakları saklıdır.',
        },
        category: 'layout',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'gamification_config' },
      update: {},
      create: {
        key: 'gamification_config',
        value: {
          pointsPerFeedback: 50,
          pointsPerDetailedFeedback: 100,
          xpPerLevel: 1000,
          levelMultiplier: 1.5,
          leagues: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
        },
        category: 'gamification',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'ai_config' },
      update: {},
      create: {
        key: 'ai_config',
        value: {
          enabled: true,
          model: 'gpt-4-turbo-preview',
          maxTokens: 500,
          temperature: 0.7,
          sentimentAnalysis: true,
          emotionDetection: true,
          topicExtraction: true,
          toxicityCheck: true,
        },
        category: 'ai',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'theme_config' },
      update: {},
      create: {
        key: 'theme_config',
        value: {
          defaultTheme: 'dark',
          allowUserTheme: true,
          primaryColor: '#8b5cf6',
          accentColor: '#d946ef',
        },
        category: 'theme',
      },
    }),
    prisma.settings.upsert({
      where: { key: 'avatar_options' },
      update: {},
      create: {
        key: 'avatar_options',
        value: {
          categories: [
            {
              name: 'İnsanlar',
              avatars: [
                '/images/avatar/AVATAR ERKEK 1.svg',
                '/images/avatar/AVATAR ERKEK 2.svg',
                '/images/avatar/AVATAR ERKEK 3.svg',
                '/images/avatar/AVATAR ERKEK 4.svg',
                '/images/avatar/AVATAR ERKEK 5.svg',
                '/images/avatar/AVATAR KADIN 1.svg',
                '/images/avatar/AVATAR KADIN 2.svg',
                '/images/avatar/AVATAR KADIN 3.svg',
                '/images/avatar/AVATAR KADIN 4.svg',
              ],
            },
            {
              name: 'Hayvanlar',
              avatars: [
                '/images/avatar/CAT.svg',
                '/images/avatar/DOG.svg',
                '/images/avatar/ELEPHANT.svg',
                '/images/avatar/FROG.svg',
                '/images/avatar/KOALA.svg',
                '/images/avatar/LİON.svg',
                '/images/avatar/MONKEY.svg',
                '/images/avatar/PANDA.svg',
                '/images/avatar/TİGER.svg',
              ],
            },
            {
              name: 'Yiyecekler',
              avatars: [
                '/images/avatar/APPLE.svg',
                '/images/avatar/AVACADO.svg',
                '/images/avatar/BANANA.svg',
                '/images/avatar/BLUEBERRY.svg',
                '/images/avatar/CHERRRY.svg',
                '/images/avatar/COFFFE.svg',
                '/images/avatar/DONUT.svg',
                '/images/avatar/HAMBURGER.svg',
                '/images/avatar/PİZZ.svg',
              ],
            },
            {
              name: 'Emojiler',
              avatars: [
                '/images/avatar/EMOJİ1.svg',
                '/images/avatar/EMOJİ2.svg',
                '/images/avatar/EMOJİ3.svg',
                '/images/avatar/EMOJİ4.svg',
                '/images/avatar/EMOJİ5.svg',
                '/images/avatar/EMOJİ6.svg',
                '/images/avatar/EMOJİ7.svg',
                '/images/avatar/EMOJİ8.svg',
              ],
            },
          ],
        },
        category: 'avatars',
      },
    }),
  ]);

  console.log('✅ Settings created:', settings.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE FEATURE FLAGS
  // ─────────────────────────────────────────────────────────────
  const featureFlags = await Promise.all([
    prisma.featureFlag.upsert({
      where: { key: 'gamification' },
      update: {},
      create: {
        key: 'gamification',
        name: 'Gamification Sistemi',
        description: 'Puan, rozet ve ödül sistemi',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'ai_analysis' },
      update: {},
      create: {
        key: 'ai_analysis',
        name: 'AI Analizi',
        description: 'OpenAI ile geri bildirim analizi',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'push_notifications' },
      update: {},
      create: {
        key: 'push_notifications',
        name: 'Push Bildirimleri',
        description: 'Tarayıcı push bildirimleri',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'leaderboard' },
      update: {},
      create: {
        key: 'leaderboard',
        name: 'Liderlik Tablosu',
        description: 'Kullanıcı sıralaması',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'vip_club' },
      update: {},
      create: {
        key: 'vip_club',
        name: 'VIP Kulüp',
        description: 'VIP üyelik özellikleri',
        isEnabled: false,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'dark_mode' },
      update: {},
      create: {
        key: 'dark_mode',
        name: 'Karanlık Mod',
        description: 'Karanlık tema desteği',
        isEnabled: true,
      },
    }),
    prisma.featureFlag.upsert({
      where: { key: 'light_mode' },
      update: {},
      create: {
        key: 'light_mode',
        name: 'Açık Mod',
        description: 'Açık tema desteği',
        isEnabled: true,
      },
    }),
  ]);

  console.log('✅ Feature flags created:', featureFlags.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE PRICING PLANS
  // ─────────────────────────────────────────────────────────────
  const pricingPlans = await Promise.all([
    prisma.pricingPlan.upsert({
      where: { id: 'plan-free' },
      update: {},
      create: {
        id: 'plan-free',
        name: 'Ücretsiz',
        description: 'Küçük işletmeler için ideal başlangıç',
        price: 0,
        currency: 'TRY',
        interval: 'monthly',
        features: [
          '3 QR Kod',
          'Aylık 100 Geri Bildirim',
          'Temel Analitik',
          'E-posta Desteği',
        ],
        order: 0,
      },
    }),
    prisma.pricingPlan.upsert({
      where: { id: 'plan-starter' },
      update: {},
      create: {
        id: 'plan-starter',
        name: 'Başlangıç',
        description: 'Büyüyen işletmeler için',
        price: 299,
        currency: 'TRY',
        interval: 'monthly',
        features: [
          '10 QR Kod',
          'Aylık 500 Geri Bildirim',
          'Gelişmiş Analitik',
          'AI Duygu Analizi',
          'Öncelikli Destek',
        ],
        isPopular: true,
        order: 1,
      },
    }),
    prisma.pricingPlan.upsert({
      where: { id: 'plan-pro' },
      update: {},
      create: {
        id: 'plan-pro',
        name: 'Profesyonel',
        description: 'Orta ölçekli işletmeler için',
        price: 699,
        currency: 'TRY',
        interval: 'monthly',
        features: [
          'Sınırsız QR Kod',
          'Sınırsız Geri Bildirim',
          'Tam Analitik Paketi',
          'AI Asistan',
          'API Erişimi',
          'Özel Entegrasyonlar',
          '7/24 Destek',
        ],
        order: 2,
      },
    }),
    prisma.pricingPlan.upsert({
      where: { id: 'plan-enterprise' },
      update: {},
      create: {
        id: 'plan-enterprise',
        name: 'Kurumsal',
        description: 'Büyük işletmeler ve zincirler için',
        price: 1999,
        currency: 'TRY',
        interval: 'monthly',
        features: [
          'Tüm Pro Özellikleri',
          'Çoklu Şube Yönetimi',
          'Özel Raporlama',
          'SLA Garantisi',
          'Dedicated Hesap Yöneticisi',
          'On-premise Seçeneği',
          'Özel Eğitim',
        ],
        order: 3,
      },
    }),
  ]);

  console.log('✅ Pricing plans created:', pricingPlans.length);

  // ─────────────────────────────────────────────────────────────
  // GIVE BADGES TO USERS
  // ─────────────────────────────────────────────────────────────
  await prisma.userBadge.upsert({
    where: {
      userId_badgeId: {
        userId: customer.id,
        badgeId: 'badge-first-feedback',
      },
    },
    update: {},
    create: {
      userId: customer.id,
      badgeId: 'badge-first-feedback',
    },
  });

  await prisma.userBadge.upsert({
    where: {
      userId_badgeId: {
        userId: admin.id,
        badgeId: 'badge-early-bird',
      },
    },
    update: {},
    create: {
      userId: admin.id,
      badgeId: 'badge-early-bird',
    },
  });

  console.log('✅ User badges assigned');

  // ─────────────────────────────────────────────────────────────
  // CREATE DONATION PROJECTS
  // ─────────────────────────────────────────────────────────────
  const donationProjects = await Promise.all([
    prisma.donationProject.upsert({
      where: { id: 'project-clean-water' },
      update: {},
      create: {
        id: 'project-clean-water',
        name: 'Temiz Su Projesi',
        description: 'Afrika köylerinde temiz su kuyuları açarak binlerce insanın hayatını değiştiriyoruz. Her 100 puan = 10 litre temiz su.',
        icon: '💧',
        category: 'water',
        goal: 10000,
        current: 3250,
        impact: { unit: 'litre', perPoint: 0.1, label: 'Temiz Su' },
        tags: ['Temel İhtiyaç', 'Afrika', 'Sürdürülebilir'],
        isFeatured: true,
      },
    }),
    prisma.donationProject.upsert({
      where: { id: 'project-education' },
      update: {},
      create: {
        id: 'project-education',
        name: 'Eğitim Bursu',
        description: 'Dezavantajlı öğrencilere eğitim bursu sağlayarak geleceğe yatırım yapıyoruz. Her 500 puan = 1 öğrenci için 1 aylık eğitim desteği.',
        icon: '📚',
        category: 'education',
        goal: 25000,
        current: 8750,
        impact: { unit: 'öğrenci', perPoint: 0.002, label: 'Eğitim Desteği' },
        tags: ['Eğitim', 'Gençlik', 'Fırsat Eşitliği'],
        isFeatured: true,
      },
    }),
    prisma.donationProject.upsert({
      where: { id: 'project-tree-planting' },
      update: {},
      create: {
        id: 'project-tree-planting',
        name: 'Fidan Dikimi',
        description: 'Ormanlarımızı yeniden yeşertiyoruz. Her 200 puan = 1 fidan dikimi. Geleceğe nefes olun!',
        icon: '🌳',
        category: 'environment',
        goal: 15000,
        current: 6420,
        impact: { unit: 'fidan', perPoint: 0.005, label: 'Dikilen Fidan' },
        tags: ['Çevre', 'İklim', 'Yeşil Gelecek'],
        isFeatured: false,
      },
    }),
    prisma.donationProject.upsert({
      where: { id: 'project-animal-shelter' },
      update: {},
      create: {
        id: 'project-animal-shelter',
        name: 'Hayvan Barınağı Desteği',
        description: 'Sokak hayvanlarına yiyecek ve barınak sağlıyoruz. Her 50 puan = 1 kg mama.',
        icon: '🐾',
        category: 'animals',
        goal: 8000,
        current: 2150,
        impact: { unit: 'kg mama', perPoint: 0.02, label: 'Hayvan Maması' },
        tags: ['Hayvan Hakları', 'Sokak Hayvanları', 'Barınak'],
        isFeatured: false,
      },
    }),
    prisma.donationProject.upsert({
      where: { id: 'project-health-support' },
      update: {},
      create: {
        id: 'project-health-support',
        name: 'Sağlık Yardımı',
        description: 'İhtiyaç sahibi ailelere sağlık desteği sağlıyoruz. Her 1000 puan = 1 sağlık paketi.',
        icon: '🏥',
        category: 'health',
        goal: 20000,
        current: 4500,
        impact: { unit: 'paket', perPoint: 0.001, label: 'Sağlık Paketi' },
        tags: ['Sağlık', 'Destek', 'Acil Yardım'],
        isFeatured: false,
      },
    }),
  ]);

  console.log('✅ Donation projects created:', donationProjects.length);

  // Create some sample donations
  await prisma.donation.createMany({
    data: [
      {
        userId: admin.id,
        projectId: 'project-clean-water',
        points: 500,
        message: 'Temiz su herkesin hakkı!',
        isPublic: true,
      },
      {
        userId: admin.id,
        projectId: 'project-education',
        points: 750,
        message: 'Eğitim en büyük yatırım.',
        isPublic: true,
      },
      {
        userId: customer.id,
        projectId: 'project-tree-planting',
        points: 100,
        message: 'Yeşil bir gelecek için!',
        isPublic: true,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Sample donations created');

  // ─────────────────────────────────────────────────────────────
  // PHYSICAL CARD SYSTEM - PRODUCT CATEGORIES
  // ─────────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.productCategory.upsert({
      where: { id: 'cat-food' },
      update: {},
      create: {
        id: 'cat-food',
        name: 'Yemekler',
        icon: '🍽️',
        order: 1,
        dealerId: null, // Global kategori
      },
    }),
    prisma.productCategory.upsert({
      where: { id: 'cat-drinks' },
      update: {},
      create: {
        id: 'cat-drinks',
        name: 'İçecekler',
        icon: '🥤',
        order: 2,
        dealerId: null,
      },
    }),
    prisma.productCategory.upsert({
      where: { id: 'cat-desserts' },
      update: {},
      create: {
        id: 'cat-desserts',
        name: 'Tatlılar',
        icon: '🍰',
        order: 3,
        dealerId: null,
      },
    }),
    prisma.productCategory.upsert({
      where: { id: 'cat-coffee' },
      update: {},
      create: {
        id: 'cat-coffee',
        name: 'Kahveler',
        icon: '☕',
        order: 4,
        dealerId: null,
      },
    }),
    prisma.productCategory.upsert({
      where: { id: 'cat-snacks' },
      update: {},
      create: {
        id: 'cat-snacks',
        name: 'Atıştırmalıklar',
        icon: '🍿',
        order: 5,
        dealerId: null,
      },
    }),
  ]);

  console.log('✅ Product categories created:', categories.length);

  // ─────────────────────────────────────────────────────────────
  // PHYSICAL CARD SYSTEM - PRODUCTS
  // ─────────────────────────────────────────────────────────────
  const products = await Promise.all([
    // Yemekler
    prisma.product.upsert({
      where: { id: 'prod-burger' },
      update: {},
      create: {
        id: 'prod-burger',
        name: 'Klasik Burger',
        description: 'Dana köfte, marul, domates, turşu',
        price: 180,
        categoryId: 'cat-food',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-pizza' },
      update: {},
      create: {
        id: 'prod-pizza',
        name: 'Karışık Pizza',
        description: 'Sucuk, sosis, mantar, biber, mozzarella',
        price: 220,
        categoryId: 'cat-food',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-pasta' },
      update: {},
      create: {
        id: 'prod-pasta',
        name: 'Fettuccine Alfredo',
        description: 'Kremalı makarna, parmesan',
        price: 160,
        categoryId: 'cat-food',
        dealerId: dealer.id,
      },
    }),
    // İçecekler
    prisma.product.upsert({
      where: { id: 'prod-cola' },
      update: {},
      create: {
        id: 'prod-cola',
        name: 'Kola',
        description: '330ml',
        price: 35,
        categoryId: 'cat-drinks',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-lemonade' },
      update: {},
      create: {
        id: 'prod-lemonade',
        name: 'Ev Yapımı Limonata',
        description: 'Taze sıkılmış',
        price: 45,
        categoryId: 'cat-drinks',
        dealerId: dealer.id,
      },
    }),
    // Kahveler
    prisma.product.upsert({
      where: { id: 'prod-latte' },
      update: {},
      create: {
        id: 'prod-latte',
        name: 'Caffè Latte',
        description: 'Espresso + süt köpüğü',
        price: 55,
        categoryId: 'cat-coffee',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-americano' },
      update: {},
      create: {
        id: 'prod-americano',
        name: 'Americano',
        description: 'Double shot espresso + su',
        price: 45,
        categoryId: 'cat-coffee',
        dealerId: dealer.id,
      },
    }),
    // Tatlılar
    prisma.product.upsert({
      where: { id: 'prod-cheesecake' },
      update: {},
      create: {
        id: 'prod-cheesecake',
        name: 'San Sebastian Cheesecake',
        description: 'Yanık cheesecake',
        price: 85,
        categoryId: 'cat-desserts',
        dealerId: dealer.id,
      },
    }),
    prisma.product.upsert({
      where: { id: 'prod-brownie' },
      update: {},
      create: {
        id: 'prod-brownie',
        name: 'Brownie',
        description: 'Dondurma ile servis',
        price: 75,
        categoryId: 'cat-desserts',
        dealerId: dealer.id,
      },
    }),
  ]);

  console.log('✅ Products created:', products.length);

  // ─────────────────────────────────────────────────────────────
  // PHYSICAL CARD SYSTEM - DEMO CARDS
  // ─────────────────────────────────────────────────────────────
  const demoCardBatch = await prisma.cardBatch.upsert({
    where: { id: 'batch-demo' },
    update: {},
    create: {
      id: 'batch-demo',
      name: 'Demo Kartlar - Ocak 2024',
      quantity: 5,
      prefix: 'DEMO',
      createdById: admin.id,
    },
  });

  console.log('✅ Card batch created:', demoCardBatch.name);

  // Demo kartlar - 1 aktive edilmiş (müşteriye bağlı), 2 boş, 1 bloklu
  const demoCards = await Promise.all([
    // Müşteriye bağlı aktif kart
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-1' },
      update: {},
      create: {
        id: 'card-demo-1',
        token: 'DEMO_AktifKartToken12345',
        batchId: demoCardBatch.id,
        status: CardStatus.ACTIVATED,
        customerId: customer.id,
        activatedAt: new Date(),
      },
    }),
    // Boş kartlar (aktivasyon bekliyor)
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-2' },
      update: {},
      create: {
        id: 'card-demo-2',
        token: 'DEMO_BosKartToken123456',
        batchId: demoCardBatch.id,
        status: CardStatus.UNUSED,
      },
    }),
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-3' },
      update: {},
      create: {
        id: 'card-demo-3',
        token: 'DEMO_BosKartToken789012',
        batchId: demoCardBatch.id,
        status: CardStatus.UNUSED,
      },
    }),
    // Bloklanmış kart
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-4' },
      update: {},
      create: {
        id: 'card-demo-4',
        token: 'DEMO_BlokluKartToken345',
        batchId: demoCardBatch.id,
        status: CardStatus.BLOCKED,
        blockedAt: new Date(),
        blockReason: 'Demo bloklu kart - test amaçlı',
      },
    }),
    // Test için sabit token'lı kart
    prisma.physicalCard.upsert({
      where: { id: 'card-demo-5' },
      update: {},
      create: {
        id: 'card-demo-5',
        token: 'TEST123',
        batchId: demoCardBatch.id,
        status: CardStatus.UNUSED,
      },
    }),
  ]);

  console.log('✅ Physical cards created:', demoCards.length);

  // ─────────────────────────────────────────────────────────────
  // PHYSICAL CARD SYSTEM - DEMO CONSUMPTION
  // ─────────────────────────────────────────────────────────────
  const demoConsumption = await prisma.consumption.upsert({
    where: { id: 'consumption-demo-1' },
    update: {},
    create: {
      id: 'consumption-demo-1',
      cardId: 'card-demo-1',
      customerId: customer.id,
      dealerId: dealer.id,
      productId: 'prod-latte',
      amount: 55,
      note: 'Demo tüketim kaydı',
    },
  });

  console.log('✅ Demo consumption created:', demoConsumption.id);

  // Demo consumption review
  await prisma.consumptionReview.upsert({
    where: { id: 'review-demo-1' },
    update: {},
    create: {
      id: 'review-demo-1',
      consumptionId: demoConsumption.id,
      customerId: customer.id,
      rating: 5,
      text: 'Harika bir latte! Kahve çekirdekleri çok kaliteli.',
      dimensions: {
        taste: 5,
        service: 5,
        ambiance: 4,
        value: 4,
      },
    },
  });

  console.log('✅ Demo consumption review created');

  // Card audit log örneği
  await prisma.cardAuditLog.createMany({
    data: [
      {
        cardId: 'card-demo-1',
        userId: customer.id,
        action: 'ACTIVATED',
        metadata: { source: 'seed' },
      },
      {
        cardId: 'card-demo-1',
        userId: dealer.id,
        action: 'CONSUMPTION_ADDED',
        metadata: { consumptionId: demoConsumption.id },
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Card audit logs created');

  // ─────────────────────────────────────────────────────────────
  // CREATE VIP TIERS
  // ─────────────────────────────────────────────────────────────
  const vipTiers = [
    {
      name: 'Bronze',
      minPoints: 0,
      multiplier: 1.0,
      benefits: [
        { type: 'points', label: '1x puan kazanımı' },
        { type: 'access', label: 'Temel ödüllere erişim' },
      ],
      color: '#CD7F32',
      icon: '🥉',
      order: 1,
    },
    {
      name: 'Silver',
      minPoints: 1000,
      multiplier: 1.25,
      benefits: [
        { type: 'points', label: '1.25x puan kazanımı' },
        { type: 'access', label: 'Özel ödüllere erişim' },
        { type: 'support', label: 'Öncelikli destek' },
      ],
      color: '#C0C0C0',
      icon: '🥈',
      order: 2,
    },
    {
      name: 'Gold',
      minPoints: 5000,
      multiplier: 1.5,
      benefits: [
        { type: 'points', label: '1.5x puan kazanımı' },
        { type: 'access', label: 'Premium ödüllere erişim' },
        { type: 'support', label: 'VIP destek' },
        { type: 'exclusive', label: 'Özel kampanyalar' },
      ],
      color: '#FFD700',
      icon: '🥇',
      order: 3,
    },
    {
      name: 'Platinum',
      minPoints: 15000,
      multiplier: 2.0,
      benefits: [
        { type: 'points', label: '2x puan kazanımı' },
        { type: 'access', label: 'Tüm ödüllere erişim' },
        { type: 'support', label: 'Kişisel hesap yöneticisi' },
        { type: 'exclusive', label: 'Özel etkinlikler' },
        { type: 'gift', label: 'Yıllık hediye' },
      ],
      color: '#E5E4E2',
      icon: '💎',
      order: 4,
    },
  ];

  for (const tier of vipTiers) {
    await (prisma as any).vIPTier.upsert({
      where: { name: tier.name },
      update: tier,
      create: tier,
    });
  }
  console.log('✅ VIP tiers created:', vipTiers.length);

  // ─────────────────────────────────────────────────────────────
  // CREATE HAPPY HOURS
  // ─────────────────────────────────────────────────────────────
  await (prisma as any).happyHour.upsert({
    where: { id: 'hh-lunch-special' },
    update: {},
    create: {
      id: 'hh-lunch-special',
      dealerId: dealer.id,
      name: 'Öğle Yemeği Bonusu',
      description: 'Öğle saatlerinde ekstra puan kazan!',
      multiplier: 1.5,
      startTime: '12:00',
      endTime: '14:00',
      daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
      isActive: true,
    },
  });

  await (prisma as any).happyHour.upsert({
    where: { id: 'hh-weekend-special' },
    update: {},
    create: {
      id: 'hh-weekend-special',
      dealerId: null, // Global
      name: 'Hafta Sonu Çılgınlığı',
      description: 'Hafta sonu tüm gün 2x puan!',
      multiplier: 2.0,
      startTime: '10:00',
      endTime: '22:00',
      daysOfWeek: [0, 6], // Sat-Sun
      isActive: true,
    },
  });

  console.log('✅ Happy hours created');

  // ─────────────────────────────────────────────────────────────
  // CREATE CUSTOMER STREAK
  // ─────────────────────────────────────────────────────────────
  await (prisma as any).userStreak.upsert({
    where: { userId: customer.id },
    update: {},
    create: {
      userId: customer.id,
      currentStreak: 5,
      longestStreak: 12,
      lastActivityAt: new Date(),
      totalActiveDays: 45,
      streakFreezes: 2,
    },
  });
  console.log('✅ User streak created');

  // ─────────────────────────────────────────────────────────────
  // CREATE REFERRAL CODE
  // ─────────────────────────────────────────────────────────────
  await (prisma as any).referralCode.upsert({
    where: { userId: customer.id },
    update: {},
    create: {
      userId: customer.id,
      code: 'DEMO2024',
      usageCount: 3,
    },
  });
  console.log('✅ Referral code created: DEMO2024');

  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('📧 Login credentials:');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │ Admin:    admin@qratex.com / Admin123! │');
  console.log('   │ Dealer:   dealer@qratex.com / Dealer123!│');
  console.log('   │ Customer: customer@qratex.com / Customer123!│');
  console.log('   └─────────────────────────────────────────┘');
  console.log('');
  console.log('🎴 Demo Cards:');
  console.log('   ┌─────────────────────────────────────────────────────┐');
  console.log('   │ Aktif Kart:  /c/DEMO_AktifKartToken12345 (müşteriye bağlı) │');
  console.log('   │ Boş Kart 1:  /c/DEMO_BosKartToken123456 (aktivasyon bekliyor) │');
  console.log('   │ Boş Kart 2:  /c/DEMO_BosKartToken789012 (aktivasyon bekliyor) │');
  console.log('   │ Test Kart:   /c/TEST123 (kısa test token)  │');
  console.log('   │ Bloklu Kart: /c/DEMO_BlokluKartToken345 (bloklanmış) │');
  console.log('   └─────────────────────────────────────────────────────┘');
  console.log('');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
