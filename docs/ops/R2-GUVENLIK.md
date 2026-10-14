# R2 güvenliği: bucket public erişimini kapatma

## Ne değişti

Eskiden her yükleme `R2_PUBLIC_URL/<key>` (`https://pub-….r2.dev/...`) biçiminde herkese açık ve süresiz bir URL olarak DB'ye yazılıyordu. Görev ekleri, gelen kutusu ekleri ve QR geri bildirim fotoğrafları URL'yi bilen herkese açıktı. Artık bütün dosyalar **uygulama üzerinden** sunuluyor ve bucket'ın public erişimi kapatılabilir.

| Sınıf | Önek | Uç | Yetki |
|---|---|---|---|
| PUBLIC (site görselleri) | `assets/` (rozet/ödül/kozmetik), `logos/` (bayi logosu), `products/` (ürün görseli) | `GET /api/files/public/<key>` | Oturum gerekmez. Yalnız bu önekler ve görsel uzantıları (png/jpg/webp/gif/avif/svg) sunulur. `..` ya da boş segment içeren yol reddedilir. `Cache-Control: public, max-age=31536000, immutable` ve ETag (304) var. |
| PRIVATE: geri bildirim fotoğrafı | `feedback/` | `GET /api/files/feedback/<feedbackId>/<index>` | ADMIN her kaydı görür. DEALER yalnız kendi QR'ına geleni görür. STAFF yalnız AKTİF bağlı olduğu bayininkini görür (DB'den okunur). CUSTOMER yalnız kendi yazdığını görür; moderasyonla kaldırılmışsa göremez. Erişimi olmayana 404 döner, kaydın varlığı sızdırılmaz. |
| PRIVATE: görev eki | `tasks/` | `GET /api/admin/team/tasks/<taskId>/file?k=<key>` | Görevi görebilen ekip üyesi (`findVisibleTask` kapsamı). Key bu görevin bir ekine ya da yorum ekine ait olmalı. |
| PRIVATE: gelen kutusu eki | `inbox/` | `GET /api/admin/inbox/<id>/attachments/<n>` (mevcuttu) | Yalnız ADMIN. Ayrıca `inbox/` önek denetimi eklendi. |

Tüm uçlar `X-Content-Type-Options: nosniff` ve sandbox CSP gönderir. Yalnız görsel, PDF ve video `inline` sunulur. SVG, HTML ve bilinmeyen türler `attachment` olarak verilir; HTML ve bilinmeyen türlerin tipi `application/octet-stream` yapılır. SVG'nin tipi `image/svg+xml` olarak kalır, `<img>` içinde görünmeye devam eder.

**Yeni yüklemeler** DB'ye URL yerine şunu yazar:
- Public sınıf: iç URL (`/api/files/public/<key>`).
- Private sınıf: çıplak key (`tasks/…`, `inbox/…`, `feedback/…`). İstemciye her zaman yetkili uç URL'si verilir (`toServedUrl`).

`uploadToR2` artık public URL değil, **key** döndürür.

**Geriye uyum (migration yok):** DB'deki eski tam r2.dev URL'leri okunurken çevrilir:
- `lib/storage/served-url.ts` içindeki `storedKeyOf` / `keyFromPublicUrl` dört biçimi tanır: eski URL, iç URL, `/key` ve çıplak key.
- Public alanlar (`User.businessLogo/image`, `Product.image`, `Badge/Quest/Reward/DonationProject/VIPTier/ProductCategory/MenuItem.icon`, `CosmeticItem/SeasonalCampaign.imageUrl`) `lib/prisma.ts` içindeki sonuç eklentisiyle okunurken `/api/files/public/<key>` biçimine çevrilir. Bildirim JSON'undaki görsel URL'leri `sanitizeNotificationData` içinde çevrilir.
- Geri bildirim medyası `servedFeedbackMedia` ile, görev ekleri `toServedUrl(…, {kind:'task'})` ile istemciye verilir.
- `R2_PUBLIC_URL` env'i artık yalnız bu geri uyum ayrıştırması için okunur. **Silmeyin**: eski kayıtların key'e çevrilmesi buna bağlı.

`next.config.js` içindeki r2.dev `remotePatterns` kaldırıldı, çünkü görseller artık aynı kökenden geliyor.

## Deploy sonrası: r2.dev public erişimini kapatma

1. Deploy'u doğrulayın:
   - Bir rozet ya da ödül görseli yükleyin. Dönen adres `/api/files/public/assets/...` biçiminde olmalı ve görsel açılmalı.
   - Bayi logosu ile bir ürün görselinin, eski kayıtlarda bile `/api/files/public/...` üzerinden geldiğini görün. Tarayıcı ağ sekmesinde `r2.dev` isteği kalmamalı.
   - Bayi gelen kutusunda fotoğraflı bir geri bildirim açın. Adres `/api/files/feedback/...` olmalı.
   - Ekip modülünde bir görev ekini açın. Adres `/api/admin/team/tasks/.../file?k=...` olmalı.
2. Cloudflare Dashboard → **R2 Object Storage** → uygulamanın bucket'ı (`R2_BUCKET`) → **Settings**.
3. **Public access → R2.dev subdomain** → **Disallow Access** (onaylayın). Bucket'a bağlı bir **Custom Domain** varsa onu da **Disconnect** edin ya da erişimini kapatın.
4. Kontrol edin: eski bir `https://pub-….r2.dev/<key>` adresi artık 401 ya da 404 dönmeli. Uygulamadaki görseller ve ekler açılmaya devam etmeli. Uygulama S3 API'sini (`R2_ACCESS_KEY_ID/SECRET`) kullandığı için public erişim gerekmiyor.
5. İsteğe bağlı: R2 API token'ını yalnız bu bucket'a, "Object Read & Write" yetkisiyle sınırlayın.

**Geri alma:** Sorun çıkarsa 3. adımda "Allow Access" seçmek yeterli; kod iki durumda da çalışır.

## Bilinen sınırlar / kalan risk

- `$queryRaw` ile okunan public görsel alanları Prisma eklentisinden geçmez. Bu yolla eski bir r2.dev URL'si okunursa bucket kapandıktan sonra kırık görünür.
- Başka tablolara ya da JSON'lara **kopyalanmış** eski r2.dev URL'leri yalnız şu üç yerde çevrilir: bildirim verisi, geri bildirim medyası ve görev ekleri. Bunların dışında kopya varsa kırık görünür.
- QR hunisinde yerelde saklanan taslaktan geri yüklenen fotoğrafın önizlemesi artık bir key. Anonim kullanıcı bunu görüntüleyemez, bu yüzden önizleme boş kalır. Gönderim çalışmaya devam eder.
- E-posta gibi uygulama dışı bağlamlarda göreli `/api/files/public/...` adresi tek başına çalışmaz; mutlak URL gerekir. Şu an e-postalarda R2 görseli kullanılmıyor.
- `attachment-backfill` cron'u artık gereksiz (disposition başlıklarını proxy uçları belirliyor) ama zararsız.
