# /feedback/[code]

**Amaç:** Müşterinin işletmedeki QR kodu okuttuktan sonra (veya `/customer/scan` üzerinden kodu girdikten sonra) düştüğü genel erişimli geri bildirim formu: 1-5 yıldız, opsiyonel personel seçimi, NPS (0-10), hızlı seçenekler, serbest yorum, fotoğraf; giriş yapmışsa puan/XP/seviye ödülü. Platformun **en kritik giriş kapısı**: bayinin AI analizi, otomatik yanıtlar, telafi teklifleri, ısı haritası, webhook'lar ve müşterinin oyunlaştırma döngüsü bu sayfadan beslenir.

**Genel puan: 4.8 / 10** · **Karar: yeniden tasarla** (çekirdek akış çalışıyor ama sunucu tarafında anonim gönderimleri sessizce eksik işleyen kritik bir dal, fiilen bozuk fotoğraf yüklemesi, doğrulanmayan personel kimliği ve "QR okut, 20 saniyede bitir" deneyimine uymayan tek-uzun-form yapısı var).

Dosyalar: `app/(public)/feedback/[code]/page.tsx` (546 satır, `'use client'`), `app/(public)/layout.tsx`, `app/api/qr-codes/public/[code]/route.ts`, `app/api/feedbacks/route.ts` (POST), `lib/validations.ts`, `lib/points-rules.ts`, `lib/points-caps.ts`, `lib/trust-score.ts`, `lib/rate-limit.ts`, `lib/idempotency.ts`, `lib/effects/confetti.ts`, `i18n/request.ts`, `messages/tr.json`/`en.json`, `prisma/schema.prisma` (`Feedback`, `DealerStaff`, `QRCode`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Giriş yapmış kullanıcı için gönderim + ödül zinciri sağlam; fakat anonim gönderimler AI/otomatik yanıt/webhook/ısı haritası/analitik işlemeyi tamamen atlıyor, fotoğraf yükleme gerçek telefon fotoğraflarında fiilen çalışmıyor. |
| UX | 5/10 | Tüm alanlar tek uzun kartta, hiyerarşi düz; personel etiketi ham i18n anahtarı gösteriyor, başarı ekranı aynı cümleyi üç kez söylüyor, anonim kullanıcıya verilen "Kayıt ol ve puan kazan" vaadi bu gönderim için karşılanmıyor. |
| Görsel | 6/10 | Glass kart + gradient buton + konfeti tutarlı ve temiz; ancak işletme markası (logo) hiç yok, pazarlama header/footer'ı ve animasyonlu arka plan mağaza-içi akışı sulandırıyor. |
| Mimari | 4/10 | Tamamen istemci tarafında veri çekme, global locale context'i kopyalayan yerel locale state, sunucuda 270 satırlık tek `if (session)` bloğu, base64 fotoğrafların JSON gövdeyle DB'ye yazılması, doğrulanmayan yabancı anahtar. |
| Performans | 5/10 | QR verisi SSR edilmiyor (spinner → fetch → render şelalesi), her yüklemede DB'ye analitik yazımı, istemci paketine iki ~200 KB'lık mesaj sözlüğü, fotoğraflar 5×6.7 MB'a kadar base64 gövde. |
| Erişilebilirlik + Mobil | 4/10 | Yıldız/NPS/seçenekler için `radiogroup`/`aria-pressed` yok, fotoğraf ekleme klavyeyle erişilemez, NPS 36 px hedeflerle 375 px'te iki satıra kırılıyor, konfeti `prefers-reduced-motion`'a uymuyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | QR verisini çekme (`GET /api/qr-codes/public/[code]`) | ÇALIŞIYOR | page.tsx:80-104; route.ts:43-119 | Aktif/süresi dolmuş/iptal kontrolleri sunucuda doğru. |
| 2 | Yükleniyor durumu | ÇALIŞIYOR | page.tsx:191-200 | Sadece spinner; iskelet yok, `aria-live` yok. |
| 3 | Hata durumu (404 / diğer / ağ) | KISMİ | page.tsx:84-96, 203-218 | Sunucunun ayrıntılı mesajı ("süresi dolmuş", "iptal edilmiş") atılıyor; 429 "Bir hata oluştu"ya düşüyor; metinler EN modda da Türkçe. |
| 4 | TR/EN dil düğmesi | KISMİ | page.tsx:55-77, 298-302 | Global `AppLocaleProvider` (lib/app-locale.tsx:19) ile senkron değil; header/footer dili değişmiyor, `document.documentElement.lang` güncellenmiyor. |
| 5 | Oturum dil tercihini uygulama | KISMİ | page.tsx:57-70 | Öncelik sırası global provider'ın tersi (oturum > localStorage vs localStorage > oturum); `localStorage` try/catch'siz. |
| 6 | Başlık + işletme adı + QR adı | ÇALIŞIYOR | page.tsx:304-313 | |
| 7 | İşletme logosu | EKSİK | route.ts:59 `businessLogo` döner; page.tsx'te render yok | Marka güveni için en önemli öğe kullanılmıyor. |
| 8 | QR açıklaması (`description`) | EKSİK | page.tsx:22 tipte var, render yok | |
| 9 | Segment karşılama metni (`segmentExperience.welcomeText`) | BOZUK | route.ts:38, 91-95; page.tsx:83 `?segment` iletilmiyor | Bayi `segmentConfig` ayarlayabiliyor (app/api/qr-codes/[id]/route.ts:73) ama bu sayfa hiçbir zaman göstermiyor — ölü özellik. |
| 10 | 5 yıldız puanlama | ÇALIŞIYOR | page.tsx:318-341 | `aria-label` İngilizce ("1 star"), seçili durum ekran okuyucuya bildirilmiyor. |
| 11 | Hover önizleme | ÇALIŞIYOR | page.tsx:326-327, 334 | Sadece masaüstü. |
| 12 | Puan etiketi (Mükemmel … Kötü) | ÇALIŞIYOR | page.tsx:342-354 | |
| 13 | Personel seçimi (opsiyonel) | KISMİ | page.tsx:358-389; route.ts:256 | Seçim gönderiliyor ama sunucuda doğrulanmıyor (bkz. Bulgu 4); toplanan veriyi okuyan bayi/personel ekranı bulunamadı (grep: `dealerStaffId`/`staff:` tüketicisi yok). |
| 14 | Personel bölümü etiketi | BOZUK | page.tsx:362; messages/tr.json `publicFeedback` içinde `rateStaff` yok; i18n/request.ts:37 eksik anahtarda anahtarın kendisini döndürüyor | Ekranda literal `publicFeedback.rateStaff` yazıyor; `||` yedeği hiç çalışmaz. |
| 15 | NPS 0-10 | KISMİ | page.tsx:392-409 | Seçim geri alınamıyor, uç etiketleri ("hiç"/"kesinlikle") yok, 11×36 px + boşluk = 436 px → telefonda 8+3 diye kırılıyor. |
| 16 | Hızlı seçenek çipleri | KISMİ | page.tsx:412-440 | Sabit Türkçe (EN'de de), seçili durumu yok, tekrar basınca metni çoğaltıyor; 3 çip "detaylı yorum" eşiğini (50 karakter) aşıp bonus puan açıyor (Bulgu 6). |
| 17 | Yorum alanı | ÇALIŞIYOR | page.tsx:443-453 | `maxLength` 2000 = `INPUT_LIMITS.feedbackText` (lib/input-limits.ts:7). |
| 18 | Karakter sayacı | ÇALIŞIYOR | page.tsx:460 | |
| 19 | "+50 bonus puan" ipucu | SAHTE | page.tsx:456-458 vs lib/points-rules.ts:53-56, 269 | Sabit kodlu 50; sunucu eşiği `>= 50` iken UI `> 50`; tutar admin matrisinden ve VIP/sezon/global çarpanlardan geliyor; anonim kullanıcıya da gösteriliyor ama anonim hiç puan almıyor. |
| 20 | Fotoğraf ekleme | BOZUK | page.tsx:163-184 (FileReader → data URL), 122; lib/validations.ts:100-108 | 5 MB'lık dosya base64'te ~6.7 MB; Vercel fonksiyon gövde sınırı 4.5 MB → tek bir modern telefon fotoğrafı bile isteği düşürebilir (doğrulanmadı: canlıda denenmedi; sınır platform belgesine dayanıyor). Sunucuda R2 yüklemesi yok, base64 doğrudan `Feedback.media` JSON'una yazılıyor. |
| 21 | Fotoğraf önizleme + kaldırma | KISMİ | page.tsx:468-491 | `key={img}` aynı fotoğraf iki kez seçilirse çakışır; kaldırma düğmesinin `aria-label`'ı yok. |
| 22 | 5 adet / 5 MB sınırı | KISMİ | page.tsx:167-176 | Sınır, gerçek darboğaz olan toplam gövde boyutunu dikkate almıyor; sıkıştırma yok. |
| 23 | Fotoğrafların bayi/admin tarafında görüntülenmesi | EKSİK | grep: `.tsx` dosyalarında `media` tüketicisi yok; yalnızca lib/surprise-badges.ts:63 sayıyor | Müşterinin yüklediği fotoğrafı kimse görmüyor; tek etkisi "fotoğraflı yorum" sürpriz rozeti. |
| 24 | Giriş ipucu bandı | KISMİ | page.tsx:508-515 | `/auth/login` linki `callbackUrl` taşımıyor (login bunu destekliyor: app/(auth)/auth/login/page.tsx:67) → kullanıcı formu ve QR bağlamını kaybediyor. |
| 25 | Gönder düğmesi + yükleniyor | ÇALIŞIYOR | page.tsx:518-536 | |
| 26 | "Puan seçin" doğrulaması | ÇALIŞIYOR (ölü dal) | page.tsx:107-110 vs 523 | Düğme `rating === 0` iken disabled olduğu için toast'a hiç ulaşılmaz; `selectRatingError` anahtarı varken sabit metin. |
| 27 | Geri bildirim POST'u | ÇALIŞIYOR | page.tsx:115-126; feedbacks/route.ts:169-258 | Kayıt her iki durumda oluşuyor. |
| 28 | Idempotency (çift gönderim koruması) | EKSİK | page.tsx:117 başlık yok; lib/idempotency.ts:32-33 anahtar yoksa koruma yok | Ağ kopup tekrar basılırsa iki kayıt + iki ödül denemesi. |
| 29 | Gönderim hata mesajları | KISMİ | page.tsx:128-131, 156-157 | HTML dönen 413/502/504'te `response.json()` patlıyor → genel "Bir hata oluştu"; `Retry-After` kullanılmıyor. |
| 30 | PostHog `feedback_submitted` | ÇALIŞIYOR | page.tsx:138-145; lib/analytics.ts:6-14 | |
| 31 | Konfeti / seviye atlama yağmuru | KISMİ | page.tsx:147-153; lib/effects/confetti.ts:20-81 | `disableForReducedMotion` yok; 3 sn `setInterval` + `requestAnimationFrame` hareket hassasiyetine saygı göstermiyor. |
| 32 | Başarı toast'ı | ÇALIŞIYOR | page.tsx:155 | Başlık ve açıklamayla aynı cümle → üçlü tekrar. |
| 33 | Başarı ekranı başlık + açıklama | BOZUK | page.tsx:241, 243 | İkisi de `publicFeedback.successMsg`; `<p>` içine `<div>` (page.tsx:242-265) geçersiz DOM iç içeliği. |
| 34 | Kazanılan puan/XP kartı | KISMİ | page.tsx:244-252; feedbacks/route.ts:318, 365 | UI `reward.xp` (çarpansız) gösteriyor, kredilenen `xpToCredit` (çarpanlı); günlük tavan dolunca neden 0 puan geldiği açıklanmıyor; "Kazanılan/Puan" sabit TR. |
| 35 | "SEVİYE ATLADIN" bloğu | KISMİ | page.tsx:253-262 | Sabit TR; Tailwind `animate-bounce` global `MotionConfig reducedMotion="user"` (components/providers.tsx:232) kapsamı dışında. |
| 36 | "Dashboard'a git" CTA | KISMİ | page.tsx:267-270 | Rol kontrolsüz `/customer`; bayi/personel kendi QR'ını test ederse yanlış panele gider. |
| 37 | "Kayıt ol ve puan kazan" CTA | SAHTE | page.tsx:273-277 | Az önce gönderilen anonim geri bildirimi hesaba bağlayan bir talep (claim) mekanizması yok (grep: claim/pending feedback yok); `callbackUrl` de yok. Vaat bu gönderim için karşılanmıyor. |
| 38 | "Ana sayfaya dön" | ÇALIŞIYOR | page.tsx:278-280, 211-213 | |
| 39 | Arka plan AI analizi | KISMİ | feedbacks/route.ts:432-527 (yalnız oturum dalında); app/api/cron/ai-retry/route.ts:37-45 | Anonim gönderim yalnızca günlük cron'da, koşu başına en fazla 15 kayıtla analiz edilir (cron 953c8fe ile günde 1'e indirildi). |
| 40 | Otomatik yanıt / telafi / webhook / ısı haritası / analytics / cache invalidation | BOZUK (anonim) | feedbacks/route.ts:283-545 tek `if (session?.user?.id)` bloğu; anonim dal 547-554 | Bkz. Bulgu 1. |
| 41 | Puan/XP kredisi (VIP → sezon → global çarpan → günlük/haftalık tavan, Serializable tx) | ÇALIŞIYOR | feedbacks/route.ts:308-359; lib/points-caps.ts:57-65 | Ekonomi değişmezlerine uygun; `points_credited` olayı yazılıyor. |
| 42 | Güven skoru (Trust Score) | KISMİ | feedbacks/route.ts:269-280; lib/trust-score.ts:53-121 | Sadece sıklık ve düşük puan örüntüsüne bakıyor; bayinin/personelin kendi işletmesine yorum yazması tespit edilmiyor (Bulgu 5). |
| 43 | Hız sınırları | ÇALIŞIYOR | feedbacks/route.ts:171 (20/dk/IP), 221 (5/dk/QR/IP); public route.ts:15 (60/dk/IP) | |
| 44 | Sürpriz + davranışsal rozetler | ÇALIŞIYOR | feedbacks/route.ts:534-541, 548-552 | `after()` ile güvenilir. |
| 45 | `qr_scanned` analitik olayı | KISMİ | public route.ts:98-111; app/customer/scan/page.tsx:31-35 | GET'in yan etkisi var: her yenilemede ve uygulama içi taramada (scan sayfası doğrulama + bu sayfa) iki kez sayılıyor; UTM parametreleri sayfa tarafından hiç iletilmiyor. |
| 46 | `QRCode.scanCount` artışı | KISMİ | feedbacks/route.ts:261-264 | Adı "tarama" ama aslında geri bildirim sayıyor; dönüşüm oranı hesaplarında karışıklık yaratır. |
| 47 | UTM / attribution alanlarının yazılması | EKSİK | page.tsx:118-125 `utmSource/utmCampaign/utmMedium/attributionSource` gönderilmiyor; schema.prisma `Feedback.utm*` | Bu sayfadan gelen kayıtlarda alanlar hep null. |
| 48 | Sayfa meta verisi / `noindex` | EKSİK | page.tsx:1 istemci bileşeni, klasörde layout yok; app/robots.ts:20 `/feedback/` yasaklı değil | Generic başlık, arama motoruna açık ince sayfalar. |
| 49 | Daha önce gönderildi / taslak koruma | EKSİK | page.tsx state'i yalnız bellekte | Login'e gidip dönen ya da sekmeyi kapatan kullanıcı her şeyi kaybediyor. |
| 50 | Düşük puanda kurtarma akışı (iletişim izni, telafi) | EKSİK | page.tsx:106-161 tek tip akış | Telafi yalnızca arka planda ve yalnızca oturumlu kullanıcıda (route.ts:503-515). |
| 51 | Sayfa kabuğu (pazarlama header/footer + animasyonlu arka plan) | KISMİ | app/(public)/layout.tsx:13-31; components/landing/LandingBackground.tsx | Mağaza içi tek görevli akış için ağır ve dikkat dağıtıcı. |

**Durum sayımı:** ÇALIŞIYOR 17 · KISMİ 19 · BOZUK 5 · SAHTE 2 · EKSİK 8 (toplam 51 — #26 "ölü dal" ÇALIŞIYOR'a, #39 KISMİ'ye sayıldı).

---

## Bulgular

### 1. Anonim geri bildirimler iş hattının yarısını atlıyor
- **Önem:** kritik · **Kategori:** veri bütünlüğü / mimari · **Efor:** M
- **Kanıt:** `app/api/feedbacks/route.ts:283` `if (session?.user?.id) {` bloğu satır 545'te kapanıyor; `analyticsEvent feedback_submitted` (390-398), webhook (402-412), ısı haritası (416-418), cache invalidation (422-429), AI analizi + otomatik yanıt + telafi (432-527) **tamamı bu bloğun içinde**. Anonim dal (547-554) yalnızca `{ success, feedback }` döndürüyor.
- **Sorun:** QR geri bildiriminin doğal kullanıcısı çoğunlukla anonimdir. Bu kayıtlar için bayi webhook'u hiç tetiklenmez, ısı haritası artmaz, admin dashboard/leaderboard cache'i bayatlamaz, `feedback_submitted` olayı yazılmaz, otomatik yanıt kuralları çalışmaz, telafi taslağı oluşmaz. AI analizi yalnızca günlük `ai-retry` cron'uyla gelir ve o da koşu başına 15 kayıtla sınırlı (`app/api/cron/ai-retry/route.ts:37-45`); yoğun bir işletmede anonim yorumlar günlerce "AI bekliyor" kalır. Bayi panelindeki tüm AI/aksiyon ekranları sistematik olarak yanlı (yalnız üye müşterilerin sesi) beslenir.
- **Öneri:** POST'u açık aşamalara bölün: (1) doğrulama + kayıt, (2) **oturumdan bağımsız** "geri bildirim oluşturuldu" yan etkileri (analytics, webhook, heatmap, cache tag, AI kuyruğu/after, auto-reply, remedy), (3) yalnızca oturumlu kullanıcıya özel ödül/trust/rozet. Yan etkileri `lib/feedback/on-feedback-created.ts` gibi tek bir fonksiyona çıkarın ve hem bu route'tan hem ileride consumption review'dan çağırın. Regresyon testi: anonim POST sonrası `after` kuyruğunda AI analizinin ve `processAutoReplies`'ın çağrıldığını doğrulayan bir route testi. Ek olarak, mevcut birikmiş anonim kayıtlar için `ai-retry` bütçesini geçici olarak artıran tek seferlik bir telafi koşusu planlayın (canlı Neon'a dikkat).

### 2. Fotoğraf yükleme fiilen bozuk ve kimse fotoğrafı görmüyor
- **Önem:** yüksek · **Kategori:** işlevsellik / performans / depolama · **Efor:** L
- **Kanıt:** `page.tsx:178-182` `readAsDataURL` → base64 string state'e; `page.tsx:122` JSON gövdesine ekleniyor; `lib/validations.ts:103` `z.string().url()` (zod 3.25, `data:` URL'leri `new URL` ile geçer); `feedbacks/route.ts:249` `media` doğrudan DB'ye. `.tsx` dosyalarında `media`'yı render eden bayi/admin/müşteri ekranı bulunamadı; tek tüketici `lib/surprise-badges.ts:63` (sayaç).
- **Sorun:** (a) Sayfanın izin verdiği 5 MB dosya base64'te ~6.7 MB, beş dosya ~33 MB; Vercel fonksiyon gövde sınırı 4.5 MB olduğundan tek bir yüksek çözünürlüklü telefon fotoğrafı isteği 413 ile düşürebilir (canlıda denenmedi). 413 HTML döndüğünde `page.tsx:129` `response.json()` atar ve kullanıcı yalnız "Bir hata oluştu" görür — hangi alanın sorun olduğunu bilemez ve tüm formu kaybetmemek için ne yapacağını bilmez. (b) Başarılı olursa Postgres'e megabaytlarca base64 yazılır; `GET /api/feedbacks` listesi (`route.ts:68`) 50'lik sayfada `media`'yı seçtiği için bayi listesi devasa yanıtlara dönüşür. (c) Fotoğraf hiçbir yerde gösterilmediği için özellik müşteri açısından "boşluğa yükleme"; yalnızca rozet sayacını besliyor ve çöp fotoğraf teşvik ediyor.
- **Öneri:** Doğrudan R2'ye imzalı URL ile yükleme: `POST /api/public/feedback-media/presign` (QR kodu + hız sınırı + içerik tipi/boyut kontrolü, kısa ömürlü anahtar) → istemci `browser-image-compression` benzeri ile ~1600 px / ~400 KB'a sıkıştırıp doğrudan R2'ye PUT → form yalnızca R2 URL'lerini gönderir. `feedbackSchema.media` yalnızca kendi R2 alan adınızla başlayan `https` URL'leri kabul etsin (`data:`/harici URL reddi). Bayi geri bildirim detayında ve müşterinin "geri bildirimlerim" ekranında küçük resim galerisi + lightbox ekleyin. Fotoğraflı yorum rozetini yalnızca AI/moderasyon "geçerli görsel" dediğinde saydırın. Mevcut base64 kayıtlar için R2'ye taşıyan bir backfill (mail ekleri için yapılan `attachment-backfill` deseni yeniden kullanılabilir).

### 3. Personel bölümünün başlığı ham i18n anahtarı gösteriyor
- **Önem:** yüksek (her personelli işletmede görünür) · **Kategori:** UX / i18n · **Efor:** S
- **Kanıt:** `page.tsx:362` `t(locale, 'publicFeedback.rateStaff') || 'Hangi personelimizle…'`; `messages/tr.json` ve `en.json` `publicFeedback` nesnesinde `rateStaff` yok; `i18n/request.ts:37` eksik anahtarda `return key` — boş olmayan string olduğu için `||` yedeği asla çalışmaz.
- **Sorun:** Müşteri "publicFeedback.rateStaff" metnini görüyor; sayfanın güvenilirliğini ilk bakışta zedeler.
- **Öneri:** Anahtarı iki dile ekleyin; daha önemlisi `t()`'nin "anahtarı döndür" davranışına karşı `x || fallback` desenini kod tabanında yasaklayan bir lint kuralı (veya `t` için tip güvenli anahtar birliği: `keyof` tabanlı `MessageKey` tipi) getirin, böylece eksik anahtar derleme zamanında yakalanır.

### 4. `dealerStaffId` doğrulanmıyor — başka işletmenin personeline yorum yazılabiliyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü (IDOR) · **Efor:** S
- **Kanıt:** `lib/validations.ts:115` `dealerStaffId: z.string().optional().nullable()`; `feedbacks/route.ts:256` `...(dealerStaffId && { dealerStaffId })` — QR'ın `dealerId`'si ile `DealerStaff.dealerId` eşleşmesi kontrol edilmiyor (`schema.prisma` `DealerStaff.dealerId`). Var olmayan bir id gönderilirse FK hatası 500'e dönüşür.
- **Sorun:** Herhangi bir işletmenin QR'ı üzerinden başka bir işletmenin personeline 1 yıldız atfedilebilir; personel performans metrikleri (yazılırsa) kirlenir. Ayrıca `isActive: false` personel de seçilebilir.
- **Öneri:** Kayıttan önce `prisma.dealerStaff.findFirst({ where: { id, dealerId: qrCode.dealerId, isActive: true } })`; eşleşmezse sessizce `null`'a düşürün (kullanıcıyı cezalandırmadan). Bunun yanında toplanan verinin tüketicisini yazın: bayi panelinde "Personel bazlı puan" kartı — aksi halde müşteriden boşuna veri isteniyor (bkz. Bulgu 10).

### 5. Bayi/personel kendi işletmesine yorum yazıp puan kazanabiliyor
- **Önem:** yüksek · **Kategori:** ekonomi / güvenlik · **Efor:** M
- **Kanıt:** `feedbacks/route.ts:243-359` rol veya ilişki kontrolü yok; `lib/trust-score.ts:53-121` yalnızca sıklık ve düşük-puan örüntüsüne bakıyor, `overSoftLimit` (eşik 3, `trust-score.ts:29`) puan kredisini etkilemiyor; per-QR sınır 5/dk (`lib/rate-limit.ts:167`).
- **Sorun:** Personel (müşteri hesabıyla) kendi işletmesinin QR'ına 5 yıldız verip kendini personel olarak seçebilir, hem işletme puanını hem kişisel metriklerini şişirir, günlük 500 puan tavanına kadar kazanır. Bayi kendi QR'ını "test ederken" de aynı şey olur. [[points-economy-invariants]] fraud görünürlüğü ilkesine göre `points_credited` yazılıyor ama engelleme yok.
- **Öneri:** Kayıt sonrası "çıkar çatışması" kontrolü: `session.user.id === qrCode.dealerId` veya kullanıcı bu bayinin `DealerStaff` kaydıysa → geri bildirimi `trustFlagged=true, trustReason='işletme içi'` ile kaydet, ödül verme, bayi analizlerinden hariç tut ve UI'da "Kendi işletmeniz için yorum puan kazandırmaz" bilgisini göster. Bayi için ayrı bir "önizleme modu" (`?preview=1` + rol kontrolü) sunarak test gönderimlerinin gerçek veriye karışmasını engelleyin.

### 6. Hızlı seçenek çipleri "detaylı yorum" bonusunu 3 dokunuşla açıyor
- **Önem:** orta · **Kategori:** ekonomi / UX · **Efor:** M
- **Kanıt:** `page.tsx:429-433` çip metnini serbest metne ekliyor; `lib/points-rules.ts:53-56, 269` detaylı eşik `text.trim().length >= 50` → 100 puan / 50 XP (temel 50/25). Örn. "Çok memnunum Personel çok ilgili Temizlik mükemmel" = 50 karakter.
- **Sorun:** Detaylı yorum bonusu emek gerektiren metni ödüllendirmek için tasarlanmış; çipler bunu sıfır eforla tetikliyor. Ayrıca çipler serbest metni kirletiyor (AI analizi şablon cümleleri müşteri sesi gibi okuyor), EN modunda da Türkçe, seçili durumları ve geri alınabilirlikleri yok.
- **Öneri:** Çipleri ayrı yapılandırılmış alan yapın: `tags: string[]` (sabit kimlikler: `staff_friendly`, `long_wait` …) → `Feedback.quickTags Json` olarak saklayın; AI'a ayrı sinyal olarak verin, bayi panelinde etiket dağılımı grafiği olarak gösterin. Detaylı bonusu yalnızca kullanıcı tarafından yazılmış metne uygulayın. Çipleri puana göre bağlamsal yapın (1-2 yıldızda olumsuz, 4-5'te olumlu set) ve i18n'e taşıyın; bayinin kendi çip setini tanımlayabilmesi (ör. kafe vs berber) ürünleşebilir.

### 7. Anonim kullanıcıya verilen "Kayıt ol ve puan kazan" vaadi karşılanmıyor; giriş akışı bağlamı kaybettiriyor
- **Önem:** orta · **Kategori:** UX / büyüme · **Efor:** M
- **Kanıt:** `page.tsx:273-277` `/auth/register`, `page.tsx:510` `/auth/login` — ikisinde de `callbackUrl` yok (login destekliyor: `app/(auth)/auth/login/page.tsx:67, 125-126`); anonim geri bildirimi sonradan hesaba bağlayan kod yok (grep).
- **Sorun:** Starbucks/Duolingo dönüşüm anı tam burası: kullanıcı değer üretti, ödül görmek istiyor. Şu an kayıt olursa az önceki yorumu için hiçbir şey almıyor; girişe giderse formu kaybediyor ve dashboard'a düşüyor.
- **Öneri:** Anonim gönderimde sunucu, kısa ömürlü (ör. 24 saat) imzalı bir `claimToken` döndürsün (`Feedback` üzerinde `claimTokenHash`, `claimedAt`). Başarı ekranı: "Bu yorum için **X puan** seni bekliyor — 30 saniyede hesap aç ve al". Kayıt/giriş sonrası `callbackUrl=/feedback/claim?token=…` ile tek seferlik, atomik (`updateMany where userId null and claimedAt null`) talep; ödül normal `creditPointsAndXp` + tavan zincirinden geçsin ([[points-economy-invariants]]: tek seferlik kredi). Giriş bandı `callbackUrl=/feedback/{code}` taşısın ve form taslağı `sessionStorage`'a yazılsın.

### 8. Attribution ve tarama analitiği yanlış veya boş
- **Önem:** orta · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** `page.tsx:83` `fetch('/api/qr-codes/public/${code}')` sorgu parametresiz → `route.ts:38-41` `segment`/`utm_*` hep `undefined`; `page.tsx:118-125` POST'ta `utmSource/utmCampaign/utmMedium/attributionSource` yok; `route.ts:98-111` her GET'te `qr_scanned` yazılıyor; `app/customer/scan/page.tsx:31-35` aynı GET'i doğrulama için çağırıp sonra bu sayfaya yönlendiriyor → çift sayım; `feedbacks/route.ts:261-264` `scanCount` aslında gönderim sayıyor.
- **Sorun:** Bayinin "kampanya QR'ı ne kadar dönüştü" sorusunun cevabı bozuk: taramalar şişkin, gönderimlerde kaynak boş, segment karşılama metni hiç görünmüyor.
- **Öneri:** Sayfayı sunucu bileşenine çevirip (`page.tsx` → server `page` + client `FeedbackForm`) `searchParams`'tan segment/UTM'i okuyun, QR verisini sunucuda tek sorguyla çekin ve `qr_scanned` olayını tek noktada, `scanSessionId` (çerez) ile tekilleştirerek yazın; `customer/scan` doğrulaması için yan etkisiz bir `HEAD`/`?validate=1` modu ekleyin. POST'a `attributionSource: 'qr' | 'in_app_scan' | 'link'` + UTM'leri iletin. `scanCount`'u `feedbackCount` olarak yeniden adlandırın ya da gerçek taramaya taşıyın.

### 9. Ödül kartı kredilenen değeri göstermiyor; tavan açıklanmıyor
- **Önem:** orta · **Kategori:** ekonomi şeffaflığı / UX · **Efor:** S
- **Kanıt:** `feedbacks/route.ts:318` `xpToCredit = floor(reward.xp * xpMultiplier)` kredilenirken `route.ts:365` UI'a `xp: reward.xp` dönüyor; `route.ts:362` puan tavanda 0'a düştüğünde yalnız XP gösteriliyor, sebep yok; `squadContribution` dönüyor ama UI'da kullanılmıyor (`page.tsx:44` tipte bile yok).
- **Sorun:** Çarpan aktifken kullanıcı gerçekte kazandığından az XP görüyor; tavana takılan kullanıcı "neden puan almadım" diye kafası karışık ayrılıyor.
- **Öneri:** API kredilenen gerçek değerleri ve bir `breakdown` döndürsün: `{ base, vipBonus, seasonalBonus, cappedBy: 'daily'|'weekly'|null, squadContribution, levelProgress: {current, next, pct} }`. Başarı ekranında Duolingo tarzı sayaç animasyonuyla taban → bonuslar → toplam sıralı gösterilsin; tavan dolduysa "Bugünkü puan limitine ulaştın, XP kazanmaya devam ediyorsun" mesajı.

### 10. Toplanan personel verisi ve fotoğraflar tüketilmiyor
- **Önem:** orta · **Kategori:** ürün / ölü veri · **Efor:** M
- **Kanıt:** `dealerStaffId` ve `staff` ilişkisini seçen bayi/personel API'si bulunamadı (`grep dealerStaffId` yalnız bu sayfa + validations; `staff: { select` yok); `media` için Bulgu 2.
- **Sorun:** Müşteriden ek bilişsel yük istenip karşılığında bayiye değer üretilmiyor; ayrıca public API personel tam adlarını açığa çıkarıyor (`route.ts:60-65`) — UI yalnız ilk adı gösterse de JSON tam adı içeriyor (KVKK açısından gereksiz veri ifşası).
- **Öneri:** Ya bayi tarafında "Personel performansı" (ortalama puan, yorum sayısı, trend) kartını yazın ya da alanı kaldırın. Public API'de yalnızca `firstName` + avatar döndürün; personelin public listede görünme rızası için `DealerStaff.showOnFeedback` bayrağı ekleyin.

### 11. Başarı ekranı tekrarlı metin, geçersiz DOM ve i18n kaçakları
- **Önem:** orta · **Kategori:** UX / i18n / kod kalitesi · **Efor:** S
- **Kanıt:** `page.tsx:241` ve `243` aynı `successMsg`; `155` aynı metni toast'la tekrar; `242-265` `<p>` içinde `<div>`; sabit TR: `86-88, 95, 108, 130, 155, 157, 168, 174, 247, 249-250, 259-260, 383, 416-424`; `329` `aria-label` İngilizce; `messages/*.json` `selectRatingError`, `pointsEarned` tanımlı ama kullanılmıyor.
- **Sorun:** EN seçen turist yarı Türkçe bir deneyim yaşıyor; başarı anı "teşekkürler" cümlesini üç kez söyleyip asıl ödül bilgisini geri plana itiyor.
- **Öneri:** Tüm metinleri `publicFeedback.*` altına taşıyın, `useAppT` (global provider) kullanın; başarı ekranı: başlık "Teşekkürler, {işletme}!" + alt metin "Yorumun işletmeye ulaştı" + ödül kartı; toast'ı kaldırın (tam ekran onay zaten var).

### 12. Yerel locale state global provider'ı kopyalıyor
- **Önem:** orta · **Kategori:** mimari · **Efor:** S
- **Kanıt:** `page.tsx:55-77` vs `lib/app-locale.tsx:19-40` (`components/providers.tsx:221` tüm uygulamayı sarıyor); header `useAppT` kullanıyor (`components/layout/header.tsx:23, 34`).
- **Sorun:** Sayfadaki TR/EN düğmesi yalnız formu çeviriyor, header/footer eski dilde kalıyor, `<html lang>` güncellenmiyor; öncelik kuralları iki yerde farklı.
- **Öneri:** Yerel state'i silin, `useAppLocale()`'nin `setLocale`'ini kullanın; dil düğmesini paylaşılan bir `LocaleToggle` bileşenine çıkarın.

### 13. Erişilebilirlik: semantik kontroller ve klavye erişimi eksik
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** M
- **Kanıt:** yıldızlar `page.tsx:319-340` `role="radiogroup"/aria-checked` yok; NPS `395-407` `aria-pressed` yok, 36 px hedef; çipler `426-437` durum yok; fotoğraf girişi `495-501` `className="hidden"` (= `display:none`) olduğu için odaklanamıyor, `<label>` klavyeyle tetiklenemez; kaldır düğmesi `482-488` `aria-label` yok; `Label` (`317, 393, 413, 466`) bir kontrole bağlı değil; yükleniyor/hata için `aria-live` yok.
- **Öneri:** Yıldız ve NPS'i `RadioGroup` (shadcn/Radix) ile yeniden kurun (ok tuşlarıyla gezinme ücretsiz gelir), `fieldset/legend` kullanın; dosya girişini `sr-only` yapıp `<label>`'ı `tabIndex=0` + Enter/Space ile tetikleyin veya görünür bir `Button` kullanın; hedefleri 44 px'e çıkarın.

### 14. Mobil: NPS satırı kırılıyor, kabuk ağır
- **Önem:** orta · **Kategori:** mobil / performans · **Efor:** M
- **Kanıt:** `page.tsx:394-407` 11×`w-9` + `gap-1` ≈ 436 px, 375 px ekranda kart içi alan ≈ 295 px → 8+3 kırılım; `app/(public)/layout.tsx:18-29` pazarlama header'ı, footer, `LandingBackground` (kendi fetch'i + animasyon); sayfa tamamen istemci tarafında (`page.tsx:1, 80-104`) → HTML → JS → fetch → render şelalesi; `i18n/request.ts:7-8` iki ~200 KB sözlüğü istemci paketine statik olarak alıyor (global, ama bu sayfanın ilk yükünü de etkiliyor).
- **Öneri:** NPS'i 0-10 tek satırlık segmentli kaydırıcı ya da 2 satırlı ızgara (0-5 / 6-10) ile uç etiketleriyle sunun; `/feedback` için odaklı bir kabuk (`app/(public)/feedback/layout.tsx`): yalnız işletme logosu + dil + kapat, footer yok, animasyonlu arka plan yok. QR verisini sunucuda çekip ilk HTML'de render edin (`generateMetadata` ile işletme adını başlığa koyun, `robots: noindex`). Mesaj sözlüklerini sayfa başına ad alanlarına bölmek uzun vadeli ama ayrı bir iş.

