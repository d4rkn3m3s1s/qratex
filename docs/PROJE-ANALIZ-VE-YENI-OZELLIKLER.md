# 🔍 QRATEX – Derin Proje Analizi & Yeni Özellik Planı

**Tarih:** 2026-02-19
**Kapsam:** Tüm kod tabanı, API, veritabanı, frontend, güvenlik, performans

---

## 📊 Mevcut Durum Özeti

### Proje Profili
| Metrik | Değer |
|--------|-------|
| **Framework** | Next.js 16 (App Router) + React 19 |
| **Veritabanı** | PostgreSQL + Prisma ORM (62 model, 1721 satır schema) |
| **Auth** | NextAuth.js (JWT, RBAC: ADMIN/DEALER/CUSTOMER/STAFF) |
| **AI** | OpenAI + Groq (sentiment, intent, churn, NLP) |
| **UI** | TailwindCSS + Radix UI + Framer Motion |
| **Monitoring** | Sentry + Vercel Analytics |
| **Async** | Inngest (cron jobs, background tasks) |
| **PWA** | next-pwa (opsiyonel, ENABLE_PWA=1) |
| **API Rotaları** | 31+ kategori, 148+ dosya |
| **Sayfa Sayısı** | Admin: 30+, Dealer: 19+, Customer: 19+, Public: 8+ |

### ✅ Tamamlanmış Büyük Özellikler
- QR kod sistemi (oluşturma, tarama, lifecycle, kişiselleştirme)
- AI analiz motoru (sentiment, intent, entities, themes, churn, fraud)
- Gamification (puanlar, rozetler, görevler, ödüller, çark, liderlik tablosu, ligler, VIP)
- Fiziksel kart sistemi (batch üretim, aktivasyon, tüketim, yorum)
- Referral & streak sistemi
- Sürpriz kutu, doğum günü bonusu, Happy Hour
- Offline senkronizasyon
- Staff modülü (görev, vardiya, izin, eğitim, checklist)
- Incident/kriz radarı, AI Action Engine
- Telafi (Remedy) sistemi
- Benchmark, Heatmap, ROI paneli, VoC duvarı
- Webhook & API key yönetimi
- Kapsamlı güvenlik (rate limit, RBAC, PII redact, prompt injection, CSP)

---

## 🚀 YENİ EKLENEBİLECEK ÖZELLİKLER

### 🔴 Öncelik 1: Yüksek Etki / Hızlı Uygulama

| # | Özellik | Açıklama | Etki | Süre |
|---|---------|----------|------|------|
| **Y1** | **Akıllı Bildirim Merkezi (Notification Center)** | Tüm roller için birleşik bildirim paneli: in-app toast + bildirim çekmecesi + okundu/okunmadı + filtreleme. Mevcut `Notification` modeli var ama kapsamlı bir UI yok. | Kullanıcı etkileşimi ↑ | 2-3 gün |
| **Y2** | **Dealer Otomatik Yanıt Kuralları** | Kural motoru: "Rating ≤ 2 → otomatik şablon yanıtı gönder", "Toksik feedback → incident oluştur". Mevcut `defaultReplyTemplate` alanı var ama kural motoru yok. | Dealer memnuniyeti ↑, yanıt süresi ↓ | 2-3 gün |
| **Y3** | **Müşteri Anket Modülü** | Dealer/admin'in çoktan seçmeli, tek seçimli, açık uçlu sorulardan oluşan mini anketler oluşturması. QR veya link ile dağıtım, sonuç raporu. | Veri kalitesi ↑ | 3-4 gün |
| **Y4** | **Akıllı Dashboard Widget'ları** | Dealer/admin dashboard'da sürükle-bırak widget düzeni: hangi kartları görmek istediğini seçme, sıralama, gizleme. Kişiselleştirilmiş dashboard. | UX ↑ | 2-3 gün |
| **Y5** | **Çoklu Dil (i18n)** | TR/EN başlangıcı ile tam i18n altyapısı. `next-intl` veya `react-i18next` ile tüm UI metinleri. Mevcut `preferredLanguage` alanı var. | Pazar genişlemesi | 3-5 gün |

### 🟡 Öncelik 2: Orta Vadeli Büyüme

