# Detaylı Yapılacaklar Listesi

**Son güncelleme:** 2025-02-19  
**Kaynak:** TARAMA-RAPORU.md + kod tabanı özeti.

Bu belge, henüz uygulanmamış veya kısmen kalan işleri öncelik ve kategorilere göre listeler. Tamamlanan maddeler raporlarda “✅ Uygulandı” olarak işaretlenmiştir; aşağıda sadece **yapılacak** işler yer alır.

---

## 1. Öncelik: Yüksek

### 1.1 Güvenlik / Gizlilik

| # | Görev | Detay | Tahmini |
|---|--------|--------|--------|
| G1 | **Rewards endpoint auth kararı** | ✅ Uygulandı: Karar dokümante edildi. Public katalog bilinçli; detay için `docs/API-REWARDS-GET.md`. | 0.5 gün |
| G2 | **PII log ince ayarı (opsiyonel)** | ✅ Uygulandı: Feedback id ve metin parçası sadece `NODE_ENV === 'development'` iken loglanıyor (`app/api/feedbacks/route.ts`, `lib/ai-engine.ts` analyzeBulk). | 0.5 gün |

### 1.2 Kritik Teknik Borç

| # | Görev | Detay | Tahmini |
|---|--------|--------|--------|
| T1 | **Middleware → proxy geçişi** | ✅ Uygulandı: `middleware.ts` → `proxy.ts`, export `proxy()`; README güncellendi. | 1 gün |
| T2 | **Kalan Prisma `as any` temizliği** | ✅ Uygulandı: Tüm `(prisma as any)` kaldırıldı. referral, streak, wallet, offline-sync, quick-presets, discovery, register, action-items-ai, admin/dashboard, admin/preagg, dealer/analytics, customer/trends, customer/analytics, happy-hour, birthday, security, push, suspicious, seed artık doğrudan `prisma.modelName` kullanıyor. | 1–2 gün |

---

## 2. Öncelik: Orta

### 2.1 Performans / Ölçek

| # | Görev | Detay | Tahmini |
|---|--------|--------|--------|
| P1 | **Admin analytics tab bazlı istek** | İlk açılışta sadece açık tab için section iste (`?sections=overview`); diğer tab’lara geçince ilgili section’ı iste. ✅ İlk istek overview,trends,activity; tab değişince section eklenir. | 0.5 gün |
| P2 | **Read-heavy route cache** | ✅ Uygulandı: Customer stats ve customer trends GET yanıtlarına Cache-Control: private, max-age=30, stale-while-revalidate=60 eklendi. | 0.5 gün |
| P3 | **AnalyticsEvent büyümesi** | ✅ Uygulandı: Inngest cron `analytics-event-cleanup` eklendi (günlük 03:00, 90 günden eski kayıtlar silinir). Mevcut `lib/analytics-event-retention.ts` ve admin cleanup API aynen kullanılıyor. | 0.5 gün |

### 2.2 Frontend / UX

| # | Görev | Detay | Tahmini |
|---|--------|--------|--------|
| F1 | **LazyMotion / motion tutarlılığı** | ✅ Uygulandı: Dealer page, dealer feedbacks, customer remedy, customer page, admin analytics, dealer ai-insights LazyMotion + m. `motion` `m` + LazyMotion’a | 1 gün |
| F2 | **React Query genişletme** | ✅ Kısmen: Remedy, dealer page (profile/offline/next-best-actions), campaigns, customer ai-insights useQuery; kalan sayfalar genişletilebilir. | 1 gün |

### 2.3 Kod Kalitesi

| # | Görev | Detay | Tahmini |
|---|--------|--------|--------|
| K1 | **Arama/filtre Zod genişletme** | ✅ Uygulandı: `listQueryBaseSchema` ve `LIST_QUERY_DEFAULTS` (`lib/validations-admin.ts`); admin feedbacks/users/cards ve `api/feedbacks` GET sayfalama Zod ile. `listQueryPageSchema` (`lib/validations.ts`) genel listeler için. | 0.5 gün |
| K2 | **Health / readiness ayrımı** | ✅ Uygulandı: GET /api/health?light=1 sadece DB ping ve minimal yanıt (readiness probe). Tam health aynı kaldı. | `/api/health` şu an DB + diğer kontrolleri yapıyor. Deployment’ta hafif bir readiness endpoint (sadece DB ping) veya aynı endpoint’e `?light=1` ile kısa yol. | 0.5 gün |

---

## 3. Öncelik: Düşük / İsteğe Bağlı

### 3.1 Test

