# /customer/surprise-boxes

**Amaç:** Tüketicinin kendisine gelen sürpriz kutuları (otomatik "Günlük Giriş Ödülü" kutusu + admin'in elle/rastgele gönderdiği hediye kutuları) listelemek, tek tek açtırmak ve açılışı 3B kutu animasyonlu bir kutlama modalıyla göstermek. Puan içeren kutular açılınca hesaba atomik olarak işleniyor. Kupon içerenlerde kod gösteriliyor.
**Genel puan:** 5/10
**Karar:** **yeniden tasarla.** Çekirdek akış (sahiplik kontrolü + atomik açma + `points_credited`) sağlam ve açılış modalı görsel olarak güçlü. Ama sayfanın etrafındaki her şey ya yanıltıcı ya eksik. Kod tabanında karşılığı olmayan "yorum yaz, kutu ihtimalin artsın" vaadi, gerçek ödül gibi görünen sahte "Önizleme" modalı, açıldıktan sonra kaybolan kupon kodu ve 100 açılmış kutudan sonra yeni kutuları görünmez yapan sıralama hatası var. Sayfa, /customer/rewards içinde bir **"Ödül Gelen Kutusu"** olarak yeniden kurgulanmalı (bkz. Çakışmalar).

Kapsam: `app/customer/surprise-boxes/page.tsx` (486 satır), `app/customer/surprise-boxes/layout.tsx`, `components/rewards/surprise-box-modal.tsx`, `components/rewards/signature-gift-box-lazy.tsx`, `components/rewards/signature-gift-box-3d.tsx` (ilgili kısımlar), `app/api/surprise-box/route.ts`, `app/api/surprise-box/[id]/open/route.ts`, `app/api/customer/stats/route.ts`, `app/api/admin/surprise-box/send/route.ts`, `app/api/customer/weekly-card/route.ts`, `lib/points-wallet.ts`, `lib/login-streak.ts`, `lib/surprise-box-config.ts`, `lib/admin-toast.ts`, `lib/play-chime.ts`, `lib/app-locale.tsx`, `i18n/request.ts`, `messages/tr.json`, `messages/en.json`, `components/providers.tsx`, `proxy.ts`, `prisma/schema.prisma` (`UserSurpriseBox`). Kod çalıştırılmadı. Tüm bulgular okuyarak doğrulandı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Açma ve puan kredisi doğru, idempotent ve IDOR'a kapalı. Ama `ORDER BY openedAt ASC` + `take: 100` yüzünden sadık kullanıcıda yeni kutular kayboluyor. Açılmış kutunun kuponu UI'da bir daha görülemiyor. Hata durumları çeviri anahtarı olarak ekrana düşüyor. |
| UX | 4/10 | Kullanıcıya gerçek olmayan mekanikler vaat ediliyor (yorum → kutu ihtimali, haftalık zafer → "ek şans"). Sahte önizleme modalı "Kazanılan puan +120", "Ödül hesabına güvenle işlendi", kupon "Aktif" diyor. "+X puan potansiyeli" rozeti sürprizi baştan bozuyor. |
| Görsel | 6/10 | Açılış modalı (lake safir 3B kutu, eşikli bloom, ödül yuvası) premium. Liste ve hero ise jenerik amber kartlar. Modal ile sayfa iki ayrı görsel dil konuşuyor (safir/siyah ↔ amber/turuncu). |
| Mimari | 4/10 | GET isteği veritabanına yazıyor (günlük kutu üretimi). Modül anahtarı müşteri API'lerinde uygulanmıyor. Lig bazlı ödül konfigürasyonu (`lib/surprise-box-config.ts`) ölü kod. Kutu modelinde son kullanma, kaynak işletme ve kupon durumu yok. |
| Performans | 5/10 | 3B sahne doğru biçimde lazy (ayrı chunk, `ssr:false`, görünmezken duruyor). Ancak 2 sayı için ~10 sorgulu `/api/customer/stats` çağrılıyor, liste yanıtı `all` alanıyla iki kat şişiyor ve her açılıştan sonra tüm sayfa verisi baştan çekiliyor. |
| Erişilebilirlik + mobil | 5/10 | Mobilde dokunma hedefleri iyi (`min-h-11/12`, `touch-manipulation`) ve 3B sahne `prefers-reduced-motion`'a saygılı. Ama açılış modalında `role="dialog"`, odak tuzağı, Esc ve kaydırma kilidi yok. Kartlardaki sonsuz opaklık nabzı azaltılmış harekette de sürüyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (i18n başlık/açıklama) | ÇALIŞIYOR | `app/customer/surprise-boxes/layout.tsx:4-6` | `segmentLayoutMetadata` ile. TR "Sürpriz kutular", EN "Surprise boxes". |
| 2 | Rol koruması (sayfa + API) | ÇALIŞIYOR | `proxy.ts:53`, `app/api/surprise-box/route.ts:13-15`, `app/api/surprise-box/[id]/open/route.ts:17-19` | İki uç da `role !== 'CUSTOMER'` için 401 dönüyor. |
| 3 | Modül aç/kapa (`surprise_boxes`) | KISMİ | `lib/module-controls.ts:24`, `components/dashboard/sidebar.tsx:305`, `app/api/admin/surprise-box/send/route.ts:27-33` | Yalnızca admin gönderim ucu ve menü bu anahtarı dikkate alıyor. Müşteri GET/open uçlarında `assertModuleEnabled` yok, yani modül kapalıyken de günlük kutu üretilip puan verilmeye devam ediyor. |
| 4 | Masaüstü sayfa başlığı | ÇALIŞIYOR | `page.tsx:184-187`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex`. |
| 5 | Mobil başlık kartı | ÇALIŞIYOR | `page.tsx:189-194` | Hemen altındaki hero da başlık ve açıklama taşıdığı için mobilde ilk ekranın yarısı başlıklardan oluşuyor. |
| 6 | Hero hediye ikonu + sayaç rozeti | KISMİ | `page.tsx:200-205` | Rozet `total` (açılmış + açılmamış) gösteriyor. Bildirim rozeti dilinde "açılmayı bekleyen" sayısı beklenir. |
| 7 | Hero metinleri | ÇALIŞIYOR | `page.tsx:206-212` | i18n anahtarları mevcut. |
| 8 | 3 istatistik çipi (Açılacak/Açılmış/Toplam) | KISMİ | `page.tsx:223-227`, `app/api/surprise-box/route.ts:40` | Sunucu `take: 100` ile kestiği için sayılar 100'de tavan yapıyor ama "Toplam" diye etiketli. |
| 9 | Hero yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:216-221` | |
| 10 | "Kişisel öneri": bekleyen yorum cümlesi | BOZUK | `page.tsx:137`, `messages/tr.json:184` | Sayfa önce "`{n} Tüketim`" yazıyor, ardından çeviri metni de "`{count} tüketim için yorum yazarsan…`" ile başlıyor. Ekranda "**3 Tüketim** 3 tüketim için yorum yazarsan…" çıkıyor. |
| 11 | "Yorum yazarsan sürpriz kutu ihtimalin artar" vaadi | SAHTE | `messages/tr.json:184`, `app/api/surprise-box/route.ts:23`, `app/api/admin/surprise-box/send/route.ts:86` | Kod tabanında `UserSurpriseBox` üreten yalnızca iki yol var: günlük upsert ve admin createMany. Yorumun kutu üretimine hiçbir etkisi yok. |
| 12 | "Ritmini koru; özel kutular burada birikir" ipucu | SAHTE | `page.tsx:141-145`, `messages/tr.json:185` | Paylaşım davranışına bağlı bir kutu üretimi yok. |
| 13 | Toplam tüketim sayısı satırı | ÇALIŞIYOR | `page.tsx:243-247` | |
| 14 | "Daha fazla kutu" rozeti | SAHTE | `page.tsx:250-252` | Tıklanamayan, anlamı olmayan, sabit TR metinli bir süs. |
| 15 | "Yorum bekleyenler" bağlantısı | KISMİ | `page.tsx:255-260`, `app/customer/consumptions/page.tsx:67` | Tüketimler sayfasının `pending` filtresi var ama URL parametresi okumadığı için bağlantı "Tümü" sekmesine düşüyor. |
| 16 | "Geri bildirimlerim" bağlantısı | ÇALIŞIYOR | `page.tsx:261-266` | |
| 17 | "Önizlemeyi aç" (öneri kartında ve boş durumda) | SAHTE | `page.tsx:89-95`, `page.tsx:176-180`, `page.tsx:267-269`, `page.tsx:310-312` | Sabit kodlu `PREVIEW-2026` kuponu ve +120 puanla gerçek açılış modalını açıyor. Modal "Kazanılan puan", "Ödül hesabına güvenle işlendi" ve kupon için "Aktif" yazıyor. "Önizleme" ibaresi yok. |
| 18 | Genel boş durum + 3 CTA | BOZUK | `page.tsx:293-315`, `app/api/surprise-box/route.ts:23-34` | Her başarılı GET bugünün kutusunu ürettiği için bu durum başarılı yüklemede hiç görünmüyor. Yalnızca API hata verince görünüyor ve hatayı "Henüz sürpriz kutun yok" olarak gösteriyor. |
| 19 | Liste yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:275-292` | |
| 20 | Sekmeler (Açılacaklar/Geçmiş) + sayaçlar + otomatik sekme seçimi | ÇALIŞIYOR | `page.tsx:317-343`, `page.tsx:113` | Radix Tabs ile klavye erişimi var. |
| 21 | "Açılacak kutu yok" boş durumu + CTA | ÇALIŞIYOR | `page.tsx:346-360` | CTA metni ("Yorum yaparak hızlan") 11. satırdaki sahte vaadi tekrarlıyor. |
| 22 | Açılmamış kutu kartları | KISMİ | `page.tsx:362-429`, `app/api/surprise-box/route.ts:37-41` | Postgres'te `ASC` sıralama `NULLS LAST` olduğu için açılmamış kutular listenin sonuna düşüyor. 100 açılmış kutudan sonra hiç görünmüyorlar (bkz. Bulgu 1). |
| 23 | Kart üzerindeki sonsuz nabız animasyonu | KISMİ | `page.tsx:378-382`, `components/providers.tsx:232` | `MotionConfig reducedMotion="user"` yalnızca transform ve layout animasyonlarını kapatıyor. Opaklık döngüsü azaltılmış harekette de çalışıyor. |
| 24 | "+X puan potansiyeli" rozeti | KISMİ | `page.tsx:388-393` | Ödülü açmadan önce kesin değeriyle gösteriyor. "Sürpriz" kavramını yok ediyor. |
| 25 | Göreli zaman ("3 gün önce") | KISMİ | `page.tsx:400`, `page.tsx:455` | `date-fns` locale'i `tr` olarak sabit. EN kullanıcısı da Türkçe görüyor. |
| 26 | "Kutuyu aç" butonu + yükleniyor durumu | ÇALIŞIYOR | `page.tsx:405-421` | Yalnızca o kutu kilitleniyor. Bkz. Bulgu 12 (ikinci kutuya tıklayınca ilkinin kilidi açılıyor). |
| 27 | Açma API'si: sahiplik + atomik claim + kredi + `points_credited` | ÇALIŞIYOR | `app/api/surprise-box/[id]/open/route.ts:25-27`, `:40-73` | `updateMany where openedAt:null` ile çift açma imkânsız. Kredi ve fraud olayı aynı transaction'da. IDOR yok. |
| 28 | "Zaten açılmış" yanıtının istemcide işlenmesi | KISMİ | `open/route.ts:32-37`, `page.tsx:165` | Yanıtta `pointsGranted` yok. İstemci `box.points`'e düşüp kutlama modalında "+X kazanıldı" gösteriyor, oysa bu açılışta puan verilmedi. |
| 29 | Kutlama ses efekti | ÇALIŞIYOR | `page.tsx:167`, `lib/play-chime.ts` | `reduce-animations` sınıfında susuyor. `prefers-reduced-motion`'a bakmıyor. |
| 30 | Açılış sonrası verinin yeniden çekilmesi | KISMİ | `page.tsx:168`, `page.tsx:100-126` | Her açılışta liste ve ~10 sorgulu stats ucu yeniden çağrılıyor. Yerel durum güncellemesi yeterli. |
| 31 | Günlük giriş kutusu üretimi | KISMİ | `app/api/surprise-box/route.ts:21-34` | GET isteğinin yan etkisi. Yalnızca bu sayfa ziyaret edilirse üretiliyor (adı "giriş" ödülü olsa da). Gün UTC'ye göre (TR'de 03:00'te dönüyor). Puan `Math.random` ile 50-250. |
| 32 | Açılış modalı faz animasyonu + 3B imza kutu | ÇALIŞIYOR | `components/rewards/surprise-box-modal.tsx:37-55`, `:135-136`, `signature-gift-box-lazy.tsx:14-32` | Lazy chunk, placeholder, `visibilitychange` ile duraklatma ve dispose mevcut (`signature-gift-box-3d.tsx:1262-1283`). |
| 33 | Modal ödül yuvası (ikon + "+puan") | ÇALIŞIYOR | `surprise-box-modal.tsx:139-168` | |
| 34 | Modal "Durum / Tür / Seviye" çipleri | SAHTE | `surprise-box-modal.tsx:172-185` | "Seviye: Premium" her kutuda sabit. "Durum" zamanlayıcıya bağlı, sunucu durumuna değil. |
| 35 | Modal üst etiketi "Günlük giriş ödülü" | BOZUK | `surprise-box-modal.tsx:199` | Admin'in gönderdiği hediye ve kupon kutularında da "Günlük giriş ödülü" yazıyor. |
| 36 | Modal "Kayıtlandı / Ödül hesabına güvenle işlendi" kartı | SAHTE | `surprise-box-modal.tsx:257-266` | 1,8 saniyelik zamanlayıcıyla "Kayıtlandı" oluyor. Önizlemede de aynı metin çıkıyor. |
| 37 | Kupon kodu gösterimi + kopyala | KISMİ | `surprise-box-modal.tsx:57-62`, `:269-300` | `clipboard.writeText` beklenmiyor ve hatası yakalanmıyor. Başarısız olsa da "kopyalandı" toast'ı çıkıyor. "Aktif" rozeti sabit. Kuponun durum, son kullanma ve kullanım takibi yok. |
| 38 | Modal kapatma (X, Kapat, Harika, arka plan tıklaması) | ÇALIŞIYOR | `surprise-box-modal.tsx:76`, `:309-323`, `:329-337` | Arka plan tıklaması yalnızca `done` fazında çalışıyor. |
| 39 | Modal klavye / odak / ARIA | EKSİK | `surprise-box-modal.tsx:70-77` | `role="dialog"`, `aria-modal`, `aria-labelledby`, odak tuzağı, Esc ile kapatma ve body kaydırma kilidi yok. Portal da kullanılmıyor. |
| 40 | Geçmiş listesi | KISMİ | `page.tsx:443-468`, `app/api/surprise-box/route.ts:39` | En eskiden en yeniye sıralı (son açılan en altta). Kupon kodu, mesaj ve tür gösterilmiyor. Satıra tıklanamıyor. |
| 41 | Geçmiş boş durumu | ÇALIŞIYOR | `page.tsx:434-441` | |
| 42 | Hata yönetimi (toast) | BOZUK | `page.tsx:122`, `page.tsx:170`, `i18n/request.ts:36`, `lib/admin-toast.ts` | `surpriseBoxes.errorLoading` ve `surpriseBoxes.openError` anahtarları TR/EN'de yok. `t()` eksik anahtarda anahtarın kendisini döndürdüğü için `||` yedeği hiç devreye girmiyor. Kullanıcı "Dikkat: surpriseBoxes.errorLoading" görüyor. Toast'lar admin önekli (`Dikkat:`, ASCII `Basarili:`). |
| 43 | Çok dillilik (i18n) | KISMİ | `page.tsx:89-95`, `:155`, `:251`, `:268`, `:311`, `surprise-box-modal.tsx:112`, `:174-183`, `:199`, `:239-306`, `:314`, `:321` | Sayfadaki ve modaldeki 25+ metin sabit Türkçe. Sunucu hata metinleri de Türkçe (`data.error`). |
| 44 | Açılmış kutunun kuponunu yeniden görme / kupon cüzdanı | EKSİK | `page.tsx:443-468` | Veri istemcide var (`couponCode`) ama arayüzde gösterilmiyor. Modal kapanınca kupon kayboluyor, oysa modal "Bu açılış hesabında saklanır" diyor (`surprise-box-modal.tsx:306`). |
| 45 | Yeni kutu bildirimi / menüde açılmamış kutu rozeti | EKSİK | `app/api/admin/surprise-box/send/route.ts:86-101`, `components/dashboard/sidebar.tsx:305` | Admin kutu gönderdiğinde bildirim veya push yok. Menüde sayaç yok. Kullanıcı kutusunu ancak sayfaya kendisi girerse fark ediyor. |
| 46 | Son kullanma / aciliyet | EKSİK | `prisma/schema.prisma:262-285` | `expiresAt` alanı yok. Kutular sonsuza dek birikiyor ve "bugün açmazsan kaçar" gerilimi kurulamıyor. |
| 47 | Sayfalama / tam geçmiş | EKSİK | `app/api/surprise-box/route.ts:40` | Sabit `take: 100`, cursor yok. |

**Özet:** 47 özellik. 18 ÇALIŞIYOR, 14 KISMİ, 4 BOZUK, 6 SAHTE, 5 EKSİK.

---

## Bulgular

### 1. [YÜKSEK, Veri/işlevsellik] 100 açılmış kutudan sonra yeni kutular görünmez oluyor
- **Kanıt:** `app/api/surprise-box/route.ts:37-41`: `orderBy: [{ openedAt: 'asc' }, { createdAt: 'desc' }], take: 100`. Yorum satırı "açılmamış önce" diyor (`:9`).
- **Sorun:** PostgreSQL'de `ORDER BY ... ASC` varsayılan olarak `NULLS LAST` çalışıyor. `openedAt = null` olan açılmamış kutular listenin **sonuna** düşüyor. Kullanıcının ≥100 açılmış kutusu olduğunda (her gün sayfaya girip kutusunu açan bir kullanıcı için ~100 gün) ilk 100 satırın tamamı açılmış kutu oluyor. Bugünün günlük kutusu ve admin'in gönderdiği hediyeler yanıtta hiç yer almıyor. "Açılacak" sayısı 0 görünüyor, kutular veritabanında açılmadan birikiyor. Ayrıca geçmiş, en eski açılıştan başlıyor ve 100'de donuyor. Hata en sadık kullanıcıyı vuruyor.
- **Öneri:** Listeyi iki ayrı sorguya böl. (a) Açılmamışlar: `where: { userId, openedAt: null }, orderBy: { createdAt: 'desc' }`, tavansız ya da makul bir tavanla. (b) Geçmiş: `where: { openedAt: { not: null } }, orderBy: { openedAt: 'desc' }`, cursor sayfalamalı (`?cursor=&limit=20`). Sayılar için ayrı `count` sorguları (ya da `groupBy`) kullan, "Toplam" artık 100'de tavan yapmasın. `@@index([userId, openedAt])` bileşik indeksi ekle (mevcut indeksler tekil: `schema.prisma:282-284`).
- **Efor:** S

### 2. [YÜKSEK, Ürün güveni] Gerçekte olmayan mekanikler vaat ediliyor
- **Kanıt:** `page.tsx:132-146` + `messages/tr.json:184-185` ("yorum yazarsan yeni sürpriz kutu ihtimalin artar", "özel kutular burada birikir"), `page.tsx:357` ("Yorum yaparak hızlan"), `app/api/customer/weekly-card/route.ts:59` ("Sürpriz kutularda ek şans…"). Kutu üreten yalnızca iki kod yolu var: `app/api/surprise-box/route.ts:23` (günlük) ve `app/api/admin/surprise-box/send/route.ts:86` (admin).
- **Sorun:** Kullanıcıya davranışını değiştirmesi için olmayan bir ödül mekanizması anlatılıyor. Duolingo ve Starbucks gibi ürünlerin oyunlaştırmasını çalıştıran şey kuralın şeffaf ve güvenilir olması. Kullanıcı yorum yazıp kutu gelmediğini gördüğü anda tüm ödül sistemine güveni sarsılıyor. "Kişisel öneri" etiketi de yanıltıcı, çünkü öneri yalnızca `pendingReviewCount > 0` kontrolü.
- **Öneri:** İki seçenek var. **(A, doğru olan)** Mekanizmayı gerçekten kur: `ConsumptionReview` oluşturulduğunda (rozet sisteminin kullandığı aynı olay noktasında) olasılıklı ya da eşikli bir "Yorum kutusu" üret. Örnek kural: her 3 onaylı yorumda 1 kutu, `source: 'review_milestone'`, idempotent anahtar `@@unique([userId, sourceKey])`. Haftalık zaferde gerçekten bir `weekly_victory` kutusu düşür. Ardından ipucunu gerçek ilerlemeye bağla: "Sonraki kutuya 2 yorum kaldı" + ilerleme çubuğu. **(B, kısa vade)** Bu metinleri ve "Yorum yaparak hızlan" CTA'sını kaldır.
- **Efor:** M (A), S (B)

### 3. [YÜKSEK, Güven/UX] "Önizlemeyi aç" gerçek ödül gibi görünen sahte bir modal açıyor
- **Kanıt:** `page.tsx:89-95` (`couponCode: 'PREVIEW-2026'`, `points: 120`), `page.tsx:176-180`, `:267-269`, `:310-312`. Modal metinleri: `surprise-box-modal.tsx:239-240` ("Kazanılan puan +120"), `:264-265` ("Kayıtlandı… Ödül hesabına güvenle işlendi"), `:295-297` ("Aktif").
- **Sorun:** Kullanıcı 120 puan ve kullanılabilir bir kupon kazandığını sanıyor, bakiyesine baktığında puanı göremiyor, kuponu işletmede denediğinde kod geçersiz çıkıyor. Bu, destek talebi ve güven kaybı üreten bir desen. Üstelik buton "Kişisel öneri" kartının içinde ve amacı belirsiz.
- **Öneri:** Önizleme gerçekten gerekliyse, modala `mode: 'preview'` prop'u ekle: kupon ve puan alanları yerine "Bu bir örnek açılış" bandı göster, "Kayıtlandı/Aktif" metinlerini gizle, CTA "Gerçek kutunu aç"a dönüşsün. Daha iyisi: önizlemeyi tamamen kaldır. Her gün zaten gerçek bir günlük kutu olduğu için kullanıcı deneyimi gerçek kutuyla öğrenir. Onboarding'de bir kez gösterilecek "ilk kutu" eğitimi daha doğru yer.
- **Efor:** S

### 4. [YÜKSEK, İşlevsellik] Açılmış kutunun kupon kodu kalıcı olarak kayboluyor
- **Kanıt:** Geçmiş listesi yalnızca başlık, zaman ve puan gösteriyor (`page.tsx:443-468`). `couponCode` istemciye geliyor ama render edilmiyor. Modal ise "Kodu kaybetme, bir işletmede kullanacaksın" (`surprise-box-modal.tsx:279`) ve "Bu açılış hesabında saklanır" (`:306`) diyor.
- **Sorun:** Kupon içeren bir kutunun tüm değeri koddur. Modal kapandığında kullanıcı kodu bir daha göremiyor ve ödülünü fiilen kaybediyor. Kuponun durum, son kullanma ve kullanıldı bilgisi de modelde yok (`schema.prisma:262-285`), bu yüzden "Aktif" etiketi her zaman doğru değil.
- **Öneri:** Geçmiş satırını tıklanabilir yap ve bir "Ödül detayı" sheet'i aç (mobilde alttan açılan `Drawer`): mesaj, kupon kodu + kopyala, QR/barkod gösterimi, durum. Orta vadede kuponları `UserSurpriseBox.couponCode` serbest metninden çıkarıp mevcut kupon/ödül altyapısına bağla (bkz. `components/rewards/coupon-redeem-card.tsx`). Kutu açılınca bir `UserCoupon`/`RewardRedemption` kaydı üretilsin, kod "Cüzdanım"da yaşasın ve kullanıldığında `usedAt` işaretlensin.
- **Efor:** S (detay sheet), L (kupon cüzdanı entegrasyonu)

### 5. [ORTA, Hata yönetimi / i18n] Hata toast'ı çeviri anahtarını gösteriyor, "Kişisel öneri" cümlesi tekrarlı
- **Kanıt:** `page.tsx:122` ve `:170` → `surpriseBoxes.errorLoading` ve `surpriseBoxes.openError` anahtarları `messages/tr.json`/`en.json`'da yok. `i18n/request.ts:36` eksik anahtarda anahtarın kendisini döndürüyor, bu yüzden `|| 'Kutular yüklenemedi'` yedeği ölü kod. Tekrar: `page.tsx:137` "`{n} {common.consumptions}`" + `reviewHint` ("`{count} tüketim için…`").
- **Sorun:** Kullanıcı "Dikkat: surpriseBoxes.errorLoading" görüyor (`lib/admin-toast.ts` "Dikkat: " ekliyor). Öneri kartında "**3 Tüketim** 3 tüketim için yorum yazarsan…" yazıyor. Müşteri sayfası admin toast sarmalayıcısını kullanıyor (ASCII "Basarili:" öneki dahil). Ayrıca 25+ sabit Türkçe metin (`page.tsx:89-95, 155, 251, 268, 311`, modalın neredeyse tamamı) ve sabit `tr` date-fns locale'i (`page.tsx:400, 455`) EN arayüzünü yarı Türkçe bırakıyor. Bu dosyada `t || fallback` deseninin hiçbir dalı çalışmıyor.
- **Öneri:** Eksik anahtarları ekle ve `|| fallback` desenini kaldır. Sayfanın kendi `<span>` önekini sil, sayıyı çeviri değişkeninden bas. Müşteri tarafında `sonner`'ı doğrudan ya da müşteri tonlu bir toast yardımcısı kullan. Modal metinlerini `surpriseBoxes.modal.*` altında topla. `formatDistanceToNow` için locale'i `useAppLocale()`'den türet (`tr`/`enUS`). Uzun vadede `t()` geliştirmede eksik anahtar için uyarı loglamalı.
- **Efor:** S

### 6. [ORTA, Hata yönetimi] Hata durumu "kutun yok" boş durumu gibi görünüyor, gerçek boş durum ise erişilemez
- **Kanıt:** `page.tsx:100-126`: `res.ok` kontrolü yok, `boxesData.success === false` sessizce yutuluyor. `page.tsx:293-315`: genel boş durum. `app/api/surprise-box/route.ts:23-34`: her başarılı GET bugünün kutusunu üretiyor.
- **Sorun:** Başarılı her yüklemede en az bir kutu (bugünkü) olduğu için "Henüz sürpriz kutun yok" ekranı yalnızca API 401/500/503 döndüğünde görünüyor. Kullanıcı sistem hatasını "hiç kutum yok" diye okuyor ve "Tekrar dene" seçeneği yok. Ayrıca iki istek `Promise.all` ile bağlı: stats ucunun JSON parse hatası, başarılı kutu verisini de çöpe atıyor.
- **Öneri:** Veri katmanını React Query'ye (`useQuery(['surprise-boxes'])`) taşı ve `isError` için ayrı bir hata kartı + "Tekrar dene" göster. İki isteği bağımsızlaştır (stats düşerse yalnızca öneri kartı gizlensin). Boş durumu gerçek senaryoya göre yeniden yaz. Günlük kutu her zaman olacağı için boş durum yerine "Bugünün kutusu yarın 00:00'da" geri sayımı daha anlamlı.
- **Efor:** S-M

### 7. [ORTA, Güvenlik/Ekonomi] Modül anahtarı müşteri API'lerinde uygulanmıyor, kapalı modül puan basmaya devam ediyor
- **Kanıt:** `app/api/admin/surprise-box/send/route.ts:27-33` `assertModuleEnabled('surprise_boxes')` kullanıyor. `app/api/surprise-box/route.ts` ve `app/api/surprise-box/[id]/open/route.ts` kullanmıyor. `proxy.ts` sayfa düzeyinde modül kontrolü yapmıyor. Diğer müşteri uçları kullanıyor (ör. `app/api/customer/squads/route.ts`, `app/api/customer/lounge/route.ts`).
- **Sorun:** Admin "Sürpriz Kutular" modülünü kapattığında menü gizleniyor ama doğrudan URL veya API çağrısıyla günlük kutu üretilmeye ve 50-250 puan kredilenmeye devam ediyor. Modül anahtarının ekonomi için "acil fren" olması beklenir.
- **Öneri:** Her iki uca `assertModuleEnabled('surprise_boxes', { role: 'customer', … })` ekle (GET'te günlük kutu üretimini de bu kontrolün arkasına al). Sayfada modül kapalıysa bilgilendirici bir durum göster. Aynı kontrol açık kalan diğer puan basan uçlarda da taranmalı.
- **Efor:** S

### 8. [ORTA, Ürün tasarımı] "Sürpriz" kavramı baştan bozuluyor: ödül ve kupon açılmadan önce biliniyor
- **Kanıt:** `page.tsx:388-393` "+X puan potansiyeli" rozeti. `app/api/surprise-box/route.ts:43-48`: açılmamış kutular `couponCode`, `message`, `points`, `metadata` ile tam olarak istemciye gidiyor ve `all` alanında ikinci kez tekrarlanıyor.
- **Sorun:** Kullanıcı kartta kazanacağı puanı kesin görüyor. Açılış animasyonunun duygusal karşılığı (belirsizlik → ödül) kalmıyor. Kupon kodu DevTools'ta açılmadan okunabiliyor ve açma adımı atlanabiliyor. Bunun güvenlik etkisi düşük ama açılış metriklerini bozuyor.
- **Öneri:** GET yanıtında açılmamış kutular için yalnızca `id, title, createdAt, rarity/tier, source, expiresAt` döndür. İçerik (`points`, `couponCode`, `message`) yalnızca `POST /open` yanıtında gelsin, istemci modal içeriğini bu yanıttan kursun (şu an `box`'tan kuruyor: `page.tsx:158-164`). Kartta kesin puan yerine **nadirlik kademesi** göster (Ortak/Nadir/Efsanevi, rozet sistemiyle aynı dil), çünkü merak duygusunu besleyen şey kesin değer değil olasılık. `all` alanını kaldır.
- **Efor:** S-M

### 9. [ORTA, Mimari/Ekonomi] Günlük kutu bir GET yan etkisi, rastgele ve ekonomi kurallarından kopuk
- **Kanıt:** `app/api/surprise-box/route.ts:21-34` (GET içinde upsert, `Math.random()` ile 50-250, UTC gün anahtarı). `lib/surprise-box-config.ts:19-32` lig bazlı puan aralıkları tanımlıyor ama hiçbir yerde import edilmiyor. Ayrıca bağımsız bir günlük giriş serisi sistemi var: `lib/login-streak.ts:25-30` (3/7/14/30 gün kilometre taşları).
- **Sorun:** (a) "Günlük Giriş Ödülü" aslında "bu sayfayı ziyaret etme ödülü". Sayfaya girmeyen kullanıcı o günü kaybediyor ve bundan haberi olmuyor. (b) Güvenli olmayan, okumanın yazma yaptığı bir uç: prefetch, önbellek ısıtma ya da bot ziyareti de kutu üretiyor. (c) Ayda ~30 × ortalama 150 = ~4.500 puan, login streak'in 30 gün ödülünün (1000) 4,5 katı. Bu dengenin admin tarafında bir ayarı yok. (d) Gün UTC'ye göre döndüğü için TR'de 00:00-03:00 arası "dün" sayılıyor. (e) Lig kademesine göre ödül hazırlanmış ama kullanılmıyor.
- **Öneri:** Günlük kutuyu `touchLoginStreak` ile aynı "panel dokunuşu" olayına bağla (`POST /api/customer/daily-box/claim` ya da login streak sonucunun parçası olarak). Böylece giriş = kutu, ve seri ile kutu tek bir "günlük ritüel"de birleşir (Duolingo'nun streak + chest modeli). Puanı `getSurpriseBoxConfig(userLeague)` aralığından ve ağırlıklı nadirlik tablosundan üret (ör. %70 ortak, %25 nadir, %5 efsanevi). Değerleri `Settings`'te admin ayarı olarak tut. Gün anahtarını iş kuralı olarak `Europe/Istanbul`'a göre hesapla ya da UI'da sıfırlanma saatini açıkça göster. GET'i saf okuma yap.
- **Efor:** M

### 10. [ORTA, UX/Doğruluk] Açılış modalında sabit ve sahte meta bilgiler
- **Kanıt:** `surprise-box-modal.tsx:199` her kutuda "Günlük giriş ödülü". `:183` "Seviye: Premium" sabit. `:175` ve `:264` "Durum" zamanlayıcıya bağlı ("Hazır/Kayıtlandı"). `:112` "Ödül merkezi" sabit. `:252-253` puansız kutuda "Anında erişim / Kazanılan içerik hesabında hazır".
- **Sorun:** Admin'in kişisel bir hediye olarak gönderdiği kupon kutusu "Günlük giriş ödülü" diye açılıyor. Tüm kutular "Premium". Modal sunucudan gelen gerçek veriyi değil, dekoratif metni öne çıkarıyor. Puansız ve kuponsuz bir kutuda (ör. `rewardType: 'badge'`) ne kazanıldığı hiç söylenmiyor.
- **Öneri:** Modal içeriğini bir `RevealPayload` tipinden besle: `{ source: 'daily' | 'gift' | 'review' | 'campaign', tier, points, coupon?, badge?, sender? }`. Etiket kaynaktan türesin ("Günlük kutu", "Qratex'ten hediye", "İşletme X'ten"), seviye kademeden gelsin. Zamanlayıcıya bağlı "Durum" çiplerini kaldır ve yerine gerçek sonucu koy: yeni bakiye (`newPoints` zaten API'de dönüyor, `open/route.ts:91` ama kullanılmıyor) ve "Bakiyen 1.240 → 1.360" sayaç animasyonu.
- **Efor:** M

### 11. [ORTA, Erişilebilirlik] Açılış modalı erişilebilir bir dialog değil
- **Kanıt:** `surprise-box-modal.tsx:70-77`: düz bir `Motion.div` (`fixed inset-0`). `role`, `aria-modal`, `aria-labelledby`, odak yönetimi, Esc dinleyicisi ve body kaydırma kilidi yok. `AnimatePresence` `if (!open) return null` sonrasında olduğu için çıkış animasyonu da hiç çalışmıyor (`:64`, `:70`).
- **Sorun:** Ekran okuyucu kullanıcısı modalın açıldığını duymuyor. Tab ile modalın arkasındaki sayfaya geçilebiliyor. Esc çalışmıyor. Mobilde arka sayfa kaydırılabiliyor. Ödülün değeri (puan, kupon) `aria-live` ile duyurulmuyor.
- **Öneri:** Modalı shadcn `Dialog` (Radix) üzerine taşı. Odak tuzağı, Esc, `aria-*` ve kaydırma kilidi hazır geliyor, `forceMount` + `AnimatePresence` ile çıkış animasyonu da korunuyor. Ödül yuvasına `aria-live="polite"` metni ekle ("150 puan kazandın"). `reveal` fazında odağı birincil CTA'ya taşı. Azaltılmış harekette 3B sahne kurulmadığı için (`signature-gift-box-3d.tsx:736-737`) statik bir kutu görseli göster. Şu an alan boş kalıyor.
- **Efor:** M

### 12. [DÜŞÜK, Doğruluk] "Zaten açılmış" yanıtında sahte kutlama, ikinci kutuya tıklayınca kilit açılıyor
- **Kanıt:** `open/route.ts:32-37` ve `:76-83` `pointsGranted` döndürmüyor. `page.tsx:165` `?? box.points`'e düşüyor. `page.tsx:150` tek bir `openingId` tutuyor: A açılırken B'ye basılırsa A'nın butonu yeniden etkinleşiyor (`:408`).
- **Sorun:** Çift sekme veya çift dokunuş senaryosunda kullanıcı aynı kutu için ikinci kez "+X kazanıldı" kutlaması görüyor. Puan iki kez verilmiyor (sunucu doğru) ama UI yalan söylüyor.
- **Öneri:** `alreadyOpened` durumunda modal yerine "Bu kutu zaten açıldı" bilgisi ve detay sheet'i göster. Açılmakta olan kutuları `Set<string>` olarak tut ya da açılış sürerken tüm "Aç" butonlarını kilitle.
- **Efor:** S

### 13. [DÜŞÜK, Performans] İki sayı için ağır stats ucu, iki kat yanıt, her açılışta tam yeniden yükleme
- **Kanıt:** `page.tsx:103` → `app/api/customer/stats/route.ts:17-71`: 10 Prisma sorgusu (200'e kadar fiziksel kart, son 5 geri bildirim/tüketim, rozetler, görevler) çalışıyor, sayfa yalnızca `pendingReviewCount` ve `consumptionCount` kullanıyor (`page.tsx:115-119`). `app/api/surprise-box/route.ts:48` `all: boxes` (200 nesneye kadar tekrar). `page.tsx:168` her açılıştan sonra iki ucu yeniden çağırıyor (GET yine upsert yazıyor).
- **Sorun:** Neon üzerinde gereksiz sorgu yükü ve mobilde gereksiz veri. Açılıştan sonra liste bir an tutarsız kalıyor.
- **Öneri:** Kutu GET'ine `pendingReviewCount` ve "sonraki kutuya kalan" alanlarını ekle (2 `count` sorgusu), stats çağrısını kaldır. Açılış sonrası iyimser yerel güncelleme yap (kutuyu `unopened`'dan `opened`'ın başına taşı) ve React Query `setQueryData` kullan. `all` alanını sil.
- **Efor:** S

### 14. [DÜŞÜK, UX cilası] Küçük tutarsızlıklar
- **Kanıt ve sorunlar:**
  - Hero rozeti toplam kutu sayısını gösteriyor (`page.tsx:203`). Rozet dilinde "bekleyen" sayısı olmalı.
  - `useCallback(..., [])` ve `useMemo(..., [rewardStrategy])` bağımlılıklarında `t` eksik (`page.tsx:126`, `:146`). Dil değişince öneri metni eski dilde kalıyor.
  - Kart nabız animasyonu (`page.tsx:378-382`) opaklık tabanlı olduğu için `reducedMotion="user"` kapsamına girmiyor.
  - `clipboard.writeText` hatası yakalanmıyor, başarı toast'ı koşulsuz (`surprise-box-modal.tsx:57-62`).
  - "Yorum bekleyenler" bağlantısı (`page.tsx:256`) tüketimler sayfasının `pending` filtresine düşmüyor. Sayfa URL parametresi okumuyor (`app/customer/consumptions/page.tsx:67`).
  - Mobilde başlık kartı + hero aynı bilgiyi iki kez veriyor (`page.tsx:189-212`).
  - Dekoratif ikonların bir kısmında `aria-hidden` yok (`page.tsx:383`, `:390`, `:412`).
- **Öneri:** Rozet `unopened.length` göstersin. Bağımlılıkları düzelt. Nabzı `useReducedMotion()` ile koşullu yap. Kopyalamayı `await` + `try/catch` ile yaz. Bağlantıyı `?filter=pending` yap ve tüketimler sayfası bunu okusun. Mobil başlık kartını kaldırıp hero'yu başlık olarak kullan.
- **Efor:** S

### İlgili (sayfa dışı ama bu sayfanın verisini besliyor)
- `app/api/admin/surprise-box/send/route.ts:65-72`: "rastgele N müşteri" sırasız `findMany({ take: randomCount * 2 })` alıp karıştırıyor. Bu rastgele değil, tablonun ilk 2N satırından seçim. Postgres'te `ORDER BY random()` ya da id örneklemesi kullanılmalı. Ayrıca alıcıya bildirim gönderilmiyor (`:86-101`).
- Admin gönderiminde `points` için üst sınır yok (`send/route.ts:12`, `min(0)` var, `max` yok). Puan basan bir admin yolunun makul bir tavanı ve denetim kaydı olmalı.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Gerçek kazanım kuralları + ilerleme göstergesi** (Duolingo chest, Starbucks "Star" ilerlemesi): "Sonraki kutuya 2 yorum kaldı" çubuğu. Bugünkü sahte vaadin yerine konmalı (Bulgu 2).
2. **Nadirlik kademeleri ve ağırlıklı ödül tablosu** (Duolingo chest renkleri, gacha kademeleri): kartta kesin puan yerine kademe, açılışta kademe rengine göre efekt yoğunluğu. Kademe oranlarının şeffaf gösterimi ("Olasılıklar" bilgi sayfası) güvenin ve mevzuat uyumunun parçası.
3. **Ödül cüzdanı / kupon detay ekranı** (Starbucks Rewards "Offers", Revolut "Rewards" sekmesi): açılmış kuponlar, durum (aktif/kullanıldı/süresi doldu), QR/barkod, işletmede gösterme modu (Bulgu 4).
4. **Bildirim + menü rozeti**: yeni kutu geldiğinde push/uygulama içi bildirim ve sidebar'da "2" sayacı. Bugün admin hediyesi sessizce düşüyor.
5. **Son kullanma ve geri sayım**: "Bu kutunun süresi 2 gün sonra doluyor" ve "Yarınki kutu 14:32:10 sonra" sayaçları günlük dönüşü besler (Duolingo, Monzo bonus pencereleri).
6. **Paylaşılabilir açılış anı** (Spotify Wrapped kartı): efsanevi kutu açıldığında "Paylaş" ile marka görselli bir hikâye kartı, referral sistemine bağlı.

Ek olarak: toplu "Tümünü aç" (5+ birikmiş günlük kutu için, özet kartıyla), kutu kaynağı ("Kahve Durağı'ndan hediye") ve PostHog açılış hunisi olayları (`surprise_box_viewed/opened`, kademe ve kaynak boyutlarıyla). Şu an sayfada analytics olayı yok.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Her gün bir şey seni bekliyor." Kullanıcı panele girdiğinde günlük kutusunun hazır olduğunu bir rozetle görüyor. Kutunun ne getireceğini bilmiyor, yalnızca kademesini (renk ve parıltı) görüyor. Tek dokunuşla açıyor, 2 saniyelik ölçülü bir 3B açılış izliyor, ödülün bakiyesine aktığını sayaç animasyonuyla görüyor. Kupon kazandıysa kupon cüzdanına "uçtuğunu" görüyor ve istediği zaman geri bulabiliyor. Bir sonraki kutuya ne kadar kaldığını (yorum ilerlemesi + günlük geri sayım) her zaman biliyor.

**Yerleşim (mobil öncelikli):**
1. **Üst şerit: "Bugünün kutusu"** (tam genişlik, tek büyük kart). Açılmadıysa kademe renginde hafif nefes alan kutu görseli (statik WebP/CSS, 3B değil) + "Aç" CTA. Açıldıysa "Yarınki kutu 09:12:44 sonra" geri sayımı + günlük seri sayısı (login streak ile birleşik).
2. **"Bekleyen hediyeler"**: yatay kaydırmalı kartlar (kaynak logosu, kademe, son kullanma rozeti). 5+ kutu varsa "Tümünü aç" butonu.
3. **"Sonraki kutu" ilerleme kartı**: gerçek kurala bağlı ilerleme çubuğu ("3/5 yorum"), tek CTA: `/customer/consumptions?filter=pending`.
4. **"Ödüllerim" (geçmiş)**: en yeniden eskiye, sonsuz kaydırma. Satıra dokununca detay drawer'ı (kupon kodu, QR, durum, mesaj).
5. Mobil başlık kartını ve 3'lü stat çiplerini kaldır. Sayılar bölüm başlıklarında yaşasın.

**Motion/3D (yerinde ve ölçülü):**
- 3B imza kutu **yalnızca açılış anında** kalsın (mevcut lazy chunk doğru). Liste kartlarında 3B kullanma, statik görsel yeterli.
- Kademeye göre efekt yoğunluğu: ortak → kısa açılış, bloom yok. Nadir → bloom. Efsanevi → ışın patlaması + haptic (`navigator.vibrate`, destekleniyorsa). Böylece efekt bilgi taşıyor, süs olmaktan çıkıyor.
- Ödül sonrası `layoutId` ile ödül ikonunun header'daki puan rozetine "uçması" ve bakiyenin sayaç animasyonu (Revolut cashback hissi).
- Azaltılmış hareket: 3B yerine statik açık kutu görseli + anında ödül metni. Nabız/parıltı yok, ses yok.
- Toplam açılış süresi 1,8 saniyeyi aşmasın ve ikinci açılıştan itibaren "Atla" dokunuşu olsun.

**Veri/API değişiklikleri:**
- `UserSurpriseBox`'a alanlar: `source` (enum: DAILY/GIFT/REVIEW_MILESTONE/WEEKLY_VICTORY/CAMPAIGN), `tier` (COMMON/RARE/EPIC/LEGENDARY), `expiresAt`, `sourceKey` (idempotent üretim için `@@unique([userId, sourceKey])`, mevcut `dayKey`'i genelleştirir), `dealerId?` (işletme hediyesi için). Bileşik indeks `@@index([userId, openedAt, createdAt])`.
- `GET /api/surprise-box?status=unopened|opened&cursor=`: açılmamışlarda içerik alanları gizli, iki ayrı sorgu, `counts` + `nextBox` (kalan yorum, sonraki günlük saat) alanları. Saf okuma, `assertModuleEnabled` arkasında.
- Günlük kutu üretimi `touchLoginStreak` olayına taşınsın. Puan `lib/surprise-box-config.ts` (lig aralığı) + ağırlıklı kademe tablosundan, değerler `Settings`'ten gelsin.
- `POST /api/surprise-box/[id]/open` tam `RevealPayload` dönsün (`tier, source, points, newPoints, coupon{code, expiresAt}, badge?`). Kupon bir cüzdan kaydına bağlansın. `POST /api/surprise-box/open-all` toplu açılış için tek transaction.
- `ConsumptionReview` oluşturma noktasında (rozet sayacının yanında) eşik bazlı `REVIEW_MILESTONE` kutusu üretimi. Admin gönderiminde ve her yeni kutuda bildirim (`Notification` + push).
- PostHog: `surprise_box_viewed`, `surprise_box_opened` (tier, source), `surprise_coupon_copied`.

---

## Çakışmalar / birleştirme önerisi

- **/customer/rewards**: Aynı "sürpriz açılış" fikrinin ikinci bir uygulaması orada var (`SurpriseEggThreeModal`, `app/customer/rewards/page.tsx:43-44`, `:787-796`), ayrı bir görsel dil ve ayrı bir 3B bileşenle (`components/rewards/surprise-egg-three-modal-premium.tsx`). Kullanıcı açısından "ödül mağazası", "sürpriz kutu" ve "sürpriz yumurta" aynı ödül alanının parçaları. **Öneri:** Bu sayfa /customer/rewards içinde "Kutularım" sekmesi (ya da rewards hub'ın en üst şeridi) olsun. Açılış deneyimi tek bir `RewardReveal` bileşeninde (imza kutu) birleşsin, yumurta modalı emekliye ayrılsın. `/customer/surprise-boxes` rotası yönlendirme olarak kalsın (weekly-card CTA'sı, lounge, discover ve sidebar bağlantıları buraya işaret ediyor: `app/api/customer/weekly-card/route.ts:60`, `app/customer/lounge/page.tsx:235`, `app/customer/discover/page.tsx:37`, `components/dashboard/sidebar.tsx:305`).
- **Günlük giriş serisi (`lib/login-streak.ts`) ve oyun serisi (`app/api/customer/games/streak`)**: "Günlük Giriş Ödülü" kutusu üçüncü bir günlük ritüel. Login streak ile tek bir "günlük kutu + seri" mekaniğinde birleştirilmeli (Bulgu 9). Oyun serisi ayrı kalabilir.
- **/customer/lounge** sürpriz kutulara yalnızca bağlantı veriyor, çakışma yok. Birleştirme sonrası bağlantı hedefi güncellenmeli.
- **Admin tarafı**: `/admin/surprise-boxes` bu sayfanın içerik kaynağı. Yeniden tasarımda kaynak/kademe/son kullanma alanları ve bildirim seçeneği admin gönderim formuna da eklenmeli.

---

## Doğrulama (şüpheci inceleme)

### 1. Sadık kullanıcıda (≥100 açılmış kutu) açılmamış kutular API yanıtından tamamen düşüyor — **DOĞRULANDI**

- `app/api/surprise-box/route.ts:37-41` sorgusu `orderBy: [{ openedAt: 'asc' }, { createdAt: 'desc' }]` ve `take: 100` kullanıyor. Prisma, `nulls` seçeneği verilmediğinde SQL'e `NULLS FIRST/LAST` eklemez; PostgreSQL'de `ASC` için varsayılan `NULLS LAST`'tır. `openedAt` alanı `DateTime?` ve `null = henüz açılmadı` anlamında (`prisma/schema.prisma:275`). Yani açılmamış kutular sıralamanın sonuna düşer.
- Kodun yorumu (`route.ts:9` "açılmamış önce") niyetin tam tersini söylüyor; niyet ile davranış çelişiyor.
- `unopened`/`opened` ayrımı sorgudan sonra bellekte yapılıyor (`route.ts:43-44`), dolayısıyla ilk 100 satırın hepsi açılmış kutuysa `unopened` boş döner. Sayfa yalnızca bu listeyi kullanıyor (`app/customer/surprise-boxes/page.tsx:102-113`) ve açma butonu yalnızca bu listeden çağrılıyor (`page.tsx:148-152`). Kutuyu açmanın başka bir istemci yolu yok (repo genelinde `/api/surprise-box/[id]/open` çağıran tek yer bu sayfa).
- Eski açılmış kutuları silen bir cron/temizlik yok (`userSurpriseBox` yalnızca listelenen route'larda ve `lib/surprise-badges.ts:142` sayımında geçiyor), yani 100 sınırı bir kez aşılınca durum kalıcı.
- **Yeniden üretim:** Bir müşteri sayfayı 100 farklı UTC gününde ziyaret edip her günün kutusunu açsın (ya da admin 100'den fazla hediye göndersin, kullanıcı hepsini açsın). 101. gün `GET /api/surprise-box` bugünün kutusunu upsert ile oluşturur (`route.ts:23-34`), fakat `findMany` en eski 100 açılmış kutuyu döndürür; `unopened: []` gelir, UI "açılacak kutu yok" durumuna düşer, günlük kutu ve sonraki admin hediyeleri hiçbir zaman açılamaz ve puan kredilenmez. "Açılmış" sekmesi de en eski 100 açılışta donar.
- **Öneri:** Tek `findMany + take` yerine iki ayrı sorgu: `where: { userId, openedAt: null }` (açılmamışların tamamı ya da makul bir üst sınır, `createdAt desc`) ve `where: { userId, openedAt: { not: null } }` + `orderBy: { openedAt: 'desc' }` + cursor sayfalama. Sayaçlar `count`/`groupBy` ile ayrı dönsün. Böylece açılmamış kutular sıralama yan etkisine bağlı kalmaz; mevcut `@@index([userId])` + `@@index([openedAt])` yerine `@@index([userId, openedAt, createdAt])` bileşik indeksi eklenmeli.

### 2. Modül anahtarı kapalıyken müşteri uçları günlük kutu üretmeye ve puan kredilemeye devam ediyor — **DOĞRULANDI**

- `app/api/surprise-box/route.ts` (GET) ve `app/api/surprise-box/[id]/open/route.ts` (POST) içinde `assertModuleEnabled` çağrısı yok; yalnızca oturum ve `CUSTOMER` rol kontrolü var (`route.ts:12-15`, `open/route.ts:16-19`). Admin tarafı aynı modülü kapılıyor (`app/api/admin/surprise-box/route.ts:13`, `app/api/admin/surprise-box/send/route.ts:27`).
- `surprise_boxes` gerçek bir modül anahtarı (`lib/module-controls.ts:24`) ve kapatıldığında etkisi yalnızca sidebar filtresinde görülüyor (`components/dashboard/sidebar.tsx:450-455`). `proxy.ts` içinde modül/görünürlük kontrolü yok (grep: eşleşme yok), `app/customer/**/layout.tsx` içinde de yok. Sayfa doğrudan URL ile ve lounge/discover/weekly-card bağlantılarıyla açılabiliyor.
- Diğer müşteri modülleri bu deseni uyguluyor (örn. `app/api/customer/donations/route.ts:38`, `app/api/customer/squads/route.ts:16`, `app/api/customer/discovery/route.ts:105`), yani bu bir tutarsızlık, bilinçli bir istisna değil.
- **Yeniden üretim:** Admin `/admin` modül kontrollerinden `surprise_boxes`'ı kapatır. Müşteri `/customer/surprise-boxes` adresine doğrudan gider (veya `GET /api/surprise-box` çağırır): günlük kutu 50-250 puanla oluşturulur (`route.ts:22-34`), ardından `POST /api/surprise-box/{id}/open` `creditPointsAndXp` ile puanı kredilendirir (`open/route.ts:54-59`). Admin'in "acil fren" beklentisi karşılanmıyor; ayrıca kapalıyken admin daha önce gönderilmiş hediye kutuları da açılabiliyor.
- **Önem notu:** Kimlik/yetki atlatma değil (kullanıcı yalnızca kendi kutusunu, sunucunun belirlediği puanla açabiliyor; günde bir kutu `@@unique([userId, dayKey])` ile sınırlı). Etki, puan basan bir yolun yönetici kill-switch'inden kaçması; puan ekonomisi değişmezleri açısından YÜKSEK kabul edilebilir, KRİTİK değil.
- **Öneri:** Her iki uca `assertModuleEnabled('surprise_boxes', { userId, request, routeKey })` eklenmeli (GET'te upsert'ten ÖNCE). Sayfa 403 + `moduleKey` yanıtını tanıyıp "Bu modül geçici olarak kapalı" boş durumu göstermeli. Kalıcı çözüm olarak müşteri sayfaları için `detailHref` üzerinden modül kapısını `app/customer/layout.tsx` (sunucu bileşeni) veya proxy seviyesinde tek yerde uygulamak, her yeni modülde aynı hatanın tekrarını önler.


---

## Uygulama (Dalga 2)

**Yeni yer:** `/customer/wallet/owned?tab=boxes` (Cüzdan → Ödüllerim → Kutularım). `/customer/surprise-boxes` kalıcı yönlendirme koçanı. Eski `GET /api/surprise-box` (GET'te kutu üreten yan etki) ve `POST /api/surprise-box/[id]/open` silindi; yerlerine `POST /api/customer/wallet/boxes/daily` (yalnız "Aç"ta, İstanbul günü, kriptografik rastgele 50–250, modül kapısı), `POST /api/customer/wallet/boxes/[id]/open` (sahiplik `where`'de, atomik `openedAt`, puan `mintPoints` — tek-kez `surprise:<id>`, defter + `points_credited`, fraud kapısı) ve `GET /api/customer/wallet/owned-history?kind=boxes&cursor=` geldi. Açılış: mevcut imza 3B kutu (`signature-gift-box-lazy`, ayrı chunk) yeni erişilebilir `BoxRevealDialog` içinde. `surprise-box-modal.tsx` kaldırıldı. Test: `__tests__/lib/wallet-rewards.test.ts`, `__tests__/api/wallet-rewards-routes.test.ts`.

| # | Özellik | Yeni durum | Not / gerekçe |
|---|---|---|---|
| 1 | Metadata | ÇALIŞIYOR | Ödüllerim meta (TR/EN). |
| 2 | Rol koruması | ÇALIŞIYOR | Sayfa + uçlar (`defineRoute` CUSTOMER, DB'den yetki). |
| 3 | Modül aç/kapa | ÇALIŞIYOR | Sayfa "Kutular kapalı" durumu; günlük üretim ve açma uçları 403 `MODULE_DISABLED`. |
| 4 | Masaüstü başlık | ÇALIŞIYOR | Cüzdan kabuğu tek `h1`. |
| 5 | Mobil başlık kartı | KALDIRILDI | Kabuk + sekmeler yeterli; mobilde ilk ekranı yemiyor. |
| 6 | Hero ikon + sayaç | ÇALIŞIYOR | Sekme sayacı = BEKLEYEN kutu (toplam değil). |
| 7 | Hero metinleri | KALDIRILDI | Bölüm başlıkları ve açıklamaları taşıyor. |
| 8 | 3 istatistik çipi | KALDIRILDI | 100'de tavan yapan yanlış "Toplam" yerine sekme/bölüm sayıları. |
| 9 | Hero iskeleti | ÇALIŞIYOR | Sunucu render; kabuk iskeleti. |
| 10 | "Kişisel öneri" cümlesi | KALDIRILDI | Tekrarlı ve sahte mekaniğe bağlıydı. |
| 11 | "Yorum yazarsan ihtimal artar" | KALDIRILDI | Kod tabanında karşılığı yok (yalan vaat). |
| 12 | "Ritmini koru" ipucu | KALDIRILDI | Karşılığı yok. |
| 13 | Toplam tüketim satırı | KALDIRILDI | Hareketler'e ait. |
| 14 | "Daha fazla kutu" rozeti | KALDIRILDI | Anlamsız süs. |
| 15 | "Yorum bekleyenler" bağlantısı | KALDIRILDI | Sahte vaadin CTA'sıydı. |
| 16 | "Geri bildirimlerim" bağlantısı | KALDIRILDI | Seslerim'e ait. |
| 17 | "Önizlemeyi aç" | KALDIRILDI | Sahte +120 puan / `PREVIEW-2026` kuponu gösteriyordu. |
| 18 | Genel boş durum | ÇALIŞIYOR | Gerçek boşlar ("Bekleyen hediye kutun yok", "Henüz kutu açmadın"); hata ayrı `ErrorState`. |
| 19 | Liste iskeleti | ÇALIŞIYOR | Sunucu render + kabuk iskeleti. |
| 20 | Sekmeler | ÇALIŞIYOR | Kodlarım · Kutularım (Radix, URL'de). |
| 21 | "Açılacak kutu yok" | ÇALIŞIYOR | Sahte CTA yok. |
| 22 | Açılmamış kutu kartları | ÇALIŞIYOR | Ayrı sorgu (`openedAt: null`, yeniden eskiye) — 100 sınırı/NULLS LAST hatası kapandı. |
| 23 | Sonsuz nabız | KALDIRILDI | ops kaydında döngü yok. |
| 24 | "+X puan potansiyeli" | KALDIRILDI | Yerine nadirlik KADEMESİ (içerik açılmadan sızmıyor). |
| 25 | Göreli zaman | ÇALIŞIYOR | İstanbul saat dilimi + uygulama dili. |
| 26 | "Kutuyu aç" butonu | ÇALIŞIYOR | Açılış sürerken TÜM aç butonları kilitli (Bulgu 12). |
| 27 | Açma API'si | ÇALIŞIYOR | `mintPoints` (kilit, tek-kez, defter, `points_credited`, fraud kapısı). |
| 28 | "Zaten açılmış" yanıtı | ÇALIŞIYOR | `alreadyOpened: true` → kutlama yok, "+X kazandın" yalanı yok. |
| 29 | Ses efekti | KALDIRILDI | Yalnız destekleniyorsa ve politika izin verirse kısa titreşim (destansı/efsanevi). |
| 30 | Açılış sonrası yeniden çekme | ÇALIŞIYOR | Yalnız sunucu sayfası tazelenir; 10 sorgulu stats ucu yok. |
| 31 | Günlük kutu üretimi | ÇALIŞIYOR | GET yan etkisi yok; İstanbul günü; `crypto.randomInt`. |
| 32 | Faz animasyonu + 3B kutu | ÇALIŞIYOR | ≤ 1,8 sn, "Atla"; azaltılmış harekette 3B kurulmaz, statik kutu + anında sonuç. |
| 33 | Ödül yuvası | ÇALIŞIYOR | Sunucunun `RevealPayload`'ından. |
| 34 | "Durum/Tür/Seviye: Premium" çipleri | KALDIRILDI | Yerine gerçek kademe + kaynak. |
| 35 | "Günlük giriş ödülü" etiketi | ÇALIŞIYOR | Kaynaktan türer: "Günlük kutu" / "Qratex'ten hediye". |
| 36 | "Kayıtlandı" kartı | KALDIRILDI | Yerine gerçek yeni bakiye ("Yeni bakiyen N puan"). |
| 37 | Kupon kodu + kopyala | ÇALIŞIYOR | `await` + hata yakalama; sabit "Aktif" yok. |
| 38 | Modal kapatma | ÇALIŞIYOR | Esc, X, Tamam; açılış isteği sürerken kilitli. |
| 39 | Modal klavye/odak/ARIA | ÇALIŞIYOR | Radix Dialog (odak tuzağı, kaydırma kilidi), sonuç `aria-live` + "Tamam"a odak. |
| 40 | Geçmiş listesi | ÇALIŞIYOR | Yeniden eskiye, kupon kodu görünür, satır detay açar (`?pass=box:<id>`, QR). |
| 41 | Geçmiş boş durumu | ÇALIŞIYOR | |
| 42 | Hata yönetimi | ÇALIŞIYOR | Kodlu, çevrilmiş hata; ham anahtar yok; yeniden dene. |
| 43 | i18n | ÇALIŞIYOR | `copy.ts` TR/EN. |
| 44 | Açılmış kutunun kuponu | ÇALIŞIYOR | Geçmişte + detayda (QR + kopyala). |
| 45 | Yeni kutu bildirimi / menü rozeti | UYGULANMADI | Admin gönderim ucu ve menü rozetleri başka ajanların; sekme sayacı var. |
| 46 | Son kullanma / aciliyet | UYGULANMADI | `expiresAt` yok → ŞEMA İSTEĞİ. Bugünün kutusu için gece yarısı geri sayımı var. |
| 47 | Sayfalama | ÇALIŞIYOR | Cursor (20'şer). |

**Kapanan bulgular (13/14):** B1, B2 (B seçeneği: sahte vaatler kaldırıldı), B3, B4, B5, B6, B7, B8, B10, B11, B12, B13, B14; B9 kısmen (GET yan etkisi, UTC günü ve `Math.random` kapandı; login streak ile birleşme ve lig aralıkları — ekonomi ayarı — kalan).
**Eksik özelliklerden uygulananlar:** nadirlik kademesi, kupon cüzdanı/detayı (QR, kasada göster), günlük geri sayım, tam geçmiş.
**ŞEMA İSTEKLERİ:** `UserSurpriseBox.source` (enum), `tier`, `expiresAt`, `sourceKey` (`@@unique([userId, sourceKey])`), `dealerId?`, `@@index([userId, openedAt, createdAt])`.
