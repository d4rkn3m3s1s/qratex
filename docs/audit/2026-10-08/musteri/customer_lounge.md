# /customer/lounge

**Amaç:** Müşteriye "sessiz lüks" bir alan sunmak: VIP sadakat katmanını, katman ayrıcalıklarını ve doğum günü bonusunu (yılda bir kez talep) tek ekranda göstermek.
**Genel puan:** 3.5 / 10
**Karar:** **birleştir.** Sayfa menüde yok, yani yetim kalmış bir rota. VIP verisi pratikte hiç üretilmiyor, ayrıcalıkların yarısı sahte. Doğum günü akışı ise zaten Ayarlar ve global popup'ta var. Bu yüzden içerik, tek bir "Statü / Üyelik" merkezine (progress-hub ya da my-card altında) taşınmalı.

İncelenen dosyalar:
- `app/customer/lounge/page.tsx` (244 satır) ve `app/customer/lounge/layout.tsx`
- `app/customer/layout.tsx`
- `app/api/customer/lounge/route.ts`, `app/api/birthday/route.ts` ve `app/api/vip/route.ts`
- `lib/module-gate.ts`, `lib/module-controls.ts`, `lib/vip-multiplier.ts` ve `lib/points-rules.ts`
- `components/customer/customer-birthday-bonus-host.tsx`
- `app/customer/settings/page.tsx` (doğum günü bölümü)
- `prisma/schema.prisma` içindeki `VIPTier`, `UserVIPStatus` ve `UserBirthday` modelleri
- `prisma/seed.ts` (VIP katmanları)
- `messages/tr.json` ve `messages/en.json` (`customerLounge`)

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Doğum günü talebi çalışıyor. VIP kartının dayandığı `UserVIPStatus` kaydını ise hiçbir UI yolu yazmıyor, harcama alanı hep 0 ve 5 ayrıcalıktan 2'si gerçek değil. |
| UX | 3/10 | Menüden ulaşılamıyor. Ayarlarda düzenlenemeyen tarih için "ayarlarda düzenle" diyor ve gerçekleşmeyecek bir "otomatik yükselirsiniz" vaadi veriyor. İlerleme ve hedef duygusu yok. |
| Görsel | 4/10 | Düz shadcn kartları, başka hiçbir sayfayla ortak olmayan özel bir hero ve tek bir spinner'dan ibaret. "Lounge" adının vaat ettiği premium his hiç yok. Katmanın `color` ve `icon` alanları da kullanılmıyor. |
| Mimari | 3/10 | Modül kapısı fiilen hiçbir şeyi engellemiyor. VIP atama mantığı yan etkili bir GET'e gömülü ve o GET hiç çağrılmıyor. Ayrıcalıklar API'de sabit kodlu TR metin. VIP ile Lig adında iki paralel katman sistemi var. |
| Performans | 7/10 | Tek hafif sorgu ve paralel `getPointsMatrix` var, ciddi bir sorun yok. Eksikler: cache, skeleton ya da SWR kullanılmıyor. |
| Erişilebilirlik + mobil | 5/10 | Mobil yerleşim düzgün (`max-w-lg`, `min-h-10`, `touch-manipulation`). Spinner'da `role="status"` yok, hata kartında yeniden dene yok, dekoratif ikonlar `aria-hidden` değil (lucide 0.303 bunu varsayılan yapmıyor). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota metadata (başlık ve açıklama) | KISMİ | `app/customer/lounge/layout.tsx:4-6`, `messages/tr.json:101-102` | Açıklama "Sezonluk avantajlar … sınırlı süreli düşüşler" diyor. Sayfada sezonluk avantaj da drop da yok. |
| 2 | Menüden giriş noktası | EKSİK | `components/dashboard/sidebar.tsx` ve `lib/visibility-controls.ts` içinde `lounge` geçmiyor; `REDESIGN.md:89` | Rota yetim kalmış. Yalnızca URL elle yazılarak açılıyor. Uygulama içinde `/customer/lounge`'a giden tek bir link yok (grep ile doğrulandı). |
| 3 | "Panele dön" geri butonu | ÇALIŞIYOR | `page.tsx:92-97` | Mobilde tam genişlik. |
| 4 | Hero başlık kartı | ÇALIŞIYOR | `page.tsx:99-105` | 17 müşteri sayfası `DashboardPageHero` kullanıyor, bu sayfa kullanmıyor (tutarsız). |
| 5 | Yükleniyor durumu | KISMİ | `page.tsx:107-111` | Yalnızca spinner var. Skeleton, `role="status"` ve `aria-live` yok. |
| 6 | Hata durumu | KISMİ | `page.tsx:112-116` | Yeniden dene butonu yok. Sunucunun TR mesajı EN kullanıcıya da çiğ haliyle gösteriliyor. JSON olmayan bir 502'de "Unexpected token <" görünür (`page.tsx:48-50`). |
| 7 | `vip_lounge` modül kapısı | BOZUK | `app/api/customer/lounge/route.ts:16`, `lib/module-controls.ts:17-68`, `lib/module-controls.ts:77-87` | `vip_lounge`, `MODULE_CATALOG` içinde yok. `normalizeModuleControls` yalnızca katalog anahtarlarını taşıdığı için `controls['vip_lounge']` her zaman `undefined` kalıyor ve kapı hiçbir zaman kapanmıyor. Admin modülü kapatamaz. `admin/modules/overview/route.ts:71` içindeki endpoint bağlaması da boşa düşüyor. |
| 8 | API kimlik ve rol kontrolü | ÇALIŞIYOR | `lounge/route.ts:18-20` | `requireAuth(['CUSTOMER','ADMIN'])` ve token-replay kontrolü var. Kullanıcı ID'si oturumdan geliyor, IDOR yok. |
| 9 | VIP katman adı | BOZUK | `page.tsx:127-131`; `UserVIPStatus` yalnızca `app/api/vip/route.ts:45` içinde yazılıyor | `/api/vip`'i çağıran hiçbir istemci kodu yok (`app`, `components`, `lib`, `hooks` taraması boş). Bu yüzden seed dışındaki gerçek kullanıcılarda `vip` neredeyse her zaman `null` olur ve kart "VIP yok" der. |
| 10 | "Ömür boyu puan" | BOZUK | `page.tsx:131-132`, `vip/route.ts:49,55` | Değer, yükseltme anındaki *harcanabilir* `user.points` görüntüsü. Ne ömür boyu toplam ne de güncel. |
| 11 | "Harcama" (₺) | SAHTE | `page.tsx:132-133`; şemada `totalSpent Float @default(0)` (`schema.prisma` içindeki `UserVIPStatus`) | `UserVIPStatus.totalSpent`'e yazan tek bir kod yolu yok, değer hep "0 ₺". Gerçek harcama `customer/analytics` içinde `consumption` toplamından hesaplanıyor. |
| 12 | "Katman yenileme" rozeti (`tierExpiry`) | KISMİ | `page.tsx:134-138` | `tierExpiry`'ye yazan bir yol yok, pratikte hiç görünmez. Ölü dal. |
| 13 | "VIP yok" mesajı | SAHTE | `page.tsx:141-143`, `messages/tr.json` içinde `customerLounge.noVip` | "Puan ve etkileşimle otomatik yükselirsiniz" vaadi gerçekleşmiyor (bkz. #9). |
| 14 | Genel puan ve seviye satırı | ÇALIŞIYOR | `page.tsx:146-148`, `lounge/route.ts:110-111` | |
| 15 | Bir sonraki katmana ilerleme | EKSİK | `vip/route.ts:73-85` içinde `progressToNext` hesaplanıyor ama kullanılmıyor | Starbucks/Duolingo tarzı "X puan kaldı" çubuğu yok. |
| 16 | Katmanın gerçek avantajları (`VIPTier.benefits`, `multiplier`, `color`, `icon`) | EKSİK | `schema.prisma` içindeki `VIPTier`, `prisma/seed.ts:1322-1377` | DB'de katman başına avantaj listesi ve çarpan var. Lounge bunları göstermek yerine sabit kodlu metin basıyor. |
| 17 | Ayrıcalık: "Öncelikli kampanya bildirimleri" | KISMİ | `lounge/route.ts:77`, `dealer/campaigns/[id]/send/route.ts:48-53` | Yalnızca bayi kampanyalarında bir `vip` segmenti var, ortada bir "öncelik" yok. Üstelik VIP olmayan herkese de listeleniyor. |
| 18 | Ayrıcalık: "Doğum günü bonusu" | ÇALIŞIYOR | `lounge/route.ts:78`, `birthday/route.ts:151-245` | |
| 19 | Ayrıcalık: "Lounge içi mini görev önerileri" | SAHTE | `lounge/route.ts:79` | Lounge'da görev önerisi bileşeni ya da verisi yok. |
| 20 | Ayrıcalık: "Ek puan çarpanı (kampanya dönemlerinde)" | KISMİ | `lounge/route.ts:82`, `app/api/feedbacks/route.ts:314`, `lib/vip-multiplier.ts` | Çarpan, geri bildirim ödülünde *her zaman* uygulanıyor. "Kampanya dönemlerinde" ifadesi yanlış, oran da gösterilmiyor. |
| 21 | Ayrıcalık: "Bağış eşleştirmelerinde öncelikli rozet" | SAHTE | `lounge/route.ts:83` | Bağış kodunda VIP referansı yok (`app/api/customer/donations` taraması boş). |
| 22 | Doğum tarihi gösterimi | KISMİ | `page.tsx:181-189`, `lounge/route.ts:100` | `YYYY-MM-DD` UTC gece yarısı olarak parse ediliyor. Negatif UTC ofsetli tarayıcıda (ör. ABD) bir gün önce görünür. |
| 23 | "Sonraki kutlama … gün sonra" sayacı | KISMİ | `page.tsx:190-194`, `lounge/route.ts:61-64` | Sunucu saatiyle (Vercel UTC) hesaplanıyor. 29 Şubat doğumlularda artık olmayan yıllarda tarih 1 Mart'a kayıyor. |
| 24 | "Bugün doğum günün" | KISMİ | `page.tsx:195-197`, `lounge/route.ts:66-68`, `birthday/route.ts:168-170` | UTC'ye göre hesaplanıyor. TR'de (UTC+3) doğum gününün ilk 3 saatinde görünmez, ertesi günün ilk 3 saatinde hâlâ görünür. 29 Şubat doğumlular 4 yılın 3'ünde hiç talep edemez. |
| 25 | Bonus miktarı ipucu | ÇALIŞIYOR | `page.tsx:198-200`, `lib/points-rules.ts:288` | Puan matrisinden geliyor (varsayılan 500). |
| 26 | "Doğum günü bonusunu talep et" | KISMİ | `page.tsx:71-89`, `page.tsx:201-210` | Sunucu tarafı atomik ve iyi (bkz. #32). Ancak talep başarılı olup `reloadLounge` patlarsa kullanıcı hata toast'ı görür (`page.tsx:80-83`). API hataları İngilizce. Kutlama anı yok, başlıktaki puan güncellenmiyor (global puan yenileme mekanizması bulunamadı). |
| 27 | "Bu yıl alındı" rozeti | ÇALIŞIYOR | `page.tsx:211-215` | |
| 28 | "Doğum tarihini ayarlarda düzenle" CTA | BOZUK | `page.tsx:216-218`, `birthday/route.ts:121-141` | API tarih ilk kez kaydedildikten sonra değişikliği `409 BIRTHDAY_LOCKED` ile reddediyor. CTA imkânsız bir eylem vaat ediyor. Ayarlar sayfasında da input kilitli görünmüyor (`settings/page.tsx:706-718`). |
| 29 | Doğum tarihi yoksa "Profil ayarlarına git" | ÇALIŞIYOR | `page.tsx:220-229` | Doğum günü kartına derin link yok, yalnızca varsayılan `profile` sekmesine iniyor (`settings/page.tsx:515`). |
| 30 | "Sürpriz kutular" linki | ÇALIŞIYOR | `page.tsx:233-238` | Bağlamsız tek bir buton. `gap-2` ile `mr-2` birlikte kullanıldığı için ikon boşluğu çift. |
| 31 | Global doğum günü popup'ıyla senkron | KISMİ | `app/customer/layout.tsx:48`, `customer-birthday-bonus-host.tsx:59-77` | Popup'tan talep edilince lounge state'i yenilenmiyor. Talep butonu görünmeye devam ediyor, basılınca "Already claimed this year" (İngilizce) hatası çıkıyor. |
| 32 | Talep backend güvenliği | KISMİ | `birthday/route.ts:101`, `birthday/route.ts:113-150`, `birthday/route.ts:186-229` | Artısı: tx içinde `updateMany` ile yarış koşuluna karşı korunuyor ve `points_credited` yazılıyor. Eksisi: `requireAuth` yerine çıplak `getServerSession` kullanılıyor (rol ve token-replay kontrolü yok). Tarih bugüne ayarlanıp aynı gün 500 puan alınabiliyor. |
| 33 | i18n (TR/EN) | KISMİ | `lounge/route.ts:50,77-83,123`; `birthday/route.ts:162,173,182,234` | Ayrıcalıklar ve lounge hataları yalnızca TR, birthday hataları yalnızca EN. Her iki dildeki kullanıcı da karışık dil görüyor. `customerLounge.bonusUsed` anahtarı kullanılmıyor (ölü). |
| 34 | Erişilebilirlik | KISMİ | `page.tsx:94,100,108,122,174,236` | Dekoratif ikonlarda `aria-hidden` yok (yalnızca `page.tsx:156`'da var). Spinner'ın erişilebilir adı yok. Hata ve yükleniyor durumları duyurulmuyor. |
| 35 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:91`, butonlar `min-h-10 touch-manipulation` | Tek sütun, `max-w-lg`, safe-area layout'tan geliyor (`app/customer/layout.tsx:34-40`). |
| 36 | Hareket ve azaltılmış hareket | ÇALIŞIYOR (nötr) | `page.tsx:108` | Yalnızca `animate-spin` var. Abartı yok, ama ödül anında hiç mikro etkileşim de yok. |

**Toplam 36 özellik:** ÇALIŞIYOR 11 · KISMİ 14 · BOZUK 4 · SAHTE 4 · EKSİK 3

---

## Bulgular

### 1. VIP kartı gerçek kullanıcılarda hiç dolmuyor: atama yolu ölü
- **Önem:** yüksek
- **Kategori:** veri bütünlüğü / işlevsellik
- **Kanıt:**
  - `UserVIPStatus`'a yazan tek yer `app/api/vip/route.ts:45` (upsert).
  - `api/vip`'i çağıran hiçbir istemci kodu yok (`app/`, `components/`, `lib/`, `hooks/` grep'i boş).
  - Lounge yalnızca okuyor (`app/api/customer/lounge/route.ts:31-38`).
  - `app/api/customer/analytics/route.ts:326-334` ise kayıt yoksa sessizce `'Bronze'` döndürüyor.
- **Sorun:** Seed dışındaki müşteriler Lounge'da "Henüz atanmış VIP katmanı yok … otomatik yükselirsiniz" görüyor, Analizler sayfasında ise aynı anda "Bronze" görüyor. İki sayfa aynı kullanıcı için çelişiyor. Bundan dolayı `lib/vip-multiplier.ts` çarpanı da (`feedbacks/route.ts:314`) pratikte hiçbir kullanıcıya uygulanmıyor: Silver 1.25x, Gold 1.5x tanımlı ama ölü. Ayrıca `/api/vip` bir GET içinde upsert ve bildirim oluşturuyor (yan etkili GET). `lifetimePoints` alanına da harcanabilir puanı yazıyor (`vip/route.ts:49,55`).
- **Profesyonel öneri:** Katman tespitini okuma yolundan çıkarıp **olay güdümlü** yap:
  - `lib/vip-tier.ts` içinde saf bir `resolveTier(lifetimeEarned, tiers)` ve tx-uyumlu bir `syncVipTier(tx, userId)` yaz.
  - `syncVipTier`'i `creditPointsAndXp` sonrasında (aynı tx'te) çağır. Böylece puan kazanılan her yol katmanı günceller ve harcama (ödül alma) katmanı düşürmez.
  - "Ömür boyu kazanılan" puan için `User` üzerinde ayrı bir `lifetimeEarnedPoints` sayacı tut (ya da `points_credited` event'lerinden türet).
  - `/api/vip` GET'ini salt okunur yap.
  - Analytics'teki `'Bronze'` sahte fallback'ini kaldır, tek kaynak `resolveTier` olsun.
  - Mevcut kullanıcılar için tek seferlik bir backfill script'i yaz. Bu, canlı DB'de çalışacağı için ayrıca onay gerektirir.
- **Efor:** L

### 2. Ayrıcalık listesi kısmen uydurma, sabit kodlu ve tek dilli
- **Önem:** yüksek
- **Kategori:** dürüstlük / ürün güveni / i18n
- **Kanıt:** `app/api/customer/lounge/route.ts:76-84`. "Lounge içi mini görev önerileri" ile "Bağış eşleştirmelerinde öncelikli rozet" ifadelerinin karşılığı yok. "Ek puan çarpanı (kampanya dönemlerinde)" gerçeği yanlış anlatıyor (`feedbacks/route.ts:314` çarpanı her zaman uyguluyor). Tüm metin TR ve locale'den bağımsız.
- **Sorun:** Kullanıcıya olmayan bir hak vaat etmek, sadakat programında en hızlı güven kaybettiren hatadır. EN kullanıcılar da TR metin görüyor. Ayrıca ilk 3 "ayrıcalık" VIP olmayanlara da gösterildiği için "ayrıcalık" kavramı anlamsızlaşıyor.
- **Profesyonel öneri:** Ayrıcalıkların tek doğruluk kaynağı `VIPTier.benefits` (JSON, zaten seed'de var) olsun. Her benefit `{ type, labelKey, params }` biçiminde tutulsun ve i18n anahtarıyla render edilsin. API, mevcut katman ile bir üst katmanın avantajlarını ayrı döndürsün; "kilidi açılacak" avantajlar soluk gösterilsin. Gerçek mekanizması olmayan maddeler hemen kaldırılsın. Çarpan oranı (`multiplier`) "Geri bildirim puanların ×1.25" gibi somut gösterilsin.
- **Efor:** M

### 3. Doğum günü talep yolu `requireAuth`'u atlıyor, "bugüne ayarla ve hemen al" mümkün
- **Önem:** yüksek
- **Kategori:** güvenlik / puan ekonomisi
- **Kanıt:**
  - `app/api/birthday/route.ts:101` çıplak `getServerSession` kullanıyor: rol kısıtı yok, `checkTokenReplay` yok (bkz. `lib/api-auth.ts:52-80`).
  - `set` (`:113-150`) tarihi kontrolsüz kabul ediyor.
  - `claim` (`:151-229`) kaydın yaşına bakmıyor.
- **Sorun:**
  - Yeni açılan her hesap, doğum gününü bugün olarak kaydedip aynı dakika 500 puan (varsayılan, `lib/points-rules.ts:67-68`) basabiliyor. Çoklu hesap çiftliği için bedava bir puan musluğu.
  - DEALER rolündeki hesaplar da bu yolla puan alabiliyor.
  - Token-replay korumasının bu puan basan uçta devre dışı kalması, `points-economy-invariants` ilkesiyle çelişiyor.
  - Olumlu taraf: atomik `updateMany` guard'ı ve `points_credited` kaydı doğru yazılmış (`:186-210`).
- **Profesyonel öneri:**
  - `requireAuth(['CUSTOMER'])` ile değiştir.
  - `claim`'de `UserBirthday.createdAt` için en az 30 gün kuralı koy ("doğum gününü en az 30 gün önce kaydetmiş olmalısın"), ya da kayıt anında ±N gün içindeki tarihleri bu yıl için bonussuz işaretle.
  - Uca hız limiti ekle.
  - Fraud panelinde `category: 'birthday'` ile hesap yaşı kesişimini izlenebilir yap.
- **Efor:** S

### 4. "Ayarlarda düzenle" CTA'sı imkânsız bir eylem vaat ediyor
- **Önem:** orta
- **Kategori:** UX / tutarlılık
- **Kanıt:** `page.tsx:216-218`. API değişikliği `409 BIRTHDAY_LOCKED` ile reddediyor (`birthday/route.ts:121-141`). Ayarlar sayfasında date input ve Kaydet butonu kayıtlı tarihte de aktif (`settings/page.tsx:706-718`).
- **Sorun:** Kullanıcı Lounge'dan Ayarlar'a gidiyor, tarihi değiştiriyor ve ancak kaydedince "değiştirilemez" hatası alıyor. Bu bir çıkmaz sokak.
- **Profesyonel öneri:** Lounge, tarih kayıtlıysa CTA yerine "Tarih kilitli · hatalıysa destekle iletişime geç" bilgisini göstersin. Ayarlar'da da input `disabled` olsun ve kilit ikonuyla açıklansın. API GET yanıtı `locked: true` dönsün ki iki UI aynı kaynağa baksın. Destek talebine giden ikincil bir link eklenebilir.
- **Efor:** S

### 5. Modül kapısı `vip_lounge` hiç çalışmıyor
- **Önem:** orta
- **Kategori:** mimari / yönetilebilirlik
- **Kanıt:** `lounge/route.ts:16`. `MODULE_CATALOG`'da `vip_lounge` anahtarı yok (`lib/module-controls.ts:17-68`). `normalizeModuleControls` yalnızca katalog anahtarlarını kopyalıyor (`:77-87`), bu yüzden `controls['vip_lounge'] === false` asla olmuyor (`lib/module-gate.ts:100`). Sayfa tarafında hiç kapı yok. Kapı ayrıca auth'tan önce çalışıyor (`route.ts:16-18`), engellense anonim isteklerde de `analyticsEvent` yazardı.
- **Sorun:** Admin bu modülü kapatamıyor. Modül genel bakışında (`admin/modules/overview/route.ts:71`) endpoint bağlaması var ama modülün kendisi listelenmiyor.
- **Profesyonel öneri:** Ya `MODULE_CATALOG`'a `{ key: 'vip_lounge', scope: 'customer', detailHref: '/customer/lounge' }` eklenip sayfa tarafında da kapı uygulansın (`app/customer/lounge/layout.tsx` server bileşeninde `getModuleControls` ile `notFound()`/bilgi ekranı), ya da sayfa birleştirildiğinde (bkz. Çakışmalar) anahtar tamamen kaldırılsın. Kapının sırası auth sonrasına alınsın.
- **Efor:** S

### 6. Yetim rota: hiçbir yerden link yok
- **Önem:** orta
- **Kategori:** bilgi mimarisi
- **Kanıt:** `components/dashboard/sidebar.tsx` ve `lib/visibility-controls.ts` içinde `lounge` yok. `/customer/lounge`'a giden tek bir `href` yok (grep). `REDESIGN.md:89` "lounge/favorites (zaten menüde değil)" diyor.
- **Sorun:** Doğum günü ve VIP bilgisinin tek "ev"i olması gereken sayfayı kullanıcı bulamıyor. Bulsa da yukarıdaki sorunlar yüzünden değer üretmiyor.
- **Profesyonel öneri:** Ayrı rota olarak yaşatma; içeriği "Statü" merkezine birleştir (bkz. son bölüm). `/customer/lounge` için bir `redirect()` bırak (PWA ön belleği ve eski linkler için).
- **Efor:** M

### 7. Saat dilimi ve 29 Şubat hataları
- **Önem:** orta
- **Kategori:** doğruluk
- **Kanıt:** `lounge/route.ts:61-68` ve `birthday/route.ts:35-37,166-170` `new Date()` ile sunucu (UTC) saatini kullanıyor. `page.tsx:184` `YYYY-MM-DD`'yi UTC olarak parse edip yerel saatte gösteriyor.
- **Sorun:**
  - TR kullanıcısı (UTC+3) doğum gününün 00:00-03:00 aralığında bonusu göremez.
  - Ertesi gün 00:00-03:00 arasında hâlâ "bugün doğum günün" görür. Popup ve bildirim de aynı kaymayı yaşar.
  - 29 Şubat doğumlular 4 yılın 3'ünde hiç talep edemez.
  - ABD gibi negatif ofsetlerde tarih bir gün önce görünür.
- **Profesyonel öneri:** Doğum gününü `birthMonth` + `birthDay` (tamsayı) olarak normalize et. "Bugün"ü kullanıcının saat dilimine göre hesapla: profilde `timezone` alanı varsa onu, yoksa `Europe/Istanbul`'u kullan (`Intl.DateTimeFormat` ile parçala). Artık olmayan yıllarda 29 Şubat'ı 28 Şubat say. İstemcide tarihi `timeZone: 'UTC'` ile formatla. `lounge` ve `birthday` uçlarındaki kopya mantığı tek bir `lib/birthday.ts` helper'ında topla.
- **Efor:** M

### 8. Sahte ve ölü veri alanları: Harcama, Ömür boyu puan, Katman yenileme
- **Önem:** orta
- **Kategori:** veri bütünlüğü
- **Kanıt:** `UserVIPStatus.totalSpent` alanına yazan kod yok (yalnızca okumalar: `lounge/route.ts:34,95`). `lifetimePoints`'a yalnızca anlık puan yazılıyor (`vip/route.ts:49,55`). `tierExpiry`'ye yazan yok. Gösterim: `page.tsx:131-138`.
- **Sorun:** VIP'li kullanıcı (ör. seed) "Harcama: 0 ₺" ve yanlış "ömür boyu puan" görüyor. Bu, finansal bir metriğin yanlış gösterilmesi demek.
- **Profesyonel öneri:** Harcamayı `consumption` toplamından türet (analytics zaten böyle hesaplıyor: `customer/analytics/route.ts:117`) ve kısa TTL ile Upstash'te cache'le. Ömür boyu kazanımı Bulgu 1'deki sayaçtan oku. Katman süresi iş kuralı (ör. 12 aylık yenileme) tanımlanmadıysa `tierExpiry` UI'dan kaldırılsın.
- **Efor:** M

### 9. Popup ve Lounge senkronsuz; başarılı talep hata gibi görünebiliyor
- **Önem:** düşük
- **Kategori:** durum yönetimi / UX
- **Kanıt:**
  - `page.tsx:78-83`: talep başarılıysa ama `reloadLounge` atarsa kod `catch` bloğuna düşüyor ve `toast.error` gösteriyor.
  - Global popup (`customer-birthday-bonus-host.tsx:59-77`) talep edince lounge state'ine haber vermiyor.
  - `useEffect` bağımlılıkları `[]` (`page.tsx:61`).
- **Sorun:** Kullanıcı puanı alıyor ama kırmızı hata görüyor. Ya da popup'tan alıp lounge'daki butona bastığında "Already claimed this year" (İngilizce) görüyor.
- **Profesyonel öneri:**
  - Veri katmanını SWR'a taşı: `useSWR('/api/customer/lounge')`.
  - Talep sonrası `mutate` ile hem lounge'ı hem başlıktaki puanı yenile. Ortak bir `qx:points-changed` event'i ya da SWR key'i ile popup, ayarlar ve lounge senkron kalsın.
  - Başarı toast'ını reload'dan önce göster; reload hatasını yut ve sessizce yeniden dene.
  - API hata kodlarını (`ALREADY_CLAIMED`, `NOT_TODAY`) makine okunur döndürüp istemcide i18n ile çevir.
- **Efor:** S

### 10. Görsel ve deneyim: "Lounge" vaadi karşılanmıyor
- **Önem:** düşük
- **Kategori:** tasarım / tutarlılık / erişilebilirlik
- **Kanıt:**
  - `page.tsx:99-105` özel hero kullanıyor (17 müşteri sayfası `DashboardPageHero` kullanıyor).
  - Katmanın `color` ve `icon` alanları kullanılmıyor (`schema.prisma` içindeki `VIPTier`).
  - Ödül anında kutlama yok.
  - `aria-hidden` eksik (`page.tsx:94,100,122,174,236`).
  - Spinner'da `role="status"` yok (`page.tsx:108`).
- **Sorun:** Starbucks Rewards ya da Revolut Metal hissinin tam tersi: üç düz kart ve bir buton. Ekran okuyucu kullanıcısı yüklenme ve hata durumunu duymuyor.
- **Profesyonel öneri:** Bkz. Yeniden tasarım vizyonu. Kısa vadede `DashboardPageHero` kullan, skeleton ekle, hata kartına "Tekrar dene" koy, dekoratif ikonlara `aria-hidden` ver ve yüklenme durumunu `aria-live="polite"` ile duyur.
- **Efor:** M

---

## Eksik özellikler (kıyas ürünlerle)

1. **Katman ilerleme çubuğu ve "X puan kaldı":** Starbucks Rewards yıldız sayacı ve Duolingo lig ilerlemesi gibi. API mantığı `vip/route.ts:73-85`'te yarım halde duruyor.
2. **Katman merdiveni (tüm katmanlar ve avantajları, kilitli/açık):** Revolut planları ve Starbucks Green/Gold karşılaştırması gibi. Veri `VIPTier.benefits`'te var.
3. **Doğum günü kutlama anı:** Konfeti, kişiselleştirilmiş kart ve "bugün sana özel" teklif (Starbucks doğum günü ödülü). Ayrıca doğum günü haftası boyunca geçerli bir talep penceresi (sadece tek gün değil).
4. **Katman koruma ve süre bilgisi:** "Gold statün 31 Aralık'a kadar; korumak için X puan daha" (havayolu ve Starbucks statü yenilemesi).
5. **Gerçek "lounge" içeriği:** Katmana özel sınırlı süreli drop'lar ve erken erişim kampanyaları. Metadata bunu vaat ediyor (`messages/tr.json:102`) ama hiçbiri yok.
6. **Yıllık statü özeti:** Wrapped tarzı "bu yıl Gold'da kaldın, X puan çarpan bonusu kazandın". `/customer/my-year` ile bağlanabilir.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Kullanıcı açtığı anda üç şeyi 2 saniyede anlamalı:
1. Hangi statüdeyim?
2. Bir sonrakine ne kadar kaldı?
3. Bu statü bana şu an ne kazandırıyor?

Doğum günü bu ekranın kalıcı kartı değil, zamanı gelince öne çıkan bir **an** olmalı.

**Yerleşim (mobil önce, tek sütun):**
1. **Statü kartı (hero):** Katmanın `color` ve `icon` alanlarıyla renklenen, Apple Wallet benzeri fiziksel bir üyelik kartı. Üzerinde katman adı, üyelik süresi ve çarpan rozeti (×1.5) yer alır. Altında katman ilerleme halkası veya çubuğu ve "Platinum'a 3.200 puan" mesajı bulunur.
2. **Şu an aktif avantajların:** `benefits` listesi, her biri ikon ve somut değerle. "Geri bildirim puanların ×1.5" satırının yanında "bu ay +240 bonus puan kazandırdı" gibi gerçek metrik gösterilir (`points_credited` event'lerindeki VIP bonus kayıtlarından).
3. **Katman merdiveni:** Yatay kaydırılabilir kartlar; kilitli katmanlar soluk, avantaj farkı vurgulu.
4. **Bağlamsal an kartı:** Doğum günü haftasında "İyi ki doğdun" kartı ve talep butonu. Diğer zamanlarda tek satırlık "Doğum günü bonusu: 14 gün sonra · +500". Tarih yoksa tek satırlık davet. Tarih kilitliyse kilit bilgisi.
5. Sürpriz kutular gibi alakasız linkler kaldırılır.

**Motion ve 3D (ölçülü):**
- Statü kartına hafif bir eğim ve parallax (`m as Motion`, `useReducedMotion` ile kapatılabilir). 3D gerekmiyor; kart yüzeyinde CSS gradient ve shine sweep yeterli.
- İlerleme çubuğu ilk girişte bir kez dolsun.
- Doğum günü talebinde tek seferlik konfeti ve puan sayacı animasyonu. Mevcut `components/3d` sürpriz kutusu reveal'i yeniden kullanılabilir, ama yalnızca talep anında ve `prefers-reduced-motion` altında statik varyantla.
- Katman yükseltme anı için ayrı bir tam ekran "level-up" sahnesi tetiklensin (bildirimden derin link ile).

**Veri ve API değişiklikleri:**
- `GET /api/customer/status` (yeni, ya da `lounge` yeniden adlandırılır). Döndürdükleri:
  - `tier { key, name, color, icon, multiplier }`
  - `nextTier`, `progress { current, target, remaining }`
  - `benefits[]` (i18n anahtarlı) ve `ladder[]`
  - `lifetimeEarned`, `spentTotal` (consumption toplamı)
  - `birthday { month, day, locked, daysUntil, claimWindowOpen, canClaim }`
- Upstash'te kullanıcı başına 60 sn cache; puan kredisinde invalidate.
- `lib/vip-tier.ts`: `resolveTier` ve `syncVipTier(tx)`. `creditPointsAndXp` sonrasında çağrılır (Bulgu 1).
- `lib/birthday.ts`: TZ'ye duyarlı `isBirthdayToday`, `daysUntil` ve 29 Şubat kuralı. `/api/birthday` ve status ucu bunu paylaşır. `requireAuth(['CUSTOMER'])`, 30 günlük kayıt yaşı kuralı ve hata kodları eklenir.
- **Ürün kararı gerekiyor:** VIP katmanı ile **Lig** (`lib/league-rules-core.ts:29-37`, puana göre 7 kademe) iki ayrı puan-eşikli statü sistemi. Kullanıcıya iki farklı "seviye merdiveni" göstermek kafa karıştırır. Ya VIP, Lig'in bir avantaj katmanı olarak tanımlansın (Lig = statü, VIP avantajları ligden türesin) ya da biri kaldırılsın.

---

## Çakışmalar / birleştirme önerisi

| Çakışan yer | Ne çakışıyor | Öneri |
|---|---|---|
| `/customer/settings` (Profil, doğum günü kartı) | Doğum günü gösterimi ve talep butonu birebir kopya (`settings/page.tsx:193-290, 680-720`) | Ayarlar yalnızca tarihi bir kez kaydetsin ve kilit durumunu göstersin. Talep ve kutlama tek bir yerde olsun: statü merkezi ve global popup. |
| Global `CustomerBirthdayBonusHost` popup'ı | Aynı talep akışı, ayrı state (`app/customer/layout.tsx:48`) | Ortak SWR key ve event ile senkronlansın; popup CTA'sı statü merkezine derin link versin. |
| `/customer/analytics` | VIP katmanı gösterimi ve `'Bronze'` fallback'i (`customer/analytics/route.ts:326-334`, `app/customer/analytics/page.tsx:301-312`) | Tek kaynak `resolveTier` olsun; analytics yalnızca link versin. |
| `/customer/progress-hub` ve `/customer/my-card` | "İlerleme" ve "üyelik kartı" kavramları | **Birleştirme hedefi:** Lounge içeriği "Statü" sekmesi ya da kartı olarak `progress-hub`'a (ya da üyelik kartı metaforuyla `my-card`'a) taşınsın. `/customer/lounge` → `redirect`. |
| Lig sistemi (`lib/league-rules-core.ts`) | İkinci bir puan-eşikli katman merdiveni | Ürün kararı: VIP ile Lig'i tek statü modelinde birleştir. |
| `/customer/surprise-boxes` | Lounge'daki bağlamsız link (`page.tsx:233-238`) | Kaldırılsın; menüde zaten var (`sidebar.tsx:305`). |

---

## Doğrulama (şüpheci inceleme)

Üç KRİTİK/YÜKSEK iddia kod baştan okunarak çürütülmeye çalışıldı. Okunan dosyalar: `app/api/birthday/route.ts`, `app/api/customer/lounge/route.ts`, `app/api/vip/route.ts`, `lib/api-auth.ts`, `lib/module-controls.ts`, `lib/module-gate.ts`, `lib/vip-multiplier.ts`, `lib/points-velocity.ts`, `lib/points-rules.ts`, `app/api/customer/analytics/route.ts`, `app/api/admin/modules/overview/route.ts`, `app/api/auth/register/route.ts`, `prisma/schema.prisma` (VIPTier/UserVIPStatus), `prisma/seed.ts`, `proxy.ts`. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1) Doğum günü bonusu: yeni hesap tarihi bugüne ayarlayıp anında puan alabiliyor
**Karar: DOĞRULANDI (önem derecesi düşürülmeli: KRİTİK değil, ORTA).**

- Çekirdek iddia doğru. `POST /api/birthday` `action:'set'` tarihi hiçbir aralık veya ön süre kuralı olmadan kabul ediyor (`app/api/birthday/route.ts:115-146`). Tek kısıt, kaydın bir kez yazılabilmesi (`:127-139`). `action:'claim'` yalnızca "bugün ay/gün eşleşiyor mu" ve "bu yıl alındı mı" kontrolünü yapıyor (`:165-183`). Hesap yaşı veya "tarih en az N gün önce kaydedilmiş olmalı" kuralı yok. Varsayılan tutar 500 puan (`lib/points-rules.ts:67-68`).
- **Yeniden üretim:** Doğum günü kaydı olmayan herhangi bir oturumlu hesap (1) `POST /api/birthday {"action":"set","birthDate":"<bugünün tarihi>"}`, (2) `POST /api/birthday {"action":"claim"}` gönderir. Sonuç: +500 harcanabilir puan. Bu, doğum gününü henüz kaydetmemiş **mevcut** hesapların hepsi için de geçerli; yani "doğum günü bonusu" fiilen "isteğe bağlı tek seferlik 500 puan" gibi çalışıyor.
- **Abartılan kısımlar:**
  - "Aynı istekte" ifadesi yanlış. Discriminated union tek `action` alıyor (`:91-94`), bu yüzden iki istek gerekiyor. Sonucu değiştirmiyor.
  - Token-replay argümanı bu senaryoyla ilgisiz. `checkTokenReplay` (`lib/api-auth.ts:66-79`) çalınmış JWT'nin başka IP/UA'dan kullanımını yakalar. Burada saldırgan kendi hesabını kullanıyor. Çalınmış token ile claim yapılırsa da puan saldırgana değil kurbana yazılır. Yine de `requireAuth` kullanılmaması, proje kuralıyla (`lib/api-auth.ts:3` başlık yorumu) tutarsız bir hijyen eksiği.
  - Çiftlik ölçeği sınırlı. Kayıtta e-posta doğrulaması zorunlu (`app/api/auth/register/route.ts:56-63`), dolayısıyla her hesap için doğrulanmış bir e-posta veya OAuth hesabı gerekiyor. Ayrıca kayıt anında referral ile zaten 500 puan veriliyor (`points-rules` `referredPoints: 500`). Doğum günü açığı yeni hesap başına kazancı kabaca ikiye katlıyor ama yeni bir sınıf açık yaratmıyor. `points_credited` yazılıyor (`:213-220`) ve 24 saatte ≥500 eşiği (`lib/points-velocity.ts:8`) bu hesabı **yalnızca leaderboard'da** şüpheli işaretliyor. Harcamayı engelleyen bir şey yok.
  - DEALER/STAFF rol kısıtı yok (`:101`, yalnızca `getServerSession`). Ancak bu rollerin puanla müşteri ödülü alıp alamadığı ayrı bir konu ve bu incelemede doğrulanmadı.
- **Öneri (uygulama yaklaşımı):** `requireAuth(['CUSTOMER'])` kullanılmalı. `UserBirthday.createdAt` (ya da yeni bir `lockedAt`) üzerinden "claim ancak doğum tarihi en az 30 gün önce kaydedildiyse" kuralı eklenmeli. Bu kural atomik `updateMany` guard'ının `where` koşuluna konursa yarış durumu da kapanır. İlk kayıtta tarih bugünden ±N gün içindeyse bonus o yıl için `lastBonusAt = now` ile "tüketilmiş" sayılabilir. Ret durumları için UI'da açıklayıcı hata kodu (`BIRTHDAY_TOO_RECENT`) dönülmeli.

### 2) VIP katman ataması hiçbir kullanıcı akışında çalışmıyor
**Karar: DOĞRULANDI (iddiadan da geniş).**

- `UserVIPStatus`'a yazan **tek** yer `app/api/vip/route.ts:45` (bir GET içindeki upsert). `app/`, `lib/`, `components/` ve `hooks/` altında `/api/vip` çağıran istemci bulunamadı (grep boş, `public/sw.js` yalnızca statik precache). `prisma/seed.ts` VIPTier oluşturuyor (`:1320-1420`, Bronze 0 / Silver 1000 / Gold 5000 / Platinum 15000; çarpanlar 1.0/1.25/1.5/2.0) ama **hiçbir kullanıcıya `UserVIPStatus` yazmıyor**. Yani "seed dışındaki müşteriler" ifadesi bile iyimser: normal akışta hiçbir kullanıcıda VIP kaydı oluşmuyor.
- **Somut etkiler:**
  - Lounge her kullanıcıya `customerLounge.noVip` gösteriyor ("…otomatik yükselirsiniz", `messages/tr.json:3237`; `app/customer/lounge/page.tsx:128-144`). Aynı kullanıcı analytics'te `'Bronze'` görüyor (`app/api/customer/analytics/route.ts:326-334`). Bu bir tutarsızlık; "otomatik yükselirsiniz" vaadi de hiç gerçekleşmiyor.
  - `applyVipMultiplier` (`app/api/feedbacks/route.ts:301`) kayıt olmadığı için daima 1.0 dönüyor (`lib/vip-multiplier.ts:29`).
  - Lounge perk listesindeki çarpan maddesi (`app/api/customer/lounge/route.ts:81-84`) hiç tetiklenmiyor.
  - Ek bulgu: bayi kampanyasındaki VIP segmenti (`app/api/dealer/campaigns/[id]/send/route.ts:53`, `vipStatus: { isNot: null }`) fiilen boş kitleye gönderim yapıyor.
- `/api/vip` `lifetimePoints`'e harcanabilir bakiyeyi yazıyor (`:50, :54`). Bu da doğru.
- **Ek risk (iddiada yok):** Uç elle çağrılabiliyor. Bu yüzden geçici olarak yüksek bakiyeye ulaşan bir kullanıcı `GET /api/vip` ile Platinum'a (2x) yükselip puanı harcayabilir. Uç bir daha çağrılmadığı için katman düşmez ve çarpan kalıcı olur. Etkisi feedback günlük tavanıyla sınırlı (`app/api/feedbacks/route.ts:297-312`, tavan çarpandan sonra uygulanıyor).
- **Öneri:** Katman, harcanabilir bakiyeden değil kalıcı bir `lifetimeEarned` sayacından türetilmeli. Bu sayaç `creditPointsAndXp` içinde aynı transaction'da artırılmalı. `syncVipTier(tx)` kredi yollarından çağrılmalı. GET içindeki yan etkili upsert kaldırılmalı. Mevcut kullanıcılar için tek seferlik bir backfill gerekir (onaylı bir migration penceresinde).

### 3) `vip_lounge` modül kapısı hiçbir şeyi engellemiyor
**Karar: DOĞRULANDI (önem: KRİTİK/YÜKSEK değil, DÜŞÜK-ORTA; güvenlik açığı değil, yönetim kontrolü eksikliği).**

- `vip_lounge`, `MODULE_CATALOG` içinde yok (`lib/module-controls.ts:17-69`; repo genelinde yalnızca `app/api/customer/lounge/route.ts:16` ve `app/api/admin/modules/overview/route.ts:71`'de geçiyor). `normalizeModuleControls` yalnızca katalog anahtarlarını taşıyor (`:78-88`). DB'ye elle `vip_lounge:false` yazılsa bile normalize sırasında atılıyor. `controls['vip_lounge']` her zaman `undefined`, bu yüzden `blockedByGlobalControl` hep false (`lib/module-gate.ts:100`).
- Rol görünürlüğü de devreye girmiyor. Katalogda scope olmadığı ve çağrıda `role` verilmediği için `role` undefined (`:96-98`), dolayısıyla `blockedByRoleVisibility` hep false (`:101`). Admin modül panelinde lounge listelenmiyor (`overview/route.ts` `MODULE_CATALOG.map`). `:71`'deki endpoint bağlaması, kataloğa karşılık gelmeyen boşta bir kayıt.
- **Yeniden üretim:** Admin lounge'u kapatmak istese bile UI'da anahtar yok. Settings satırına elle `vip_lounge:false` eklense de `GET /api/customer/lounge` 200 dönmeye devam eder. `proxy.ts` sayfa seviyesinde lounge'a özel bir kapı içermiyor.
- **Öneri:** Kataloğa `{ key: 'vip_lounge', scope: 'customer', severity: 'optional', detailHref: '/customer/lounge' }` eklenmeli. Kapı sayfa tarafında da uygulanmalı (menü öğesinin gizlenmesi ve doğrudan URL için bir "modül kapalı" durumu). Aynı yapısal hatayı başka modüllerde yakalamak için kapıya verilen her anahtarın katalogda bulunduğunu kontrol eden bir birim testi eklenmeli (`assertModuleEnabled` çağrılarını tarayan test).


---

## Uygulama (Dalga 2)

**Karar uygulandı: birleştir.** `/customer/lounge` emekli koçanı (`permanentRedirect` → `/customer/wallet/card`, sorgu korunur). İçerik Cüzdan → Kartım'daki **Statü** bölümüne (`components/customer/m-cuzdan-kart/status-panel.tsx`) gerçek veriyle taşındı. `GET /api/customer/lounge` kaldırıldı (tek tüketicisi bu sayfaydı); statü verisi Kartım yükleyicisinden (`lib/wallet-card/load.ts`) gelir. Doğum günü kuralları tek kaynakta: `lib/birthday.ts` (Europe/Istanbul, 29 Şubat, 30 gün kuralı).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Rota metadata | ÇALIŞIYOR | Kartım metadata'sı; sahte "sezonluk avantaj/drop" vaadi yok |
| 2 | Menüden giriş | ÇALIŞIYOR | Cüzdan → Kartım (kayıtta `keywords: statü, lounge, vip`) |
| 3 | "Panele dön" | KALDIRILDI | Cüzdan sekmeleri ve alt sekme çubuğu |
| 4 | Özel hero | KALDIRILDI | Cüzdan kabuğu başlığı |
| 5 | Yükleniyor | ÇALIŞIYOR | Sunucu ilk render + `aria-busy` iskelet |
| 6 | Hata | ÇALIŞIYOR | `ErrorState` + yeniden dene; JSON olmayan yanıt sözleşme hatası olarak yakalanır |
| 7 | `vip_lounge` modül kapısı | KALDIRILDI | Uç kaldırıldı; statü ayrı modül değil, Kartım'ın parçası |
| 8 | API kimlik/rol | ÇALIŞIYOR | `defineRoute` CUSTOMER |
| 9 | VIP katman adı | ÇALIŞIYOR (koşullu) | Yalnız gerçekten atanmış, etkin ve süresi dolmamış kayıtta (çarpanın uygulandığı koşulun aynısı, `buildVip`). Atama yolu F4.4'te |
| 10 | "Ömür boyu puan" | KALDIRILDI | Değer harcanabilir bakiyenin anlık görüntüsüydü |
| 11 | "Harcama" | KALDIRILDI | Alan hiç yazılmıyordu; gerçek harcama Hareketler sekmesinde |
| 12 | Katman yenileme | ÇALIŞIYOR | `tierExpiry` varsa "… tarihine kadar"; yoksa hiç gösterilmez |
| 13 | "VIP yok … otomatik yükselirsiniz" | KALDIRILDI | Gerçekleşmeyen vaat |
| 14 | Puan + seviye | ÇALIŞIYOR | `PointsChip` + seviye |
| 15 | Sonraki katmana ilerleme | ÇALIŞIYOR | Lig ilerleme çubuğu, "X ligine N puan" (lig kuralları sunucudan) |
| 16 | Katmanın gerçek avantajları | ÇALIŞIYOR (dar kapsam) | Gerçek mekanizması olan tek avantaj (geri bildirim çarpanı) somut oranla; `VIPTier.benefits` seed metni doğrulanamadığından gösterilmez |
| 17 | "Öncelikli kampanya bildirimleri" | KALDIRILDI | Mekanizma yok |
| 18 | "Doğum günü bonusu" | ÇALIŞIYOR | Doğum günü anı |
| 19 | "Mini görev önerileri" | KALDIRILDI | Sahteydi |
| 20 | Puan çarpanı | ÇALIŞIYOR | "Geri bildirim puanların ×1,25" (yanlış "kampanya dönemlerinde" ifadesi düzeldi) |
| 21 | "Bağış öncelikli rozet" | KALDIRILDI | Sahteydi |
| 22 | Doğum tarihi gösterimi | ÇALIŞIYOR | Gün/ay `timeZone: 'UTC'` ile biçimlenir (negatif ofsette kayma yok) |
| 23 | "… gün sonra" sayacı | ÇALIŞIYOR | İstanbul takvimi, 29 Şubat → 28 Şubat |
| 24 | "Bugün doğum günün" | ÇALIŞIYOR | İstanbul günü |
| 25 | Bonus ipucu | ÇALIŞIYOR | Puan matrisinden |
| 26 | Bonus talebi | ÇALIŞIYOR | An Motoru puan kapsülü (Host yoksa tek toast), `moments.refresh()`, hata sonrası durum tazelenir; Türkçe hata metinleri |
| 27 | "Bu yıl alındı" | ÇALIŞIYOR | |
| 28 | "Ayarlarda düzenle" | KALDIRILDI | Çıkmazdı; yerine "tarih kaydedildikten sonra değiştirilemez; hatalıysa destek" bilgisi |
| 29 | Tarih yoksa davet | ÇALIŞIYOR | "Doğum tarihini ekle, +N puan" → Ayarlar |
| 30 | "Sürpriz kutular" linki | KALDIRILDI | Bağlamsızdı |
| 31 | Popup ile senkron | ÇALIŞIYOR (kısmi) | Kartım odakta yeniden çeker; başarısız talepte (ör. popup'tan alınmış) sunucudan tazelenir. Popup'ın sayfaya olay yayması ortak bileşen işi |
| 32 | Talep backend güvenliği | ÇALIŞIYOR | `defineRoute` CUSTOMER + hız sınırı; 30 gün kuralı guard'ın `where`'inde; puan `mintPoints` (`birthday:<kullanıcı>:<yıl>` tek-kez anahtarı, defter + `points_credited` aynı tx) |
| 33 | i18n | ÇALIŞIYOR | Sayfa TR/EN; `/api/birthday` Türkçe metin + makine kodu (`NOT_SET`, `NOT_TODAY`, `ALREADY_CLAIMED`, `TOO_RECENT`, `BIRTHDAY_LOCKED`, `INVALID_DATE`) |
| 34 | Erişilebilirlik | ÇALIŞIYOR | Dekoratif ikonlar `aria-hidden`, `progressbar` değerleri, durumlar duyurulur |
| 35 | Mobil | ÇALIŞIYOR | Tek sütun, ≥ 44px hedefler |
| 36 | Hareket | ÇALIŞIYOR | Kutlama An Motoru'nda (kayıtlı, idempotent); ops bölümünde döngü yok |

### Kapanan bulgular
- **1** kısmen: yan etkili `GET /api/vip` salt okunur yapıldı (geçici bakiyeyle Platinum'a yükselip ×2 çarpanı kalıcı tutma açığı kapandı); UI yalnız gerçek kaydı gösterir, "Bronze" ile çelişen "VIP yok" vaadi kalktı. Kalan: olay güdümlü atama (F4.4, ekonomi şeridi).
- **2** kapandı: uydurma ayrıcalıklar kaldırıldı; yalnız gerçek çarpan somut oranla.
- **3** kapandı: `requireAuth(['CUSTOMER'])`, 30 gün kuralı (ön kontrol + atomik guard), `mintPoints` + yıllık tek-kez anahtarı, hız sınırı; `set` girdisi geçerli takvim günü / gelecekte değil / ≤ 120 yaş.
- **4** kapandı (Kartım): CTA yerine kilit bilgisi; `GET /api/birthday` artık `locked: true` döndürür (Ayarlar input'u bunu kullanabilir).
- **5** kapandı: kapı ve uç kaldırıldı.
- **6** kapandı: içerik Cüzdan → Kartım'da; eski rota yönlendirir.
- **7** kapandı: `lib/birthday.ts` (İstanbul, 29 Şubat); GET hatırlatma bildirimi İstanbul günü başına bir kez.
- **8** kapandı: sahte/ölü alanlar kaldırıldı.
- **9** büyük ölçüde kapandı: React Query + başarı/başarısızlık sonrası tazeleme, makine okunur hata kodları.
- **10** kapandı: QDL v2 bölüm kartı, amblem, ilerleme, An Motoru kutlaması.

### Kalanlar
- VIP olay güdümlü atama + lig/VIP tek statü modeli kararı (F4.4).
- `app/api/admin/modules/overview/route.ts:71` hâlâ kaldırılan `/api/customer/lounge` için boşta bir uç bağlaması tutuyor (admin yüzeyi).
- Ayarlar'da doğum tarihi input'unun kilitli gösterilmesi (Ayarlar yüzeyi; `locked` alanı hazır).
- Doğum günü haftası talep penceresi ve yıllık statü özeti (ürün kararı).
