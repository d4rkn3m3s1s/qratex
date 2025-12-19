# QRATEX - QR Tabanlı Geri Bildirim ve Gamification Platformu

![QRATEX Logo](public/logo/logo.png)

QRATEX, işletmelerin QR kodlar üzerinden müşteri geri bildirimi toplamasını, AI ile analiz etmesini ve gamification sistemi ile müşteri bağlılığını artırmasını sağlayan modern bir SaaS platformudur.

## 🚀 Özellikler

### Temel Özellikler
- **🔲 Akıllı QR Kodlar** - Özelleştirilebilir QR kodlar ile geri bildirim toplama
- **🤖 AI Destekli Analiz** - OpenAI ile duygu analizi, konu çıkarımı ve akıllı içgörüler
- **🎮 Gamification** - Puanlar, rozetler, görevler ve ödüllerle müşteri bağlılığı
- **📊 Gerçek Zamanlı Dashboard** - Anlık analitik ve raporlama
- **📱 PWA Desteği** - Yüklenebilir mobil uygulama deneyimi

### Kullanıcı Rolleri
- **Admin** - Tam sistem yönetimi
- **Dealer (İşletme)** - QR kod oluşturma, geri bildirim analizi
- **Customer (Müşteri)** - Geri bildirim verme, puan ve rozet kazanma

### Teknik Özellikler
- Next.js 14+ (App Router)
- TypeScript (Strict Mode)
- TailwindCSS (Mobile-first, Responsive)
- Framer Motion (Animasyonlar)
- Prisma ORM + PostgreSQL
- NextAuth.js (Authentication)
- PWA (Progressive Web App)
- Vercel Deploy Ready

## 📋 Gereksinimler

- Node.js 18.x veya üzeri
- PostgreSQL 14.x veya üzeri (veya Supabase)
- npm veya yarn

## 🛠️ Kurulum

### 1. Projeyi Klonlayın

```bash
git clone https://github.com/yourusername/qratex.git
cd qratex
```

### 2. Bağımlılıkları Yükleyin

```bash
npm install
# veya
yarn install
```

### 3. Environment Değişkenlerini Ayarlayın

```bash
cp env.example .env
```

`.env` dosyasını düzenleyin:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/qratex?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-key-generate-with-openssl-rand-base64-32"

# Google OAuth (opsiyonel)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# OpenAI (AI özellikleri için gerekli)
OPENAI_API_KEY=""

# Supabase Storage (opsiyonel)
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
SUPABASE_SERVICE_ROLE_KEY=""

# App Config
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="QRATEX"
```

### 4. Veritabanını Oluşturun

```bash
# Prisma migration'ları çalıştırın
npx prisma migrate dev

# Seed data'yı yükleyin
npx prisma db seed
```

### 5. Geliştirme Sunucusunu Başlatın

```bash
npm run dev
# veya
yarn dev
```

Uygulama `http://localhost:3000` adresinde çalışacaktır.

## 🔐 Demo Hesapları

Seed data ile oluşturulan demo hesaplar:

| Rol | Email | Şifre |
|-----|-------|-------|
| Admin | admin@qratex.com | Admin123! |
| Dealer | dealer@qratex.com | Dealer123! |
| Customer | customer@qratex.com | Customer123! |

## 📁 Proje Yapısı

```
qratex/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth sayfaları (login, register)
│   ├── (public)/          # Public sayfalar (landing)
│   ├── admin/             # Admin dashboard
│   ├── customer/          # Customer dashboard
│   ├── dealer/            # Dealer dashboard
│   ├── api/               # API Routes
│   ├── globals.css        # Global styles
│   └── layout.tsx         # Root layout
├── components/
│   ├── dashboard/         # Dashboard bileşenleri
│   ├── layout/            # Layout bileşenleri
│   ├── providers.tsx      # Context providers
│   └── ui/                # UI bileşenleri
├── lib/
│   ├── auth.ts            # NextAuth config
│   ├── prisma.ts          # Prisma client
│   ├── utils.ts           # Utility fonksiyonları
│   └── validations.ts     # Zod schemas
├── prisma/
│   ├── schema.prisma      # Prisma schema
│   └── seed.ts            # Seed data
├── public/
│   ├── icons/             # PWA icons
│   ├── images/            # Static images
│   ├── logo/              # Logo files
│   └── manifest.json      # PWA manifest
├── types/
│   ├── index.ts           # Type definitions
│   └── next-auth.d.ts     # NextAuth types
├── middleware.ts          # Auth middleware
├── next.config.js         # Next.js config
├── tailwind.config.ts     # Tailwind config
└── tsconfig.json          # TypeScript config
```

## 🎨 UI/UX Özellikleri

- **Dark Mode First** - Varsayılan karanlık tema
- **Glassmorphism** - Modern cam efektli tasarım
- **Gradient Heavy** - Canlı gradient kullanımı
- **Smooth Animations** - Framer Motion ile akıcı animasyonlar
- **Mobile First** - Mobil öncelikli responsive tasarım
- **Touch Friendly** - Minimum 44px dokunma hedefleri
- **Accessibility** - ARIA standartlarına uygun

## 📱 PWA Özellikleri

- Yüklenebilir uygulama
- Offline desteği
- Push notification ready
- Splash screen
- iOS ve Android uyumlu

## 🔧 Kullanılabilir Scriptler

```bash
# Geliştirme sunucusu
npm run dev

# Production build
npm run build

# Production sunucusu
npm run start

# Linting
npm run lint

# Database push (schema sync)
npm run db:push

# Database migration
npm run db:migrate

# Database seed
npm run db:seed

# Prisma Studio
npm run db:studio
```

## 🚀 Deploy

### Vercel ile Deploy

1. GitHub'a push edin
2. Vercel'e giriş yapın
3. "Import Project" ile projeyi import edin
4. Environment değişkenlerini ayarlayın
5. Deploy edin

### Manuel Deploy

```bash
# Build
npm run build

# Start
npm run start
```

## 🔐 Güvenlik

- **Password Hashing** - bcrypt ile şifre hashleme
- **JWT Sessions** - Güvenli session yönetimi
- **RBAC** - Rol tabanlı erişim kontrolü
- **Input Validation** - Zod ile input doğrulama
- **Rate Limiting** - API rate limiting (opsiyonel)
- **Secure Cookies** - HttpOnly, Secure cookie'ler

## 📊 Database Schema

Ana modeller:
- User, Account, Session (Auth)
- Badge, Quest, Reward (Gamification)
- QRCode, Feedback (Feedback System)
- Settings, FeatureFlag (Configuration)
- Notification, AnalyticsEvent (System)
- Page, MenuItem, Theme, PricingPlan (CMS)

Detaylı schema için `prisma/schema.prisma` dosyasına bakın.

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'feat: Add amazing feature'`)
4. Push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için `LICENSE` dosyasına bakın.

## 📞 İletişim

- **Website:** [qratex.com](https://qratex.com)
- **Email:** info@qratex.com
- **Twitter:** [@qratex](https://twitter.com/qratex)
- **LinkedIn:** [QRATEX](https://linkedin.com/company/qratex)

---

Made with ❤️ by QRATEX Team