| # | Özellik | Açıklama | Etki | Süre |
|---|---------|----------|------|------|
| **Y6** | **WhatsApp / SMS Entegrasyonu** | Kritik feedback, kampanya, telafi bildirimi için WhatsApp Business API veya Twilio SMS. Dealer ayarlarında kanal tercihi. | Erişim ↑ | 2-3 gün |
| **Y7** | **E-posta Şablon Editörü** | Admin'in WYSIWYG editör ile e-posta şablonları düzenlemesi. Değişkenler ({{userName}}, {{businessName}}). Önizleme ve test gönderimi. | Marka tutarlılığı ↑ | 2-3 gün |
| **Y8** | **Segment Bazlı Kampanya Hedefleme** | Mevcut `CustomerSegment` modeli var ama kampanya hedefleme yok. "Churn riski yüksek" veya "VIP Silver" segmentine özel kampanya. | Dönüşüm ↑ | 2 gün |
| **Y9** | **Sezonluk Lig Sistemi** | Liglerin tarih aralığına bağlanması. Sezon sonu ödülleri, sıralama arşivi, yeni sezon sıfırlama. | Engagement ↑ | 2-3 gün |
| **Y10** | **Dealer Karşılaştırma Paneli** | Birden fazla şube varsa: şubeler arası karşılaştırma, en iyi/kötü performans metrikleri, trend analizi. | Karar kalitesi ↑ | 2-3 gün |
| **Y11** | **Müşteri Yolculuğu Haritası (Visual Journey)** | Zaman çizelgesi UI: kayıt → ilk QR tarama → ilk feedback → rozet → VIP tier. Mevcut `journey-score` API var; görsel timeline UI eksik. | Müşteri anlayışı ↑ | 2 gün |
| **Y12** | **Toplu QR Kod Oluşturma** | CSV yükleme → toplu QR oluşturma → ZIP indirme veya etiket PDF. Mevcut `CardBatch` modelinden ilham. | Dealer verimlilik ↑ | 2 gün |

### 🟢 Öncelik 3: Uzun Vadeli / Farklılaştırıcı

| # | Özellik | Açıklama | Etki | Süre |
|---|---------|----------|------|------|
| **Y13** | **AI Copilot Chat (Gelişmiş)** | Dealer'ın AI ile sohbet ederek "son 1 haftadaki şikayetleri özetle", "garson eğitimi öneri planı yaz" gibi doğal dil sorguları. Mevcut `AIConversation` modeli var; frontend chat UI ve streaming yanıt eksik. | WOW faktörü ↑ | 3-4 gün |
| **Y14** | **Sosyal Paylaşım & Testimonial** | Müşterinin olumlu feedback'ini sosyal medyada paylaşma (embed widget); dealer'ın web sitesine "müşteri yorumları" widget'ı. | Organik büyüme ↑ | 2-3 gün |
| **Y15** | **Zapier / Make / n8n Entegrasyonu** | "Yeni feedback" tetikleyicisi, "Müşteri oluştur" aksiyonu. Webhook tabanlı veya native app. | Ekosistem ↑ | 3-4 gün |
| **Y16** | **Multi-Tenant / Franchise Yönetimi** | Zincir işletmeler için merkezi yönetim: franchise owner → şubeler, merkezi kampanya, çapraz raporlama. | Enterprise hazırlığı | 5-7 gün |
| **Y17** | **AI Competitor Analizi** | Google/Yelp/Foursquare yorumlarını çekip rakip işletmelerle karşılaştırmalı duygu analizi. | Stratejik değer ↑ | 4-5 gün |
| **Y18** | **Gelir / Abonelik Yönetimi** | Stripe/İyzico entegrasyonu ile PricingPlan'lara ödeme. Fatura, abonelik yönetimi, plan değiştirme. | Gelir modeli | 5-7 gün |

---

## ⚡ OPTİMİZASYON FIRSATLARI

### Performans

| # | Alan | Mevcut Durum | Öneri | Öncelik |
|---|------|-------------|-------|---------|
| **O1** | Admin page.tsx (101KB) | Tek dosyada tüm dashboard | Bileşenlere ayırma + lazy import + Suspense | Yüksek |
| **O2** | Dealer page.tsx (48KB) | Büyük tek dosya | Aynı yaklaşım: widget bileşenleri | Yüksek |
| **O3** | Customer page.tsx (47KB) | Büyük tek dosya | Aynı yaklaşım | Yüksek |
| **O4** | React Query tutarlılık | Bazı sayfalar hâlâ useEffect+fetch | Tüm veri çekme işlemlerini React Query'ye taşıma | Orta |
| **O5** | API yanıt boyutu | Bazı endpoint'ler fazla veri dönüyor | Field selection, sparse fieldsets | Orta |
| **O6** | Bundle boyutu | Three.js (182KB), Recharts, Framer Motion | Dynamic import + tree shaking | Orta |

### Veritabanı

