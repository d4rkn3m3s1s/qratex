# QRateX — Redesign & Rework Plan (2026-07)

> Kaynak: kullanıcı raporu (landing + müşteri paneli + bayi paneli + bug fix + demo veri).
> Bu belge **uygulama öncesi plandır**. Her madde ayrı ayrı, onayla uygulanır.
> Kod içi ad `qratex` KORUNUR; sadece kullanıcıya görünen metin `QRateX` olur.

## Onaylanan kararlar
- **Yaklaşım:** Önce plan + todo, sonra madde madde uygulama.
- **Marka:** Sadece kullanıcıya görünen metinlerde `QRATEX → QRateX`. Kod/değişken/paket adı `qratex` kalır.
- **Abonelik/pricing:** Silinmez. Admin'den **modül toggle** (mevcut `lib/module-gate.ts`). Toggle KAPALIYKEN **sadece landing pricing gizlenir**; bayi paneli ayrı yönetilir.
- **Görseller:** Placeholder ile başlanır (video/logo/reklam varlıkları sonra).
- **Demo:** 3 zengin demo kafe.

---

## BÖLÜM A — ANA SAYFA (Landing)

**Bölüm sırası (mevcut):** `app/(public)/home-client.tsx:70-77`
Hero → Features → Demo → HowItWorks → Testimonials → Pricing → FAQ → CTA

### A1. Marka adı QRATEX → QRateX (görünen metinler)
- **Görsel logo** = `public/logo/*.png` (font.png, font-light.png, logo.png, logo-light.png). Metin değişimi logoyu DEĞİŞTİRMEZ — logo görselleri ayrıca güncellenmeli (placeholder/sonra).
- **Metin/alt değişecek yerler:**
  - `components/layout/header.tsx` — alt'lar (154,158,179,190,291,299,307,315)
  - `components/layout/footer.tsx:20` ("Neden QRATEX?"), :79/:85 (alt), :192 (© telif)
  - `messages/tr.json` + `messages/en.json` — `landing.*` ve `appShell.*` içindeki "QRATEX" geçişleri (hero.sub 2112, demo 2165-2166, testimonials 2236/2241, faq 2261-2262, appShell.navWhyQratex 1857, appShell.appName 215, my-year 2548 vb.)
  - `lib/seo-settings.ts` :42 defaultTitle, :44 desc, :45 siteName, :54 organizationName (DB-override edilebilir defaultlar)
  - Statik: `blog/page.tsx:9`, `neden-qratex/page.tsx` (9,11,14-15,55-56,73,82), `blog/[slug]/page.tsx:109`, `lib/blog-posts.ts` (18,21,29)
- **Not:** `QRATEX'e/ten/i/te` TR ekleri blanket replace ile korunur. Email `info@qratex.com`, `@qratex`, URL'ler AYRI karar (dokunma önerisi).

