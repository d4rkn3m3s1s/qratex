import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/password';

/**
 * 3 zengin demo kafe seeder'ı — admin bootstrap üzerinden tetiklenir.
 * İdempotent: tüm satırlar sabit id ile upsert edilir, tekrar çalıştırınca duplike YOK.
 *
 * Her kafe: DEALER kullanıcı + ürün kategorisi + ürünler + QR kod + müşteri geri
 * bildirimleri + kart/tüketim kayıtları + kampanya. Liderlik/trend tablolarının dolu
 * görünmesi için yeterli çeşitlilik.
 *
 * Şema notları (gotcha'lar):
 * - Feedback.text (comment değil), Feedback.userId (opsiyonel).
 * - Consumption.cardId ZORUNLU → CardBatch → PhysicalCard(ACTIVATED) zinciri.
 * - Campaign: title + message + targetSegment (name/date yok).
 * - Product.categoryId zorunlu, price opsiyonel. QRCode.code unique.
 */

type CafeSpec = {
  slug: string;
  email: string;
  businessName: string;
  businessDesc: string;
  category: string; // businessCategory (cafe/restaurant/bakery)
  address: string;
  lat: number;
  lng: number;
  products: { id: string; name: string; price: number }[];
  feedbacks: { rating: number; text: string; sentiment: string }[];
};

const CAFES: CafeSpec[] = [
  {
    slug: 'aroma',
    email: 'cafe-aroma@qratex.com',
    businessName: 'Kafe Aroma',
    businessDesc: 'Taze kavrulmuş çekirdekler, üçüncü nesil kahve deneyimi.',
    category: 'cafe',
    address: 'Moda Cad. No:12, Kadıköy, İstanbul',
    lat: 40.9812, lng: 29.0257,
    products: [
      { id: 'demo-aroma-latte', name: 'Flat White', price: 75 },
      { id: 'demo-aroma-filter', name: 'Filtre Kahve', price: 55 },
      { id: 'demo-aroma-cheesecake', name: 'San Sebastian Cheesecake', price: 95 },
      { id: 'demo-aroma-cookie', name: 'Kurabiye', price: 35 },
    ],
    feedbacks: [
      { rating: 5, text: 'Flat White muhteşemdi, çekirdekler çok taze. Kesinlikle döneceğim!', sentiment: 'positive' },
      { rating: 5, text: 'Cheesecake efsane, kahvenin yanına tam oturuyor.', sentiment: 'positive' },
      { rating: 4, text: 'Kahve harika ama yoğun saatte biraz beklettiler.', sentiment: 'positive' },
      { rating: 5, text: 'Mekân çok şık, personel ilgili. Favori kafem oldu.', sentiment: 'positive' },
      { rating: 3, text: 'Filtre kahve biraz soğuk geldi ama tadı güzeldi.', sentiment: 'neutral' },
    ],
  },
  {
    slug: 'lezzet',
    email: 'cafe-lezzet@qratex.com',
    businessName: 'Lezzet Durağı',
    businessDesc: 'Ev yapımı tatlar, günlük menü ve sıcak atmosfer.',
    category: 'restaurant',
    address: 'Bağdat Cad. No:88, Suadiye, İstanbul',
    lat: 40.9635, lng: 29.0785,
    products: [
      { id: 'demo-lezzet-kahvalti', name: 'Serpme Kahvaltı', price: 320 },
      { id: 'demo-lezzet-menemen', name: 'Menemen', price: 120 },
      { id: 'demo-lezzet-corba', name: 'Günün Çorbası', price: 65 },
      { id: 'demo-lezzet-cay', name: 'Demlik Çay', price: 40 },
    ],
    feedbacks: [
      { rating: 5, text: 'Serpme kahvaltı çok zengindi, her şey tazeydi. Bayıldık!', sentiment: 'positive' },
      { rating: 4, text: 'Menemen güzeldi ama biraz tuzluydu.', sentiment: 'positive' },
      { rating: 5, text: 'Fiyat/performans harika, porsiyonlar bol.', sentiment: 'positive' },
      { rating: 2, text: 'Servis çok yavaştı, yarım saat bekledik.', sentiment: 'negative' },
      { rating: 4, text: 'Çorba enfesti, tekrar geleceğiz.', sentiment: 'positive' },
    ],
  },
  {
    slug: 'firin',
    email: 'cafe-firin@qratex.com',
    businessName: 'Fırın & Co',
    businessDesc: 'Taş fırın ekmekleri, taze hamur işleri ve butik pastalar.',
    category: 'bakery',
    address: 'İstiklal Cad. No:45, Beyoğlu, İstanbul',
    lat: 41.0369, lng: 28.9850,
    products: [
      { id: 'demo-firin-kruvasan', name: 'Tereyağlı Kruvasan', price: 60 },
      { id: 'demo-firin-ekmek', name: 'Ekşi Maya Ekmek', price: 80 },
      { id: 'demo-firin-pogaca', name: 'Peynirli Poğaça', price: 30 },
      { id: 'demo-firin-tart', name: 'Meyveli Tart', price: 90 },
    ],
    feedbacks: [
      { rating: 5, text: 'Kruvasanlar tam kıvamında, katmanları mükemmel!', sentiment: 'positive' },
      { rating: 5, text: 'Ekşi maya ekmek harika, her sabah alıyorum.', sentiment: 'positive' },
      { rating: 4, text: 'Poğaçalar taze ama bazen erken tükeniyor.', sentiment: 'positive' },
      { rating: 5, text: 'Meyveli tart çok başarılı, çok da şık sunuluyor.', sentiment: 'positive' },
      { rating: 3, text: 'Fiyatlar biraz yüksek ama kalite iyi.', sentiment: 'neutral' },
    ],
  },
];

