# /admin/coupons

**Amaç:** Platform operatörünün platform genelinde geçerli indirim kuponları (yüzde / sabit) oluşturması, kullanım sayısını görmesi ve kuponları pasifleştirmesi. Müşteri tarafında `/customer/rewards` içindeki `CouponRedeemCard` (components/rewards/coupon-redeem-card.tsx) üzerinden kod girilerek kullanılır.

**Genel puan:** 4.3 / 10

**Karar:** **Yeniden tasarla.** Sayfanın CRUD iskeleti temiz ve API tarafı yetki/doğrulama açısından düzgün. Ancak asıl sorun bu sayfanın ürettiği şeyin hiçbir yerde bir değere dönüşmemesi. Kupon "kullanıldığında" sayaç artıyor ve müşteriye "tanımlandı" deniyor, fakat indirim hiçbir akışta uygulanmıyor ve `minPurchase` hiçbir yerde kontrol edilmiyor. Bunun yanında sistemde birbirinden habersiz üç ayrı "kupon" kavramı var: `Coupon` tablosu, `UserReward.code` (KPN-…) ve sürpriz kutunun serbest metin `couponCode` alanı. Önce domain modeli netleşmeli, ardından sayfa tam bir kupon yönetim aracı olarak yeniden kurulmalı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Oluşturma ve pasifleştirme çalışıyor. Ancak kuponun uçtan uca bir etkisi yok, düzenleme ve yeniden aktifleştirme yok, liste hatası boş liste gibi görünüyor. |
| UX | 4/10 | Tek sütunlu form ve düz bir liste var. Durum (süresi dolmuş / limiti dolmuş) gösterilmiyor, arama ve filtre yok, onay için native `confirm()` kullanılıyor, sabit indirimde birim belirtilmiyor. |
| Görsel | 5/10 | Ortak `AdminPremiumHero` ve shadcn kartları tutarlı. Liste ise tablo değil, metin satırı. Rozet, durum rengi ve KPI yok. |
| Mimari | 4/10 | İstemci bileşeni ham `fetch` ile `r.ok` kontrolü yapmıyor. Audit log transaction dışında. `lib/validations.ts` içinde çelişen ölü bir şema var. `CouponRedemption` ile `Coupon` arasında FK ilişkisi yok. |
| Performans | 7/10 | Tek sorgu atılıyor, `take: 300` sınırı var ve index'ler uygun. Sayfalama olmadığı için 300 üstü kayıt sessizce kesiliyor. |
| Erişilebilirlik + mobil | 4/10 | `Label` öğeleri input'lara bağlı değil. İkon-only buton `aria-label` taşımıyor. Native `select` kullanılıyor. Mobilde grid tek sütuna düşüyor ama sayfa çift padding alıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa kabuğu + `AdminPremiumHero` başlık/açıklama | ÇALIŞIYOR | app/admin/coupons/page.tsx:97-101 | Hero'nun `chips` / `actions` / `aside` slotları (components/admin/admin-premium-hero.tsx:137-148) kullanılmıyor. KPI gösterilmiyor. |
| 2 | Yetki: sayfa (proxy) + API (`requireAuth(['ADMIN'])`) | ÇALIŞIYOR | proxy.ts:51,79,124 · app/api/admin/coupons/route.ts:26,46,97 | GET, POST ve DELETE uçlarının üçü de ADMIN ister. Token-replay kontrolü de var (lib/api-auth.ts:64-78). |
| 3 | Kod alanı | KISMİ | page.tsx:113-114 | İstemcide regex/uzunluk kontrolü yok. Sunucu büyük harfe çeviriyor (route.ts:63) ama input'ta `uppercase` görünümü yok (müşteri kartında var: coupon-redeem-card.tsx:64). "Rastgele kod üret" butonu yok. |
| 4 | Tür seçimi (Yüzde / Sabit) | ÇALIŞIYOR | page.tsx:117-125 | Native `<select>` kullanılıyor, shadcn `Select` değil. Label'a bağlı değil. |
| 5 | Değer alanı | KISMİ | page.tsx:128-129 · route.ts:57-62 | %>100 kontrolü yalnızca sunucuda yapılıyor. "Sabit" türünde birim (TL mi, puan mı) belirsiz. Müşteri mesajı bile "puanlık/tutarlık" diyor (app/api/customer/redeem-coupon/route.ts:131). |
| 6 | Min. tutar | SAHTE | page.tsx:132-133 · redeem-coupon/route.ts:126 | Değer kaydediliyor ve müşteriye geri dönülüyor ama hiçbir akışta kontrol edilmiyor. Grep'te `minPurchase` yalnızca bu iki rotada ve ölü şemada geçiyor. |
| 7 | Maks. kullanım | KISMİ | page.tsx:64,136-137 · route.ts:20 | `0` kabul ediliyor ve hiç kullanılamayan bir kupon oluşuyor. `1.5` girilirse zod'un İngilizce "Expected integer, received float" mesajı gösteriliyor. |
| 8 | Son kullanım tarihi | KISMİ | page.tsx:65,140-141 · route.ts:21 | Geçmiş bir tarih kabul ediliyor, yani doğuştan süresi dolmuş kupon oluşturulabiliyor. Başlangıç tarihi (`startsAt`) yok. |
| 9 | Oluştur butonu + kaydediliyor durumu | ÇALIŞIYOR | page.tsx:144-147,55,80 | Enter ile gönderme yok (form elemanı yok). |
| 10 | İstemci doğrulaması | KISMİ | page.tsx:49-54 | Yalnızca "kod boş mu" ve "değer > 0 mı" kontrol ediliyor. Alan bazlı hata gösterimi yok, tek bir toast çıkıyor. |
| 11 | Sunucu doğrulaması + hata toast'ı | KISMİ | route.ts:15-23,49-55 · page.tsx:79 | Özel mesaj yalnızca regex için tanımlı. `min(3)`, `max(40)`, `positive`, `int`, `datetime` hataları İngilizce zod mesajı olarak toast'a düşüyor. |
| 12 | Tekrarlanan kod kontrolü | KISMİ | route.ts:64-67 | findUnique ile create arasında yarış var. Eşzamanlı iki istekte ikincisi P2002 alıyor ve 409 yerine 500 "Kupon oluşturulamadı" dönüyor. |
| 13 | Audit log (oluşturma / pasifleştirme) | KISMİ | route.ts:79-88,108-117 | Transaction dışında. `newData` alanında `minPurchase`, `maxUses` ve `expiresAt` yok. Zaten pasif olan bir kupon tekrar pasifleştirilince yeni audit kaydı yazılıyor. |
| 14 | Liste yükleme | ÇALIŞIYOR | page.tsx:36-46 · route.ts:25-43 | `createdAt desc`, `take: 300`. |
| 15 | Liste hata durumu | BOZUK | page.tsx:38-40 | `r.ok` kontrol edilmiyor. 401/403/500 yanıtı `{error}` döndüğü için `Array.isArray` false oluyor, liste `[]` olarak ayarlanıyor ve ekranda "Henüz kupon yok." yazıyor. `catch` yalnızca ağ hatasında çalışıyor. |
| 16 | Yükleniyor durumu | KISMİ | page.tsx:156-157 | Skeleton yok, yalnızca "Yükleniyor..." metni var. Oluşturma/pasifleştirme sonrası yenilemede gösterge yok. |
| 17 | Boş durum | ÇALIŞIYOR | page.tsx:158-159 | Hata durumuyla ayırt edilemiyor (bkz. #15). CTA yok. |
| 18 | Kupon satırı: kod, değer, PASİF etiketi | KISMİ | page.tsx:168-173 | Süresi dolmuş veya limiti dolmuş kuponlar "aktif" görünüyor. Durum türetilmiyor. Rozet yerine düz metin " · PASİF" kullanılıyor. |
| 19 | Kullanım sayacı / min / son tarih | ÇALIŞIYOR | page.tsx:175-179 | Oluşturulma tarihi, oluşturan kişi ve kullanım yüzdesi (progress) gösterilmiyor. |
| 20 | Pasifleştir butonu | ÇALIŞIYOR | page.tsx:181-185 · route.ts:96-123 | İkon-only buton `aria-label` / tooltip taşımıyor. HTTP fiili `DELETE`, ama anlamı soft-deactivate. |
| 21 | Onay diyaloğu | KISMİ | page.tsx:84 | Native `confirm()` kullanılıyor. Projede `components/ui/alert-dialog.tsx` var ama admin sayfalarında yalnızca 1 dosya kullanıyor, 9 dosya native `confirm` kullanıyor. Tutarsız. |
| 22 | Yeniden aktifleştirme | EKSİK | route.ts:107 | Yalnızca `isActive:false` yönü var. Yanlışlıkla pasifleştirilen kupon geri alınamıyor. |
| 23 | Düzenleme (limit/tarih uzatma) | EKSİK | route.ts (PATCH yok) | Yazım hatası veya süre uzatma için tek yol yeni kod oluşturmak. |
| 24 | Arama / durum filtresi | EKSİK | route.ts:30-32 | API `?isActive=` filtresini destekliyor ama UI kullanmıyor. Kodla arama yok. |
| 25 | Sayfalama / toplam sayı | EKSİK | route.ts:36 | 300'den sonrası sessizce kesiliyor. Toplam sayı gösterilmiyor. |
| 26 | Kullanım detayı (kim, ne zaman) | EKSİK | prisma/schema.prisma:1490-1498 | `CouponRedemption` verisi mevcut ama admin hiçbir yerde göremiyor. |
| 27 | Kuponun gerçek etkisi (indirim uygulanması) | SAHTE | redeem-coupon/route.ts:71-117 · grep `couponRedemption` | Kullanım yalnızca `usedCount` artırıyor ve bir `CouponRedemption` ile bir `analyticsEvent` yazıyor. Hiçbir checkout, shop, ödül veya bayi akışı bu kaydı okumuyor. Müşteriye "hesabınıza tanımlandı" deniyor (coupon-redeem-card.tsx:74). |
| 28 | Kapsam / hedefleme (işletme, segment, kullanıcı) | EKSİK | schema.prisma:1470-1485 | `Coupon` modelinde `businessId`, `dealerId` veya segment yok. Tamamen global. |
| 29 | Kullanıcı başına limit ayarı | EKSİK | schema.prisma:1496 | `@@unique([userId, couponId])` ile her kullanıcı için sabit 1 kullanım. Yapılandırılamıyor. |
| 30 | Toplu kod üretimi (tek kullanımlık kodlar) | EKSİK | — | Kampanya ve influencer dağıtımı için gerekli. |
| 31 | Kodu kopyala | EKSİK | page.tsx:168 | — |
| 32 | CSV dışa aktarma | EKSİK | — | — |
| 33 | i18n | KISMİ | page.tsx (tüm metinler sabit TR) · components/dashboard/sidebar.tsx:169 | Menü etiketi i18n anahtarından geliyor (`messages/tr.json:2473`), sayfa ise sabit Türkçe. Toast öneki ASCII: "Basarili: " (lib/admin-toast.ts:17). |
| 34 | Mobil yerleşim | ÇALIŞIYOR | page.tsx:111,165 | `sm:grid-cols-2` ve `flex-wrap` var. Ama layout zaten yatay padding verirken (app/admin/layout.tsx:33) sayfa `p-6` ekliyor (page.tsx:96). Dar ekranda içerik gereksiz daralıyor. |
| 35 | Erişilebilirlik (label–input bağı, aria) | KISMİ | page.tsx:113-141,182 | `Label` öğelerinde `htmlFor`, input'larda `id` yok. Ekran okuyucu alan adını okuyamıyor. Pasifleştir butonu isimsiz. |
| 36 | Azaltılmış hareket | ÇALIŞIYOR | components/admin/admin-premium-hero.tsx:9,35 | Sayfada hareket yalnızca hero'da var ve `useReducedMotion` ile korunuyor. |

**Durum özeti:** 10 ÇALIŞIYOR · 13 KISMİ · 1 BOZUK · 2 SAHTE · 10 EKSİK (toplam 36)

---

## Bulgular

### 1. Kupon kullanımı hiçbir değer üretmiyor; müşteri yanıltılıyor
- **Önem:** yüksek · **Kategori:** ürün / veri bütünlüğü · **Efor:** L
- **Kanıt:**
  - app/api/customer/redeem-coupon/route.ts:71-117 (yalnızca `couponRedemption.create`, `usedCount++` ve `analyticsEvent` var)
  - components/rewards/coupon-redeem-card.tsx:40,74 ("✓ {kod} kuponu hesabınıza tanımlandı.")
  - `couponRedemption` için grep sonucu yalnızca redeem rotası. Hiçbir okuyucu yok.
- **Sorun:** Admin bu sayfada "%20 indirim" kuponu oluşturuyor. Müşteri kodu giriyor, sayaç artıyor ve müşteriye kuponun tanımlandığı söyleniyor. Ancak bu indirimi uygulayan bir checkout, shop, bayi POS veya ödül akışı yok. `minPurchase` da hiçbir yerde kontrol edilmiyor. Admin açısından sayfa "kupon dağıtıyorum" yanılsaması yaratıyor. Müşteri açısından ise kullanılmış ama hiçbir şey vermeyen bir kod ortaya çıkıyor. Bu durum güven kaybına yol açar ve destek yükü oluşturur.
- **Profesyonel öneri:** Önce kuponun ne olduğuna karar verilmeli. Qratex'te gerçek para ödeme akışı yok, değer ya puan ekonomisinden ya da işletmede (bayi tarafında) kullanılan tekliften geliyor. İki tutarlı yol var:
  1. **"Cüzdana eklenen teklif" modeli (önerilen).** Redeem işlemi bir `CustomerOffer` / `UserReward` kaydı oluşturur. Müşteri bunu "Kuponlarım" listesinde görür. Bayi QR veya kod okuttuğunda kayıt `USED` durumuna geçer ve `minPurchase` bayi tarafında doğrulanır. Böylece `/customer/remedy` ve dealer win-back teklifleriyle (lib/dealer/win-back-offers.ts) aynı tüketim hattı kullanılır.
  2. **Puan modeli.** "Sabit" tür puan olarak tanımlanır ve redeem işlemi puan kredisi verir. Bu durumda projedeki puan ekonomisi kuralları zorunlu olur: atomik tek seferlik kredi, `points_credited` görünürlüğü ve escrow/net-sıfır. Ayrıca "yüzde" türü anlamsızlaşır ve kaldırılmalıdır.

  Karar verilene kadar müşteri tarafındaki "hesabınıza tanımlandı" metni ve `minPurchase` alanı kaldırılmalıdır.

### 2. Üç ayrı ve birbirinden habersiz "kupon" kavramı
- **Önem:** yüksek · **Kategori:** mimari / bilgi mimarisi · **Efor:** L
- **Kanıt:**
  - `Coupon` tablosu (schema.prisma:1470)
  - Ödül türü `coupon` ile üretilen `KPN-XXXX-XXXX` kodları (app/api/gamification/rewards/route.ts:19-25, 257-312)
  - Sürpriz kutunun serbest metin `couponCode` alanı (app/api/admin/surprise-box/send/route.ts:11,92; doğrulama yalnızca `max(50)`)
- **Sorun:** Admin, sürpriz kutuya `/admin/coupons` sayfasında hiç oluşturulmamış bir kod yazabiliyor. Müşteri bu kodu `CouponRedeemCard`'a girince "Kupon bulunamadı" alıyor. Ödülden gelen KPN kodları da aynı karta girildiğinde reddediliyor. Kullanıcı açısından hepsi "kupon".
- **Profesyonel öneri:** Tek bir "kod defteri" (code ledger) kavramı kurulmalı. Sürpriz kutu formunda serbest metin yerine `Coupon` tablosundan seçim yapılan bir combobox olmalı ve sunucu `couponCode` alanının var olduğunu ve aktif olduğunu doğrulamalı. Ödül KPN kodları ya bu deftere yazılmalı ya da müşteri UI'da açıkça "ödül kodu" olarak ayrıştırılmalı. Bkz. "Çakışmalar".

### 3. Liste hatası "Henüz kupon yok." olarak gizleniyor
- **Önem:** orta · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** page.tsx:37-40 (`r.json()` öncesinde `r.ok` kontrolü yok) · route.ts:41 (500 yanıtında `{error}` dönüyor)
- **Sorun:** Neon kesintisi, oturum düşmesi veya token-replay 403 durumunda operatör "hiç kupon yok" sanıyor ve aynı kodu yeniden oluşturmaya çalışıyor.
- **Profesyonel öneri:** Yanıtlar `if (!res.ok) throw new Error(data.error)` ile ele alınmalı. Ayrı bir `error` state'i tutulmalı ve "Yeniden dene" butonlu bir hata kartı gösterilmeli. Daha iyisi, projedeki ortak SWR/fetcher desenine geçmektir (bkz. Bulgu 9).

### 4. Durum türetilmiyor: süresi dolmuş veya limiti dolmuş kuponlar "aktif" görünüyor
- **Önem:** orta · **Kategori:** UX / doğruluk · **Efor:** S
- **Kanıt:** page.tsx:172 (yalnızca `!c.isActive` için "PASİF") · redeem-coupon/route.ts:53,82 (sunucu süre ve limiti ayrı reddediyor)
- **Sorun:** Admin listede aktif görünen bir kuponun müşteride "süresi dolmuş" hatası verdiğini göremiyor.
- **Profesyonel öneri:** Tek bir `deriveCouponStatus(c, now)` yardımcısı yazılmalı: `active | scheduled | expired | exhausted | inactive`. Bu yardımcı hem API yanıtında (`status` alanı) hem de UI rozetinde kullanılmalı. Liste varsayılan olarak "Kullanılabilir" filtresiyle açılmalı.

### 5. Doğrulama boşlukları: 0 kullanım, geçmiş tarih, İngilizce hata mesajları, ölü şema
- **Önem:** orta · **Kategori:** doğrulama / dil · **Efor:** S
- **Kanıt:**
  - route.ts:16-21 (`maxUses.min(-1)` 0'a izin veriyor; `expiresAt` için gelecek kontrolü yok; `min(3)`/`max(40)`/`int`/`datetime` için TR mesaj yok)
  - page.tsx:79 (sunucu mesajı doğrudan toast'a basılıyor)
  - lib/validations.ts:227-238 (`createCouponSchema` hiçbir yerde kullanılmıyor ve kurallar çelişiyor: `max(20)`, regex yalnızca `A-Z0-9`)
- **Sorun:** Doğuştan kullanılamayan kuponlar oluşturulabiliyor. TR arayüzde "String must contain at least 3 character(s)" gibi İngilizce mesajlar görünüyor. İki "doğru" şema bulunması gelecekte yanlış olanın kullanılmasına davetiye çıkarıyor.
- **Profesyonel öneri:** Tek bir paylaşılan şema `lib/validations/coupon.ts` içine taşınmalı ve hem istemci (react-hook-form + zodResolver) hem sunucu tarafından kullanılmalı. Şema şunları içermeli: `maxUses: int().min(1).nullable()` (null = sınırsız; -1 sentinel'i UI'dan kaldırılır), `expiresAt` için `refine(d => d > now)`, `percentage` için `max(100)` (`superRefine` ile), tüm mesajlar Türkçe. Ölü şema silinmeli.

### 6. Oluşturma işleminde yarış ve transaction dışı audit
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** route.ts:64-78 (önce kontrol, sonra yaz) · route.ts:79-88 (audit ayrı sorgu) · route.ts:90-93 (tüm hatalar 500)
- **Sorun:**
  - Aynı kodla eşzamanlı iki POST gelirse ikincisi P2002 alıyor ve 500 dönüyor.
  - Kupon oluşturulduktan sonra audit yazımı başarısız olursa istemci "oluşturulamadı" görüyor. Operatör tekrar denediğinde "Bu kod zaten var" (409) alıyor ve audit izi olmayan bir kupon kalıyor.
  - Pasifleştirmede de güncelleme ile audit ayrı sorgular.
- **Profesyonel öneri:** `prisma.$transaction([create, auditLog.create])` kullanılmalı. P2002 yakalanıp 409'a çevrilmeli (böylece ön-kontrol yalnızca UX içindir). DELETE işlemi `updateMany({where:{id,isActive:true}})` ile idempotent yapılmalı. `count===0` ise audit yazılmamalı. Audit `newData` alanına tüm alanlar eklenmeli.

### 7. Yaşam döngüsü eksik: düzenleme ve yeniden aktifleştirme yok
- **Önem:** orta · **Kategori:** işlevsellik · **Efor:** M
- **Kanıt:** route.ts yalnızca GET/POST/DELETE içeriyor · page.tsx:181 (buton yalnızca aktif kuponda görünüyor)
- **Sorun:** Süre uzatma, limit artırma veya yanlışlıkla pasifleştirilmiş bir kuponu geri açma imkânı yok. Bu standart bir operasyon ihtiyacı.
- **Profesyonel öneri:**
  - `PATCH /api/admin/coupons/[id]` eklenmeli. Düzenlenebilir alanlar `maxUses` (mevcut `usedCount` altına inemez), `expiresAt`, `isActive` ve `minPurchase` olmalı. `code`, `type` ve `value` kullanım başladıktan sonra kilitlenmeli; kullanılmış bir kuponun değerini değiştirmek geçmişi bozar.
  - Kaynak yolu `[id]` segmentine taşınmalı (`DELETE ?id=` yerine).
  - Her değişiklik `oldData`/`newData` farkıyla audit'e yazılmalı.

### 8. Kullanım görünürlüğü yok
- **Önem:** orta · **Kategori:** gözlemlenebilirlik · **Efor:** M
- **Kanıt:** schema.prisma:1490-1498 (`CouponRedemption`, `Coupon` ile `@relation` kurmuyor) · admin tarafında bu tabloyu okuyan uç yok
- **Sorun:** "Bu kodu kim kullandı?", "Kampanya hangi günlerde patladı?" ve "Kötüye kullanım var mı?" soruları cevaplanamıyor. Kodlar herkese açık olduğu için tek kullanıcı limitine rağmen çoklu hesap suistimali görünmez kalıyor (/admin/fraud-prevention ile bağlantı yok).
- **Profesyonel öneri:**
  - `CouponRedemption.coupon @relation` ve `user @relation` eklenmeli (yalnızca ekleme yapan bir migration; yine de canlı Neon olduğu için dikkatli planlanmalı).
  - `GET /api/admin/coupons/[id]/redemptions?cursor=` ucu yazılmalı.
  - Satıra tıklandığında açılan bir detay paneli (Sheet) eklenmeli. Panelde günlük kullanım sparkline'ı, son kullanıcılar listesi (kullanıcı sayfasına link) ve aynı cihaz/IP'den çoklu kullanım uyarısı yer almalı.

### 9. Sayfa mimarisi: ham fetch, form state dağınık, sayfalama yok
- **Önem:** düşük · **Kategori:** mimari / performans · **Efor:** M
- **Kanıt:** page.tsx:26-34 (7 ayrı `useState`) · page.tsx:36-46 (`useEffect` + `fetch`, iptal yok) · route.ts:36 (`take: 300`)
- **Sorun:** Bileşen genişledikçe state yönetimi zorlaşır. 300 üstü kupon sessizce kesilir. Toplu üretim eklendiğinde bu sınıra hızla ulaşılır.
- **Profesyonel öneri:**
  - Form react-hook-form + zod ile `CouponForm` bileşenine taşınmalı. Liste `useSWR('/api/admin/coupons?status=&q=&cursor=')` kullanmalı ve mutasyon sonrası `mutate` ile optimistik güncelleme yapılmalı.
  - API cursor tabanlı sayfalamaya geçmeli ve `{ items, nextCursor, total }` döndürmeli.
  - KPI'lar için ayrı bir `/api/admin/coupons/summary` ucu yazılmalı (aktif sayısı, toplam kullanım, 7 günlük kullanım, yakında dolacaklar).

### 10. Erişilebilirlik ve tutarlılık eksikleri
- **Önem:** düşük · **Kategori:** a11y / tasarım dili · **Efor:** S
- **Kanıt:**
  - page.tsx:113-141 (`Label` öğelerinde `htmlFor` yok)
  - page.tsx:182-184 (isimsiz ikon-only buton)
  - page.tsx:118 (native select)
  - page.tsx:84 (native `confirm`)
  - lib/admin-toast.ts:17-19 ("Basarili: " ve "Dikkat: " önekleri; Türkçe karakter eksik, müşteri kartında da kullanılıyor: coupon-redeem-card.tsx:8)
  - page.tsx:96 ve layout.tsx:33 (çift padding)
- **Profesyonel öneri:**
  - Alanlara `id`/`htmlFor` eklenmeli. Pasifleştir butonuna `aria-label="{kod} kuponunu pasifleştir"` ve `Tooltip` verilmeli.
  - shadcn `Select` ve `AlertDialog` kullanılmalı. Diyalogda kodun ve mevcut kullanım sayısının yazılması geri dönüşü olmayan bir işlem için doğru bağlamı verir.
  - Toast öneki "Başarılı: " olarak düzeltilmeli; bu tüm admin ve müşteri toast'larını etkileyen tek satırlık ortak bir düzeltme.
  - Sayfa `p-6` yerine diğer admin sayfalarının boşluk düzenine uymalı.

### 11. Analitik olay adı karışıklığı
- **Önem:** düşük · **Kategori:** gözlemlenebilirlik · **Efor:** S
- **Kanıt:** components/rewards/coupon-redeem-card.tsx:39 (`track('reward_redeemed', …)`)
- **Sorun:** Kupon kullanımı PostHog'a ödül kullanımı olarak gidiyor ve ödül hunisini kirletiyor. Sunucu tarafında doğru olay adı (`coupon_redeemed`) zaten kullanılıyor (redeem-coupon/route.ts:96).
- **Profesyonel öneri:** İstemci olayı `coupon_redeemed` olarak adlandırılmalı ve `couponType`/`value` özellikleri eklenmeli.

---

## Eksik özellikler (kıyas: Stripe Coupons / Promotion Codes, Shopify Discounts, Retool iç araçları)

1. **Coupon ↔ Promotion Code ayrımı ve toplu üretim.** Stripe'taki gibi tek bir indirim tanımına bağlı çok sayıda kod (ör. 500 adet tek kullanımlık `YAZ-XXXX`) üretilebilmeli ve CSV olarak indirilebilmeli.
2. **Hedefleme ve kısıtlar.** Belirli işletme veya bayi, kullanıcı segmenti (/admin/segments), yalnızca ilk kez kullananlar ve kullanıcı başına N kullanım tanımlanabilmeli. Başlangıç–bitiş penceresi olmalı.
3. **Kullanım analitiği.** Kod başına kullanım zaman serisi, dönüşüm (kullanım → ziyaret/puan), en çok kullanan kanallar ve kötüye kullanım sinyalleri (fraud-prevention ile entegre) görülebilmeli.
4. **Yaşam döngüsü yönetimi.** Düzenleme, çoğaltma (duplicate), yeniden aktifleştirme, zamanlanmış yayın ve otomatik arşiv olmalı.
5. **Liste ergonomisi.** Arama, durum sekmeleri (Kullanılabilir / Zamanlanmış / Süresi doldu / Limit doldu / Pasif), sıralama, cursor sayfalama, kodu tek tıkla kopyalama ve satır detay paneli olmalı.
6. **Önizleme.** "Müşteri bu kodu girince ne görür?" sorusunu cevaplayan canlı bir kart önizlemesi ve sürpriz kutu/kampanya ile "bu kodu dağıt" kısayolu olmalı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında kupon portföyünün sağlığını üç saniyede görmeli: kaç kod canlı, bu hafta ne kadar kullanıldı, hangileri yakında dolacak. Bir koda tıkladığında kimin kullandığını ve suistimal olup olmadığını görebilmeli. Yeni kampanya kodunu tek bir sheet'ten hedefleme ve kısıtlarıyla birlikte oluşturabilmeli. Oluşturulan kodun müşteride gerçekten bir şeye dönüştüğünden emin olmalı.

**Yerleşim:**
- **Hero** (`AdminPremiumHero`): `chips` slotunda 4 KPI (Canlı kod, 7 günlük kullanım, Yakında bitecek, Limiti dolan). `actions` slotunda "Yeni kupon" (sağdan açılan Sheet) ve "Toplu üret" butonları.
- **Araç çubuğu:** Durum sekmeleri (sayaçlarıyla), kod araması (debounce), sıralama (en yeni / en çok kullanılan / bitişi yakın).
- **Tablo** (shadcn `Table`; mobilde kart listesine dönüşür). Sütunlar:
  - Kod: monospace, yanında kopyala butonu.
  - Tür/Değer: birim açık olmalı, "%20" veya "50 puan".
  - Durum rozeti.
  - Kullanım: progress bar ile `usedCount / maxUses`.
  - Geçerlilik penceresi.
  - Kapsam.
  - Satır menüsü: Düzenle, Çoğalt, Pasifleştir/Aktifleştir, Kullanımları gör.
- **Detay Sheet:** Kupon özeti, kullanım sparkline'ı, kullanan kullanıcılar listesi (cursor), audit zaman çizelgesi ve "sürpriz kutuyla dağıt" kısayolu.
- **Oluşturma Sheet'i:** Adım adım ilerler: 1) değer, 2) kısıtlar, 3) hedefleme, 4) önizleme. Sağda müşteri kartının canlı önizlemesi yer alır.

**Motion / 3D:** Bu bir operasyon aracı; 3D gereksiz. Hareket ölçülü olmalı ve `m as Motion` (global LazyMotion) ile yapılmalı:
- Yeni oluşturulan satır listeye `layout` + kısa fade/slide (150–200 ms) ile girmeli.
- Pasifleştirmede rozet geçişi animasyonlu olmalı.
- Kopyalama başarısında ikon morph (kopyala → tik) kullanılmalı.
- KPI sayıları ilk yüklemede kısa bir count-up yapmalı.

Tüm bunlar `useReducedMotion` ile kapatılabilmeli. Hero'daki mevcut "breathe" animasyonu yeterli; ek dekoratif efekt eklenmemeli.

**Veri / API değişiklikleri:**
- **Domain kararı (Bulgu 1).** `Coupon` için `unit: 'percent' | 'points' | 'try'` eklenmeli. Redeem işlemi bir `CustomerOffer`/`UserReward` cüzdan kaydı üretmeli ve bayi tarafında kullanılmalı; ya da puan yolu seçilirse puan ekonomisi kurallarıyla atomik kredi verilmeli.
- **Şema.** `Coupon` modeline şu alanlar eklenmeli: `startsAt`, `perUserLimit` (varsayılan 1), `scopeBusinessId?`, `segmentId?`, `createdById`, `batchId?`. `CouponRedemption` için `coupon`/`user` ilişkileri ve `@@index([couponId, createdAt])` eklenmeli. Migration yalnızca ekleme yapmalı; canlı Neon olduğu için dikkatle uygulanmalı.
- **API.**
  - `GET /api/admin/coupons?status=&q=&cursor=&sort=` → `{items, nextCursor, total}`; her öğede türetilmiş `status` alanı olmalı.
  - `GET /api/admin/coupons/summary` (KPI'lar; kısa TTL ile Upstash cache).
  - `POST /api/admin/coupons` (transaction + P2002 → 409).
  - `POST /api/admin/coupons/batch` (N tek kullanımlık kod).
  - `PATCH /api/admin/coupons/[id]`
  - `GET /api/admin/coupons/[id]/redemptions`
  - `GET /api/admin/coupons/export.csv`
- **Tek şema:** `lib/validations/coupon.ts` (istemci + sunucu, Türkçe mesajlar). `lib/validations.ts` içindeki ölü `createCouponSchema` silinmeli.
- **Sürpriz kutu entegrasyonu:** `/api/admin/surprise-box/send` içinde `couponCode` alanı `Coupon` tablosunda var ve aktif olmalı. UI'da serbest metin yerine combobox kullanılmalı.

---

## Çakışmalar / birleştirme önerisi

- **/admin/rewards:** Ödül türü "Kupon" (app/admin/rewards/page.tsx:62,297) ayrı bir `KPN-…` kod sistemi üretiyor (app/api/gamification/rewards/route.ts:19-25). Kullanıcı açısından ikisi de "kupon", ama müşterinin kod kutusu yalnızca `Coupon` tablosunu tanıyor. **Öneri:** Ödül kodları ve kampanya kuponları tek bir kod defterinde toplanmalı ya da müşteri UI'da "ödül kodu" ile "kampanya kuponu" açıkça ayrıştırılmalı.
- **/admin/surprise-boxes:** Serbest metin `couponCode` alanı bu sayfanın kuponlarına bağlı değil (app/api/admin/surprise-box/send/route.ts:11). **Öneri:** Bu sayfadaki kuponlardan seçim yapılmalı ve sunucu tarafında doğrulanmalı.
- **/admin/seasonal-campaigns:** Kampanyada ayrı bir `discount` (0–100) alanı var (app/api/admin/seasonal-campaigns/route.ts:21,77). Bu, bir başka "indirim" kaynağı. **Öneri:** Kampanyaya bir kupon bağlanabilmeli (`couponId`); kampanya kendi indirim sayısını tutmamalı.
- **Bayi tarafı teklifleri** (`/customer/remedy`, lib/dealer/win-back-offers.ts, lib/remedy-options.ts): Bunlar işletmede gerçekten kullanılan teklifler. Kuponun "değere dönüşme" hattı için en doğal yeniden kullanım adayı bunlar.
- **Sonuç:** Sayfa kaldırılmamalı; platform genelinde kampanya kodu yönetimi meşru bir ihtiyaç. Ancak "Teklifler & Kodlar" başlığı altında rewards (kod üreten ödüller), surprise-boxes (dağıtım kanalı) ve seasonal-campaigns (indirim alanı) ile tek bir kod defteri üzerinden birleştirilmeli. Bu sayfa da o defterin yönetim yüzü olarak yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

### İddia: Kupon kullanımı hiçbir indirim veya değer üretmiyor; müşteriye "hesabınıza tanımlandı" deniyor

**Karar: DOĞRULANDI** (önem derecesine bir düzeltmeyle; aşağıya bakın)

**Çürütme denemesi ve kanıt:**
- `app/api/customer/redeem-coupon/route.ts:71-110`: Transaction yalnızca üç şey yapıyor. `CouponRedemption` satırı oluşturuyor, `Coupon.usedCount` değerini guarded `updateMany` ile artırıyor ve `AnalyticsEvent('coupon_redeemed')` yazıyor. Puan kredisi, `UserReward`/cüzdan kaydı, bildirim, sepet ya da sipariş indirimi gibi değer üreten hiçbir yan etki yok.
- `app/api/customer/redeem-coupon/route.ts:119-131`: Yanıtta `minPurchase` yalnızca geri dönülüyor, hiçbir yerde kontrol edilmiyor. Mesaj "%X indirim kuponunuz tanımlandı" ya da "X puanlık/tutarlık indirim kuponunuz tanımlandı" şeklinde. "Puanlık/tutarlık" ifadesi, birimin kodda bile belirsiz olduğunu gösteriyor.
- `components/rewards/coupon-redeem-card.tsx:40,74`: Müşteriye toast ile "✓ {kod} kuponu hesabınıza tanımlandı." gösteriliyor. Bu durum yalnızca bileşen state'inde (`applied`) tutuluyor; sayfa yenilenince kayboluyor. Müşterinin "kuponlarım" diye bir görünümü yok.
- `CouponRedemption` ve `couponRedemption` için tüm repo tarandı (`node_modules`, `.next` ve `docs` hariç). Bu tabloyu yalnızca redeem route'u okuyup yazıyor (`route.ts:59,74`) ve test dosyası kullanıyor. `coupon_redeemed` event'ini okuyan bir tüketici de yok.
- `prisma/schema.prisma:1470-1495`: `Order`, `Cart`, `Purchase`, `Payment` ya da `Checkout` modeli yok. Yani indirimin uygulanabileceği bir ödeme akışı platformda mevcut değil.
- "İndirim" kelimesini içeren diğer akışlar (`lib/dealer/win-back-offers.ts`, `lib/remedy-options.ts`, `lib/churn-intervention-core.ts`, `app/api/admin/seasonal-campaigns/route.ts`) `Coupon` modeline hiç referans vermiyor. `coupon` grep sonucunda bu dosyaların hiçbiri çıkmadı. Bayi (`app/dealer/**`, `app/api/dealer/**`) tarafında da kupon doğrulayan ya da tüketen bir uç yok.
- `/api/gamification/rewards` içindeki "Kupon" (`KPN-…` kodu, `route.ts:19-25,257`) ayrı bir `UserReward` sistemi. `Coupon` tablosuyla bağlantısı yok, dolayısıyla bu iddiayı çürütmüyor.

**Yeniden üretim senaryosu:**
1. Admin `/admin/coupons` sayfasında `YAZ2026`, %20, maks. 100 kullanımlık bir kupon oluşturur (`app/admin/coupons/page.tsx:56-67`).
2. Müşteri `/customer/rewards` sayfasındaki `CouponRedeemCard` kartında (`app/customer/rewards/page.tsx:306`) kodu girer. Ekranda "%20 indirim kuponunuz tanımlandı" ve "YAZ2026 kuponu hesabınıza tanımlandı" mesajları görünür.
3. DB'de bir `CouponRedemption` satırı oluşur, `usedCount` 1 artar ve kotadan 1 düşer. Bundan sonra müşterinin puanı, ödülü ya da gösterebileceği bir kod/cüzdan kaydı yoktur. İşletmede kullanmak istese bile bayinin bunu doğrulayacak bir ekranı yoktur.
4. Müşteri tekrar denediğinde `409 "Bu kuponu zaten kullandınız"` yanıtı alır (`route.ts:63-64`). Hak tükenmiştir ama karşılığında hiçbir değer verilmemiştir.

**Önem notu:** Bu bir güvenlik açığı değil; para ya da puan kaybı veya sahte değer basımı yok. Aslında puan ekonomisi açısından "zararsız" bir çıkmaz sokak. Gerçek etkisi ürün bütünlüğü ve güvenle ilgili: Müşteriye yanlış bir vaat veriliyor, sınırlı kotalı kampanyalarda hak boşa tüketiliyor, admin de `usedCount` sayısını gerçek bir dönüşüm sanıyor (`app/admin/coupons/page.tsx:176`). "KRİTİK" yerine **YÜKSEK (ürün/işlev)** seviyesi daha doğru.

**Öneri (ürün seviyesinde):** Kuponun neye dönüştüğüne dair bir domain kararı verilmeden bu akış yayında kalmamalı. Seçenekler şunlar:
- (a) **Puan kuponu:** `unit='points'` olmalı ve redeem transaction'ı içinde, puan ekonomisi kurallarına uygun atomik ve tek seferlik bir kredi verilmeli (`CouponRedemption` UNIQUE zaten idempotency anahtarı işlevi görüyor).
- (b) **İşletmede kullanılan teklif:** Redeem işlemi müşteriye ait bir cüzdan kaydı (`UserReward`/`CustomerOffer` + gösterilebilir kod/QR) üretmeli. Bayi panelinde "kodu doğrula ve kullan" ucu olmalı. `minPurchase` ve kapsam (`scopeBusinessId`) kontrolü burada yapılmalı.

Karar verilene kadar müşteri kartı gizlenmeli (feature flag) ya da mesaj gerçeğe uygun hale getirilmeli. Ayrıca admin sayfasındaki "indirim" dili ve açıklama metni (`page.tsx:99,108,171`) seçilen modele göre güncellenmeli.

---

## Uygulama (Dalga 2)

**Yeni yapı:** `app/admin/coupons/page.tsx` sunucu bileşeni (KPI + ilk sayfa sunucuda) → `components/admin/a-kutu-kupon/coupons-center.tsx` (QDL v2 ops: `PanelPage`, `MetricTile`, sayaçlı durum sekmeleri, URL'de arama + sıralama, mobilde karta dönen `DataTable`, `DetailSheet ?kupon=`). Düzenleyici sağ panel (`coupon-editor.tsx`), toplu üretim (`coupon-batch-dialog.tsx`), satır işlemleri (`coupon-actions.tsx`, `ConfirmAction`). Tek şema `lib/admin-coupons/contract.ts` (istemci + sunucu, Türkçe mesajlar), çekirdek `lib/admin-coupons/server.ts`. Uçlar `defineRoute` ile: `GET/POST/DELETE /api/admin/coupons`, `GET/PATCH /api/admin/coupons/[id]`, `GET …/stats`, `POST …/batch`, `GET …/export`. Testler: `__tests__/admin/a-kutu-kupon/kutu-kupon-server.test.ts`.

**Domain kararı (Bulgu 1):** Ödeme/sepet akışı olmadığı için kupon, sürpriz kutuyla dağıtılan, Ödüllerim'de saklanan ve kasada gösterilen kampanya kodudur; indirimi işletme uygular. Sayfa bu durumu bilgi bandında açıkça söyler. "Sürpriz kutuyla dağıt" kısayolu var ve kutuyla dağıtım sayıları gerçek veriden gelir. `minPurchase` hiçbir yerde denetlenmediği için formdan kaldırıldı. Kasada doğrulama (bayinin "kodu doğrula" ucu) F2.5'in işi.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa kabuğu + başlık | ÇALIŞIYOR | `PageHeader` + 4 KPI. |
| 2 | Yetki | ÇALIŞIYOR | Tüm uçlar ADMIN + rate limit + zod (`defineRoute`). |
| 3 | Kod alanı | ÇALIŞIYOR | Büyük harf görünümü, yazarken normalize, kriptografik "Üret", alan altı hata. |
| 4 | Tür seçimi | ÇALIŞIYOR | `ChoiceChips` (Yüzde / Sabit tutar ₺), etiketli. |
| 5 | Değer alanı | ÇALIŞIYOR | Birim etiketi (% / ₺); %>100 istemcide ve sunucuda reddedilir. |
| 6 | Min. tutar | KALDIRILDI | Hiçbir akışta denetlenmiyordu (sahte alan). |
| 7 | Maks. kullanım | ÇALIŞIYOR | Boş = sınırsız (−1 arayüzden kalktı), ≥1, Türkçe tam sayı hatası. |
| 8 | Son kullanım | ÇALIŞIYOR | İstanbul saati, geçmiş tarih reddedilir, "Süresiz yap". `startsAt` → ŞEMA İSTEĞİ. |
| 9 | Oluştur + kaydediliyor | ÇALIŞIYOR | Idempotency anahtarlı. |
| 10 | İstemci doğrulaması | ÇALIŞIYOR | Paylaşılan zod, alan altı. |
| 11 | Sunucu doğrulaması | ÇALIŞIYOR | Tüm mesajlar Türkçe; `details` alanlara eşlenir. |
| 12 | Tekrarlanan kod | ÇALIŞIYOR | Ön kontrol + P2002 → 409. |
| 13 | Audit log | ÇALIŞIYOR | Transaction içinde, tüm alanlarla; düzenlemede eski/yeni fark; tekrar pasifleştirme denetim yazmaz. |
| 14 | Liste yükleme | ÇALIŞIYOR | Sunucu sayfalama + sıralama (en yeni / en çok kullanılan / bitişi yakın). |
| 15 | Liste hata durumu | ÇALIŞIYOR | `QueryState` hata + "Tekrar dene"; `r.ok` + zarf kontrolü. |
| 16 | Yükleniyor | ÇALIŞIYOR | İskelet; arka plan yenilemesinde dönen ikon. |
| 17 | Boş durum | ÇALIŞIYOR | Sekmeye göre metin, CTA'lı; aramada "temizle". |
| 18 | Satır: kod, değer, durum | ÇALIŞIYOR | Türetilmiş durum rozeti (ikon + metin): kullanılabilir / süresi doldu / limit doldu / pasif. |
| 19 | Kullanım sayacı / tarih | ÇALIŞIYOR | İlerleme çubuğu; oluşturulma tarihi detayda. |
| 20 | Pasifleştir | ÇALIŞIYOR | Sürüm kontrollü PATCH, `aria-label`'lı. |
| 21 | Onay diyaloğu | ÇALIŞIYOR | `ConfirmAction` (kullanım + kalan hak etkisi); native `confirm` yok. |
| 22 | Yeniden aktifleştirme | ÇALIŞIYOR | `ACTIVATE_COUPON` denetimli. |
| 23 | Düzenleme | ÇALIŞIYOR | PATCH; ilk kullanımdan sonra kod/tür/değer kilitli, limit kullanımın altına inemez, `updatedAt` ile iyimser eşzamanlılık (409 + yeniden yükleme). |
| 24 | Arama / durum filtresi | ÇALIŞIYOR | Sayaçlı durum sekmeleri + kod araması, URL'de. |
| 25 | Sayfalama / toplam | ÇALIŞIYOR | `{items,total,counts}`. |
| 26 | Kullanım detayı | ÇALIŞIYOR | Çekmece: son 50 kullanan (kullanıcı 360 bağlantısı), 14 günlük seri, kutu dağıtımı, denetim zaman çizelgesi. |
| 27 | Kuponun gerçek etkisi | ÇALIŞIYOR (dürüst çerçeve) | Otomatik indirim iddiası yok; kod sürpriz kutuyla müşteriye gerçekten ulaşıyor (sunucu doğrulamalı). Kasada doğrulama F2.5'te. |
| 28 | Kapsam / hedefleme | KALDIRILDI (kapsam dışı) | Şemada alan yok → ŞEMA İSTEĞİ. |
| 29 | Kullanıcı başına limit | KALDIRILDI (kapsam dışı) | `@@unique([userId,couponId])` sabit 1; alan yok → ŞEMA İSTEĞİ. |
| 30 | Toplu kod üretimi | ÇALIŞIYOR | 1–500 tek kullanımlık `ÖNEK-XXXXXX` (karışmayan alfabe, `crypto.randomInt`), çakışmada yeniden dener, CSV indirme. |
| 31 | Kodu kopyala | ÇALIŞIYOR | `IconButton` + kopyala → tik geçişi (azaltılmış harekette anında). |
| 32 | CSV dışa aktarma | ÇALIŞIYOR | `GET /api/admin/coupons/export`: geçerli filtreyle, BOM + `;`, formül enjeksiyonuna karşı korumalı. |
| 33 | i18n | ÇALIŞIYOR | Tam Türkçe karakterli metin (sayfada i18n anahtar düzeni yoktu). Bu yüzey artık `lib/admin-toast.ts` yerine sonner kullanıyor. |
| 34 | Mobil yerleşim | ÇALIŞIYOR | Çift padding kalktı (`PanelPage`), tablo mobilde karta döner, dokunma hedefleri ≥44px. |
| 35 | Erişilebilirlik | ÇALIŞIYOR | `id/htmlFor`, `aria-invalid/describedby`, adlandırılmış ikon butonlar, sonuç sayısı canlı bölgede. |
| 36 | Azaltılmış hareket | ÇALIŞIYOR | `useMotionPolicy`; hareket yalnız durum değişiminde. |

### Kapanan bulgular (10/11)
1 (dürüst domain çerçevesi, `minPurchase` kaldırıldı, kutuyla dağıtım), 2 (sürpriz kutu yalnız gerçek, aktif ve hakkı yeten kuponu kabul ediyor; üç kavramdan biri bağlandı), 3, 4, 5 (tek şema, Türkçe, 0 limit/geçmiş tarih), 6 (tx + 409 + idempotent pasifleştirme), 7 (PATCH + yeniden etkinleştirme), 8 (kullanım görünürlüğü; FK olmadığı için kullanıcılar ayrı sorguyla), 9 (sunucu sayfalama, KPI ucu, react-query), 10 (a11y/onay/padding).

### Kalanlar
- **ŞEMA İSTEĞİ:** `Coupon.startsAt`, `perUserLimit`, `scopeBusinessId?`, `segmentId?`, `createdById`, `batchId?`; `CouponRedemption.coupon/user @relation` + `@@index([couponId, createdAt])`. Toplu üretimin `batchId`'si bugün yalnız denetim kaydında.
- Bulgu 11 (`coupon-redeem-card` olay adı): bileşen artık depoda yok. Müşteri kod giriş yüzeyi olmadığı için `usedCount` yalnız `/api/customer/redeem-coupon` üzerinden artabilir; bu ucun çağıranı yok. Kasada doğrulama + tek kod defteri F2.5'te.
- `lib/validations.ts` içindeki ölü `createCouponSchema` paylaşılan dosyada duruyor; eklemeli değişiklik kuralı nedeniyle silinmedi (çağıranı yok).
- `/api/customer/redeem-coupon` yanıt metni ("puanlık/tutarlık") müşteri tarafına ait; dokunulmadı.