| # | Alan | Öneri | Öncelik |
|---|------|-------|---------|
| **D1** | Feedback tablosu büyümesi | Partitioning (tarih bazlı) veya arşiv stratejisi | Orta |
| **D2** | Composite index'ler | `[dealerId, createdAt]`, `[userId, createdAt]` gibi sık kullanılan sorgulara composite index | Orta |
| **D3** | Connection pooling | PgBouncer veya Prisma Data Proxy (serverless için) | Düşük |

### Frontend

| # | Alan | Öneri | Öncelik |
|---|------|-------|---------|
| **F1** | Skeleton UI | Veri yüklenirken tutarlı skeleton bileşenleri | Yüksek |
| **F2** | Image lazy loading | next/image `loading="lazy"` + priority ayarları | Orta |
| **F3** | Font subset | Google Fonts için Latin-ext subset | Düşük |

---

## 🔧 TEKNİK BORÇ & DÜZELTİLMESİ GEREKENLER

| # | Konu | Detay | Öncelik |
|---|------|-------|---------|
| **B1** | Test coverage düşük | Sadece birkaç API testi var; kritik iş mantığı (puan hesaplama, gamification claim, auth) testleri yetersiz. | Yüksek |
| **B2** | E2E test senaryoları | Playwright var ama minimal. Kritik akışları kapsamalı: kayıt → giriş → feedback → puan → ödül. | Yüksek |
| **B3** | Apple Wallet gerçek imza | `lib/wallet.ts` placeholder imza kullanıyor; production için Apple Developer sertifikası gerekli. | Orta |
| **B4** | Erişilebilirlik (a11y) | Form etiketleri, ARIA rolleri, klavye navigasyonu eksik alanlar var. | Orta |
| **B5** | OpenAPI güncelliği | `openapi.yaml` kısmen güncel; tüm endpoint'leri yansıtmıyor. | Düşük |
| **B6** | Root-level Python scriptleri | Proje kökünde 20+ `_*.py` dosyası var (migration/fix scriptleri). Bunlar temizlenebilir veya `/scripts/archive/` altına taşınabilir. | Düşük |

---

## 🛡️ GÜVENLİK GELİŞTİRMELERİ

| # | Konu | Öneri | Öncelik |
|---|------|-------|---------|
| **S1** | 2FA (İki faktörlü kimlik doğrulama) | Admin ve dealer hesapları için TOTP (Google Authenticator) veya SMS 2FA. | Yüksek |
| **S2** | Session yönetimi | Aktif oturumları listeleme, uzak cihazdan çıkış yapma. | Orta |
| **S3** | IP bazlı erişim kısıtlama | Admin paneli için IP whitelist opsiyonu. | Orta |
| **S4** | Data export / KVKK uyumu | "Verilerimi indir" ve "Hesabımı sil" müşteri self-servis. GDPR/KVKK uyumu. | Yüksek |

---

## 📈 ÖNERİLEN UYGULAMA SIRASI

### Sprint 1 (Haftaya başlayabilir)
1. **O1-O3**: Büyük sayfa dosyalarını bileşenlere ayırma (performans)
2. **Y1**: Bildirim Merkezi UI
3. **F1**: Skeleton UI bileşenleri
4. **B6**: Root Python scriptleri temizliği

### Sprint 2
5. **Y2**: Dealer otomatik yanıt kuralları
6. **Y11**: Müşteri yolculuk haritası (visual timeline)
7. **O4**: React Query genişletme
8. **B1**: Kritik API testleri

### Sprint 3
9. **Y3**: Anket modülü
10. **Y5**: i18n altyapısı (TR/EN)
11. **S1**: 2FA
12. **S4**: KVKK / veri dışa aktarma

### Sprint 4+
13. **Y6**: WhatsApp/SMS
14. **Y13**: AI Copilot Chat UI
15. **Y8**: Segment kampanya hedefleme
16. **Y14**: Sosyal paylaşım widget

---

## 🎯 SONUÇ

QRATEX şu an **çok kapsamlı bir SaaS platformu**. 62 veritabanı modeli, 31+ API kategori, 3 farklı rol paneli, AI analiz motoru ve oyunlaştırma sistemi ile güçlü bir altyapıya sahip.

**En kritik ihtiyaçlar:**
1. **Performans**: 100KB+ sayfa dosyalarının bileşenlere ayrılması
2. **Test**: Kapsamlı test coverage
3. **UX**: Bildirim merkezi, skeleton UI, i18n
4. **Güvenlik**: 2FA, KVKK uyumu
5. **Yeni Özellikler**: Otomatik yanıt kuralları, anket modülü, AI copilot chat

Hangi öncelikle başlamak istersin? Yukarıdaki özelliklerden ilgi çekenler var mı? 🚀