| # | Görev | Detay | Tahmini |
|---|--------|--------|--------|
| S1 | **API birim testleri** | ✅ Kısmen: GET /api/health testi eklendi (__tests__/api/health.test.ts); light=1 ve full, DB ok/hata senaryoları. Mevcut contract ve api-auth-isolation testleri var. | Auth, feedback POST, gamification claim, dealer reply vb. kritik route’lar için mock session/Prisma ile test; `__tests__/api/` ve `__tests__/lib/` genişlet. | 2–3 gün |
| S2 | **E2E kritik akışlar** | ✅ Kısmen: e2e/critical-flows — login → dashboard, feedback gönderme, dealer scan gibi senaryolar; `e2e/` ve `playwright.config.ts` kullan. | 2–3 gün |

### 3.2 Erişilebilirlik (a11y)

| # | Görev | Detay | Tahmini |
|---|--------|--------|--------|
| A1 | **Form ve buton etiketleri** | ✅ Kısmen: Login (demo butonlar aria-label, Google buton, Mail/Lock aria-hidden, submit aria-label); public feedback yıldız butonları aria-label. | Tüm form alanlarında `label` + `id`/`htmlFor`; butonlarda `aria-label` veya görünür metin; ikonlarda `aria-hidden` veya uygun `alt`/`role`. | 1 gün |
| A2 | **Odak ve klavye** | ✅ Kısmen: Dialog ve Sheet kapat butonları aria-label \"Kapat (Escape)\"; Radix ile focus trap ve Escape zaten var. | Modal/drawer’da focus trap, Escape ile kapatma; liste/tab’da klavye ile gezinme. | 0.5–1 gün |

### 3.3 Dokümantasyon ve Süreç

| # | Görev | Detay | Tahmini |
|---|--------|--------|--------|
| D1 | **OpenAPI güncelliği** | ✅ openapi.yaml güncellendi; /api/health (light=1), /api/feedbacks GET+POST, /api/gamification/rewards GET; açıklamalar ve parametreler eklendi. Contract testi geçiyor. | `openapi.yaml`’ı mevcut API’ye göre güncel tut; Postman koleksiyonu veya internal API dokümanı üret. | 1 gün |
| D2 | **CHANGELOG / release notları** | ✅ CHANGELOG.md eklendi; Unreleased ve 1.0.0 bölümleri. Sürüm etiketlendiğinde güncellenebilir. | Önemli değişiklikler için CHANGELOG.md; sürüm etiketleri ile eşleştir. | Sürekli |

---

## 4. Raporlardan Kalan Öneriler (Bölüm 7)

Aşağıdakiler TARAMA-RAPORU Bölüm 7’de yer alan; uygulanmamış önerilerdir. İsterseniz bu listeye “Orta/ Düşük öncelik” olarak dahil edilip plana alınabilir.

| Öneri | Bölüm | Not |
|-------|--------|-----|
| Settings/points matrix önbelleği | 7.1 | ✅ Zaten uygulandı (Bölüm 8). |
| Admin analytics cevap boyutu | 7.1 | `?sections=` var; tab bazlı lazy istek (P1) ile tamamlanabilir. |
| Public / read-heavy route cache | 7.1 | P2 ile örtüşüyor. |
| Veri çekme SWR/React Query | 7.2 | Dealer/customer dashboard yapıldı; F2 kalan sayfalar. |
| Framer Motion bundle | 7.2 | LazyMotion birçok yerde uygulandı; F1 ile tutarlılık. |
| Görsel optimizasyonu | 7.2 | ✅ `unoptimized: false` yapıldı (Bölüm 8). |
| AnalyticsEvent büyümesi | 7.3 | P3. |
| İndeks kontrolü | 7.3 | Yavaş sorgu tespit edildikçe; proaktif değil. |
| Hata sınırları | 7.4 | ✅ Customer/admin/dealer error.tsx var. |
| Kritik sayfa önceliği | 7.4 | ✅ Logo preload eklendi. |

---

## 5. Özet Tablo (Yapılacaklar)

| Öncelik | Kategori | Madde no. | Kısa açıklama |
|--------|----------|-----------|----------------|
| Yüksek | Güvenlik | G1, G2 | Rewards auth kararı, PII log (opsiyonel) |
| Yüksek | Teknik borç | T1, T2 | Middleware→proxy, Prisma as any temizliği |
| Orta | Performans | P1, P2, P3 | Tab bazlı analytics, cache, AnalyticsEvent |
| Orta | Frontend | F1, F2 | LazyMotion tutarlılığı, React Query genişletme |
| Orta | Kod | K1, K2 | Zod genişletme, health/readiness |
| Düşük | Test | S1, S2 | API testleri, E2E |
| Düşük | a11y | A1, A2 | Form/buton etiketleri, odak/klavye |
| Düşük | Dokümantasyon | D1, D2 | OpenAPI, CHANGELOG |
| — | **Geliştirme** | **Bölüm 7** | **Yeni özellikler (Ö1–Ö26)** |