### 15. Hata yönetimi kırılgan, idempotency kullanılmıyor
- **Önem:** orta · **Kategori:** dayanıklılık · **Efor:** S
- **Kanıt:** `page.tsx:128-131` JSON olmayan hata gövdesinde `response.json()` fırlatır; `84-90` sunucunun ayrıntılı mesajını atar; `117` `Idempotency-Key` başlığı yok (`lib/idempotency.ts:32-33` başlık yoksa korumasız).
- **Öneri:** Form açılışında `crypto.randomUUID()` ile tek bir idempotency anahtarı üretip POST'a ekleyin; hata gövdesini `res.headers.get('content-type')` ile güvenle okuyun, 413/429/5xx için ayrı, eyleme dönük mesajlar (ör. "Fotoğraflar çok büyük — kaldırıp tekrar dene", "1 dakika sonra tekrar dene" + geri sayım) verin; form state'i hata sonrası korunsun (şu an korunuyor, iyi).

### 16. Konfeti ve zıplama animasyonu azaltılmış hareketi yok sayıyor
- **Önem:** düşük · **Kategori:** erişilebilirlik / motion · **Efor:** S
- **Kanıt:** `lib/effects/confetti.ts:20-81` `disableForReducedMotion` yok; `page.tsx:259` `animate-bounce` (Tailwind, `MotionConfig` kapsamı dışı).
- **Öneri:** Konfeti çağrılarına `disableForReducedMotion: true` ekleyin; `motion-safe:animate-bounce` kullanın.

