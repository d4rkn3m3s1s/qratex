# /customer/rewards

**Amaç:** Müşterinin biriktirdiği puanı platform ödül kataloğundaki (`Reward`) ödüllerle takas etmesi, aldığı ödüllerin kupon kodlarını görmesi ve ayrıca yönetici tarafından üretilen promosyon kuponlarını (`Coupon`) girmesi.

**Genel puan: 4.6 / 10** · **Karar: yeniden tasarla**

Ön yüz düzgün çalışan bir katalog + onay akışı sunuyor ve puan düşme işlemi sunucuda atomik. Ama ürünün asıl vaadi kırık: alınan ödülün kodu hiçbir yerde doğrulanamıyor ya da "kullanıldı" diye işaretlenemiyor; yani zincirin son halkası (teslim) yok. Sayfadaki "Kupon kodu" kartı da kullanıcıya hiçbir karşılık vermeyen bir çıkmaz sokak. Görsel kabuk korunabilir. Asıl yeniden tasarlanması gereken teslim modeli, cüzdan bilgi mimarisi ve veri akışı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Talep akışı atomik ve sağlam. Ama ödülün kullanımı/teslimi yok, "Kullanıldı" durumu hiç oluşmuyor, kupon kartı bir karşılık vermiyor. |
| UX | 5/10 | Akış anlaşılır. Ancak stoğu tükenmiş ya da alınamayan ödülde onay penceresi açılıyor, hata yerine "Henüz ödül yok" boş durumu görünüyor, aynı sayfada iki ayrı "kupon" kavramı birbirine karışıyor. |
| Görsel | 6/10 | Kartlar, gradient'ler ve iskeletler tutarlı. Ama gradient renkleri sıraya göre veriliyor, anlamı yok. Kutlama modalı da ödülle ilgisi olmayan "sürpriz kutu" diliyle konuşuyor. |
| Mimari | 4/10 | 800 satırlık tek client bileşen. React Query hazırda dururken ham `fetch` + `useState` kullanılıyor. Effect bağımlılığı yüzünden istekler tekrarlanıyor. Kopya sabit metinlerle dolu; şemada olmayan `image` alanı ve seed'e bağlı görsel haritası var. |
| Performans | 5/10 | Sadece puanı okumak için ~10 sorgu yapan `/api/customer/stats` çağrılıyor. Sayfa açılışında 3 istek ikişer kez gidiyor, talepten sonra 5 istek daha gidiyor. |
| Erişilebilirlik + Mobil | 5/10 | Mobil ızgara ve dokunma hedefleri iyi. Ama "Ödüllerim" kartları klavyeyle açılamıyor, kopyala butonunun etiketi yok, kutlama modalında dialog rolü / odak tuzağı / Esc yok, 10px metin opaklık 70 kartın üstünde duruyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa meta verisi (title/description) | ÇALIŞIYOR | `app/customer/rewards/layout.tsx:4-6` | i18n anahtarlı. |
| 2 | Masaüstü başlık (`DashboardPageHeading`) | ÇALIŞIYOR | `page.tsx:265-268`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex`. |
| 3 | Mobil başlık kartı | ÇALIŞIYOR | `page.tsx:270-275` | `sm:hidden`; aynı anda tek bir `h1` görünüyor. |
| 4 | Mevcut puan göstergesi | KISMİ | `page.tsx:139-153, 286` | Açılışta `0` gösteriyor. Hata olursa bayat JWT puanına düşüyor. Puan, ağır `/api/customer/stats` ucundan okunuyor. `toLocaleString()` locale'siz. |
| 5 | "Toplam Ödül" sayacı | KISMİ | `page.tsx:291`, `route.ts:96` | Etiket belirsiz: katalog mu, sahip olunan mı? API 200 kayıtla sınırlı. |
| 6 | "Kullanılabilir" sayacı | BOZUK | `page.tsx:296`, `route.ts:107` | `isUsed = !!claimedAt`, ama `claimedAt` hiçbir yerde yazılmıyor. Değer her zaman toplamla aynı. |
| 7 | Kupon kodu kullanım kartı (`CouponRedeemCard`) | SAHTE | `components/rewards/coupon-redeem-card.tsx:24-48`, `app/api/customer/redeem-coupon/route.ts:71-125` | Sunucu tarafı atomik, ama kullanıcıya hiçbir hak tanımıyor. `CouponRedemption` başka hiçbir yerde okunmuyor; "%10 indirim kuponunuz tanımlandı" mesajı bir çıkmaz sokak. |
| 8 | Kupon kartında Enter ile gönderme | ÇALIŞIYOR | `coupon-redeem-card.tsx:61` | |
| 9 | Kupon brute-force hız sınırı / tek kullanım | ÇALIŞIYOR | `redeem-coupon/route.ts:35-41, 74-89` | 10 deneme/dk; UNIQUE ile atomik. |
| 10 | Mağaza / Ödüllerim sekmeleri | KISMİ | `page.tsx:309-322` | Sekme URL'e yansımıyor; `?tab=myRewards` ile derin bağlantı kurulamıyor. |
| 11 | Ödüllerim sekmesindeki aktif sayaç rozeti | BOZUK | `page.tsx:318-320` | #6 ile aynı neden: "aktif" sayısı hep toplama eşit. |
| 12 | Mağaza yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:326-341` | |
| 13 | Mağaza boş durumu + Tüketimlerim/Geri Bildirimlerim linkleri | KISMİ | `page.tsx:342-359` | API hatasında, modül kapalıyken ve DB 503 verdiğinde de bu "Henüz ödül yok" ekranı çıkıyor. |
| 14 | Hata durumu + yeniden dene | EKSİK | `page.tsx:170-177` | `success:false` yanıtı sessizce yutuluyor; toast yalnızca ağ istisnasında çıkıyor. |
| 15 | Ödül kartı ızgarası | ÇALIŞIYOR | `page.tsx:361-480` | `grid-cols-2 sm:grid-cols-2` tekrarı gereksiz. |
| 16 | Ödül görselini çözümleme | KISMİ | `lib/reward-display-image.ts:5-27`, `page.tsx:364-416` | Admin'in varsayılan emoji ikonu (`'🎁'`, `app/admin/rewards/page.tsx:83`) müşteride hiç görünmüyor, yerine genel `Gift` ikonu geliyor. 4 seed ID'si sabit kodlanmış. Şemada `image` alanı yok (`prisma/schema.prisma:680-697`). |
| 17 | Kart gradient döngüsü | ÇALIŞIYOR | `page.tsx:369-377` | Renk sıraya göre veriliyor (`index % 6`); tür ya da kategoriyle bağı yok. |
| 18 | Tür rozeti | KISMİ | `page.tsx:98-116, 419-421` | `VIP` anahtarı ölü (`lib/validations.ts:186` yalnızca digital/physical/coupon kabul ediyor). Bilinmeyen türde rozet boş kalıyor. |
| 19 | "Tükendi" kaplaması | KISMİ | `page.tsx:424-428, 390` | Kart tıklanabilir kalıyor ve onay penceresi açılıyor. |
| 20 | Fiyat (puan) | ÇALIŞIYOR | `page.tsx:447` | |
| 21 | Stok rozeti (sayı / ∞) | KISMİ | `page.tsx:449-455` | Etiketsiz çıplak sayı; "Son 3" gibi bir aciliyet dili yok. |
| 22 | "Talep Et" / "X eksik" butonu | KISMİ | `page.tsx:459-474` | Kendi `onClick`'i yok, karta kabarcıklanarak çalışıyor. Puan yüklenene kadar (0 iken) her kartta "X eksik" yanıp sönüyor. |
| 23 | Karta tıklayınca onay penceresi | KISMİ | `page.tsx:390` | Puanı yetmeyen ve stoğu tükenen ödülde de açılıyor. |
| 24 | Giriş / hover animasyonu | ÇALIŞIYOR | `page.tsx:380-386, 399-403` | Ölçülü; global `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`). |
| 25 | Geçerlilik penceresi / kişi başı limit gösterimi | EKSİK | `route.ts:28-68, 261-269` | `validFrom`/`validUntil`/`perUserLimit` sunucuda uygulanıyor ama kullanıcıya gösterilmiyor. Süresi dolmuş ödül "Talep Et" diyor. |
| 26 | Arama / filtre / sıralama / kategori | EKSİK | `page.tsx:361`, `route.ts:132` | Sıralama yalnızca `cost asc`. |
| 27 | Onay penceresinin içeriği | ÇALIŞIYOR | `page.tsx:621-666` | Radix Dialog, erişilebilir. |
| 28 | "Kalan Puan" hesabı | KISMİ | `page.tsx:657` | Puanı yetmeyen ödülde negatif değer gösteriyor. |
| 29 | Stok satırı | BOZUK | `page.tsx:660-664` | `stock >= 0` koşulunun içinde `=== -1 ? 'Sınırsız'` dalı var; bu dal hiç çalışmaz, "Sınırsız" asla görünmez. |
| 30 | "Onayla" butonu | KISMİ | `page.tsx:671-674` | `stock === 0` iken etkin kalıyor; sunucu "stoğu tükendi" hatası dönüyor. |
| 31 | Talep API'si (PATCH: atomik puan düşme, stok koruması, audit, bildirim) | KISMİ | `app/api/gamification/rewards/route.ts:205-377` | Puan ve stok atomik. `perUserLimit` sayımı ise yarışa açık (bkz. Bulgu 4). |
| 32 | Idempotency | KISMİ | `route.ts:209-212`, `lib/idempotency.ts:12-50` | İstemci `Idempotency-Key` göndermiyor, mekanizma bu sayfa için ölü. Önbellek kullanıcıya göre kapsamlanmamış. |
| 33 | Talep sonrası toast | ÇALIŞIYOR | `page.tsx:220-223` | `admin-toast` "Basarili: " önekini ekliyor (bkz. Bulgu 6). |
| 34 | Yerel bakiye güncelleme | ÇALIŞIYOR | `page.tsx:226` | `||` kullanılmış; bakiye 0 olduğunda yedek ifadeye düşüyor (sonuç doğru ama kırılgan). |
| 35 | Oturum (JWT) puan güncelleme | KISMİ | `page.tsx:229`, `lib/auth.ts:272-275` | İstemcinin yazabildiği alan; effect'i yeniden tetikliyor. |
| 36 | Talepten sonra "Ödüllerim" sekmesine geçiş | ÇALIŞIYOR | `page.tsx:238` | |
| 37 | Kutlama modalı (`SurpriseEggThreeModal`) | KISMİ | `page.tsx:241-250, 787-796`, `components/rewards/surprise-egg-three-modal-premium.tsx` | Metinler satın almayla uyuşmuyor ("Bugünün sürprizi", "Günün ödülü"). Lig bayat oturumdan hesaplanıyor. Dialog semantiği yok. Adında "Three" geçiyor ama three.js kullanılmıyor. |
| 38 | Ödüllerim yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:486-501` | |
| 39 | Ödüllerim boş durumu + "Mağazaya Git" | ÇALIŞIYOR | `page.tsx:502-513` | |
| 40 | Ödüllerim kartı (tür, Aktif/Kullanıldı) | KISMİ | `page.tsx:524-571` | Her ödül sonsuza kadar "Aktif". `image` alanı API'den hiç gelmiyor (`route.ts:85-92`). |
| 41 | Kupon kodu gösterimi | ÇALIŞIYOR | `page.tsx:574-596` | |
| 42 | Kopyala butonu (kart) | KISMİ | `page.tsx:199-204, 582-592` | `writeText` beklenmiyor ve hata yakalanmıyor; kopyalama başarısız olsa da başarı toast'ı çıkıyor. İkon butonunun `aria-label`'ı yok. |
| 43 | Göreli tarih ("3 gün önce") | ÇALIŞIYOR | `page.tsx:602` | Locale'e duyarlı. |
| 44 | Kupon detay penceresi | KISMİ | `page.tsx:690-785, 531-533` | Tetikleyici `div onClick`, klavyeyle erişilemiyor. Tarih `'tr-TR'` olarak sabit (`:753`). |
| 45 | "Kodu Kopyala" (detay) | KISMİ | `page.tsx:736-743` | #42 ile aynı hata yönetimi sorunu. |
| 46 | Kullanım talimatı ("ilgili işletmede gösterin") | SAHTE | `page.tsx:770-776` | `Reward` modelinde işletme (dealerId) yok, işletme tarafında kod doğrulama ucu da yok. "İlgili işletme" diye bir şey yok. |
| 47 | "Kullanıldı" durumu / üstü çizili kod | SAHTE | `page.tsx:555-559, 578`, `route.ts:107` | `userReward.update*` ya da `claimedAt` yazan hiçbir kod yok (app/lib/components genelinde grep ile doğrulandı). |
| 48 | Ödülü işletmede doğrulama (QR/barkod) | EKSİK | — | Starbucks/Monzo tarzı "göster ve okut" akışı yok. |
| 49 | Kodun son kullanma tarihi / geri sayım | EKSİK | `prisma/schema.prisma:699-714` | `UserReward` modelinde `expiresAt` yok. |
| 50 | Fiziksel ödül teslimat (adres/kargo) akışı | EKSİK | — | `physical` türü var ama teslim akışı yok. |
| 51 | i18n (TR/EN) | KISMİ | `messages/tr.json:1808-1821` | 12 anahtar çevrilmiş; sayfada ~45 sabit Türkçe metin var. |
| 52 | Modül kapalı durumu | BOZUK | `lib/module-gate.ts:103-122`, `page.tsx:170-172` | 403 mesajı yutuluyor, kullanıcı "Henüz ödül yok" görüyor. |
| 53 | Azaltılmış hareket desteği | KISMİ | `components/providers.tsx:232`, `surprise-egg-three-modal-premium.tsx:126-138, 166, 182` | Global ayar transform'ları kapatıyor, ama modaldaki sonsuz opaklık ve blur döngüleri çalışmaya devam ediyor. |
| 54 | Ödüllerim filtresi (aktif/kullanılmış/süresi dolmuş) | EKSİK | `page.tsx:515-615` | |
| 55 | Puan hareket geçmişi / "nereden kazandım, nereye harcadım" | EKSİK | — | Hero'da puanın kaynağına giden bir bağlantı yok. |

**Durum özeti:** ÇALIŞIYOR 18 · KISMİ 22 · BOZUK 4 · SAHTE 3 · EKSİK 8 (toplam 55)

---

## Bulgular

### 1. Ödülün teslim/kullanım zinciri yok: puan harcanıyor, karşılığında doğrulanamayan bir kod veriliyor
- **Önem:** kritik · **Kategori:** işlevsellik / ekonomi bütünlüğü · **Efor:** XL
- **Kanıt:**
  - `prisma/schema.prisma:680-697`: `Reward` modelinde `dealerId` ya da kullanım kanalı yok.
  - `prisma/schema.prisma:699-714`: `UserReward.claimedAt` alanı var.
  - `app/api/gamification/rewards/route.ts:107`: `isUsed: !!ur.claimedAt`.
  - Depo genelinde `userReward.update|updateMany|upsert` araması 0 sonuç verdi; `claimedAt` yalnızca okunuyor (`route.ts:106`, `app/api/user/data-export/route.ts:39`).
  - `app/api/dealer/*` altında kod doğrulayan bir uç yok.
  - `page.tsx:773`: "Bu kupon kodunu ilgili işletmede göstererek ödülünüzü alabilirsiniz."
- **Sorun:** Kullanıcı puanını harcıyor (`debitPoints`, `route.ts:303`) ve `KPN-XXXXXXXX-XXXX` biçiminde bir kod alıyor. Ama bu kodu okuyacak, doğrulayacak ya da "kullanıldı" diye işaretleyecek hiçbir işletme, personel veya admin ekranı yok. Sonuçları:
  - "Kullanıldı" rozeti, üstü çizili kod, "Kullanılabilir" sayacı ve sekme rozeti hep yanlış çalışıyor.
  - Kod kopyalanıp paylaşılırsa, gerçek dünyada kaç kez kullanıldığı bilinmiyor.
  - Fiziksel ödülde teslimat bilgisi toplanmıyor.

  Bu, ürünün ana vaadini, yani "puan → somut değer" dönüşümünü, sayfa düzeyinde yarım bırakıyor.
- **Profesyonel öneri:** Bir "ödül teslim modeli" tasarlanmalı:
  1. **Veri:**
     - `Reward` modeline `fulfillment` (`IN_STORE_SCAN | DIGITAL_DELIVERY | SHIPPING | PLATFORM_PERK`) ve isteğe bağlı `dealerId` / `dealerIds` eklenmeli.
     - `UserReward` modeline `status` (`ISSUED | REDEEMED | EXPIRED | CANCELLED`), `expiresAt`, `redeemedByStaffId`, `redeemedDealerId` ve `shippingAddress Json?` eklenmeli.
  2. **İşletme tarafı:** `POST /api/dealer/rewards/redeem` (staff/dealer rolü, `code` + işletme kapsamı kontrolü). Atomik `updateMany where { code, status: 'ISSUED', OR dealer eşleşmesi }` ile tek kullanım garanti edilmeli; işlem audit'e yazılmalı.
  3. **Müşteri tarafı:**
     - Kod, kısa ömürlü imzalı bir QR / barkod olarak gösterilmeli (`/api/customer/rewards/[id]/pass`, HMAC + 60 sn TTL), kopyalanabilir metin ikincil kalmalı.
     - Kullanıldığında kullanıcıya bildirim gitmeli ve kart "Kullanıldı · Kafe X · 12 Eki" olarak güncellenmeli.
  4. **Geçiş:** Mevcut `ISSUED` kayıtları için toplu `expiresAt` ataması yapılmalı.

  Bu yapılana kadar, `physical`/`coupon` türlerinde "İşletmede göster" metni yerine dürüst bir "Ekibimiz seninle iletişime geçecek" bilgisi gösterilmeli.

### 2. "Kupon kodu" kartı kullanıcıya hiçbir şey kazandırmıyor ve sayfadaki ikinci "kupon" kavramıyla karışıyor
- **Önem:** yüksek · **Kategori:** işlevsellik / bilgi mimarisi · **Efor:** M
- **Kanıt:**
  - `components/rewards/coupon-redeem-card.tsx:32-41`
  - `app/api/customer/redeem-coupon/route.ts:71-125`: yalnızca `couponRedemption` kaydı + `usedCount++` + analitik olayı yazıyor.
  - `CouponRedemption` başka hiçbir yerde okunmuyor; `prisma.coupon` kullanımı yalnızca `app/api/admin/coupons/route.ts` ve bu uçta var.
  - `Coupon` modeli (`schema.prisma:1470-1485`) `percentage | fixed` + `minPurchase` taşıyor, yani bir ödeme sepeti varsayıyor; müşteri tarafında böyle bir sepet yok.
  - `page.tsx:576`: "Kupon Kodu" etiketi `UserReward.code` için de kullanılıyor.
- **Sorun:** Kullanıcı kodu giriyor ve "%10 indirim kuponunuz tanımlandı" mesajını görüyor. Ama bu indirim hiçbir yerde görünmüyor ve hiçbir yerde uygulanmıyor. Üstelik aynı sayfada kullanıcının kendi ödül kodları da "Kupon Kodu" diye anılıyor. Kullanıcı bunları bu kutuya yapıştırırsa "Kupon bulunamadı" hatası alıyor. Bu iki ayrı kavram, iki ayrı tablo ve aynı kelime demek. `lib/qra-knowledge-base.ts:57-60` de asistanı kullanıcıları bu kutuya yönlendiriyor.
- **Profesyonel öneri:** Promosyon kodunun ürün anlamına karar verilmeli:
  - **(a) Puan/ödül veren promosyon kodu:** Kullanım anında atomik `creditPoints` + `points_credited` olayı (fraud görünürlüğü) ya da doğrudan bir `UserReward` oluşturulmalı. Sonuç "Ödüllerim" listesinde görünmeli.
  - **(b) İşletmede indirim:** Kupon, `UserReward` benzeri bir cüzdan kaydına (`WalletPass`) dönüşmeli ve Bulgu 1'deki doğrulama akışından geçmeli.

  Arayüzde ise:
  - Kutu, "Promosyon kodu gir" başlığıyla mağazanın altına, ikincil bir "Kodun mu var?" açılır alanına taşınmalı.
  - Kullanıcının kendi kodları "Ödül kodu / Pass" olarak yeniden adlandırılmalı.
  - Sunucu, `KPN-`/`ODL-` önekli bir giriş gördüğünde "Bu senin ödül kodun; Ödüllerim'de göster" diye yönlendirmeli.
  - Uca `assertModuleEnabled('rewards')` kapısı eklenmeli (şu an yok).

### 3. Alınamayan ve stoğu tükenmiş ödüllerde onay akışı açılıyor; stok satırı ölü dal içeriyor
- **Önem:** orta · **Kategori:** UX / doğruluk · **Efor:** S
- **Kanıt:**
  - `page.tsx:388-390`: kartın `onClick` olayı koşulsuz.
  - `page.tsx:671-674`: Onayla yalnızca `claiming || !canAfford` durumunda pasif; `stock === 0` kontrol edilmiyor.
  - `page.tsx:657`: negatif "Kalan Puan".
  - `page.tsx:660-664`: `stock >= 0 && (stock === -1 ? 'Sınırsız' : ...)`, yani ölü dal.
- **Sorun:** Tükendi kaplamalı karta dokunan ve puanı yeten bir kullanıcı "Onayla"ya basabiliyor; sunucu "stoğu tükendi" hatası dönüyor (`route.ts:298-300`). Puanı yetmeyen kullanıcı ise "Kalan Puan: -350" gibi bir değer görüyor. Sınırsız stokta "Sınırsız" bilgisi hiç gösterilmiyor.
- **Profesyonel öneri:** Kart durumu tek bir türetilmiş değerden gelmeli: `rewardState = 'available' | 'insufficient' | 'soldOut' | 'notYetActive' | 'expired' | 'limitReached'`. Bu değer hem kart CTA'sını hem de pencere içeriğini sürmeli.
  - `insufficient` durumunda pencere yine açılabilir, ama "Hedefe kilitle" moduna geçmeli: ilerleme çubuğu ("%72 · 350 puan kaldı") ve "Puan kazan" CTA'sı (tara / oyna / görevler) gösterilmeli.
  - `soldOut` durumunda "Stoğa girince haber ver" seçeneği sunulmalı.

  Bu bir ders kitabı kalıbı: Duolingo/Starbucks'ta alınamayan ürün, bir hedefe dönüşür.

### 4. Kişi başı limit (`perUserLimit`) eşzamanlı isteklerle aşılabiliyor
- **Önem:** orta · **Kategori:** veri bütünlüğü / yarış koşulu · **Efor:** S
- **Kanıt:** `app/api/gamification/rewards/route.ts:273-285`: `tx.userReward.count(...)` sonra `tx.userReward.create(...)`. Transaction izolasyon seviyesi verilmemiş, dolayısıyla Postgres varsayılanı READ COMMITTED geçerli.
- **Sorun:** Puanı yetecek kadar olan bir kullanıcının aynı anda gönderdiği iki PATCH isteği, sayımda ikisi de `0 < 1` görebiliyor ve "kişi başı 1" kuralı olan bir kampanya ödülünü iki kez alabiliyor. Puan iki kez düşüyor, yani para basılmıyor; ama kıt ödül havuzu adaletsiz dağılıyor. Stok koruması ise doğru (`route.ts:288-300`).
- **Profesyonel öneri:**
  - Limit kontrolü sayıma dayanmayan atomik bir yapıya taşınmalı. Seçenekler: `UserRewardQuota(userId, rewardId, count)` satırında `upsert` + koşullu `updateMany where count < limit`, `pg_advisory_xact_lock(hashtext(userId||rewardId))` ya da `Serializable` izolasyon + tekrar deneme.
  - Ayrıca istemci her talepte `crypto.randomUUID()` ile `Idempotency-Key` göndermeli (`lib/idempotency.ts` hazır ama bu sayfa kullanmıyor).
  - Idempotency önbelleği `userId` ile kapsamlanmalı (`lib/idempotency.ts:37-50` şu an yalnızca `key + route` eşliyor ve kimlik doğrulamadan önce çalışıyor, `route.ts:209-215`).

### 5. Geçerlilik penceresi ve kişi başı limit kullanıcıya görünmüyor; katalog ham `metadata` ve `_count` sızdırıyor
- **Önem:** orta · **Kategori:** UX / API tasarımı · **Efor:** M
- **Kanıt:**
  - `route.ts:119-134`: müşteri için `include: { _count }` + tüm kolonlar (metadata dahil) dönüyor, `select` yok.
  - `route.ts:261-269, 282-283`: kurallar yalnızca talep anında uygulanıyor.
  - `page.tsx:48-57`: `Reward` arayüzünde bu alanlar yok.
- **Sorun:**
  - Süresi dolmuş ya da henüz başlamamış ödül "Talep Et" diye görünüyor; kullanıcı ancak denedikten sonra hata alıyor.
  - Limit dolmuşsa da durum aynı.
  - Kampanyanın ne zaman biteceğini bilmeyen kullanıcı aciliyet hissetmiyor ve FOMO kaldıracı boşa gidiyor.
  - `_count.users` (kaç kişinin aldığı) ve iç metadata da her istemciye gidiyor.
- **Profesyonel öneri:** Katalog yanıtı bir müşteri DTO'suna dönüştürülmeli: `{ id, name, description, media, cost, type, stockState: 'unlimited'|'low'|'out', stockLeft?, window: {from, until}, perUserLimit, userClaimCount, state }`.
  - `userClaimCount` tek bir `groupBy` ile hesaplanmalı (N+1 olmadan).
  - Kartta "2 gün kaldı", "Son 3 adet", "Sende 1/1 — limit doldu" çipleri gösterilmeli.
  - Popülerlik gerçekten kullanılacaksa "Bu hafta 120 kişi aldı" gibi anlamlı ve yuvarlatılmış bir metne çevrilmeli.

### 6. Dil karışıklığı: ~45 sabit Türkçe metin, admin toast öneki ve sabit `tr-TR` tarih biçimi
- **Önem:** orta · **Kategori:** i18n / tutarlılık · **Efor:** M
- **Kanıt:**
  - `messages/en.json:1808-1821`: yalnızca 12 anahtar var.
  - Sayfadaki sabit metinler: `page.tsx:99-106` (tür etiketleri), `346-356`, `426`, `467`, `471`, `506-510`, `558`, `563`, `576`, `624-626`, `645-662`, `669-681`, `695`, `729`, `742`, `751`, `761`, `773`, `781`, `243-248`.
  - `page.tsx:753`: `toLocaleDateString('tr-TR')`.
  - `page.tsx:286, 447`: locale'siz `toLocaleString()`.
  - `page.tsx:35` müşteri sayfasında `@/lib/admin-toast` kullanıyor; bu modül `lib/admin-toast.ts:12-19` içinde "Basarili: " / "Dikkat: " önekini, Türkçe karakter olmadan, ekliyor.
  - `coupon-redeem-card.tsx:20-22, 27, 74` ve modal metinlerinin tamamı da sabit.
- **Sorun:** EN locale seçen kullanıcı "Basarili: 🎁 Reward claimed!", "Talep Et", "Tükendi", "Kupon Detayı" gibi karışık metinler görüyor. TR kullanıcısı da "Basarili" yazımını görüyor. Sayı biçimi tarayıcıya göre değişiyor.
- **Profesyonel öneri:**
  - Müşteri tarafı için öneksiz bir `customer-toast` (ya da doğrudan `sonner`) kullanılmalı.
  - `customerRewards.*` ad alanı tüm metinleri kapsayacak şekilde genişletilmeli (`typeLabels`, durumlar, pencere metinleri, kutlama metinleri). Sunucu hata kodları anahtar olarak dönmeli (`error: 'REWARD_OUT_OF_STOCK'`) ve istemcide çevrilmeli.
  - Tek bir `formatPoints(locale)` / `formatDate(locale)` yardımcısı kullanılmalı.

### 7. Veri akışı israfı ve yanıltıcı ara durumlar: çift istek, ağır `stats` ucu, sıfır puan parlaması, hatanın boş duruma dönüşmesi
- **Önem:** orta · **Kategori:** performans / mimari · **Efor:** M
- **Kanıt:**
  - `page.tsx:139-159`: `fetchUserPoints`, `session?.user?.points` değerine bağlı. `SessionProvider` başlangıç oturumu almıyor (`components/providers.tsx:220`), bu yüzden ilk render'da `undefined`, sonra sayı geliyor ve effect 3 isteği tekrar atıyor.
  - Talepten sonra `updateSession` (`:229`) puanı değiştiriyor; effect 3 istek daha atıyor ve buna `:234-235`'teki 2 açık çağrı ekleniyor.
  - `/api/customer/stats` (`app/api/customer/stats/route.ts:17-71`) yalnızca `points` alanı için 10 sorgu çalıştırıyor (geri bildirimler, rozetler, görevler, kartlar, tüketimler...).
  - `userPoints` başlangıçta 0 (`:130`), bu yüzden puan gelmeden her kart "X eksik" gösteriyor (`:470-472`).
  - `:170-172` ve `:189-191`: `success:false` yanıtı yutuluyor.
- **Sorun:**
  - Sayfa açılışında 6 istek gidiyor; en ağırı iki kez çalışan 10 sorguluk istatistik ucu (Neon soğuk başlangıcında belirgin bir maliyet).
  - Kullanıcı ilk saniyede "her şey kilitli" sanıyor.
  - Modül kapalıyken, DB 503 verdiğinde ya da yetki hatası olduğunda kullanıcı "Henüz ödül yok" görüyor; destek talebi ve güven kaybı yaratan bir yanlış mesaj.
- **Profesyonel öneri:**
  - Tek bir `GET /api/customer/rewards/overview` ucu açılmalı: `{ balance, catalog: RewardDTO[], wallet: UserRewardDTO[] }`. Upstash cache'i yalnızca katalog için (kısa TTL + tag), bakiye no-store.
  - İstemcide halihazırda kurulu `@tanstack/react-query` kullanılmalı (`useQuery(['rewards-overview'])`). Talep `useMutation` ile yapılmalı: iyimser bakiye düşümü + `invalidateQueries`.
  - `updateSession` bağımlılığı kaldırılmalı.
  - Bakiye yüklenene kadar CTA'lar nötr iskelette tutulmalı.
  - `error` durumunda modül kapalıysa ayrı bir ekran, diğer hatalarda "Tekrar dene" kartı gösterilmeli.

### 8. Kutlama modalı yanlış hikâye anlatıyor ve erişilebilir bir dialog değil
- **Önem:** orta · **Kategori:** UX / erişilebilirlik / motion · **Efor:** M
- **Kanıt:**
  - Metinler: `surprise-egg-three-modal-premium.tsx:116` "Sürpriz kutu açıldı", `:187` "Bugünün sürprizi", `:241` "Günün ödülü", `:225` `couponCode ? 'Kupon kodu' : 'Puan bonusu'`, `:289` "Anında erişim" (fiziksel ödülde de), `:302` "Tema, ödüle göre dinamik olarak değişiyor" (aslında lige göre değişiyor).
  - Lig hesabı: `page.tsx:241`, eski closure'daki `session.user.points` değerini kullanıyor (JWT'de girişten beri bayat olabilir; `lib/auth.ts:241, 275`).
  - Dialog semantiği: `:75-81`'de `role="dialog"`, `aria-modal`, odak tuzağı ve Esc yok; arka plan tıklaması yalnızca `phase==='done'` iken çalışıyor.
  - Sonsuz döngüler: `:126-138, 166, 182`.
  - Kopyalama: `:63-67`, `catch` yok.
  - Bileşenin adında "Three" geçiyor ama three.js kullanılmıyor.
- **Sorun:**
  - Kullanıcı bilinçli bir satın alma yaptı; ekranda "sürpriz kutu" ve "günün ödülü" görmek mağaza deneyimini sürpriz kutu sayfasıyla (`/customer/surprise-boxes`) karıştırıyor.
  - Aynı an için üç geri bildirim üst üste geliyor: 10 saniyelik toast (`page.tsx:220-223`), sekme geçişi ve tam ekran modal.
  - Klavye ya da ekran okuyucu kullanan biri modalın arkasındaki sayfada geziniyor.
- **Profesyonel öneri:**
  - Satın almaya özel, ölçülü bir "Ödül pass'i basıldı" anı tasarlanmalı: kart, pass olarak cüzdana kayıyor (shared-layout `layoutId` geçişi, ~600 ms); kod ve QR aynı kartta beliriyor; tek bir birincil CTA: "Kullanmak için göster".
  - Toast kaldırılmalı.
  - Radix `Dialog` temeli kullanılmalı (odak tuzağı, Esc, `aria-labelledby`).
  - `useReducedMotion()` true ise sonsuz döngüler ve blur filtreleri kapatılmalı, yalnızca opaklık geçişi kalmalı.
  - Lig, sunucunun döndürdüğü güncel bakiyeden ya da hiç kullanılmamalı. Satın alma anının ligle bir bağı yok.
  - Bileşenin adı gerçeği yansıtmalı.

### 9. Kopyalama hatası yönetilmiyor; "Ödüllerim" kartları klavyeyle açılamıyor
- **Önem:** düşük · **Kategori:** erişilebilirlik / sağlamlık · **Efor:** S
- **Kanıt:**
  - `page.tsx:199-204`: `navigator.clipboard.writeText(code)` beklenmiyor, `catch` yok; başarı toast'ı her durumda çıkıyor.
  - `page.tsx:531-533`: `Card onClick`, `role` ya da `tabIndex` yok.
  - `page.tsx:582-592`: ikon butonunda `aria-label` yok.
  - `page.tsx:388-390`: mağaza kartı da `div onClick`; yalnızca içteki etkin buton sayesinde klavyeyle ulaşılabiliyor, pasif kartlar erişilemiyor.
  - `page.tsx:389, 470`: opaklık 70 + `text-[10px] text-muted-foreground`, kontrast riski var (doğrulanmadı).
- **Profesyonel öneri:**
  - Ortak bir `useCopyToClipboard()` hook'u yazılmalı: `await` + `try/catch`, başarısızlıkta metni seçip "Kopyalanamadı, uzun basıp kopyalayın" uyarısı gösterilmeli.
  - Kartlar `<button>` ya da `Link` semantiğine çevrilmeli (ya da kartın tamamını kaplayan bir buton deseni kullanılmalı).
  - İkon butonlarına `aria-label={t('copyCode')}` eklenmeli.
  - "Alınamaz" durumu opaklıkla değil bir kilit ikonu + metinle iletilmeli.

### 10. API sözleşme kusurları ve teknik borç
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt ve sorunlar:**
  - `route.ts:80`: `myRewards=true && session` koşulu sağlanmazsa (oturum süresi dolduğunda) istek düşerek **kataloğu** `success:true` ile döndürüyor. İstemci bunu `MyReward[]` sanıp `myReward.reward.id` erişiminde çöküyor (`page.tsx:519`). Proxy API isteklerinde oturum aramıyor (`proxy.ts:105-115`). Doğru davranış 401 olmalı.
  - `page.tsx:226`: `newBalance || ...` kullanılmış; `??` olmalı.
  - `page.tsx:53, 70`: `image` alanı şemada yok; `lib/reward-display-image.ts:5-10` seed ID'lerine sabit kodlu görsel eşlemesi yapıyor. Doğru çözüm `Reward.media` alanı + admin yüklemesi.
  - `route.ts:271, 348-360` (ve quests/spin): `reward_copy` A/B varyantı hesaplanıp olay olarak yazılıyor, ama arayüz hiçbir metin varyantı göstermiyor. Deney verisi anlamsız.
  - `lib/auth.ts:272-275`: `updateSession({ points })` ile istemci JWT puanını istediği değere yazabiliyor. Bugün yalnızca görüntülemeyi etkiliyor (sunucuda `session.user.points` yalnızca `app/api/surprise-box/[id]/open/route.ts:53` içinde başlangıç değeri olarak okunuyor), ama ileride biri bu değere güvenirse ciddi bir açık olur. Puan/seviye `update` tetiklemesinde DB'den yeniden okunmalı.
  - `page.tsx:516`: `AnimatePresence` çıkış animasyonu olmayan çocukları sarmalıyor, yani işlevsiz.
- **Öneri:** Bulgu 7'deki DTO/overview ucuyla birlikte toplu bir temizlik yapılmalı.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Göster ve okut ödül pass'i (Starbucks / Apple Wallet):** Kod için QR/barkod, parlaklık artırma, "Wallet'a ekle" (PassKit / Google Wallet), son kullanma geri sayımı, kullanıldığında anlık güncelleme.
2. **Hedefe kilitleme ve ilerleme (Starbucks "Stars to reward", Duolingo hedefleri):** Bir ödülü "hedef" olarak işaretlemek; hero'da "Kahve'ye 120 puan kaldı" ilerleme halkası ve puan kazandıran aksiyonlara kısa yollar.
3. **Katalog keşfi:** Kategori çipleri (içecek / indirim / deneyim / bağış), "Alabileceklerin" filtresi, sıralama (en yakın hedef, popüler, yeni, bitmek üzere) ve arama.
4. **Kıtlık ve zaman sinyalleri:** "Son 3 adet", "2 gün kaldı", "Sezon ödülü", kişi başı limit göstergesi; stok bitince "haber ver" aboneliği.
5. **Puan defteri (Revolut/Monzo işlem listesi):** Kazanım ve harcamaların tarihli dökümü, puanın son kullanma politikası, "bu ay X puan kazandın" özeti. Hero puanına dokununca açılmalı.
6. **Ödüllerim yaşam döngüsü:** Aktif / kullanılmış / süresi dolmuş filtreleri, kullanım yeri ve zamanı, fiziksel ödül için kargo takibi, bir ödülü arkadaşa hediye etme (referral ile sinerji).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Puanım neye yeter, bir sonraki ödülüme ne kadar kaldı, aldığımı nasıl kullanırım?" sorularının üçü de tek bakışta cevaplanmalı. Sayfa bir **Ödül Cüzdanı**na dönüşmeli: üstte bakiye ve hedef, ortada keşfedilebilir katalog, altta kullanıma hazır pass'ler.

**Yerleşim (mobil önce):**
1. **Bakiye + hedef kartı (hero):**
   - Büyük bakiye (sunucudan, locale biçimli).
   - Seçili hedef ödül için dairesel ilerleme halkası ("%72 · 350 puan kaldı").
   - Hızlı aksiyon çipleri: Tara · Oyna · Görevler. Puan nereden gelir, bir dokunuşla görünmeli.
   - Bakiyeye dokunmak puan defteri sheet'ini açar.
2. **"Kullanıma hazır" şeridi:** Aktif pass'ler yatay kaydırmalı kartlar olarak gösterilir; dokununca tam ekran pass açılır (QR, kod, kalan süre, nerede geçerli).
3. **Katalog:** Kategori çipleri + "Alabileceklerim" anahtarı + sıralama. Kart durumları tek kaynaktan gelir (`available / insufficient / soldOut / expired / limitReached / upcoming`). Alınamayan kart soluk görünmek yerine bir kilit ve ilerleme çubuğuyla gösterilir.
4. **Ödül detay sheet'i (mobilde alttan açılan sheet, masaüstünde dialog):** Görsel, açıklama, geçerlilik, nerede kullanılır, limit, stok. Birincil CTA duruma göre değişir: "Al · 500 puan" / "Hedef yap" / "Haber ver".
5. **Promosyon kodu:** Sayfanın altında, "Kodun mu var?" açılır alanında; sonucu doğrudan cüzdana düşen bir akış (Bulgu 2).

**Motion / 3D (yerinde ve ölçülü):**
- Satın alma anı: katalog kartı `layoutId` ile pass'e dönüşür ve "Kullanıma hazır" şeridine uçar. Hafif bir parıltı ve yalnızca bir kez çalan bir konfeti patlaması (≤ 900 ms) yeterli.
- Mevcut tam ekran sürpriz modalı mağaza için kaldırılmalı; o dil `/customer/surprise-boxes`'a ait. 3B kutu deneyimi (`72121c4` imza sürpriz kutusu) yalnızca gerçekten bir sürpriz olduğunda kullanılmalı.
- Hedef halkasında puan artışı yaylı bir sayaçla (`useSpring`) gösterilebilir.
- `prefers-reduced-motion` durumunda tüm uçuşlar yerine anlık geçiş + opaklık kullanılmalı. Sonsuz döngü olmamalı.
- Katalog kartlarının giriş "stagger"ı ilk 8 kartla sınırlı kalmalı (şimdiki 10 makul).

**Veri / API değişiklikleri:**
- **Şema:**
  - `Reward`: `fulfillment`, `dealerId?`, `media`, `category`, `validFrom/validUntil` (metadata'dan kolona taşınmalı), `perUserLimit`.
  - `UserReward`: `status`, `expiresAt`, `redeemedAt`, `redeemedDealerId`, `redeemedByStaffId`, `shipping Json?`.
  - Ayrıca `RewardWatch(userId, rewardId)` (haber ver) ve `UserRewardGoal(userId, rewardId)` tabloları.
- **Uçlar:**
  - `GET /api/customer/rewards/overview`: bakiye + katalog DTO (kullanıcıya özel durum dahil) + cüzdan. Katalog Upstash'te tag'li önbellekte tutulur.
  - `POST /api/customer/rewards/[id]/claim`: Idempotency-Key zorunlu, kullanıcı kapsamlı; limit atomik kontrol edilir.
  - `GET /api/customer/rewards/pass/[userRewardId]`: kısa ömürlü imzalı QR yükü.
  - `POST /api/dealer/rewards/redeem`: atomik tek kullanım + audit + müşteriye bildirim.
  - `GET /api/customer/points/ledger`: mevcut `points_credited` olaylarından ve talep audit kayıtlarından türetilir.
- **İstemci:**
  - Sayfa küçük bileşenlere bölünmeli: `RewardsHero`, `ReadyPassesRail`, `RewardCatalog`, `RewardDetailSheet`, `PassViewer`, `PromoCodeDisclosure`.
  - Veri React Query üzerinden; sekme ve filtre durumu URL'de (`?tab=&cat=`).
  - Tüm metinler `customerRewards.*` altında.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/shop` (Avatar/Çerçeve Dükkanı):** O da puan harcatan ikinci bir "Mağaza" (`app/customer/shop/page.tsx:18-24`, `customerShop.title`). Kenar çubuğunda aynı "Ödüller & Mağaza" grubunda iki ayrı mağaza duruyor (`components/dashboard/sidebar.tsx:303, 307`) ve iki farklı uygulama kalıbı kullanıyorlar (server component vs. client fetch). **Öneri:** Tek bir "Puan Harca" merkezi kurulmalı: `/customer/rewards` sekmeleri **Ödüller · Kozmetik · Cüzdanım** olur ve bakiye hero'su ortak bir bileşene taşınır. Shop ayrı rota olarak kalabilir ama aynı hero'yu ve aynı `overview` bakiye kaynağını kullanmalı.
- **`/customer/surprise-boxes`:** Kutlama dili (sürpriz kutu, lig teması) bu sayfaya ait. Ödül mağazası bu dili ödünç almamalı (Bulgu 8). Birleştirme gerekmiyor; dil ayrımı yeterli.
- **Müşteri ana panosu (`components/customer/dashboard/customer-dashboard.tsx:171, 1260-1279`):** Aynı katalog ucunu çekip "Al / Kilitli" gösteriyor. `/customer/rewards`'a link veriyor ama ödülü açmıyor. Yeni yapıda `?reward=<id>` derin bağlantısı detay sheet'ini doğrudan açmalı; pano da aynı overview DTO'sunu (ya da hafif bir `top-3` varyantını) kullanmalı.
- **`/customer/progress-hub`:** Puan/ilerleme özeti gösteriyor ve buraya link veriyor (`app/customer/progress-hub/page.tsx:242`). "Hedef ödül" kavramı iki sayfada ortak bir bileşen olarak kullanılmalı.
- **Kaldırma önerisi yok.** Bu sayfa puan ekonomisinin "harcama" ucu, yani zorunlu bir sayfa. Ancak teslim zinciri (Bulgu 1) kurulmadan genişletilmemeli.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı. Kod değiştirilmedi, veritabanına dokunulmadı. Her iddia çürütülmeye çalışıldı.

### 1. Ödül kodu hiçbir yerde kullanılamıyor/doğrulanamıyor; puan karşılıksız düşüyor — **DOĞRULANDI**

**Kanıt:**
- `app/api/gamification/rewards/route.ts:303-314`: Aynı transaction içinde önce `debitPoints` ile puan düşülüyor, sonra `generateCouponCode` (`route.ts:19-26`, `KPN-/DJT-/VIP-/ODL-` öneki) ile üretilen kod `userReward.create` ile yazılıyor.
- `UserReward.claimedAt` alanına (`prisma/schema.prisma:704`) yazan hiçbir kod yok. `app`, `lib`, `components` ve `scripts` altında (`generated-prisma-client` ve migration'lar hariç) `claimedAt` yalnızca okunuyor: `rewards/route.ts:106-107`, `user/data-export/route.ts:39,61`, `page.tsx:63`. `userReward.update*` çağrısı yok, raw SQL ile güncelleme de yok.
- `isUsed` alanı `!!ur.claimedAt` olarak türetiliyor (`route.ts:107`), bu yüzden her zaman `false`. Sonuç olarak `page.tsx:296, 318-319`'daki "Kullanılabilir" sayacı yalnızca artıyor. `page.tsx:555, 714`'teki "Kullanıldı" dalı ise ölü kod.
- `UserReward`'ı koda göre arayan bir uç yok: `app/api/dealer/*` içinde redeem/verify ucu bulunmuyor, `app/api/admin/*` tarafında da yok. Admin ödül sayfası yalnızca `_count.users` ("X kez talep edildi", `app/admin/rewards/page.tsx:231, 528`) gösteriyor. Kodların listesi ya da teslim kuyruğu yok.
- `Reward` modelinde (`schema.prisma:680-697`) `dealerId` veya teslim/fulfillment alanı yok. Bu yüzden "ilgili işletme" (`page.tsx:773`) tanımsız.

**Yeniden üretim:** 500 puanı olan müşteri, maliyeti 500 olan bir ödülü talep eder. Bakiye 0'a iner ve `KPN-AB12CD34-XYZ1` kodu verilir. Müşteri kodu bir işletmeye gösterir. Ne bayi panelinde ne de admin panelinde bu kodu sorgulayacak ya da "kullanıldı" diye işaretleyecek bir ekran veya API vardır. İşletme kodu doğrulayamaz ve ödülü ya hiç vermez ya da yalnızca göz kararıyla verir. Kod hiçbir zaman tüketilmediği için aynı kod başka işletmelerde veya aynı işletmede tekrar tekrar gösterilebilir. Bunu engelleyen tek kayıt `claimedAt` alanıdır ve bu alan hiç yazılmıyor.

**Not / şiddet:** Muhasebe açısından puan "kaybolmuyor": `debitPoints` ve audit kaydı (`route.ts:331-346`) tutarlı. Ancak harcama karşılığında teslim edilebilir bir hak doğmuyor. Bu durum puan ekonomisinin harcama ucunun ürün düzeyinde teslim edilmemiş olması anlamına geliyor, klasik bir güvenlik açığı değil. Tek çıkış yolu, adminin ödülü platform dışında elle teslim etmesi (`AuditLog CLAIM_REWARD` / bildirim üzerinden). Bunun için de bir arayüz yok. Raporun Bulgu 1'indeki çözüm yönü doğru: `UserReward.status` + `redeemedDealerId/StaffId`, atomik tek kullanım yapan `POST /api/dealer/rewards/redeem` (koşullu `updateMany where { code, claimedAt: null }`) ve bir admin teslim kuyruğu.

### 2. Promosyon kuponu kullanımı karşılıksız bir çıkmaz sokak — **DOĞRULANDI** (şiddet: YÜKSEK değil, ORTA; güvenlik değil ürün sorunu)

**Kanıt:**
- `app/api/customer/redeem-coupon/route.ts:71-110`: Transaction yalnızca şunları yapıyor: `couponRedemption.create`, guarded `coupon.updateMany` ile `usedCount++` ve `analyticsEvent` (`coupon_redeemed`). Kullanıcıya hiçbir hak, bakiye, puan ya da indirim kaydı yazılmıyor.
- `couponRedemption` yalnızca bu route'ta okunuyor (`route.ts:59`, ön kontrol). `app`, `lib` ve `components` genelinde başka bir okuyucusu yok. `prisma.coupon` ise yalnızca `app/api/admin/coupons/route.ts` (CRUD) ve bu route'ta kullanılıyor. Sepet/checkout/sipariş akışında `Coupon` ya da `CouponRedemption` tüketen bir kod yok.
- `Coupon` modelinde (`schema.prisma:1470-1485`) `percentage/fixed` + `minPurchase` alanları bir satın alma tutarı varsayıyor. Modelde `dealerId` de yok, yani kuponun hangi işletmede geçerli olduğu belirsiz.
- Kullanıcıya gösterilen mesaj: "%X indirim kuponunuz tanımlandı." (`route.ts:128-131`) ve `coupon-redeem-card.tsx:40, 74` "hesabınıza tanımlandı". "Tanımlanan" kupon müşteri arayüzünde hiçbir yerde tekrar listelenmiyor. `applied` yalnızca yerel React state'inde tutuluyor, sayfa yenilenince kayboluyor.
- `assertModuleEnabled` kapısı bu uçta gerçekten yok (`route.ts:26-34`). Buna karşılık `rewards/route.ts:72, 152, 207` kapılı.

**Yeniden üretim:** Admin `/api/admin/coupons` ile `YAZ2026` (%20, maxUses 100) oluşturur. Müşteri `/customer/rewards`'ta kodu girer ve "%20 indirim kuponunuz tanımlandı" mesajını görür. `usedCount` 1 artar. Sayfa yenilendiğinde kupon hiçbir yerde görünmez ve hiçbir işletme ya da ödeme akışı bu indirimi uygulayamaz. 100 müşteri sonra kupon "limit dolmuş" hatası verir ve global limit karşılıksız tüketilmiş olur. Rewards modülü admin tarafından kapatıldığında da bu uç çalışmaya devam eder.

**Not / şiddet:** Kullanıcıdan puan ya da para alınmıyor. Yanıltıcı başarı mesajı ve tüketilen global limit gerçek, ama maddi kayıp yok. Modül kapısının olmaması düşük etkili (kapalı modülde yalnızca sayaç tüketir). Önerilen yön: kuponun ne olduğuna ürün kararıyla karar verilmeli. İki seçenek var:
- (a) Kupon, `UserReward` ile aynı "cüzdan / geçiş kartı" altyapısına bir hak olarak yazılmalı (`dealerId`, `expiresAt`, bayi tarafında atomik redeem).
- (b) Sepet yoksa `percentage/fixed` yerine doğrudan puan veya ödül veren bir "promosyon kodu" tipine dönüştürülmeli. Bu durumda puan ekonomisi kurallarına uyulmalı: atomik tek seferlik kredi + `points_credited` izi.

İki durumda da uca `assertModuleEnabled('rewards')` eklenmeli.