---

## 6. Hızlı Seçim (Önce Bunlar)

Zaman kısıtlıysa önce şunlar yapılabilir:

1. **T1** – Middleware deprecation uyarısını gidermek (Next.js 16 uyumu).
2. **G1** – Rewards endpoint’in public/auth kararını netleştirip dokümante etmek.
3. **T2** – En çok kullanılan dosyalardaki `(prisma as any)` kaldırma (referral, streak, wallet, offline-sync).
4. **P1** – Admin analytics’te tab bazlı ilk istek (ilk yükü hafifletir).

Bu liste, TARAMA-RAPORU.md ve mevcut kod durumuna göre güncellenebilir; yeni maddeler veya tamamlananlar bu dosyaya işlenebilir.

---

## 7. Geliştirme Özellikleri (Yeni Özellikler)

Ürünü büyüten, kullanıcı değerini artıran yeni özellik fikirleri. Öncelik iş gereksinimine göre belirlenir.

### 7.1 Müşteri (Customer) Tarafı

| # | Özellik | Açıklama | Tahmini |
|---|---------|----------|--------|
| Ö1 | **Push bildirimleri (PWA)** | Puan/rozet/görev tamamlama, sürpriz kutu, kampanya hatırlatması için Web Push; izin ekranı ve backend (VAPID). | 2–3 gün |
| Ö2 | **Favori işletmeler** | ✅ Uygulandı: `CustomerFavoriteDealer` modeli, GET/POST/DELETE `/api/customer/favorites`, discovery’de `favoriteDealerIds`, müşteri ana sayfada “Favorilerim” kartı ve trend mekanlarda kalp ile ekleme/çıkarma. | 1–2 gün |
| Ö3 | **Geri bildirim şablonları / hızlı seçenekler** | ✅ Uygulandı: Public feedback sayfasında “Çok memnunum”, “Personel çok ilgili”, “Bekleme süresi uzundu” vb. hızlı seçenek butonları; tıklanınca yoruma eklenir. | 1 gün |
| Ö4 | **Müşteri dil tercihi** | Profilde dil seçimi (TR/EN); UI metinleri ve e-posta şablonları locale’e göre. | 1–2 gün |
| Ö5 | **Karanlık mod (dark mode)** | Zaten mevcut: `ThemeProvider` (next-themes) + header’da tema seçici (Sistem / Açık / Koyu), `storageKey="qratex-theme"`. | 1 gün |
| Ö6 | **NPS (Net Promoter Score)** | ✅ Uygulandı: `Feedback.npsScore` (0–10), public feedback formunda opsiyonel NPS seçici, POST `/api/feedbacks` ile kayıt; admin geri bildirimler istatistiklerinde NPS kartı (promoters/passives/detractors). | 2 gün |
| Ö7 | **Müşteri anketleri** | Admin/dealer tarafından oluşturulan kısa anketler (çoktan seçmeli/tek seçim); QR veya link ile müşteriye gönderim, sonuç raporu. | 3–4 gün |

### 7.2 İşletme (Dealer) Tarafı

| # | Özellik | Açıklama | Tahmini |
|---|---------|----------|--------|
| Ö8 | **Toplu QR kod oluşturma** | CSV/Excel ile liste yükleyip tek seferde çok sayıda QR (masa/ürün kodu); ZIP indirme veya etiket PDF. | 2 gün |
| Ö9 | **Rapor dışa aktarma (Excel/PDF)** | ✅ Uygulandı: Admin geri bildirimler sayfasında “Dışa aktar” → Excel (CSV) / PDF indir; dealer geri bildirimlerde Excel (CSV) + PDF indir (QR + tüketim yorumları). `buildFeedbackListPDFContent` eklendi. | 1–2 gün |
| Ö10 | **Segment bazlı kampanya hedefleme** | Kampanya oluştururken “sadece şu segment” (ör. churn riski yüksek, VIP); mevcut segmentler + kampanya API entegrasyonu. | 2 gün |
| Ö11 | **Otomatik yanıt kuralları** | Düşük puan veya belirli anahtar kelimede otomatik şablon yanıtı; kural motoru (koşul + şablon) ve tetikleyici. | 2–3 gün |
| Ö12 | **Dealer mobil “hızlı tarama” modu** | Tam ekran, kamera odaklı, tek dokunuşla tara–onayla akışı; PWA kamera API. | 1–2 gün |
| Ö13 | **Benchmark karşılaştırması** | Sektör/şehir bazlı anonim benchmark (ortalama puan, yanıt süresi); dealer’a “sektör ortalamasının X puan üstündesiniz” gösterimi. | 2 gün |