### 17. SEO/gizlilik: geri bildirim sayfaları indekslenebilir
- **Önem:** düşük · **Kategori:** SEO / gizlilik · **Efor:** S
- **Kanıt:** klasörde `layout.tsx`/`metadata` yok; `app/robots.ts:20` varsayılan yasak listesinde `/feedback/` yok.
- **Öneri:** `generateMetadata` ile `robots: { index: false }` ve işletme adlı başlık; robots varsayılanlarına `/feedback/` ekleyin.

### 18. Küçük kod kalitesi kalemleri
- **Önem:** düşük · **Kategori:** kod kalitesi · **Efor:** S
- **Kanıt:** `page.tsx:35` `router` kullanılmıyor; `59` `(session?.user as any)`; `94, 156` kullanılmayan `err`; `471` `key={img}` (aynı dosya iki kez seçilirse çakışma); `65, 75` `localStorage` try/catch'siz (gizli mod); `267` `session` yüklenirken (`status==='loading'`) giriş bandı kısa süre görünüyor; `370-373` `cn` yerine şablon string.
- **Öneri:** Form `FeedbackForm`'a taşınırken temizlenmeli; görsellere `crypto.randomUUID()` id verin.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Adım adım, tek-elle akış (Duolingo/Monzo):** 1) yıldız → 2) puana göre bağlamsal çipler → 3) opsiyonel yorum/fotoğraf → 4) ödül anı. Şu an tüm alanlar tek kartta, ilk ekranda karar yükü yüksek.
2. **Gönderim öncesi ödül önizlemesi (Starbucks Rewards):** "Bu yorum sana ~50 puan, detaylı yazarsan 100 puan" — giriş yapmış kullanıcının gerçek çarpanları ve kalan günlük tavanıyla; anonim için "üye olsaydın X kazanırdın".
3. **Anonim yorumu sonradan talep etme (claim) + tek dokunuşla kayıt (magic link/Google):** dönüşüm anını yakalayan en değerli eksik (Bulgu 7).
4. **Düşük puanda hizmet kurtarma:** 1-2 yıldızda "İşletme seninle iletişime geçsin mi?" (iletişim izni + kanal), anında telafi teklifi önizlemesi (mevcut remedy motoru zaten var); 4-5 yıldızda "Deneyimini paylaş" (Wrapped tarzı paylaşılabilir kart → mevcut `experience-share` altyapısına bağlanabilir).
5. **İlerleme ve süreklilik geri bildirimi:** başarı ekranında seviye ilerleme çubuğu, seri (streak) sayacı, aktif görev/turnuva katkısı, klan katkısı (`squadContribution` zaten dönüyor), "sıradaki ödüle X puan".
6. **İşletme markalı deneyim + bayinin özelleştirebildiği soru seti:** logo/renk, bayiye özel çipler ve opsiyonel tek özel soru (segmentConfig'in genişletilmiş hali), "bayi yanıtladığında bildirim al" onayı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Masada telefonu çıkaran müşteri 3 saniyede işletmenin logosunu ve tek büyük soruyu görür; 15-20 saniyede biter; sonunda ne kazandığını ve neden buraya tekrar geleceğini hisseder. Bayi her yorumu — anonim olsun olmasın — dakikalar içinde AI etiketli olarak görür.

**Yerleşim (mobil öncelikli, odaklı kabuk):**
- `app/(public)/feedback/[code]/layout.tsx`: pazarlama header/footer yerine ince üst çubuk (işletme logosu + adı, dil düğmesi, ilerleme noktaları); `env(safe-area-inset-*)` uyumlu yapışkan alt CTA.
- **Adım 1 — Puan:** Büyük yıldızlar (56-64 px hedef), seçimde hafif yay animasyonu ve puana göre değişen tek satırlık duygusal geri bildirim. Seçim yapılınca otomatik olarak 2. adıma kayar.
- **Adım 2 — Bağlam:** Puana göre filtrelenmiş çipler (çoklu seçim, toggle), opsiyonel personel avatar şeridi, NPS'in kompakt segmentli hali (yalnız oturumlu/ikinci ziyaretçilere ya da bayi açtıysa).
- **Adım 3 — Detay (opsiyonel, atlanabilir):** Yorum alanı + canlı "detaylı yorum bonusu" ilerleme çubuğu (sunucu eşiğinden gelen değerle), R2'ye doğrudan sıkıştırılmış fotoğraf yükleme, yükleme ilerlemesi.
- **Adım 4 — Ödül anı:** Oturumlu: sayaç animasyonuyla puan dökümü → seviye çubuğu dolumu → seviye atladıysa tam ekran kutlama; sonraki aksiyon kartları (çark/sürpriz kutu/görev). Anonim: "X puan seni bekliyor" + claim token ile tek dokunuş kayıt. Düşük puan: kurtarma kartı.

**Motion/3D (yerinde ve ölçülü):** framer-motion yalnızca adım geçişlerinde (yatay kaydırma, 200-250 ms), yıldız seçiminde ve sayaçta. Konfeti yalnızca seviye atlamada ve `disableForReducedMotion` ile; three.js bu akışa **eklenmemeli** (QR anında hücresel ağda yük bütçesi kritik). Mevcut imza sürpriz kutusu 3B sahnesi varsa yalnızca ödül adımında, `dynamic(ssr:false)` ve "kutuyu aç" dokunuşundan sonra yüklenmeli.

**Veri/API değişiklikleri:**
- Sunucu `page` + istemci `FeedbackForm` ayrımı; QR verisi sunucuda (`unstable_cache`/Redis kısa TTL, yalnızca okuma alanları), `generateMetadata` (noindex + işletme adı).
- `qr_scanned` olayını yan etkisiz GET'ten ayırıp `POST /api/qr-codes/public/[code]/scan` (tekilleştirilmiş, `scanSessionId` çerezi) olarak işlemek.
- `POST /api/feedbacks`: oturumdan bağımsız yan etkiler fonksiyonu (Bulgu 1), `dealerStaffId` doğrulaması (Bulgu 4), çıkar çatışması kontrolü (Bulgu 5), `quickTags` alanı (Bulgu 6), `claimToken` (Bulgu 7), attribution alanları (Bulgu 8), kredilenen değer + `breakdown` (Bulgu 9), zorunlu `Idempotency-Key`.
- `GET /api/feedbacks/reward-preview?qrCodeId=` (oturumlu: çarpanlar + kalan tavan; anonim: taban değerler) — ödül önizlemesi için.
- `POST /api/public/feedback-media/presign` + `feedbackSchema.media` yalnız R2 URL'leri.
- Prisma: `Feedback.quickTags Json?`, `Feedback.claimTokenHash String? @unique`, `Feedback.claimedAt DateTime?`, `DealerStaff.showOnFeedback Boolean @default(true)` (şema değişiklikleri canlı Neon'a dikkatle, migration ile).

---

## Çakışmalar / birleştirme önerisi

- **`/customer/scan` (app/customer/scan/page.tsx):** Kendi başına çakışmıyor — tarayıcı/kod girişi yapıp bu sayfaya yönlendiriyor; ancak doğrulama için aynı yan etkili GET'i çağırıp çift `qr_scanned` üretiyor (Bulgu 8). Doğrulamayı yan etkisiz hale getirin veya scan sayfası doğrudan `/feedback/{code}`'a yönlendirip hatayı bu sayfa göstersin.
- **Tüketim yorumu (ConsumptionReview, `app/api/customer/reviews`, `app/customer/feedbacks/page.tsx:113-114`):** Ürün açısından iki paralel "yorum" sistemi var: QR geri bildirimi (bu sayfa) ve tüketim yorumu. Karakter rozeti yalnızca tüketim yorumunu sayıyor (feedbacks/route.ts:529-530), ödül matrisleri ayrı ama aynı değerlerde (`points-rules.ts:53-62`). Müşteri için fark görünmez ve kafa karıştırıcı. Öneri: sayfa birleştirilmemeli (giriş noktaları farklı: QR vs harcama), ancak **tek bir paylaşılan form bileşeni** (`components/feedback/FeedbackFlow`) ve tek bir sunucu tarafı "yorum oluşturuldu" yan etki hattı kullanılmalı; müşterinin "Geri bildirimlerim" ekranı iki türü tek zaman çizelgesinde göstermeli.
- **`/experience/[token]`:** Çakışma yok (paylaşılan deneyim kartı görüntüleme); 4-5 yıldız sonrası "paylaş" adımı bu altyapıya bağlanabilir.

---

## Doğrulama (şüpheci inceleme)

Yöntem: Her iddia çağıran ve çağrılan tarafıyla birlikte kod okunarak çürütülmeye çalışıldı (`app/api/feedbacks/route.ts`, `lib/validations.ts`, `node_modules/zod` 3.25.76 kaynağı, `prisma/schema.prisma`, `app/api/cron/ai-retry` + `daily`, `lib/inngest/feedback-analyze-pipeline.ts`, `lib/trust-score.ts`, `lib/points-caps.ts`, `lib/rate-limit.ts`, `app/api/qr-codes/public/[code]/route.ts`, `vercel.json`). Hiçbir komut, betik, test veya DB sorgusu çalıştırılmadı.

### 1. Anonim geri bildirimde yan etkilerin çalışmaması — **DOĞRULANDI**
- `route.ts:283` `if (session?.user?.id) {` bloğu `:545`'te kapanıyor; `feedback_submitted` analytics (`:391`), webhook (`:402`), ısı haritası (`:416`), cache invalidation (`:422-429`), inline/Inngest AI analizi (`:432-521`) ve `processAutoReplies` (`:523`, `:526`) tamamen bu bloğun içinde. Anonim dal `:547-554` yalnız kaydı döndürüyor. Yorum satırları (`:400-401` "önceden webhook'lar hiç fire etmiyordu") bu yan etkilerin her gönderim için tasarlandığını gösteriyor; puan bloğuyla aynı `if`'e düşmeleri yapısal bir hata.
- Telafi: `ai-retry` (`app/api/cron/ai-retry/route.ts:36-46`) anonim kayıtları da topluyor ve pipeline (`feedback-analyze-pipeline.ts:118-136`) telafi taslağı + otomatik yanıtı çalıştırıyor. Ancak cron yalnız `app/api/cron/daily/route.ts:58` üzerinden günde 1 kez (`vercel.json` `0 3 * * *`, commit 953c8fe) ve koşu başına en fazla 15 kayıt / 18 sn bütçeyle koşuyor. `orderBy: createdAt desc` olduğundan ve 5 karakterden kısa metinli ya da `local-fallback` kalan kayıtlar `aiProcessedAt` NULL kaldığı için kuyruk her gün aynı slotları tüketebilir. Webhook, ısı haritası, `feedback_submitted` analytics ve dashboard/leaderboard cache invalidation için hiçbir telafi yolu yok.
- Yeniden üretim: Oturumsuz tarayıcıda bir QR'a "Garson çok kaba davrandı" metniyle 1 yıldız gönder. Bayi `feedback.created` webhook'u almaz, `HeatmapData` artmaz, `AnalyticsEvent(feedback_submitted)` yazılmaz; AI analizi, otomatik yanıt ve telafi taslağı ertesi gün 03:00 UTC'ye kadar (kuyruk doluysa daha geç) oluşmaz.
- Not: "çoğunluğu anonim" oranı canlı veriden doğrulanmadı; hata oran ne olursa olsun geçerli.

### 2. Fotoğrafların base64 olarak JSON gövdesinde gönderilip Postgres'e yazılması — **DOĞRULANDI**
- `page.tsx:172-183` `readAsDataURL` ile 5 MB/dosya ve 5 dosyaya kadar data URL üretiyor. `:122` bunları JSON gövdesine koyuyor. `lib/validations.ts:103` `z.string().url()`; zod 3.25.76 bu kontrolü yalnız `new URL(input)` ile yapıyor (`node_modules/zod/v3/types.js:631-643`), `data:image/jpeg;base64,...` geçerli. `route.ts:249` diziyi doğrudan `Feedback.media Json?` alanına (`schema.prisma:773`) yazıyor.
- Okuma tarafı: `GET /api/feedbacks` listesi (`route.ts:68`, `:125`) `media`'yı seçiyor ve `app/dealer/feedbacks/page.tsx:324` ile `app/customer/feedbacks/page.tsx:113` bu ucu çağırıyor (pageSize 50). Ek olarak `lib/surprise-badges.ts:146` her oturumlu gönderimde kullanıcının TÜM feedback'lerinin `media`'sını çekiyor (yalnız fotoğraf sayısı için). `media` alanını görüntüleyen bir UI bulunamadı (grep: yalnız bu iki okuma).
- Gövde sınırı: Proje Vercel'de (`vercel.json`), fonksiyon istek gövdesi platform sınırı 4,5 MB. Base64 ~%33 büyüttüğünden ~3,4 MB üstü toplam fotoğraf 413 döner. Bu durumda `page.tsx:129` `response.json()` JSON olmayan gövdede hata fırlatır ve `:156` catch'ine düşer: sayfa çökmez ama kullanıcı nedeni belirtilmeyen "Bir hata oluştu" görür. Canlıda denenmedi.
- Yeniden üretim: Telefonla çekilmiş 2 adet ~2,5 MB JPEG ekleyip gönder → ~6,7 MB gövde → 413 → genel hata tostu. Tek ~3 MB fotoğraf ise başarılı olur ve satıra ~4 MB base64 yazılır; bayi listesi her açılışta bunu indirir.
- Ek gözlem: `z.string().url()` `"data:,x"` gibi boş içerikleri de kabul ediyor, dolayısıyla fotoğraf tabanlı sürpriz rozet koşulu (`surprise-badges.ts:153-156`) gerçek fotoğraf olmadan sağlanabilir.

### 3. `dealerStaffId` sahiplik doğrulamasının olmaması (IDOR) — **ÇÜRÜTÜLDÜ (KRİTİK/YÜKSEK olarak)**
- Doğrulama eksikliği gerçek: `validations.ts:115` serbest string, `route.ts:256` kontrolsüz yazıyor, QR'ın `dealerId`'si ile `DealerStaff.dealerId` / `isActive` karşılaştırılmıyor. Başka işletmenin personel id'leri `GET /api/qr-codes/public/[code]` (`route.ts:60-66`) üzerinden herkese açık.
- Ancak somut bir etki kurulamadı: `Feedback.dealerStaffId` / `Feedback.staff` / `DealerStaff.feedbacks` alanını okuyan hiçbir sorgu, metrik, panel veya API yok (repo genelinde grep: yalnız yazma noktası ve formdaki gönderim). "Personelin kişisel metriğini şişirme" senaryosunun bugün karşılığı yok. Geçersiz id'de dönen FK hatası (`P2003`) `responseIfDatabaseUnavailable` tarafından eşlenmediği için 500 dönüyor, fakat bu yalnız isteği gönderenin kendi isteğini etkiliyor. Meşru kullanıcı için tek uç durum, form açıkken personel kaydının silinmesi; o durumda da kayıt reddediliyor, veri bozulmuyor.
- Karar: Bugün kullanıcıya ya da veriye zarar veren bir senaryo yok; DÜŞÜK seviyeli bir sağlamlaştırma maddesi. Personel performans ekranı yazılmadan önce, `dealerStaffId`'nin `{ id, dealerId: qrCode.dealerId, isActive: true }` ile doğrulanması ve aksi durumda 400 dönmesi şart olmalı.

### 4. İşletme sahibi veya personelin kendi QR'ına yorum yazıp puan kazanması — **DOĞRULANDI (önem: ORTA; iddianın bir kısmı yanlış)**
- `route.ts:186-359` aralığında rol kontrolü ve "gönderen bu işletmenin sahibi ya da personeli mi" kontrolü yok; `creditPointsAndXp` her rolü kredilendiriyor. Kazanılan puan harcanabilir: `app/api/customer/redeem-coupon/route.ts:28-32` yalnız oturum istiyor, rol kısıtı yok.
- Trust skoru (`lib/trust-score.ts:81-117`) olumlu sahte yorumu işaretlemiyor. Tek nötr sinyal aynı işletmeye 24 saatte 3'ten fazla yorum (`:86`); günde ≤3 yorum hiç işaretlenmiyor.
- Yeniden üretim: STAFF ya da DEALER hesabıyla oturum açıkken kendi işletmenin `/feedback/{code}` sayfasına girip 5 yıldız ve uzun bir metinle gönder → `trustFlagged=false`, işletme puan ortalaması yükselir, hesaba `matrix.feedback.detailed` puanı (günlük 500 / haftalık 2000 tavan dahilinde) yazılır, bu puan kupona çevrilebilir.
- Düzeltmeler: (a) "Personel kişisel metriği şişer" kısmı yanlış, çünkü `dealerStaffId`'yi okuyan bir metrik yok (bkz. 3). (b) Sorun owner/staff'a özgü değil, dolayısıyla KRİTİK sayılmaz. Puan tavanları tüm kullanıcılara aynı uygulanıyor ve ayrı bir CUSTOMER hesabı açmak aynı sonucu verir. Puanlama şişirme ise anonim dalda trust değerlendirmesi hiç yapılmadan (`route.ts:269` yalnız oturumlu) IP başına 5/dk sınırıyla zaten mümkün. Yine de çıkar çatışması kontrolü ucuz ve açık bir sinyal. Önerilen yaklaşım: gönderen `qrCode.dealerId` ise ya da bu bayinin aktif `DealerStaff` kaydı varsa, yorum kabul edilip `trustFlagged=true` ve `trustReason='çıkar çatışması'` ile işaretlenmeli, puan/XP verilmemeli, işletme ortalamasına ve leaderboard'a dahil edilmemeli. Ayrıca anonim gönderimler için ayrı bir cihaz/IP tabanlı hafif güven değerlendirmesi düşünülmeli.
