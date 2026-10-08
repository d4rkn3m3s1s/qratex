# /admin/cards

**Amaç:** Qratex fiziksel QR kartlarının (PhysicalCard) yaşam döngüsünü platform operatörü olarak yönetmek: toplu üretim (batch), listeleme/filtreleme, müşteriye atama/atamayı kaldırma, bloklama/blok kaldırma, silme, QR/aktivasyon URL'si görüntüleme.

**Genel puan:** 4.8 / 10 · **Karar:** yeniden tasarla

Temel CRUD akışı çalışıyor ve API katmanı `requireAuth(['ADMIN'])` ile korunuyor. Ancak fiziksel kart operasyonunun en kritik parçası olan **üretilen kartları baskıya göndermek için dışa aktarma hiç yok**. Bunun yanında bloklu kartın "müşteriden kaldır" ile sessizce yeniden aktive edilebilir hâle gelmesi, silmenin tüketim/yorum/telafi geçmişini kalıcı olarak yok etmesi, atama akışındaki yarış koşulu ve istemci tarafında `null` isimle çökme gibi doğruluk sorunları var. Sayfanın bilgi mimarisi (sayfalı veride Kanban, tekrarlanan istatistikler, pazarlama çipleri) bir iç araç için yanlış kurgulanmış.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Üret/ata/kaldır/blokla/sil çalışıyor; ancak dışa aktarma/baskı yok, detay modalı mevcut detay API'sini kullanmıyor, filtre değişince sayfa sıfırlanmıyor. |
| UX | 5/10 | Sayfalı 20 kaydı Kanban'a bölmek yanıltıcı; blok için onay ve sebep girişi yok; müşteri seçimi aranamayan 100 kişilik açılır liste. |
| Görsel | 6/10 | shadcn ile tutarlı ve temiz; ama hero + istatistik kartları aynı sayıyı iki kez gösteriyor, "Canlı durum / Mobil uyumlu" çipleri iç araçta gereksiz pazarlama dili. |
| Mimari | 4/10 | Kontrol-sonra-güncelle yarışları, işlem dışı audit/bildirim yazımı, bloklu kartın kilidini açan unassign, kalıcı kaskad silme, sabit kodlu demo domain. |
| Performans | 6/10 | `dynamic(ssr:false)` + AbortController + debounce iyi; ama batch istatistiklerinde sınırsız N+1 `groupBy`, açılışta kullanılmayabilecek 100 kullanıcının ağır select'i. |
| Erişilebilirlik + mobil | 4/10 | İkon-butonlarda `aria-label` yok, batch kartları klavyeyle seçilemiyor, kopyala butonu hover'a kadar görünmez, mobil liste görünümünde blok/ata/sil aksiyonları yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa kabuğu: `dynamic(ssr:false)` + iskelet yükleyici | ÇALIŞIYOR | app/admin/cards/page.tsx:7-20 | İskelet gerçek yerleşimle uyumlu. |
| 2 | Yetki: tüm admin kart API'leri `requireAuth(['ADMIN'])` | ÇALIŞIYOR | app/api/admin/cards/route.ts:16, batches/route.ts:15, generate/route.ts:18, [id]/route.ts:19,90,170, assign:23, unassign:19 | Sayfa ayrıca proxy admin kapısının arkasında. |
| 3 | Hero (başlık, açıklama, ikon) | ÇALIŞIYOR | cards-client.tsx:462-466 | AdminPremiumHero `useReducedMotion` destekli. |
| 4 | Hero çipleri "Canlı durum / Mobil uyumlu / Hızlı aksiyonlar / Kanban + Liste" | SAHTE | cards-client.tsx:469-472 | Sabit metin; sayfada canlı güncelleme (polling/realtime) yok. |
| 5 | Hero yan panel: Toplam + Aktif mini istatistik | ÇALIŞIYOR | cards-client.tsx:477-486 | Hemen altındaki istatistik kartlarıyla birebir tekrar. |
| 6 | "Kart Üret" CTA | ÇALIŞIYOR | cards-client.tsx:487-494 | |
| 7 | 4 istatistik kartı (Toplam/Aktive edilmemiş/Aktif/Bloklu) | ÇALIŞIYOR | cards-client.tsx:500-529, route.ts:74-91 | Global sayılar; filtreden bağımsız olduğu belirtilmiyor. Stagger animasyonu MotionConfig `reducedMotion="user"` ile saygılı (components/providers.tsx:232). |
| 8 | "Son Üretimler" batch kartları (son 6) | ÇALIŞIYOR | cards-client.tsx:532-559 | Tümünü gör bağlantısı yok; oluşturan/tarih gösterilmiyor (API dönüyor). |
| 9 | Batch kartına tıklayınca batch filtresi aç/kapat | KISMİ | cards-client.tsx:543 | Sayfa numarası sıfırlanmıyor; `div` klavyeyle erişilemez. |
| 10 | Sonuç sayacı "N kart bulundu" | KISMİ | cards-client.tsx:565-567 | Sunucu toplamı; istemci yerel filtresiyle tutarsızlaşabiliyor (#14). |
| 11 | Görünüm geçişi Kanban / Liste | KISMİ | cards-client.tsx:569-588, 156 | Seçim kalıcı değil (URL/localStorage yok), `aria-pressed` yok; varsayılan Kanban. |
| 12 | Arama (token / müşteri adı / e-posta), 300 ms debounce, sunucu tarafı | ÇALIŞIYOR | cards-client.tsx:188-195, 213; route.ts:44-50 | |
| 13 | Arama değişince sayfa 1'e dönme | ÇALIŞIYOR | cards-client.tsx:193-195 | Yalnız arama için. |
| 14 | İstemci tarafı ikinci arama filtresi (`filteredCards`) | BOZUK | cards-client.tsx:444-452 | Müşteri adı `null` ise `card.customer?.name.toLowerCase()` TypeError fırlatır (User.name nullable: prisma/schema.prisma:31). |
| 15 | Durum filtresi | KISMİ | cards-client.tsx:602-612 | Değişince `page` sıfırlanmıyor → boş sayfa riski. |
| 16 | Batch filtresi (select) | KISMİ | cards-client.tsx:613-625 | Aynı sayfa sıfırlama sorunu. |
| 17 | "Sıfırla" butonu | KISMİ | cards-client.tsx:626-637 | Filtreleri temizliyor, `page`'i sıfırlamıyor. |
| 18 | Yükleniyor durumu | ÇALIŞIYOR | cards-client.tsx:645-648 | Tam alan spinner; içerik kaybolur (layout shift), `aria-live` yok. |
| 19 | Boş durum "Kart bulunamadı" | KISMİ | cards-client.tsx:649-653 | Filtre mi, veri yok mu ayrımı ve "Kart üret / filtreyi temizle" aksiyonu yok. |
| 20 | Hata durumu (liste) | KISMİ | cards-client.tsx:219-229 | `!data.success` (401/500) sessizce yutulur, eski veri kalır; yalnız ağ hatası toast'lanır. |
| 21 | Kanban görünümü (3 sütun) | KISMİ | cards-client.tsx:654-745 | 20 kayıtlık sayfanın bölünmüş hâli; sütun sayaçları sayfa-yerel; sürükle-bırak yok. |
| 22 | Kanban kartı: token + kopyala | ÇALIŞIYOR | cards-client.tsx:676-683 | İkon butonda `aria-label` yok. |
| 23 | Kanban kartı: Detay + İşlemler menüsü | ÇALIŞIYOR | cards-client.tsx:691-736 | |
| 24 | Liste görünümü – masaüstü tablo | ÇALIŞIYOR | cards-client.tsx:776-914 | Sıralama/sütun seçimi/toplu seçim yok. |
| 25 | Tabloda token kopyalama (hover'da görünür) | KISMİ | cards-client.tsx:796-803 | `opacity-0`; klavye odağında görünmez kalır. |
| 26 | Tabloda müşteri avatarı | ÇALIŞIYOR | cards-client.tsx:812-828 | `name` null ise boş ad. |
| 27 | Liste görünümü – mobil kart listesi | KISMİ | cards-client.tsx:749-773 | Yalnız "Detay" ve "URL"; ata/kaldır/blokla/sil yok. |
| 28 | Satır menüsü: Detay & QR | ÇALIŞIYOR | cards-client.tsx:846-849 | |
| 29 | URL kopyala | KISMİ | cards-client.tsx:439-442 | `clipboard.writeText` beklenmiyor; hata olsa da başarı toast'ı. |
| 30 | Token kopyala | KISMİ | cards-client.tsx:434-437 | Aynı sorun. |
| 31 | Müşteriye ata (menü + dialog) | KISMİ | cards-client.tsx:857-865, 1115-1168; assign/route.ts | Yarış koşulu (#B4); yalnız son 100 müşteri, arama yok. |
| 32 | Müşteri listesi yükleme | KISMİ | cards-client.tsx:256-266 | `/api/admin/users?role=CUSTOMER&pageSize=100` – 100 sınırı (validations-admin.ts:10), ağır select (users/route.ts:169-195), `any` (261). |
| 33 | Atama sonrası müşteriye bildirim | KISMİ | assign/route.ts:114-122 | `type: 'SYSTEM'` bildirim merkezinin tanıdığı tiplerden değil (notification-center.tsx:39-44). |
| 34 | Müşteriden kaldır (onay dialogu) | BOZUK | cards-client.tsx:866-874, 1171-1193; unassign/route.ts:54-61 | Bloklu kart için de gösteriliyor ve kartı `UNUSED` yaparak bloğu sessizce kaldırıyor (#B1). |
| 35 | Unassign bildirimi | KISMİ | unassign/route.ts:82-89 | `type: 'WARNING'` (büyük harf) → bilgi stiline düşer. |
| 36 | Blokla | KISMİ | cards-client.tsx:301-324, 879-886; [id]/route.ts:85-159 | Onay yok, sebep girişi yok (sabit "Admin tarafından bloklandı"). |
| 37 | Blok kaldır | KISMİ | cards-client.tsx:307, 887-894 | Müşteri o arada başka aktif kart aldıysa iki aktif kart oluşur; sunucu durum tutarlılığını doğrulamıyor. |
| 38 | Sil (onay dialogu) | BOZUK | cards-client.tsx:1196-1221; [id]/route.ts:165-244 | Tüketim/yorum/telafi teklifleri ve kart audit izi kalıcı silinir (#B2); 0 tüketimde açıklamaya "0" basılır (#B6). |
| 39 | Toplu kart üretimi dialogu (ad, adet, prefix) | KISMİ | cards-client.tsx:948-1026; generate/route.ts | Çalışıyor; işlem dışı, `createMany skipDuplicates` sayısı yok sayılıyor, yanıttaki `sampleTokens` kullanılmıyor. |
| 40 | Üretilen kartları dışa aktarma (CSV/PDF/baskı) | EKSİK | `Download` ikonu import edilmiş ama kullanılmıyor (cards-client.tsx:11); repo genelinde export uç noktası yok | Fiziksel kart operasyonunun ana çıktısı. |
| 41 | Kart detay modalı: QR, token, URL, durum, tüketim sayısı, müşteri, blok sebebi | KISMİ | cards-client.tsx:1029-1112 | Eski QR görüntüsü kalabiliyor (#B5); tarihler, batch, tüketim listesi, audit geçmişi yok. |
| 42 | Detay API'si `GET /api/admin/cards/[id]` (tüketim + audit log) | KISMİ | [id]/route.ts:14-79 | Sayfa bu ucu hiç çağırmıyor. |
| 43 | QR indirme / yazdırma | EKSİK | cards-client.tsx:1040-1049 | Yalnız ekranda `<img>`. |
| 44 | Sayfalama (Önceki/Sonraki) | KISMİ | cards-client.tsx:920-945 | Sayfa numarası atlama, sayfa boyutu seçimi, URL senkronu yok. |
| 45 | Toplu işlemler (çoklu seçim, toplu blok, batch blok) | EKSİK | — | Kayıp/çalıntı sevkiyat senaryosu için gerekli. |
| 46 | Audit kaydı (üret/blok/ata/kaldır/sil) | KISMİ | generate:89-104, [id]:134-147, 217-233, assign:97-111, unassign:64-79 | Var ama işlem (transaction) dışında; silmede kartın kendi audit izi siliniyor. |
| 47 | Toast mesajları | KISMİ | cards-client.tsx:270, 285, 289, 295, 315, 319, 322, 328, 343, 347, 353, 371, 375, 381, 398, 407, 436, 441 | Türkçe karakterler eksik ("Musteri", "uretildi", "kopyalandi"); lib/admin-toast.ts "Basarili:" öneki. |
| 48 | Azaltılmış hareket | ÇALIŞIYOR | components/providers.tsx:232; admin-premium-hero.tsx:73 | Global MotionConfig. |

Durum özeti (48 özellik): ÇALIŞIYOR 16 · KISMİ 25 · BOZUK 3 · SAHTE 1 · EKSİK 3. (#42 detay API ucu mevcut ama sayfa tarafından kullanılmadığı için KISMİ sayıldı.)

---

## Bulgular

### B1 — Bloklu kart "Müşteriden Kaldır" ile sessizce yeniden aktive edilebilir hâle geliyor
- **Önem:** kritik · **Kategori:** güvenlik / veri bütünlüğü · **Efor:** S
- **Kanıt:** Menü öğesi yalnız `card.customer` koşuluna bakıyor, durumu kontrol etmiyor (cards-client.tsx:712, 866). Sunucu unassign'da durumu kontrol etmeden `status: 'UNUSED'` yazıyor, `blockedAt/blockReason` temizlenmiyor (app/api/admin/cards/[id]/unassign/route.ts:46-61). Halka açık aktivasyon yalnız `BLOCKED` ve `ACTIVATED` durumlarını reddediyor (app/api/cards/[token]/activate/route.ts:58-69).
- **Sorun:** Çalıntı/sahte kullanım nedeniyle bloklanmış bir kart, bir admin "müşteriden kaldır" dediğinde `UNUSED` olur; token'ı elinde tutan herhangi biri `/c/[token]` üzerinden kartı kendi hesabına aktive edebilir. Üstelik kayıt `UNUSED` + dolu `blockReason` ile çelişkili kalır.
- **Öneri:** Kart durumunu açık bir durum makinesiyle yönetin (`lib/cards/lifecycle.ts`): izinli geçişler tablosu (`UNUSED→ACTIVATED`, `ACTIVATED→BLOCKED`, `BLOCKED→ACTIVATED|UNUSED (yalnız explicit unblock)`, `ACTIVATED→UNUSED (yalnız unassign)`). Unassign uç noktası `status !== 'ACTIVATED'` ise 409 dönsün; UI'da bloklu kartlarda "Müşteriden Kaldır" gizlensin ya da "önce blok kaldır" ipucu gösterilsin. Aynı geçiş tablosu PATCH'te de uygulanmalı (bugün PATCH müşterisiz bir kartı `ACTIVATED` yapabiliyor — [id]/route.ts:103-131).

### B2 — Kart silme tüketim, yorum, telafi teklifi ve kartın kendi audit izini kalıcı olarak yok ediyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** app/api/admin/cards/[id]/route.ts:190-214 (`consumptionReview.deleteMany`, `consumption.deleteMany`, `cardAuditLog.deleteMany`, `physicalCard.delete`); RemedyOffer → ConsumptionReview `onDelete: Cascade` (prisma/schema.prisma:1343). UI yalnız uyarı metni gösteriyor (cards-client.tsx:1202-1206).
- **Sorun:** Bayi analitiği (dealer radar, CLV/churn — schema.prisma:1614-1618), karakter rozeti sayımı (ConsumptionReview'a dayanır), bekleyen/kabul edilmiş telafi teklifleri ve kartın adli izi tek tıkla gider. Bu tüketimlerden kazanılmış puan/XP geri alınmadığı için ekonomi defteri ile kaynak kayıt arasındaki bağ kopar. Ayrıca genel `auditLog.create` transaction dışında (217-233): yazım başarısız olursa kart silinmiş ama istemci 500 görür.
- **Öneri:** Fiziksel kartta hard-delete'i yalnız `UNUSED` ve 0 tüketimli kartlarla sınırlayın; diğerleri için `RETIRED/ARCHIVED` durumu (veya `archivedAt`) ekleyip listeden gizleyin. Silme gerekirse "kart token'ını yazarak onayla" deseni kullanın. Audit kaydını aynı `$transaction` içine alın; `CardAuditLog`'u silmek yerine kart arşivlenince korunmalı.

### B3 — Üretilen kartlar dışa aktarılamıyor (baskıya gönderme akışı yok)
- **Önem:** yüksek · **Kategori:** işlevsellik · **Efor:** M
- **Kanıt:** `Download` import edilmiş ama kullanılmıyor (cards-client.tsx:11); üretim yanıtı yalnız 10 örnek token dönüyor ve UI bunu da kullanmıyor (generate/route.ts:116-117, cards-client.tsx:289-293); repoda kart export uç noktası yok.
- **Sorun:** 10.000 kartlık bir batch üretildikten sonra matbaaya verilecek token/URL listesi alınamıyor; tek yol her kartın detayını açıp kopyalamak. Sayfanın var olma nedeni olan fiziksel üretim zinciri burada kopuyor.
- **Öneri:** `GET /api/admin/cards/batches/[id]/export?format=csv|pdf` ucu: CSV (token, URL, batch, sıra no) akış (streaming) olarak dönsün; PDF/SVG için sunucuda `qrcode` ile sayfa başına N kart şablonlu baskı sayfası (bleed/kesim işaretli). Batch kartında "CSV indir / Baskı PDF'i" aksiyonları; üretim başarılı olunca dialog "İndir" adımına geçsin. Dışa aktarma `AuditLog`'a `CARDS_EXPORTED` olarak yazılmalı (token listesi hassas veridir).

### B4 — Müşteriye atamada yarış koşulu (kontrol-sonra-güncelle)
- **Önem:** yüksek · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** app/api/admin/cards/[id]/assign/route.ts:39-94 — durum `findUnique` ile okunuyor, sonra koşulsuz `update({ where: { id } })`. Halka açık aktivasyon da paralel çalışabilir (activate/route.ts:40-79).
- **Sorun:** Admin atama dialogunu açıkken müşteri kartı kendisi aktive ederse, admin'in güncellemesi `customerId`'yi ezerek kartı gerçek sahibinden alır. İki admin aynı anda farklı müşterilere atarsa son yazan kazanır; "müşterinin zaten aktif kartı var" kuralı da (74-84) yarışa açık. Ayrıca güncelleme, audit ve bildirim üç ayrı yazım; bildirim hatası 500 döndürür ama kart atanmış kalır.
- **Öneri:** `updateMany({ where: { id, status: 'UNUSED', customerId: null }, data })` ile koşullu güncelleme; `count === 0` ise 409 "kart bu arada değişti". Tümünü `$transaction` içine alın; bildirim gibi yan etkileri `after()` ile transaction sonrasına taşıyın. "Müşteri başına tek aktif kart" kuralını veritabanı düzeyinde kısmi unique index ile (`WHERE status='ACTIVATED'`) garantiye alın.

### B5 — Kart detayında önceki kartın QR kodu görünebiliyor
- **Önem:** orta · **Kategori:** doğruluk · **Efor:** S
- **Kanıt:** `openCardDetail` yeni kartı seçerken `cardQrCode`'u sıfırlamıyor (cards-client.tsx:413-431); dialog `cardQrCode &&` ile koşullu çiziyor (1040).
- **Sorun:** B kartı açıldığında, QR üretilene kadar (ve `import('qrcode')` başarısız olursa kalıcı olarak) A kartının QR'ı B'nin token'ı yanında görünür. Fiziksel kart operasyonunda yanlış QR'ın kopyalanması/basılması gerçek hata üretir.
- **Öneri:** Açılışta `setCardQrCode(null)` + yükleniyor iskeleti; QR'ı `token`'a bağlı `useMemo/useQuery` anahtarıyla üretin ve sonuç gelirken seçili token hâlâ aynı mı kontrol edin. Hata durumunda "QR üretilemedi, tekrar dene" gösterin.

### B6 — Filtre değişince sayfa sıfırlanmıyor → boş sonuç
- **Önem:** orta · **Kategori:** UX / doğruluk · **Efor:** S
- **Kanıt:** Sayfa sıfırlama yalnız arama için (cards-client.tsx:193-195); durum (602), batch select (613), batch kartı (543) ve "Sıfırla" (628-633) `setPage(1)` çağırmıyor.
- **Sorun:** 5. sayfadayken tek sayfalık bir filtreye geçilince "Kart bulunamadı · Sayfa 5 / 1" görülür; kullanıcı veri yok sanır.
- **Öneri:** Filtre durumunu tek bir `useReducer`/URL arama parametresi (`useSearchParams`) altında toplayın; herhangi bir filtre değişikliği `page=1` yazsın. URL senkronu aynı zamanda paylaşılabilir/yer imi alınabilir görünümler sağlar.

### B7 — İstemci tarafı arama `null` müşteri adında çöküyor
- **Önem:** orta · **Kategori:** hata · **Efor:** S
- **Kanıt:** cards-client.tsx:449 `card.customer?.name.toLowerCase()`; `User.name String?` (prisma/schema.prisma:31); tip tanımı `name: string` diye yalan söylüyor (cards-client.tsx:101).
- **Sorun:** Mevcut sayfada adı olmayan bir müşteriye ait kart varken arama kutusuna yazıldığı anda `TypeError` → admin `error.tsx` sınırına düşülür. Ayrıca bu istemci filtresi zaten sunucu tarafında yapılan aramanın kopyası; debounce süresince sonuç listesi ile "N kart bulundu" sayacı birbirini tutmaz.
- **Öneri:** İstemci filtresini tamamen kaldırın (sunucu araması yeterli); tipleri Prisma'dan türetin (`Prisma.PhysicalCardGetPayload<...>`) ve isimsiz müşteri için e-posta fallback'i gösterin.

### B8 — Silme dialogunda "0" metni basılıyor
- **Önem:** düşük · **Kategori:** hata · **Efor:** S
- **Kanıt:** cards-client.tsx:1202 `{deletingCard?._count?.consumptions && ... > 0 && (...)}` — tüketim 0 olduğunda ifade `0` döner ve React bunu metin olarak çizer.
- **Öneri:** `(deletingCard?._count.consumptions ?? 0) > 0 && ...`.

### B9 — QR/aktivasyon domain'i sabit kodlu demo adresi
- **Önem:** orta · **Kategori:** mimari · **Efor:** S
- **Kanıt:** `const QR_DOMAIN = 'https://demoqratex.vercel.app'` (cards-client.tsx:82; aynısı app/customer/my-card/page.tsx:41). Projede kanonik origin yardımcıları mevcut (lib/public-app-origin.ts:7-13) ve ayarlar varsayılanı `https://qratex.com` (app/admin/settings/settings-client.tsx:259).
- **Sorun:** Fiziksel kart üzerine basılan URL değiştirilemez. Kanonik domain değişirse (ör. qratex.com'a geçiş) basılmış tüm kartlar demo alt alan adına bağımlı kalır. Mevcut üretim domain'inin hangisi olduğu doğrulanmadı.
- **Öneri:** Tek kaynak `NEXT_PUBLIC_CARD_BASE_URL` (veya `getPublicAppOrigin()`), kart URL'sini sunucuda üretip API yanıtına `activationUrl` olarak koyun; kısa ve kalıcı bir yönlendirme alan adı (ör. `q.qratex.com/c/…`) kullanın ki domain değişse de basılı kartlar yaşasın.

### B10 — Batch istatistiklerinde sınırsız N+1 sorgu
- **Önem:** orta · **Kategori:** performans · **Efor:** S
- **Kanıt:** app/api/admin/cards/batches/route.ts:18-55 — tüm batch'ler sayfalamasız çekiliyor, her biri için ayrı `groupBy` `Promise.all` ile paralel atılıyor.
- **Sorun:** Batch sayısı büyüdükçe tek istek yüzlerce eşzamanlı sorgu açar; Neon pooler'da düşük bağlantı limitiyle (bkz. proje notları) diğer istekleri de boğar.
- **Öneri:** Tek sorgu: `physicalCard.groupBy({ by: ['batchId','status'], where: { batchId: { in: ids } } })` ve bellekte birleştirme; batch listesini `take`/cursor ile sınırlayın. `PhysicalCard.batchId` için `CardBatch` ile gerçek bir ilişki (FK) tanımlayın.

### B11 — Üretim işlemi atomik değil ve sayılar yanlış raporlanabilir
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** generate/route.ts:35-86 — batch kaydı önce oluşturuluyor, kartlar 500'lük `createMany` döngüsüyle ekleniyor; `skipDuplicates: true` ile atlanan kayıtlar `createdCount`'a yine ekleniyor (85); dönen `count` kullanılmıyor. Benzersizlik kontrolü `tokens.includes` ile O(n²) (64).
- **Sorun:** Yarıda kalan üretim, `quantity` alanı gerçeği yansıtmayan bir batch bırakır; başarı mesajı ("N kart başarıyla oluşturuldu") eksik eklemeyi gizler.
- **Öneri:** Batch + kartları tek `$transaction` (veya batch'e `status: PENDING|READY` alanı) ile yazın; `createMany` dönüş sayısını toplayın ve eksik kalan kadar yeniden üretin; `Set` ile benzersizlik. 10k üretimde uzun sürerse arka plan işi + ilerleme göstergesi.

### B12 — Blok aksiyonu onaysız ve sebepsiz
- **Önem:** orta · **Kategori:** UX / denetlenebilirlik · **Efor:** S
- **Kanıt:** cards-client.tsx:301-310 (sabit `blockReason`), 879-886 (doğrudan çağrı).
- **Sorun:** Kayıp/çalıntı/sahtecilik ayrımı yapılamıyor; destek ekibi neden bloklandığını göremiyor. Yanlış tıklama anında müşterinin kartını kapatır.
- **Öneri:** Sebep kategorisi (Kayıp, Çalıntı, Sahte kullanım, Diğer) + serbest not içeren onay dialogu; müşteriye bilgilendirme bildirimi seçeneği; kart detayında blok geçmişi.

### B13 — Müşteri seçici ölçeklenmiyor ve gereksiz ağır veri çekiyor
- **Önem:** orta · **Kategori:** UX / performans · **Efor:** M
- **Kanıt:** cards-client.tsx:197-200, 256-266 (sayfa açılışında her zaman çağrılır); users API 100 üst sınır (lib/validations-admin.ts:10) ve adres, konum, puan, üç `_count` alt sorgusu dahil geniş select (app/api/admin/users/route.ts:169-195); `Select` aranamaz (cards-client.tsx:1135-1150).
- **Sorun:** 100'den fazla müşterisi olan platformda en yeni 100 dışındaki müşteriye kart atanamaz; dialog hiç açılmasa bile her ziyaret kişisel veri taşıyan ağır bir istek yapar. Zaten aktif kartı olan müşteriler de listelenir, hata ancak gönderimde görülür.
- **Öneri:** shadcn `Command` tabanlı, sunucu araması yapan combobox (`/api/admin/users/lookup?q=&role=CUSTOMER&withoutActiveCard=1`, yalnız id/ad/e-posta); dialog açılınca tetiklenen istek.

### B14 — Bilgi mimarisi: sayfalı veride Kanban ve tekrarlanan istatistikler
- **Önem:** orta · **Kategori:** UX · **Efor:** M
- **Kanıt:** Varsayılan `kanban` (cards-client.tsx:156); Kanban sütunları 20'lik sayfanın bölünmüşü (454-458, 666); hero ve istatistik kartları aynı sayıları gösteriyor (477-486 vs 500-529); pazarlama çipleri (469-472).
- **Sorun:** "Aktif 3" sütun rozeti global sayı sanılabilir; Kanban'ın anlamı olan sürükle-bırak durum geçişi yok, dolayısıyla tablo üzerinde hiçbir katma değeri yok. Ekran alanının üçte biri bilgi taşımayan hero ve tekrar eden metriklere gidiyor.
- **Öneri:** Varsayılanı yoğun tabloya çevirin; Kanban'ı kaldırın ya da durum sekmeleri (Tümü/Aktive edilmemiş/Aktif/Bloklu, sayaçlı) ile değiştirin. Hero yerine kompakt sayfa başlığı + tek KPI şeridi.

### B15 — Mobil liste görünümünde yönetim aksiyonları yok
- **Önem:** düşük · **Kategori:** mobil · **Efor:** S
- **Kanıt:** cards-client.tsx:763-770 (yalnız Detay + URL); Kanban görünümünde ise tam menü var (695-736).
- **Öneri:** Mobil kart bileşenini Kanban kartıyla tek bir `CardRow` bileşeninde birleştirin; aksiyonları alttan açılan sheet'te sunun.

### B16 — Erişilebilirlik eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** İkon-butonlarda `aria-label` yok (cards-client.tsx:680, 796, 841, 1056, 1069); batch kartları `div onClick` (540-544), `role`/`tabIndex`/klavye yok; kopyala butonu `opacity-0 group-hover:opacity-100` (799) — odakta görünmez; `Label`'lar `htmlFor` ile input'a bağlı değil (962-990); görünüm geçişinde `aria-pressed` yok (570-587); durum rozetleri açık temada `text-gray-400/text-emerald-400` (lib/utils.ts:244-246) düşük kontrast; QR `alt="QR Code"` İngilizce ve kart kimliği içermiyor (1045).
- **Öneri:** Batch kartlarını `button`/`ToggleGroup` yapın, `focus-visible:opacity-100` ekleyin, etiketleri bağlayın, durum rozetlerini temaya duyarlı tokenlarla (`text-emerald-700 dark:text-emerald-300`) yeniden tanımlayın.

### B17 — Dil tutarsızlığı ve ölü kod
- **Önem:** düşük · **Kategori:** kalite · **Efor:** S
- **Kanıt:** Türkçe karaktersiz toast'lar (cards-client.tsx:270, 285, 289, 295, 315, 319, 322, 328, 343, 347, 353, 371, 375, 381, 398, 407, 436, 441) ve lib/admin-toast.ts "Basarili:" öneki; İngilizce terimler "Batch", "Token Prefix", "QR Code"; eski örnek "Ocak 2024 - Pilot" (964). Kullanılmayan importlar: `Filter`, `Download`, `XCircle`, `Calendar`, `Edit2`, `ExternalLink`, `AnimatePresence`, `CardDescription`; kullanılmayan `session` (135); `any` (261; [id]/route.ts:115). Bildirim tipleri `'SYSTEM'`/`'WARNING'` (assign:119, unassign:87) bildirim merkezinin `info|success|warning|error` sözlüğünde yok (components/dashboard/notification-center.tsx:39-58).
- **Öneri:** Metinleri i18n anahtarlarına taşıyın ("Batch" → "Üretim partisi", "Prefix" → "Token öneki"); ESLint `no-unused-vars` + `@typescript-eslint/no-explicit-any`; bildirim tipini enum/sabit ile kısıtlayın.

### B18 — Liste hata durumu sessiz
- **Önem:** düşük · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** cards-client.tsx:219-224 — `data.success` yanlışsa hiçbir şey yapılmıyor; batch ve müşteri yüklemeleri yalnız `console.error` (251-253, 263-265).
- **Öneri:** `res.ok` kontrolü + satır içi hata kartı ("Kartlar yüklenemedi · Tekrar dene"); SWR/React Query ile yeniden deneme ve önbellek.

---

## Eksik özellikler (kıyas: Stripe Dashboard Issuing, Linear, Retool, PostHog)

1. **Batch dışa aktarma ve baskı paketi:** CSV/PDF, QR SVG'leri, sıra numarası, kesim şablonu; Stripe Issuing'deki fiziksel kart sevkiyat görünümüne benzer batch durumu (Üretildi → Basıldı → Sevk edildi → Dağıtıldı).
2. **Toplu işlemler:** çoklu seçim, toplu blok/blok kaldırma, "batch'in tamamını blokla" (kayıp sevkiyat), toplu atama (CSV ile müşteri eşleme).
3. **Kart zaman çizelgesi:** detayda oluşturma, aktivasyon, taramalar (`SCANNED`), tüketimler, blok/atama olayları — veri zaten `CardAuditLog` ve `GET /api/admin/cards/[id]`'de var.
4. **Kaydedilmiş görünümler ve URL durumlu filtreler:** tarih aralığı, "hiç taranmamış", "son 30 günde kullanılmamış aktif kartlar", sütun sıralama, sayfa boyutu.
5. **Anomali sinyalleri:** kısa sürede çok tüketim, birden fazla bayide eşzamanlı tarama gibi sahtecilik işaretleri (fraud-prevention modülüyle bağlantılı) ve satırda risk rozeti.
6. **Komut paleti / kısayollar:** token yapıştırıp doğrudan karta gitme (Linear tarzı `Ctrl+K`), barkod/QR okuyucu ile arama.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Kart operasyon konsolu" — bir operatör 10 saniye içinde (1) bir kartı token veya müşteriyle bulup tüm geçmişini görebilmeli, (2) yeni bir partiyi üretip baskı paketini indirebilmeli, (3) kayıp/çalıntı bir kartı ya da tüm partiyi gerekçesiyle bloklayabilmeli.

**Yerleşim:**
- Üstte kompakt başlık satırı: "Fiziksel Kartlar" + birincil "Parti üret" + ikincil "Dışa aktar". Altında tek KPI şeridi (Toplam · Aktive edilmemiş · Aktif · Bloklu · son 7 gün aktivasyon oranı, küçük sparkline).
- İki sekme: **Kartlar** ve **Partiler**.
  - *Kartlar:* durum sekmeleri (sayaçlı) + arama + filtre çipleri (parti, tarih, tüketim var/yok); yoğun, sıralanabilir tablo (TanStack Table), satır seçimi ve seçime göre beliren toplu aksiyon çubuğu. Satıra tıklayınca sağdan açılan **detay paneli (Sheet)**: büyük QR + indir/yazdır, kimlik bilgileri, müşteri kartı (kullanıcı detayına bağlantı), aksiyonlar ve olay zaman çizelgesi.
  - *Partiler:* parti tablosu (ad, adet, oluşturan, tarih, durum dağılımı yığılmış bar, baskı durumu) ve parti başına "CSV / Baskı PDF / Partiyi blokla".
- Mobilde tablo yerine aynı `CardRow` bileşeni; aksiyonlar bottom sheet'te; detay paneli tam ekran.

**Motion / 3D:** Bu bir iç operasyon aracı; 3D gereksiz. Ölçülü motion: detay panelinin kayarak açılması, durum değişiminde rozetin kısa renk geçişi (150-200 ms), üretim sırasında ilerleme çubuğu, toplu aksiyon çubuğunun aşağıdan girişi. İstatistik kartlarındaki her yüklemede tekrarlayan stagger ve `hover:scale` kaldırılmalı. Mevcut global `MotionConfig reducedMotion="user"` korunmalı.

**Veri / API değişiklikleri:**
- `lib/cards/lifecycle.ts` durum makinesi; tüm mutasyonlar (PATCH/assign/unassign/delete) bu katmandan, koşullu `updateMany` + tek `$transaction` (audit dahil), yan etkiler `after()` ile.
- `CardStatus`'a `RETIRED` (veya `archivedAt`); hard-delete yalnız `UNUSED` + 0 tüketim.
- `PhysicalCard.batchId` → `CardBatch` FK ilişkisi; `CardBatch.createdBy` için `onDelete: Cascade` yerine `SetNull`/`Restrict` (bugün admin kullanıcısı silinirse parti kayıtları da silinir — prisma/schema.prisma:1667).
- Yeni uçlar: `GET /api/admin/cards/batches/[id]/export`, `POST /api/admin/cards/bulk` (ids + action + reason), `GET /api/admin/users/lookup`.
- Liste yanıtına `activationUrl` (sunucu üretimli, env tabanlı) ve `batch: { id, name }`; detay için mevcut `GET /api/admin/cards/[id]` kullanılmalı.
- İstatistikler için kısa TTL'li Redis önbelleği (dashboard da aynı ucu `pageSize=1` ile çağırıyor — app/admin/admin-dashboard-client.tsx:83); ayrı hafif `GET /api/admin/cards/stats`.

---

## Çakışmalar / birleştirme önerisi

- Admin panelinde fiziksel kartları yöneten başka bir sayfa yok; sayfa korunmalı, birleştirme gerekmiyor.
- Yakın ilişkili yüzeyler: `/customer/my-card` (aynı sabit `QR_DOMAIN` kopyası — app/customer/my-card/page.tsx:41), `/dealer/scan` (token ayrıştırma), `/c/[token]` (aktivasyon) ve admin dashboard'daki kart özeti (app/admin/admin-dashboard-client.tsx:83, 556). Kart URL üretimi ve durum etiketleri bu yüzeylerle tek bir `lib/cards` modülünde paylaşılmalı.
- `/admin/users` kullanıcı detayında müşterinin kartı ve tüketimleri görünmüyor; kart detay paneli ile kullanıcı detayı arasında çift yönlü bağlantı kurulmalı. `/admin/fraud-prevention` ile kart anomali sinyalleri ortak veri kaynağından beslenmeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak ilgili uçlar, istemci menüsü ve Prisma şeması baştan okundu (kod çalıştırılmadı, veritabanına dokunulmadı).

### 1. Unassign bloklu kartın bloğunu kaldırıp herkesçe aktive edilebilir yapıyor — **DOĞRULANDI**

- Bloklu bir kartın müşterisi olabilir: PATCH bloklama yalnız `status`/`blockedAt`/`blockReason` yazar, `customerId`'ye dokunmaz (app/api/admin/cards/[id]/route.ts:115-131).
- Unassign yalnız `customerId` dolu mu diye bakar (app/api/admin/cards/[id]/unassign/route.ts:46), durum kontrolü yoktur ve koşulsuz `status: 'UNUSED'` yazar; `blockedAt`/`blockReason` olduğu gibi kalır (unassign/route.ts:54-61).
- İstemci "Müşteriden Kaldır" seçeneğini yalnız `card.customer` koşuluyla gösterir, bloklu kartlarda da görünür (app/admin/cards/cards-client.tsx:712, 866). Onay metni "Aktive Edilmemiş durumuna geçecek" der, bloğun kalkacağını söylemez (cards-client.tsx:1176-1178).
- Hem public GET hem aktivasyon yalnız `status === 'BLOCKED'` kontrol eder, `blockedAt`'i hiç okumaz (app/api/cards/[token]/route.ts:47; app/api/cards/[token]/activate/route.ts:58). UNUSED kart herhangi bir CUSTOMER hesabına bağlanır (activate/route.ts:72-78).
- **Yeniden üretim:** A müşterisinin ACTIVATED kartı çalınır, admin "Blokla" der (status=BLOCKED, customerId=A). Sonra mağdurun hesabını temizlemek için "Müşteriden Kaldır"ı onaylar, kart UNUSED olur. Fiziksel kartı elinde tutan kişi kendi müşteri hesabıyla `/c/[token]` → aktive eder; kart artık onundur ve bayilerde tüketim/puan için kullanılabilir. Admin listede kartı "Aktive Edilmemiş" görür; `blockReason` sadece detay panelinde artık bayat bir bilgi olarak durur.
- Not: Saldırganın ayrıca bir şey yapmasına gerek yok, iyi niyetli bir admin işlemi tetikliyor. Önem: Yüksek. Önerilen düzeltme: unassign `updateMany({ where: { id, customerId: { not: null }, status: 'ACTIVATED' } })` ile yalnız ACTIVATED kartta çalışmalı; bloklu kartta ya 409 dönmeli ya da müşteriyi koparıp **BLOCKED durumunu koruyarak** `customerId=null` yazmalı. Aktivasyon da savunma derinliği için `blockedAt != null` olan kartı reddetmeli. UI menüsü durum makinesinden türemeli (bkz. `lib/cards/lifecycle.ts` önerisi).

### 2. Kart silme ilişkili tüketim/yorum/telafi tekliflerini ve kart audit izini kalıcı siliyor — **DOĞRULANDI (önem ve ekonomi alt iddiası abartılı)**

- Olgular doğru: transaction içinde `consumptionReview`, `consumption`, `cardAuditLog` `deleteMany` ve kart silinir (app/api/admin/cards/[id]/route.ts:190-214). `RemedyOffer.consumptionReview` `onDelete: Cascade` (prisma/schema.prisma:1343), yani açık/kabul edilmiş telafi teklifleri de gider. Silmede durum veya tüketim sayısı sınırı yok.
- Not: Açık `deleteMany`'ler olmasa bile şema zaten zincirleme siler: `Consumption.card` (schema.prisma:1585), `ConsumptionReview.consumption` (1622) ve `CardAuditLog.card` (1648) hepsi `Cascade`. Yani sorun bu uçtaki koddan çok "kart sert silinebilir" tasarımındadır.
- Genel `auditLog.create` transaction dışında (route.ts:217-233): yazılamazsa kart silinmiş olduğu halde 500 "Kart silinemedi" döner ve silme hiçbir yerde iz bırakmaz. Olasılık düşük ama gerçek.
- Abartılı kısım: "ekonomi defteriyle kaynak kayıt bağı kopuyor" — şemada tüketime/yoruma referans veren bir puan defteri modeli yok; yorum ödülü `creditPointsAndXp` ile cüzdana yazılır, `points_credited` olayı yalnız `source: 'consumption_review'` taşır, `reviewId` taşımaz (app/api/customer/consumptions/[id]/review/route.ts:190-205). Kopacak bir FK yok; kazanılmış puanın geri alınmaması da (müşteri meşru kazandıysa) tek başına hata değildir. Yeni puan basılmaz.
- Gerçek etki: admin "Sil" dediğinde (UI yalnız tüketim sayısını uyarır, yorum/telafi tekliflerini söylemez — cards-client.tsx:1200-1206) müşterinin yorum geçmişi ve bekleyen telafi teklifi kaybolur, bayi analitiği/CLV/karakter rozeti sayımları geriye dönük değişir, kartın adli izi (`CardAuditLog`) yok olur. Kasıtlı ve uyarılı bir admin eylemi olduğu için önem **Orta**; Kritik değil.
- Öneri: sert silmeyi yalnız `UNUSED` + 0 tüketim kartla sınırlayın; diğerleri için `RETIRED`/`archivedAt` soft-delete. Genel audit kaydını aynı `$transaction` içine alın.

### 3. Admin atama ile müşteri self-aktivasyonu arasında yarış — **ÇÜRÜTÜLDÜ (Kritik/Yüksek olarak)**

- İddianın anlatılan senaryosu yanlış: "admin dialogu açıkken müşteri aktive ederse" durumunda sunucu POST anında kartı yeniden okur ve `status !== 'UNUSED'` ile 400 döner (app/api/admin/cards/[id]/assign/route.ts:39-51). Bayat istemci durumu ezmeye yol açmaz.
- Gerçek TOCTOU penceresi yalnız sunucudaki `findUnique` (satır 39) ile koşulsuz `update({ where: { id } })` (satır 87) arasındaki birkaç DB gidiş-dönüşüdür (ms mertebesi). Aktivasyon ucu da aynı desende (activate/route.ts:42-78, READ COMMITTED interaktif transaction içinde kilitsiz okuma + koşulsuz update). İki bağımsız insanın aynı UNUSED kart üzerinde milisaniye içinde eşzamanlı işlem yapması pratikte kurulabilir bir kullanıcı senaryosu değil.
- "Müşteri başına tek aktif kart kuralı atomik değil" — doğru ama önemsiz: bu kural sistemde zaten bir değişmez değil; self-aktivasyon ucu bu kontrolü hiç yapmıyor (activate/route.ts:62-78), müşteri birden çok kartı kendisi aktive edebilir.
- "Bildirim hatası 500 döndürür ama kart atanmış kalır" — doğru (assign/route.ts:87-122 ayrı yazımlar, tek catch). `customerId` az önce doğrulandığı için `notification.create`'in başarısız olması yalnız geçici DB hatasında olur; sonuç admin'e yanıltıcı "Kart atanamadı" toast'u ve tekrar denemede "Sadece aktive edilmemiş kartlar atanabilir". Düşük önem.
- Hijyen önerisi (düşük öncelik): assign ve activate `updateMany({ where: { id, status: 'UNUSED', customerId: null } })` + `count === 0 → 409` ile koşullu yazsın; audit aynı transaction'da, bildirim `after()` ile yan etki olarak gönderilsin.