### 7.3 Admin / Platform Tarafı

| # | Özellik | Açıklama | Tahmini |
|---|---------|----------|--------|
| Ö14 | **Çoklu dil admin paneli** | Admin UI metinlerinin TR/EN (veya daha fazla dil) ile gösterilmesi; i18n key’leri ve dil seçici. | 2–3 gün |
| Ö15 | **A/B test sonuç dashboard’u** | Gamification (ve diğer) A/B deneylerinin impression/conversion metrikleri; hangi varyant kazanıyor, basit istatistik. | 1–2 gün |
| Ö16 | **Tenant / marka özelleştirme** | Logo, renk, favicon, e-posta alt bilgisi gibi marka alanlarının tenant bazlı (multi-tenant ise) veya tek marka ayarları. | 2 gün |
| Ö17 | **Gelir / kullanım raporları** | API çağrı sayısı, aktif dealer/customer, feedback hacmi; aylık özet rapor ve basit grafik. | 1–2 gün |
| Ö18 | **Webhook payload özelleştirme** | Webhook’a gönderilecek alanları admin’in seçmesi (örn. sadece rating + sentiment); şablon veya alan listesi. | 1 gün |

### 7.4 Gamification ve Bağlılık

| # | Özellik | Açıklama | Tahmini |
|---|---------|----------|--------|
| Ö19 | **Sezonluk ligler** | Liglerin tarih aralığına bağlanması (örn. “Şubat 2025 Ligi”); sezon sonu ödülleri ve bir sonraki sezon sıfırlama. | 2 gün |
| Ö20 | **Sınırlı süreli ödüller (flash)** | “Bugün 2x puan”, “Bu hafta özel rozet” gibi zaman sınırlı kampanya; reward/badge’e start/end tarihi. | 1–2 gün |
| Ö21 | **Özel rozet tasarımı** | Admin’in rozet için özel görsel yüklemesi (mevcut asset upload ile); müşteri tarafında bu rozetin gösterimi. | 1 gün |
| Ö22 | **Müşteri yolculuk haritası (journey)** | Zaman çizelgesi: kayıt → ilk feedback → ilk tüketim → rozet/görev; dealer/admin’e “müşteri nerede?” görünümü. Mevcut journey-score API genişletilebilir. | 2–3 gün |

### 7.5 Entegrasyon ve İletişim

| # | Özellik | Açıklama | Tahmini |
|---|---------|----------|--------|
| Ö23 | **WhatsApp / SMS bildirimi** | Kritik feedback veya kampanya için dealer’a WhatsApp/SMS; Twilio/Netgsm vb. provider entegrasyonu. | 2–3 gün |
| Ö24 | **E-posta şablon editörü** | Admin’in davet, şifre sıfırlama, kampanya e-postası için HTML metin ve değişkenler ({{userName}}) düzenlemesi. | 2 gün |
| Ö25 | **Zapier / Make entegrasyonu** | “Yeni feedback” tetikleyicisi ve “müşteri oluştur” aksiyonu; webhook tabanlı veya Zapier app. | 3–4 gün |
| Ö26 | **Public API v2 dokümantasyonu** | REST API sürümü (v2), rate limit, API key ile; OpenAPI 3.0 ve örnek kod (curl/JS). | 1–2 gün |

### 7.6 Özet – Geliştirme Özellikleri

| Alan | Madde no. | Öne çıkan fikirler |
|------|------------|---------------------|
| Müşteri | Ö1–Ö7 | Push, favoriler, NPS, anketler, dil/karanlık mod |
| Dealer | Ö8–Ö13 | Toplu QR, Excel/PDF export, segment kampanya, otomatik yanıt, benchmark |
| Admin | Ö14–Ö18 | Çoklu dil, A/B dashboard, tenant marka, kullanım raporları, webhook payload |
| Gamification | Ö19–Ö22 | Sezonluk lig, flash ödül, özel rozet, yolculuk haritası |
| Entegrasyon | Ö23–Ö26 | WhatsApp/SMS, e-posta editör, Zapier, API v2 |

İlk sprint için önerilen küçük kazanımlar: **Ö5 (dark mode)**, **Ö3 (hızlı feedback seçenekleri)**, **Ö9 (Excel/PDF export)**. Orta vadede yüksek etki: **Ö1 (push)**, **Ö6 (NPS)**, **Ö10 (segment kampanya)**.