export async function seedDemoCafes(adminUserId: string): Promise<{ cafes: number; feedbacks: number; consumptions: number }> {
  const password = await hashPassword('Demo123!');

  // Ortak demo müşterileri (geri bildirim + tüketim için). Sabit id → idempotent.
  const customers = await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      prisma.user.upsert({
        where: { email: `demo-musteri-${n}@qratex.com` },
        update: {},
        create: {
          id: `demo-customer-${n}`,
          email: `demo-musteri-${n}@qratex.com`,
          name: `Demo Müşteri ${n}`,
          password,
          role: 'CUSTOMER',
          emailVerified: new Date(),
          points: 100 + n * 50,
          level: 1 + (n % 3),
          xp: 200 + n * 120,
        },
      })
    )
  );

  // Tüketimler için tek bir kart partisi (batch) yeterli.
  const batch = await prisma.cardBatch.upsert({
    where: { id: 'demo-card-batch' },
    update: {},
    create: { id: 'demo-card-batch', name: 'Demo Kart Partisi', quantity: 50, createdById: adminUserId },
  });

  let fbCount = 0;
  let consCount = 0;

  for (const cafe of CAFES) {
    // 1) Dealer kullanıcı
    const dealer = await prisma.user.upsert({
      where: { email: cafe.email },
      update: { businessName: cafe.businessName, businessDesc: cafe.businessDesc, businessCategory: cafe.category },
      create: {
        id: `demo-dealer-${cafe.slug}`,
        email: cafe.email,
        name: cafe.businessName,
        password,
        role: 'DEALER',
        emailVerified: new Date(),
        businessName: cafe.businessName,
        businessDesc: cafe.businessDesc,
        businessCategory: cafe.category,
        businessLogo: '/logo/logo.png',
        address: cafe.address,
        latitude: cafe.lat,
        longitude: cafe.lng,
        points: 300,
        level: 4,
        xp: 1800,
      },
    });

    // 2) Ürün kategorisi (kafeye özel)
    const cat = await prisma.productCategory.upsert({
      where: { id: `demo-cat-${cafe.slug}` },
      update: {},
      create: { id: `demo-cat-${cafe.slug}`, name: 'Menü', icon: '☕', dealerId: dealer.id },
    });

    // 3) Ürünler
    for (const p of cafe.products) {
      await prisma.product.upsert({
        where: { id: p.id },
        update: { name: p.name, price: p.price },
        create: { id: p.id, name: p.name, price: p.price, categoryId: cat.id, dealerId: dealer.id },
      });
    }

    // 4) QR kod
    const qr = await prisma.qRCode.upsert({
      where: { id: `demo-qr-${cafe.slug}` },
      update: {},
      create: {
        id: `demo-qr-${cafe.slug}`,
        code: `DEMO-${cafe.slug.toUpperCase()}-001`,
        name: `${cafe.businessName} — Masa QR`,
        dealerId: dealer.id,
        scanCount: 40 + cafe.feedbacks.length * 3,
      },
    });

    // 5) Geri bildirimler (idempotent: sabit id)
    for (let i = 0; i < cafe.feedbacks.length; i++) {
      const f = cafe.feedbacks[i];
      const customer = customers[i % customers.length];
      const daysAgo = (i + 1) * 2;
      const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      await prisma.feedback.upsert({
        where: { id: `demo-fb-${cafe.slug}-${i}` },
        update: {},
        create: {
          id: `demo-fb-${cafe.slug}-${i}`,
          qrCodeId: qr.id,
          userId: customer.id,
          rating: f.rating,
          text: f.text,
          sentiment: f.sentiment,
          isPublic: true,
          createdAt,
          // Bazı geri bildirimlere bayi yanıtı ekle (VoC/telafi akışları dolu görünsün)
          ...(i === 0 ? { dealerReply: 'Teşekkür ederiz, tekrar bekleriz! 🙏', dealerRepliedAt: new Date() } : {}),
        },
      });
      fbCount++;
    }

    // 6) Kart + tüketimler (her kafe için 3 tüketim)
    for (let i = 0; i < 3; i++) {
      const customer = customers[i % customers.length];
      const cardId = `demo-card-${cafe.slug}-${i}`;
      await prisma.physicalCard.upsert({
        where: { id: cardId },
        update: {},
        create: {
          id: cardId,
          token: `demo-token-${cafe.slug}-${i}`,
          status: 'ACTIVATED',
          customerId: customer.id,
          activatedAt: new Date(),
          batchId: batch.id,
        },
      });
      const product = cafe.products[i % cafe.products.length];
      await prisma.consumption.upsert({
        where: { id: `demo-cons-${cafe.slug}-${i}` },
        update: {},
        create: {
          id: `demo-cons-${cafe.slug}-${i}`,
          cardId,
          customerId: customer.id,
          dealerId: dealer.id,
          productId: product.id,
          amount: product.price,
          createdAt: new Date(Date.now() - (i + 1) * 36 * 60 * 60 * 1000),
        },
      });
      consCount++;
    }

    // 7) Kampanya
    await prisma.campaign.upsert({
      where: { id: `demo-campaign-${cafe.slug}` },
      update: {},
      create: {
        id: `demo-campaign-${cafe.slug}`,
        dealerId: dealer.id,
        title: `${cafe.businessName} — Hafta Sonu Fırsatı`,
        message: 'Bu hafta sonu tüm menüde ikinci ürün %50 indirimli! QR okutup kazanın.',
        targetSegment: 'all',
        status: 'sent',
        sentAt: new Date(),
        sentCount: 25,
      },
    });
  }

  return { cafes: CAFES.length, feedbacks: fbCount, consumptions: consCount };
}