### A2. Pricing → admin toggle modülü
- Altyapı hazır: `lib/module-gate.ts`, `lib/module-controls.ts`, `app/api/admin/settings/modules/route.ts`, `FeatureFlag`/`Settings` modeli.
- **Yeni modül anahtarı:** `landing_pricing` (veya mevcut `billing` flag'ine bağla).
- **Uygulama:** `home-client.tsx`'te `<PricingSection />` render'ını flag'e sar; sunucu tarafında flag'i oku (`page.tsx`). Kapalıyken pricing JSON-LD (`page.tsx:70-105`) da atlanmalı.
- Header/footer'daki `/#pricing` linkleri flag kapalıyken gizlensin (`header.tsx:26-31`, `neden-qratex:109-122`).

### A3. Bölüm kaldır / taşı / yer değiştir
- **KALDIR — Testimonials (en alttaki "müşteri deneyimi"):** kullanıcı "zaten en başta var" dedi. → `TestimonialsSection`'ı **kaldır** VEYA yukarı taşı. **NETLEŞTİR:** başta olan hangisi? (aşağıda "Açık sorular")
- **SSS en alta:** FAQ zaten Pricing'ten sonra; Pricing gizlenince FAQ pratikte sona yaklaşır. CTA'dan SONRA'ya alınacak → sıra: `... → CTA → FAQ`.
- **"3 adımda başlayın" ↔ "işletmeler ne diyor" yer değişimi:** `HowItWorksSection` (3 adım) ile `TestimonialsSection` (yorumlar) sırasını değiştir. (Testimonials kaldırılırsa bu madde düşer.)

### A4. Görsel/kreatif yenileme (placeholder ile)
- **Tam ekran video hero:** `HeroSection.tsx` — arka plana `<video>` (autoplay/muted/loop, `object-cover`, `min-h-[100dvh]`). Şu an video yok; placeholder = gradient-mesh (mevcut) + video slot. `DemoSection`'daki `getEmbedUrl` helper'ı YT/Vimeo tespiti için taşınabilir.
- **Sticky bar scroll gidip-gel:** `header.tsx` — şu an `fixed`, scroll'da sadece stil değişiyor (`:72-78`). "Aşağı kaydırınca gizle, yukarı kaydırınca göster" davranışı ekle (translateY + scroll yön tespiti). QNB tarzı.
- **Renkli bloklar (açık arka plan):** Features/HowItWorks bölümlerine QNB tarzı renkli kart/blok arka planları. `lib/landing-content.ts` gradient class'ları mevcut, genişletilir.
- **Kayan reklam (marquee):** YENİ bileşen — framer-motion ile sonsuz yatay kayan şerit. Reusable yok, sıfırdan. Placeholder reklam görselleri.
- **ReverBot imzası:** footer'a "prod by ReverBot" + logo (placeholder). `footer.tsx`.
- **Daha çok görsel örnek:** Features/Demo bölümlerine ekran görüntüsü/mockup slotları (placeholder).
- **"Her şey tek platformda" & "Neden qratex" daha canlı:** `FeaturesSection` + `neden-qratex/page.tsx` görselleştir (ikon+renk+animasyon).

### A5. Blog düzenleme
- `lib/blog-posts.ts` — şu an 2 statik post, `content`/`body` alanı YOK (gövde stub: `blog/[slug]/page.tsx:106-119`).
- **Plan:** `BlogPost`'a `content` (markdown/html) alanı ekle, gerçek gövde render'ı, daha fazla örnek post. (CMS/DB ileride.)

---

## BÖLÜM B — MÜŞTERİ PANELİ

**Sol menü tek kaynak:** `components/dashboard/sidebar.tsx` — `customerNavItems` **satır 218-247** (şu an **28 düz madde**, grup yok → "kaydırınca karışıyor" sorunu).
**Dashboard:** `components/customer/dashboard/customer-dashboard.tsx` (~1405 satır, tek dosya).

### B1. Yeni sol menü (9 gruplu yapı)
`NavItem` tipine **grup/alt-öğe** desteği eklenecek (şu an düz). Hedef yapı:
```
1. Dashboard
2. Kartım
   ├ Tüketimlerim
   └ Harcama Özetim
3. Analizler
   ├ Yolculuk skorum
   ├ Gelişim Merkezi
   ├ AI Analizlerim
   ├ Kişisel Analitik
   └ QRateX'te yılım
4. Geri bildirimlerim
   └ Telafi tekliflerim
5. Trend Analiz (Trendler)
   ├ En iyi işletmeler
   └ Kampanyalar
6. Yakınımdakiler
7. Ödüller & Mağaza
   ├ Rozetlerim ├ Çerçeve Dükkanı ├ Görevler ├ Sürpriz kutular
   ├ Davet et kazan ├ Ödüller └ Sosyal sorumluluk
8. QGameX
   ├ Mini oyunlar ├ Ekip & Klan └ Liderlik
9. Ayarlar
```
- **Mevcut route eşleşmesi (hepsi var):** my-card, consumptions, spending-overview, journey-score, progress-hub(→Gelişim), ai-insights, analytics, my-year, feedbacks, remedy, category-leaderboard(→En iyi işletmeler), campaigns, nearby, badges, shop, quests, surprise-boxes, referral, rewards, donations, games, squads, leaderboard, settings.
- **KALDIR menüden:** discover (Keşfet), experiences (İşletmede Deneyim), leaderboard'un tekrarı, lounge/favorites (zaten menüde değil).
- **Genel davranış:** Başlığa tıkla → sayfa başa; sol panel **ayrı scroll** (sticky, kendi overflow'u).

### B2. Dashboard düzeltmeleri (`customer-dashboard.tsx`)
- **`:670` "Puanlarını gerçek etkiye donustur"** — hardcoded + TR karakter eksik. Düzelt + i18n'e taşı (TR/EN). ("dönüştür")
- **Çark + kısayollar profil altına:** SpinWheel (`:770-802`) profil/hero'nun (`:426-595`) hemen altına.
- **Çark yanına Mini Oyunlar sekmesi** ekle.
- **KALDIR:** "Son Rozetler" (`:991-1098`), "Lig Durumu/Lig ve Liderlik" (`:1101-1228`). (Rozetler/lig profilde kalır.)
- **Liderlik tablosu düzelt:** "tam çalışmıyor" → `/api/leaderboard?limit=4` fetch'i + render kontrol (`:168-205`, `:1101-1228`). Kök neden uygulama aşamasında teşhis.
- **Kısayol tıklama → ilgili sayfaya yönlendir** (rozet/geri bildirim vb. her yerde tekrar etmesin, sadece profilde; üstüne basınca sayfaya).

### B3. Kartım / Analizler yeniden düzeni
- **Kart en başta**, "Büyük QR göster" butonu KALDIR (dokununca zaten büyüyor). (`my-card` sayfası)
- Tüketimlerim / Harcama özeti → **kartın altında kısayol**, soldan (menüden) ayrı grup olarak kalır ama sayfa içinde kart altında da kısayol.
- **Analizler odağı:** AI Analizlerim ana içerik; Gelişim Merkezi özet ilk kısım; Yolculuk skoru / Kişisel analitik / QRateX'te yılım → kısayol/ekstra sayfa.

### B4. Trend Analiz (yeni yapı) — `trends` + `category-leaderboard` + `campaigns`
- **En iyi işletmeler bu bölümün İÇİNDE.** Toplam puan yerine **trend mekanlar** (yükseliş oranıyla öne çıkanlar).
- **Reklam sekmesi:** reklam yapmak isteyen mekanlar için ayrı sekme + pop-up reklam alanı.
- **Yeni açılan mekanlar** için ayrı yer.
- **"Sen seversin" öneri motoru:** müşterinin sevdiği ürün analizinden benzer ürün önerisi (yeni). *(Bu ML/öneri kısmı ayrı efor — açık soru.)*
- **Kampanyalar bu bölümde:** işletmeler kendi kampanyasını girer, müşteri burada görür.
- **Aylık 1. işletmeye ödül** (pazarlama) — liderlik tablosu benzeri.

### B5. Açık tema + logo + QR-tara pop-up + Keşfet
- **Açık tema renklendirme:** full beyaz olmasın, renkli aksamlar (QNB tarzı). `lib/theme-presets.ts`, `lib/brand-colors.ts`, tema CSS.
- **Açık temada logo hataları** düzelt (light logo varyantları).
- **QR Tara pop-up:** şu an 3 yerde (menü `sidebar.tsx:224`, hero CTA `:583-588`, quick-action `:789`). → Sağ üstte **pop-up kısayol** (floating button + modal), menüden çıkar.
- **KALDIR:** Keşfet (yerine chat bot — mevcut chat bot bileşenine yönlendir).

### B6. QGameX + Ayarlar
- **Mini oyun bug'ları:** oyunlarda bug var → teşhis + fix (uygulama aşamasında; `app/customer/games/*`, `components/customer/games/*`, `lib/minigame-*`).
- **Ayarlar:** Doğum günü değişikliğine izin VERME (kampanya suistimali). `app/customer/settings` + API validasyonu.

---

## BÖLÜM C — BAYİ PANELİ

**Sol menü:** `components/dashboard/sidebar.tsx` — `dealerNavItems` **satır 179-216** (şu an **36 düz madde**).

### C1. Yeni sol menü (6 gruplu yapı)
```
1. Dashboard
2. İşletme
   ├ Ürünlerim ├ QR Kodlarım ├ Kampanyalar(inovasyon) ├ Personel └ Müşteriler
   (Abonelik → Faturalandırma altına, en alt)
3. Analitik (Büyüme Merkezi)
   ├ Churn Risk ├ ROI ├ Benchmark └ İş Sonuçları(genel özet)
   (Haftalık/Operasyon Özeti sadece dashboard+analitik başı; Aksiyonlar kaldır)
4. Geri bildirimlerim
   ├ Yorumlar ├ Telafi merkezi(+otomasyon aynı ekran) ├ Tüketim Kayıtları └ Anketler
5. Sistem
   ├ Olaylar/Kriz Radarı ├ AI Sohbet(+Copilot birleşik) ├ VoC Wall
   ├ Müşteri Radarı ├ Isı Haritası └ Ayarlar(AI Ayarları)
6. Ayarlar
```
- **KALDIR:** Keşfet (discover), Veriye Sor (ask-analytics → AI sohbete birleşir), Aksiyonlar (action-items), ayrı Operasyon Özeti.
- **Abonelik → Faturalandırma altına** (billing), en alt başlık.

### C2. AI birleştirme (ai-chat + ask-analytics + copilot)
- `ai-chat` (`/dealer/ai-chat`, çok turlu sohbet, `/api/dealer/ai-chat`)
- `ask-analytics` (`/dealer/ask-analytics`, tek atış "Veriye Sor" + grounding chip, `/api/dealer/ask-analytics`)
- `copilot` (`/dealer/copilot`, proaktif dashboard — sohbet DEĞİL, `/api/dealer/copilot-summary`)
- **Plan:** Tek "AI" sayfası → (a) Copilot-tarzı genel bakış sekmesi + (b) birleşik sohbet (ai-chat kalıcılığı + ask-analytics grounding chip'leri). 3 endpoint konsolide edilir. "Veriye sor" ayrı menüden çıkar.

### C3. Isı Haritası error FIX (kök neden bulundu)
- **Sorun:** `app/dealer/heatmap/page.tsx` ile `app/api/dealer/heatmap/route.ts` **farklı sözleşme**.
  - Sayfa bekliyor: `hm.heatmap`, `hm.timeHeatmap`, `hm.summary`, `hm.period` (`:39-50`, `:178-211`).
  - API dönüyor: sadece `{ data, empty }` — düz gün/saat sayaç dizisi (`:60-73`). `heatmap`/`summary`/`timeHeatmap` YOK.
  - `if (hm.heatmap)` (`:184`) hep false → `data` null kalır → sayfa hep boş/error görünür.
- **Fix seçeneği:** API'yi `{ heatmap (per-location agg), period, timeHeatmap (7×24), summary }` döndürecek şekilde yeniden yaz. (Tercih: API'yi düzelt, çünkü sayfa daha zengin.)

### C4. Onboarding = ilk adım (gating)
- Şu an **advisory**, hard-gate yok. Tamamlanma **veri-türevli** (`profile`+`qr` zorunlu, `app/api/dealer/onboarding/route.ts:21-56`).
- **Plan:** Kurulum en başta; tamamlanmadan diğer menüler kilitli/soluk; tamamlanınca onboarding kapanıp diğerleri açılır. `app/dealer/layout.tsx` + `onboarding-sheet.tsx` (localStorage `qratex-onboarding-done`).

### C5. Diğer bayi düzeltmeleri
- **Haftalık özet:** analitik başında + dashboard'da. Ayrı menü değil.
- **İş Sonuçları:** genel özet verecek.
- **Yorumlar + Telafi merkezi** aynı ekranda (reviews + remedy-queue birleşik view).
- **Copilot ayarı** AI sohbet içine.

---

## BÖLÜM D — DEMO VERİ

- **3 zengin demo kafe.** Her biri: işletme profili + ürünler + QR kodlar + örnek müşteri geri bildirimleri + tüketim kayıtları + kampanyalar.
- Mevcut seed altyapısı: `add-shop-items.ts`, `lib/cosmetic-seed-server.ts`, `app/api/admin/bootstrap/route.ts` (demo seed action'ları burada).
- Liderlik/trend tablolarının dolu görünmesi için yeterli çeşitlilik.

---

## NETLEŞEN KARARLAR (2. tur soru-cevap)

1. **Testimonials → TAMAMEN KALDIR.** `home-client.tsx`'ten `TestimonialsSection` çıkar; import (`:15`), render (`:74`), i18n `landing.testimonials.*` (kalabilir). A3'teki "yer değişimi" maddesi düşer.
2. **"Sen seversin" öneri motoru + aylık ödül → TAM YAP (ML + cron).** Ayrı efor bloğu (bkz. B4-genişletilmiş, aşağıda). Öneri algoritması + `app/api/cron` aylık ödül job'u.
3. **"????" yerleri → ŞİMDİLİK OLDUĞU GİBİ.** Bayi "Müşteriler" kalır; müşteri "İşletmede Deneyim" (experiences) dokunma. Menüden çıkarma YOK (bu turda).
4. **QGameX bug'ları:** teşhis uygulama aşamasında (B6).
5. **Logo görselleri:** placeholder (mevcut PNG + alt metin QRateX); yeni logo sonra.
6. **Başlangıç:** REDESIGN.md sırasıyla, ben yönetirim, her adımda onay.

### B4-genişletilmiş — Öneri motoru (tam)
- **Veri:** müşterinin `Consumption` + `Feedback` geçmişinden ürün/kategori tercihleri.
- **Algoritma:** kategori/ürün benzerliği (co-occurrence veya basit embedding); `lib/ai-learning-embeddings` altyapısı kullanılabilir.
- **Cron:** aylık 1. işletme ödülü → `app/api/cron/monthly-top-business` (fail-closed, escrow uyumlu — bkz. points-economy invariants).
- **UI:** Trend Analiz içinde "Sen seversin" bölümü.

---

## UYGULAMA SIRASI (önerilen)
1. **Hızlı kazanımlar:** A1 (marka), A2 (pricing toggle), A3 (bölüm kaldır/taşı), B5-Keşfet, C1-Keşfet kaldır.
2. **Landing görsel:** A4 (sticky-scroll, video slot, renkli blok, marquee, ReverBot), A5 (blog).
3. **Müşteri paneli:** B1 (menü), B2 (dashboard), B3-B4 (kart/analiz/trend), B6 (ayar kilidi).
4. **Bayi paneli:** C1 (menü), C3 (ısı haritası FIX), C2 (AI birleştir), C4-C5.
5. **Bug fix:** B6 (oyunlar), C3 (ısı haritası).
6. **Demo:** D (3 kafe).
