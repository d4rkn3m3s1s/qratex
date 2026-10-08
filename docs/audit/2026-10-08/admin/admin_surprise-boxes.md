# /admin/surprise-boxes

**Amaç:** Platform operatörünün müşterilere (tek kişiye e-posta/ID ile veya "rastgele N" kişiye toplu) başlık + mesaj + kupon kodu + puan içeren "sürpriz kutu" göndermesi ve son gönderimlerin açılma durumunu izlemesi.
**Genel puan:** 5,2 / 10
**Karar:** **yeniden tasarla**: Form ve liste iskeleti kullanılabilir durumda. Ancak sayfa, sınırsız ve denetim kaydı (audit) bırakmayan bir **puan basma kanalı** gibi çalışıyor. "Rastgele" hedefleme gerçekte rastgele değil, kupon alanı gerçek kupon tablosuna bağlı değil. "Son gönderimler" listesi ve KPI'lar da otomatik günlük kutularla kirleniyor. Ekonomi değişmezlerine uyan bir **kampanya/gönderim** modeli gerekiyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Tekil gönderim çalışıyor. Rastgele hedefleme önyargılı, liste ve KPI'lar günlük kutularla karışıyor, kupon doğrulaması yok, hata durumu sessiz kalıyor. |
| UX | 5/10 | Önizleme, toplu gönderim onayı, alıcı arama/doğrulama, filtre ve detay yok. Operatör ne gönderdiğini ve kime gittiğini göremeden "Gönder"e basıyor. |
| Görsel | 6,5/10 | AdminPremiumHero ile panel diline uyumlu, temiz kart düzeni var. Hero'daki 3 çip yalnızca süs; KPI kutuları yanıltıcı. |
| Mimari | 4/10 | Puan için üst sınır yok, `auditLog` yazılmıyor, idempotency yok, kampanya varlığı yok. Liste uç noktası filtresiz, kupon serbest metin olarak tutuluyor. |
| Performans | 7/10 | Tek sorgu, `take: 200`, indeksli `createdAt`. Ancak 200 kayıt çekilip 50'si gösteriliyor, rastgele seçim de uygulama belleğinde yapılıyor. |
| Erişilebilirlik + Mobil | 6/10 | Etiketler `htmlFor` ile bağlı, reduced-motion global olarak açık (`components/providers.tsx:232`). Hedef input'larının etiketi yok, gönderen mobilde gizli, durum yalnızca renk/rozetle anlatılıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Yetki: yalnız ADMIN (liste + gönderim API) | ÇALIŞIYOR | `app/api/admin/surprise-box/route.ts:11`, `send/route.ts:25` | `requireAuth(['ADMIN'])` + token-replay kontrolü (`lib/api-auth.ts:64-78`). |
| 2 | Modül kapısı `surprise_boxes` (sunucu) | ÇALIŞIYOR | `route.ts:13-19`, `send/route.ts:27-33`, `lib/module-gate.ts:92-130` | Kapalıyken 403 dönüyor, ancak UI bunu göstermiyor (bkz. #31). |
| 3 | Hero: eyebrow/başlık/açıklama | ÇALIŞIYOR | `page.tsx:152-156` | |
| 4 | Hero çipleri ("Tekil veya toplu", "Kupon + puan", "Son gönderimler") | SAHTE (dekoratif) | `page.tsx:157-163` | Tıklanamıyor, filtre/link değil; bilgi taşımıyor. |
| 5 | KPI "Liste" | KISMİ | `page.tsx:82-90`, `168-169` | Yalnızca ilk 50 kaydı sayıyor (API 200 dönüyor) ve otomatik günlük kutular da sayıya giriyor. |
| 6 | KPI "Açıldı" | KISMİ | `page.tsx:84`, `172-173` | Aynı kirlilik var; oran (%) yok. |
| 7 | KPI "Bekleyen" | KISMİ | `page.tsx:88`, `176-177` | Aynı kirlilik var. |
| 8 | "Yenile" butonu + spinner | ÇALIŞIYOR | `page.tsx:180-193` | |
| 9 | Başlık alanı (zorunlu) | ÇALIŞIYOR | `page.tsx:220-228`, `93-96` | İstemcide `maxLength` yok; sunucu 200 karakterle sınırlıyor (`send/route.ts:9`) ve aşımda genel "Geçersiz istek" dönüyor. |
| 10 | Mesaj alanı | ÇALIŞIYOR | `page.tsx:229-239` | Karakter sayacı yok; sunucu sınırı 2000 (`send/route.ts:10`). |
| 11 | Kupon kodu | KISMİ | `page.tsx:241-252`, `send/route.ts:11,92` | Serbest metin. `Coupon` tablosunda (`prisma/schema.prisma:1470`) var olup olmadığı, aktifliği ve süresi kontrol edilmiyor. |
| 12 | Puan alanı | BOZUK (güvenlik/ekonomi) | `page.tsx:253-266`, `send/route.ts:12` | Üst sınır yok: `z.number().int().min(0)`. 500 alıcı × sınırsız puan basılabiliyor. Negatif değer istemciden geçiyor ve sunucu genel bir 400 dönüyor. |
| 13 | Hedef seçimi (Select) | ÇALIŞIYOR | `page.tsx:269-292` | |
| 14 | E-posta ile tek kullanıcı | KISMİ | `page.tsx:118`, `send/route.ts:55-64` | E-posta küçük harfe çevrilip `findUnique` ile aranıyor, ama kayıt sırasında e-posta normalize edilmiyor (`lib/validations.ts:26-29`). Büyük harfli kayıtlar 404 veriyor. Rol kontrolü de yok. |
| 15 | Kullanıcı ID ile tek kullanıcı | KISMİ | `page.tsx:303-310`, `send/route.ts:48-54` | cuid elle yapıştırılıyor; arama/otomatik tamamlama ve alıcı önizlemesi yok. ADMIN/DEALER kullanıcıya da gönderiliyor. |
| 16 | Rastgele N müşteri | BOZUK | `send/route.ts:65-72` | `orderBy` olmadan `take: N*2` alınıyor, yani her seferinde aynı tablo-başı kümesi seçiliyor. `sort(() => Math.random()-0.5)` önyargılı. `fraudStatus: 'shadow_ban'` olan kullanıcılar dışlanmıyor. |
| 17 | Rastgele sayı input'u | KISMİ | `page.tsx:313-321` | `Number(v) \|\| 10`: alan silinince ya da 0 yazılınca anında 10'a dönüyor, kullanıcı rahatça yazamıyor. |
| 18 | İstemci doğrulaması (başlık/e-posta/ID/aralık) | ÇALIŞIYOR | `page.tsx:93-108` | |
| 19 | "Gönder" butonu + yükleniyor durumu | ÇALIŞIYOR | `page.tsx:328-340` | Gönderim sürerken disable oluyor ve çift tıklamayı engelliyor. Sunucu tarafında idempotency yok. |
| 20 | Toplu gönderim onayı | EKSİK | `page.tsx:331` | 500 kişiye puanlı gönderim tek tıkla, onay adımı olmadan çıkıyor. |
| 21 | Müşteri görünümü önizlemesi | EKSİK | — | Müşteri tarafında modal var (`components/rewards/surprise-box-modal.tsx`), admin önizleme göremiyor. |
| 22 | `rewardType` seçimi | EKSİK | `send/route.ts:13,94` | API kabul ediyor ama UI göndermiyor; admin kutularında hep `null` kalıyor. |
| 23 | Başarı bildirimi (adet ile) | ÇALIŞIYOR | `page.tsx:134` | |
| 24 | Başarı sonrası form sıfırlama + liste yenileme | ÇALIŞIYOR | `page.tsx:135-142` | Hedef modu korunuyor, alanlar temizleniyor. |
| 25 | Hata bildirimi | KISMİ | `page.tsx:129-131` | Zod `details` alanı gösterilmiyor; hangi alanın hatalı olduğu belirsiz kalıyor. |
| 26 | Son gönderimler listesi | BOZUK | `route.ts:22-29`, `app/api/surprise-box/route.ts:23-34` | Filtre yok. Müşteri sayfasını her açışta üretilen "Günlük Giriş Ödülü" kutuları (dayKey dolu, sentBy null) listeyi dolduruyor, admin gönderimleri kayboluyor. |
| 27 | Liste satırı: başlık, alıcı, zaman, gönderen, durum rozeti, puan, kupon | ÇALIŞIYOR | `page.tsx:386-434` | Gönderen mobilde gizli (`hidden sm:inline`, `page.tsx:407`). |
| 28 | Yükleniyor durumu (liste) | ÇALIŞIYOR | `page.tsx:372-375` | Spinner var; skeleton yok. |
| 29 | Boş durum | KISMİ | `page.tsx:376-383` | API hatasında ve modül kapalıyken de "Henüz kutu yok" gösteriliyor. |
| 30 | Hata durumu (liste) | BOZUK | `page.tsx:69-70` | `success:false` (403/500) geldiğinde hiçbir mesaj gösterilmiyor; yalnız ağ istisnasında toast çıkıyor. |
| 31 | Modül kapalı uyarısı | EKSİK | `page.tsx:65-76` | 403 gövdesindeki `moduleKey/reason` kullanılmıyor. |
| 32 | Arama / filtre (durum, gönderen, tarih, kaynak) | EKSİK | — | |
| 33 | Sayfalama / tümünü gör | EKSİK | `page.tsx:386` | API 200 dönüyor, UI 50'de kesiyor; daha eskisine ulaşmak mümkün değil. |
| 34 | Kayıt detayı (mesaj, metadata, açılma zamanı) | EKSİK | — | `message` alanı API'den geliyor ama hiç gösterilmiyor. |
| 35 | Açılmamış kutuyu iptal/geri alma | EKSİK | — | Yanlış puanlı gönderimin geri alınma yolu yok. |
| 36 | Denetim kaydı (AuditLog) | EKSİK | `send/route.ts:86-101` | Aynı paneldeki kupon (`app/api/admin/coupons/route.ts:79`) ve kullanıcıya puan ekleme (`app/api/admin/users/route.ts:420`) audit yazıyor; burada yok. |
| 37 | Alıcıya bildirim (in-app/push/e-posta) | EKSİK | `send/route.ts:86-96` | `Notification` modeli var (`prisma/schema.prisma:990`) ama kullanılmıyor. Müşteri kutuyu ancak sayfaya kendisi girerse görüyor. |
| 38 | Açılma analitiği (oran, süre, kampanya bazında) | EKSİK | — | |
| 39 | Zamanlama / son kullanma tarihi | EKSİK | `prisma/schema.prisma:262-285` | Şemada `expiresAt`/`scheduledAt` alanı yok. |
| 40 | Giriş animasyonları (kart + satır stagger) | ÇALIŞIYOR | `page.tsx:199-204`, `346-351`, `387-391` | Ölçülü kullanılmış; reduced-motion global olarak `MotionConfig reducedMotion="user"` ile karşılanıyor. |

**Sayım:** ÇALIŞIYOR 18 · KISMİ 10 · BOZUK 4 · SAHTE 1 · EKSİK 7 (toplam 40)

---

## Bulgular

### 1. [KRİTİK · Güvenlik/Ekonomi] Puan için üst sınır yok: tek istekle sınırsız puan basılabiliyor
- **Kanıt:** `app/api/admin/surprise-box/send/route.ts:12` (`points: z.number().int().min(0).default(0)`), `:65-72` (500 alıcı), `app/api/surprise-box/[id]/open/route.ts:54-69` (açılışta `creditPointsAndXp`).
- **Sorun:** Tek bir POST ile 500 alıcıya kişi başı istenen kadar puan (ör. 1.000.000) yazılabiliyor. Ele geçirilmiş bir admin oturumu, ya da yanlışlıkla eklenen fazladan sıfır, puan ekonomisini (ödül mağazası, liderlik tablosu) bir anda şişirir. Bu kanal net-sıfır/escrow mantığı dışında kalan bir "mint" yoludur ve memory'deki puan ekonomisi değişmezleriyle çelişir. Ayrıca alıcılar açılışta `points_credited` (≥500/24 saat) yüzünden `lib/points-velocity.ts:8` eşiğine takılıp liderlik tablosunda `needsReview` olarak işaretleniyor (`app/api/leaderboard/route.ts:131-137`). Meşru bir admin hediyesi, alıcıyı "şüpheli" gösterebiliyor.
- **Öneri:**
  - Sunucuya `points` için sert bir üst sınır koyun (ör. `max(5000)`) ve kampanya başına toplam bütçe sınırı (`recipients × points ≤ budget`) ekleyin. Değerler `lib/` altında tek bir yapılandırmadan (ekonomi ayarları / economy-sim ile hizalı) okunsun.
  - Toplam basılacak puanı (`N × puan`) formda canlı gösterin. Eşik üstündeki gönderimler için iki adımlı onay isteyin: özet modalı + "GÖNDER" yazdırma ya da ikinci admin onayı.
  - Velocity dedektörü `category: 'surprise_box'` ve `metadata.source='admin'` olan kredileri ayrı değerlendirsin (veya admin kaynaklı kredileri hariç tutsun). Böylece meşru hediye alıcıyı fraud listesine düşürmez.
- **Efor:** M

### 2. [YÜKSEK · Güvenlik/Denetim] Gönderim AuditLog'a yazılmıyor
- **Kanıt:** `send/route.ts:86-101` (yalnız `createMany`). Kıyas: `app/api/admin/coupons/route.ts:79-88`, `app/api/admin/users/route.ts:420`.
- **Sorun:** Kimin, ne zaman, kaç kişiye, kaç puanla gönderdiği yalnızca satır başına `sentByUserId` alanında kalıyor. IP/UA, istek gövdesi ve toplu gönderimin tek bir olay olarak kaydı yok. Kullanıcı silinince `sentBy` `SetNull` oluyor (`prisma/schema.prisma:279`) ve iz tamamen kayboluyor. `/admin/users` üzerinden puan eklemek denetleniyor ama sürpriz kutu bu kaydı atlayan bir yan kapı hâline geliyor.
- **Öneri:** Aynı işlemde `auditLog.create({ action:'SEND_SURPRISE_BOX', entity:'SurpriseBoxCampaign', entityId, newData:{ title, points, couponCode, mode, recipientCount, totalPoints }, ...getAuditRequestMeta(req) })` yazın. Uzun vadede `SurpriseBoxCampaign` tablosu oluşturup kutuları `campaignId` ile bağlayın (bkz. vizyon).
- **Efor:** S

### 3. [YÜKSEK · Hata/Veri] "Son gönderimler" ve KPI'lar otomatik günlük kutularla dolu
- **Kanıt:** Liste sorgusu filtresiz: `app/api/admin/surprise-box/route.ts:22-29`. Günlük kutu müşteri sayfasının her GET'inde upsert ediliyor: `app/api/surprise-box/route.ts:21-34` (`sentByUserId` yok, `dayKey` dolu).
- **Sorun:** Aktif bir platformda son 200 kaydın büyük kısmı "Günlük Giriş Ödülü" oluyor. Admin kendi gönderimini listede bulamıyor. "Liste/Açıldı/Bekleyen" sayıları da admin kampanyalarını değil günlük giriş davranışını ölçüyor. Kart başlığı ("Son gönderimler") ile içerik çelişiyor.
- **Öneri:** API'ye `source` parametresi ekleyin (`admin` → `sentByUserId: { not: null }` veya `dayKey: null`; `daily` → `dayKey: { not: null }`; `all`). Varsayılan `admin` olsun. Günlük kutular ayrı bir sekmede, toplu istatistik (günlük üretim/açılma oranı) olarak gösterilsin. KPI'lar istemcide 50 kayıttan değil, sunucuda `groupBy`/`count` ile ve seçili filtreye göre hesaplansın.
- **Efor:** S–M

### 4. [YÜKSEK · Hata] "Rastgele N müşteri" rastgele değil
- **Kanıt:** `send/route.ts:66-72`.
- **Sorun:** (a) `findMany` `orderBy` olmadan `take: N*2` alıyor. Postgres pratikte fiziksel sırayla döndüğü için hep aynı ~2N "eski" müşteri havuzundan seçiliyor, yeni müşteriler hiç kutu almıyor. (b) `sort(() => Math.random() - 0.5)` bilinen önyargılı bir karıştırma. (c) `fraudStatus` (`prisma/schema.prisma:57`) dikkate alınmıyor; `shadow_ban` kullanıcılar ödül alabiliyor. (d) Pasif, e-postası doğrulanmamış veya son X günde hiç girmemiş hesaplar da seçiliyor.
- **Öneri:** Rastgeleliği veritabanına bırakın (ör. `$queryRaw` ile `ORDER BY random() LIMIT $n` ya da `TABLESAMPLE`) ve filtre uygulayın: `role='CUSTOMER' AND fraudStatus='clean' AND emailVerified IS NOT NULL AND lastActive > now()-interval '30 days'`. Daha iyisi, "rastgele"yi `/admin/segments` segmentleri üzerinden "segmentten N kişi örnekle" seçeneğine dönüştürmek. Gönderimden önce "Hedef kitle: 1.240 uygun müşteri, 50'si seçilecek" önizlemesini gösterin.
- **Efor:** M

### 5. [ORTA · Hata] E-posta/ID hedefi rol ve büyük-küçük harf kontrolü yapmıyor
- **Kanıt:** `send/route.ts:48-64`. E-posta küçük harfe çevriliyor (`:57`, `page.tsx:118`) ama kayıt şeması normalize etmiyor (`lib/validations.ts:26-29`). Açma uç noktası yalnız `CUSTOMER` kabul ediyor (`app/api/surprise-box/[id]/open/route.ts:17`).
- **Sorun:** (a) `Ali@Ornek.com` olarak kayıtlı kullanıcıya gönderim "kullanıcı bulunamadı" ile başarısız oluyor. (b) ADMIN/DEALER kullanıcıya gönderilen kutu başarıyla oluşuyor, ama hiçbir zaman görülemiyor ve açılamıyor (ölü kayıt).
- **Öneri:** Arama `email: { equals, mode: 'insensitive' }` ile yapılsın ve hedef `role: 'CUSTOMER'` ile sınırlansın; aksi hâlde "bu kullanıcı müşteri değil" hatası dönsün. UI'da serbest metin yerine **kullanıcı arama combobox'ı** kullanılsın (`/api/admin/users?search=`, `app/api/admin/users/route.ts:120` zaten case-insensitive arıyor): ad, e-posta, avatar, rol ve fraud durumu gösterilsin. Seçim sonrası alıcı kartı görünsün.
- **Efor:** S (sunucu) / M (combobox)

### 6. [ORTA · Veri bütünlüğü] Kupon kodu gerçek kupona bağlı değil
- **Kanıt:** `page.tsx:246-251`, `send/route.ts:11,92`. `Coupon` modeli var (`prisma/schema.prisma:1470-1485`).
- **Sorun:** Admin yazım hatalı, süresi dolmuş, pasif veya kullanım limiti dolmuş bir kodu gönderebiliyor. Müşteri modalda kodu kopyalıyor (`components/rewards/surprise-box-modal.tsx:58-59`), ödeme sırasında kod reddediliyor. Bu doğrudan bir güven kaybı demek.
- **Öneri:** Serbest metin yerine `/api/admin/coupons` listesinden **kupon seçici** kullanın (kod, tür, değer, kalan kullanım, bitiş tarihi). Sunucuda `Coupon` için `isActive && (expiresAt null || > now) && (maxUses = -1 || usedCount + N ≤ maxUses)` doğrulaması yapın. İleride kutuya `couponId` FK eklenebilir.
- **Efor:** M

### 7. [ORTA · UX/Hata yönetimi] Liste hatası ve modül kapalı durumu sessiz kalıyor
- **Kanıt:** `page.tsx:69-73` (yalnız `success && data` dalı var), `page.tsx:376-383`.
- **Sorun:** 403 (modül kapalı, token-replay) veya 500 olduğunda kullanıcı "Henüz kutu yok" görüyor. Yanlış bir boş durum, operatörü yanlış sonuca götürür. `res.ok` kontrolü de yok.
- **Öneri:** `error` state'i tutun ve hata kartını "Tekrar dene" ile gösterin. `reason === 'module_disabled_globally'` ise "Bu modül kapalı · /admin/modules'tan aç" bağlantılı bir banner gösterin ve formu disable edin. Veri katmanını SWR/React Query'ye taşıyın (yeniden doğrulama, hata, `isValidating`).
- **Efor:** S

### 8. [ORTA · UX] Toplu gönderimde onay, önizleme ve geri alma yok
- **Kanıt:** `page.tsx:328-340` (doğrudan `handleSend`), iptal uç noktası yok.
- **Sorun:** Puanlı toplu gönderim tek tıkla geri dönülemez biçimde çıkıyor. Açılmamış kutuyu iptal edecek bir yol da yok.
- **Öneri:** "Gönder" butonu bir **özet sheet'i** açsın: müşteri modalının canlı önizlemesi (mevcut `SurpriseBoxModal` yeniden kullanılır), alıcı sayısı, toplam puan, kupon geçerliliği ve "Gönder" onayı. Açılmamış kutular için `DELETE /api/admin/surprise-box/[id]` (veya kampanya düzeyinde `revoke`) uç noktası eklensin; `updateMany({ where:{ id, openedAt:null } })` claim deseniyle yarışa dayanıklı olsun ve audit kaydı yazsın.
- **Efor:** M

### 9. [ORTA · Ürün] Alıcı bilgilendirilmiyor
- **Kanıt:** `send/route.ts:86-96`; `Notification` modeli `prisma/schema.prisma:990`; benzer admin akışı `app/api/admin/cards/[id]/assign/route.ts` bildirim üretiyor.
- **Sorun:** Kutu sessizce oluşuyor; müşteri `/customer/surprise-boxes`'a kendisi girmezse kutuyu fark etmiyor. Bu da açılma oranını ve kampanyanın etkisini düşürüyor.
- **Öneri:** `createMany` sonrası `notification.createMany` (tıklayınca `/customer/surprise-boxes` açılsın) yazılsın. Kullanıcı tercihlerine (`notificationPreferences`) uyularak push/e-posta kanalı seçilebilsin; toplu gönderimde bu işlem `after()` ile arka planda yapılsın.
- **Efor:** M

### 10. [DÜŞÜK · UX] Form alanı mikro-hataları
- **Kanıt:** `page.tsx:319` (`Number(v) || 10`), `page.tsx:264` (negatif değer kabul ediliyor), `page.tsx:222-227` (`maxLength` yok), `page.tsx:295-309` (hedef input'larının `Label`/`aria-label`'ı yok), `page.tsx:129-131` (zod `details` gösterilmiyor).
- **Sorun:** Rastgele sayı alanı silinemiyor (anında 10'a dönüyor). Negatif puan sunucuda genel bir "Geçersiz istek" ile reddediliyor. Ekran okuyucu e-posta/ID alanını yalnızca placeholder'dan tanıyor.
- **Öneri:** Formu `react-hook-form` + paylaşılan zod şemasıyla (sunucu ve istemci aynı şema) yeniden kurun: alan altı hata mesajları, karakter sayaçları (200/2000), `min/max` ve `inputMode="numeric"`. Her hedef input'una görünür bir `Label` verin.
- **Efor:** S

### 11. [DÜŞÜK · Performans/Veri] 200 kayıt çekilip 50'si gösteriliyor, `message` gereksiz taşınıyor
- **Kanıt:** `route.ts:24` (`take: 200`), `page.tsx:83,386` (`slice(0, 50)`); `include` tüm sütunları döndürüyor (`message` Text, `metadata` Json).
- **Öneri:** Cursor tabanlı sayfalama (`?cursor=&limit=50`) ve açık bir `select` kullanın. KPI'lar ayrı, hafif bir `/stats` uç noktasından gelsin.
- **Efor:** S

### 12. [DÜŞÜK · Görsel/Bilgi mimarisi] Dekoratif çipler ve yanıltıcı KPI etiketi
- **Kanıt:** `page.tsx:157-163`, `166-179`.
- **Sorun:** Çipler etkileşimsiz ve bilgi taşımıyor. "Liste" etiketi bir metrik değil. Açılma oranı ve toplam dağıtılan puan gibi işe yarar sayılar yok.
- **Öneri:** Çipleri kaldırın veya filtre segmentine (Admin / Günlük / Tümü) dönüştürün. KPI'lar: "Bu ay gönderilen", "Açılma oranı %", "Dağıtılan puan", "Bekleyen puan yükümlülüğü" (açılmamış kutulardaki toplam puan, ekonomi için önemli bir göstergedir).
- **Efor:** S

### 13. [DÜŞÜK · Mobil/Erişilebilirlik] Durum yalnızca rozetle ve renkle anlatılıyor, gönderen mobilde gizli
- **Kanıt:** `page.tsx:407` (`hidden sm:inline`), `page.tsx:412-421`.
- **Öneri:** Satırı tıklanabilir yapıp bir detay drawer'ı açın (mobilde tam ekran sheet): mesaj, kupon, puan, gönderen, oluşturma ve açılma zamanı. Rozetlere ikon + metin zaten var; "Bekliyor" rozetine de bir ikon (Clock) ekleyin.
- **Efor:** S

> Bu sayfanın dışında kalan ama ilişkili bir not (doğrulandı): müşteri tarafındaki açma uç noktası `app/api/surprise-box/[id]/open/route.ts` `surprise_boxes` modül kapısını kontrol etmiyor. Modül kapatılsa bile mevcut kutular açılıp puan kredilendirilebilir. Admin modülü kapatmanın ödülü durdurduğunu varsayabilir.

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Kampanya varlığı ve geçmişi:** Gönderimler satır satır değil kampanya olarak listelenmeli (Stripe "Promotion" ve PostHog "Broadcast" gibi): her kampanyanın alıcı sayısı, açılma oranı, dağıtılan puan, gönderen ve audit bağlantısı görünmeli.
2. **Segment tabanlı hedefleme + kitle önizlemesi:** `/admin/segments` segmentleri, CSV yükleme ve "son 30 günde aktif" gibi filtreler; gönderimden önce uygun kitle sayısı (PostHog cohort, Retool tablo seçimi).
3. **Güvenli toplu işlem akışı:** Bütçe sınırı, özet + onay, (yüksek tutarda) ikinci admin onayı, idempotency anahtarı ve iptal/geri alma.
4. **Zamanlama ve son kullanma:** `scheduledAt` (cron ile yayınlanır) ve `expiresAt` (açılmayan kutunun puan yükümlülüğünü sona erdirir).
5. **Alıcı bildirimi ve kanal seçimi:** In-app bildirim, push ve e-posta, kullanıcı tercihlerine uygun olarak.
6. **Analitik ve dışa aktarım:** Açılma hunisi (gönderildi → görüldü → açıldı), açılma süresi dağılımı, CSV dışa aktarım, filtre/arama/sayfalama ve satır detayı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör "bir hediye kampanyası" kurar. Kime gideceğini (segment/kişi/örneklem), müşterinin ne göreceğini (canlı modal önizlemesi) ve ekonomiye maliyetini (toplam puan, bütçe sınırına uzaklık) gönderimden önce görür. Gönderdikten sonra kampanyanın açılma performansını izler ve gerekirse açılmamış kutuları geri çeker. Her adım audit kaydına geçer.

**Yerleşim:**
- **Üst şerit:** Kompakt hero (dekoratif çipler kalkar) + 4 KPI kutusu: bu ay gönderilen, açılma oranı, dağıtılan puan, bekleyen puan yükümlülüğü. KPI'lar sunucudan gelir.
- **Sekmeler:** `Kampanyalar` (varsayılan) · `Tekil kutular` · `Günlük giriş kutuları` (salt-okunur istatistik) · `Yeni gönderim`.
- **Yeni gönderim, 3 adımlı sağ sheet veya sayfa içi stepper:**
  1. *İçerik:* başlık/mesaj (sayaçlı), ödül türü (puan / kupon / ikisi), kupon seçici, puan (sınırlı, bütçe çubuğu ile).
  2. *Hedef:* kişi combobox'ı (çoklu seçim) · segment seçici · "segmentten N örnekle" · CSV. Canlı "uygun kitle: X" sayacı; shadow-ban ve pasif hesaplar otomatik dışlanır.
  3. *Önizleme + onay:* solda mevcut `SurpriseBoxModal`'ın gömülü önizlemesi, sağda özet (alıcı, toplam puan, kupon geçerliliği, zamanlama). Eşik üstünde "onay kelimesi" istenir.
- **Kampanya listesi:** Tablo (masaüstü) / kart (mobil). Sütunlar: ad, tarih, gönderen, alıcı, açılma oranı (mini progress), puan. Satıra tıklayınca detay drawer'ı açılır: alıcı listesi, açılma zaman çizelgesi, "açılmamışları geri çek" butonu, audit bağlantısı.

**Motion / 3D (ölçülü):**
- Mevcut kart ve satır giriş animasyonları korunabilir; stagger 50 satırda üst sınırlı (`Math.min(i*0.02,0.3)`) ve bu uygun.
- Önizleme adımında müşterinin göreceği kutu açılış animasyonu küçük ölçekte "oynat" düğmesiyle gösterilebilir. Mevcut 3B imza kutusu (commit `72121c4`) admin sayfasında **otomatik yüklenmemeli**; yalnızca kullanıcı önizlemeyi istediğinde `dynamic(..., { ssr:false })` ile yüklensin. Böylece admin sayfası hafif kalır.
- Gönderim başarısında konfeti yerine sade bir başarı durumu (kampanya kartına `layout` animasyonuyla yerleşme) kullanılsın. Bu bir operatör aracıdır, oyunlaştırma burada abartılmamalı.

**Veri / API değişiklikleri:**
- Prisma: `SurpriseBoxCampaign { id, title, message, points, couponId?, rewardType, targeting Json, recipientCount, totalPoints, status (scheduled|sent|revoked), scheduledAt?, expiresAt?, createdById, createdAt }`. `UserSurpriseBox`'a `campaignId?`, `couponId?`, `expiresAt?`, `revokedAt?` eklenir; `@@index([campaignId])` ve `@@index([sentByUserId, createdAt])` tanımlanır.
- `POST /api/admin/surprise-box/campaigns`: zod (puan üst sınırı, bütçe), idempotency başlığı, hedef çözümleme (segment/örnekleme DB tarafında), kupon doğrulama, tek transaction'da `campaign + createMany + auditLog`, ardından `after()` ile bildirimler.
- `POST /api/admin/surprise-box/audience-preview`: uygun kitle sayısı ve örnek alıcılar.
- `GET /api/admin/surprise-box?source=admin|daily|all&status=&cursor=&q=`: açık `select` + cursor sayfalama. `GET .../stats`: KPI'lar `groupBy`/`aggregate` ile.
- `POST /api/admin/surprise-box/campaigns/[id]/revoke`: `updateMany({ where:{ campaignId, openedAt:null }, data:{ revokedAt } })` + audit.
- Açma uç noktası: `revokedAt`/`expiresAt` kontrolü, modül kapısı ve `points_credited.data.source='admin'|'daily'` (velocity dedektörü bunu ayırt edebilsin).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/users` (puan ekleme, `add_points`):** İkisi de admin'in kullanıcıya puan vermesini sağlıyor. Users tarafı audit yazıyor, burası yazmıyor. Öneri: tek kullanıcıya "kutu gönder" işlemi kullanıcı detayındaki bir aksiyon olsun; iki yol da aynı servis fonksiyonunu (`grantAdminReward`) kullansın, audit ve sınırlar ortak olsun.
- **`/admin/coupons`:** Kupon kodları orada yönetiliyor; burada serbest metin olarak yeniden giriliyor. Kupon seçici ile bağlanmalı. Kupon detayında "bu kuponu sürpriz kutuyla dağıt" kısayolu eklenebilir.
- **`/admin/segments`:** Hedefleme segmentlerden beslenmeli; ayrı "rastgele N" mantığı kaldırılmalı.
- **`/admin/seasonal-campaigns` ve `/admin/rewards`:** Kavramsal örtüşme var (kampanya / ödül dağıtımı); ayrıntılı çakışma doğrulanmadı. Orta vadede "Ödül Dağıtımı" başlığı altında Sürpriz Kutu, Sezonluk Kampanya ve Kupon dağıtımı tek bir **Kampanyalar** merkezinde sekmeler olarak toplanabilir.
- **Kaldırılmamalı:** Sayfanın amacı (operatör kaynaklı hedefli ödül) benzersiz ve müşteri tarafındaki `/customer/surprise-boxes` ile doğrudan bağlantılı. Önerilen yol birleştirmek değil, kampanya modeline taşıyıp yeniden tasarlamak.

---

## Doğrulama (şüpheci inceleme)

Kod salt okunur incelendi; DB, build, test veya sunucu çalıştırılmadı. Her iddia çürütülmeye çalışıldı.

### 1. "Admin sürpriz kutu gönderimi sınırsız puan basabiliyor": **ÇÜRÜTÜLDÜ** (KRİTİK/YÜKSEK güvenlik bulgusu olarak)
- Gözlem doğru: `points` için üst sınır yok (`app/api/admin/surprise-box/send/route.ts:12`), alıcı en fazla 500 (`:18`). Açılışta `creditPointsAndXp` ile kredilendiriliyor (`app/api/surprise-box/[id]/open/route.ts:54-58`).
- Ancak bu yeni bir yetki veya saldırı yüzeyi değil. Uç `requireAuth(['ADMIN'])` ve modül kapısının arkasında (`send/route.ts:25-33`). Aynı admin, `/admin/users` `add_points` ile zaten sınırsız puan verebiliyor: `amount: z.number()` alanında min, max veya int kısıtı yok (`app/api/admin/users/route.ts:43-48`, `:399-405`). "Ele geçirilmiş admin oturumu" senaryosu bu sayfaya özgü bir açık değil, admin güven modelinin genel sonucu.
- Ekonomi değişmezi açısından açılış yolu `points_credited` olayını aynı transaction içinde yazıyor (`open/route.ts:61-69`). Yani fraud ve velocity dedektörlerine görünür; oyuncunun tetikleyebildiği bir mint yolu yok. Net-sıfır/escrow değişmezi oyuncu tetiklemeli yollar için tanımlı; admin hediyesi tasarım gereği mint yapar.
- Aşırı büyük değer (örneğin int32 üstü) `createMany` adımında Postgres `Int` taşmasıyla 500 döndürür. Veri bozulmaz.
- ≥500 puanlık hediyenin leaderboard'da şüpheli olarak işaretlenmesi (`lib/points-velocity.ts:8`, `app/api/leaderboard/route.ts:8`) bir ceza değil, inceleme bayrağı. Bu bir yanlış-pozitif konforu sorunu.
- **Kalan gerçek risk (orta, UX sağlamlaştırma):** Fazladan sıfır yazım hatasına karşı onay adımı ve toplam maliyet gösterimi yok. Öneri: sunucuda makul bir `points.max()` ve toplam bütçe kontrolü (`points × alıcı`), eşik üstünde ikinci onay; `points_credited.data.source='admin'` ile velocity dedektörünün admin hediyesini ayırt etmesi.

### 2. "Puan veren admin işlemi AuditLog'a yazılmıyor": **DOĞRULANDI** (önem: orta-yüksek, hesap verebilirlik)
- `send/route.ts:86-101` yalnızca `userSurpriseBox.createMany` yapıyor; dosyada `auditLog` yok. `requireAuth`, `assertModuleEnabled` veya `proxy.ts` içinde genel bir audit katmanı da bulunmadı (grep sonucu boş). Karşılaştırma: `app/api/admin/users/route.ts:420-429` ve `app/api/admin/coupons/route.ts:79-87` audit yazıyor.
- İzin tek kalıntısı kutu satırındaki `sentByUserId`. Bu alan `onDelete: SetNull` (`prisma/schema.prisma:279`) olduğu için admin hesabı silinirse gönderen bilgisi kaybolur. IP/UA, toplam tutar ve hedefleme yöntemi hiçbir yerde tutulmuyor.
- **Yeniden üretim:** Admin A, rastgele 500 kişiye 1000'er puanlık kutu gönderir. `AuditLog` tablosunda hiçbir kayıt oluşmaz. A'nın hesabı silindiğinde 500 satırın `sentByUserId` alanı `NULL` olur ve 500.000 puanlık dağıtımın kim tarafından, hangi IP'den yapıldığı geri bulunamaz. Müşteri tarafındaki `points_credited` olayları da (`open/route.ts:62-69`) yalnızca `category:'surprise_box'` taşır; günlük kutu ile admin hediyesini ayırt etmez.
- **Öneri:** Aynı transaction içinde `campaign/createMany + auditLog.create({ action:'SEND_SURPRISE_BOX', newData:{ count, points, totalPoints, targeting }, ...getAuditRequestMeta(req) })`. Uzun vadede iki admin puan yolu tek bir `grantAdminReward` servisinde birleşmeli.

### 3. "'Son gönderimler' listesi günlük kutularla kirleniyor; KPI'lar yanlış": **DOĞRULANDI** (önem: orta, veri doğruluğu; güvenlik değil)
- Admin listesi filtresiz: `findMany({ orderBy:{createdAt:'desc'}, take:200 })` (`app/api/admin/surprise-box/route.ts:22-29`). Müşteri `GET /api/surprise-box` her çağrıldığında günde bir `'Günlük Giriş Ödülü'` kutusu upsert ediliyor (`app/api/surprise-box/route.ts:21-34`; `sentByUserId` yok, `dayKey` dolu). KPI'lar istemcide listenin ilk 50 satırından hesaplanıyor (`app/admin/surprise-boxes/page.tsx:82-90`). Ayırt edici filtre veya etiket yok; yalnızca `sentBy?.name` varsa ad gösteriliyor.
- Düzeltme: Üretim "her platform ziyaretinde" değil, müşteri `/customer/surprise-boxes` sayfasını açtığında oluyor (tek çağıran `app/customer/surprise-boxes/page.tsx:102`). Sonuç yine de aynı: o gün sayfayı açan her müşteri admin listesine bir satır ekliyor.
- **Yeniden üretim:** Admin sabah 3 kutu gönderir. Gün içinde 60 müşteri kutularım sayfasını açar. Admin sayfayı yenilediğinde ilk 50 satırın tamamı günlük kutu olur ve admin gönderimleri listede görünmez. "Açıldı/Bekleyen" sayıları, günlük kutu açma davranışını ölçer.
- **Öneri:** API'de `source` parametresi (`admin` için `dayKey: null`, `daily` için `dayKey: {not:null}`), admin varsayılanı. KPI'lar sunucuda `count/groupBy` ile hesaplanmalı.

### 4. "Rastgele hedefleme önyargılı ve shadow_ban kullanıcılarını dışlamıyor": **KISMEN DOĞRULANDI** (önyargı gerçek; shadow_ban kısmı çürütüldü)
- **Önyargı, doğrulandı:** `findMany({ where:{role:'CUSTOMER'}, take: randomCount*2 })` sorgusunda `orderBy` yok (`send/route.ts:66-70`). Karıştırma yalnızca bu 2N satırlık havuzda yapılıyor (`:71-72`). Postgres, ORDER BY olmadan LIMIT'li sorguda pratikte fiziksel tarama sırasını döndürür. Bu yüzden havuz her çağrıda büyük ölçüde aynı satırlardır. "Yeni müşteriler hiç seçilmez" ifadesi abartılı, çünkü MVCC güncellemeleri satırları fiziksel olarak taşıyabilir. Ancak seçim tüm müşteri kümesi üzerinde düzgün dağılımlı değil. Ek olarak `sort(() => Math.random()-0.5)` zaten yanlı bir karıştırmadır.
  - **Yeniden üretim:** 5.000 müşterili bir platformda "rastgele 10" gönderimi her seferinde aynı yaklaşık 20 kişilik havuzdan seçilir. Aynı kişiler tekrar tekrar ödül alır.
  - **Öneri:** Seçim DB tarafında yapılmalı (`ORDER BY random() LIMIT N` veya `TABLESAMPLE`/id aralığı örnekleme). Bunun yerine segment tabanlı hedefleme ve dışlama kuralları (pasif hesaplar, son N günde kutu alanlar) eklenmeli.
- **shadow_ban, çürütüldü:** `fraudStatus='shadow_ban'` değerini atayan tek kod `lib/fraud/engine.ts` (`checkFraudulentActivity`, `:53`). Bu modül hiçbir yerden import edilmiyor (`fraud/engine` grep sonucu boş). `shouldApplyReward` (`:95-97`) de hiçbir ödül yolunda kullanılmıyor. Bu nedenle canlıda shadow_ban durumuna düşen kullanıcı üreten bir akış yok. Olsa bile hiçbir puan yolu bu kuralı uygulamadığı için bu sayfaya özgü bir açık sayılmaz. Asıl sorun fraud motorunun bağlanmamış olması ve bu sistem genelinde ayrı bir bulgudur.
