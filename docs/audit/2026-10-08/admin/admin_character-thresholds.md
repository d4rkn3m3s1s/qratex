# /admin/character-thresholds

**Amaç:** Karakter rozeti sisteminin 5 üslup kategorisi (Dram/Suç, Komedi, Fantastik, Gizem/Gerilim, Gizemli) için "bir karakter açmak için gereken yorum sayısı" (eşik) ve "yorumun sayılması için minimum karakter uzunluğu" değerlerini, kod varsayılanlarını ezen admin override'ları olarak yönetmek. Değerler `Settings` tablosunda tek JSON kaydı (`character_category_thresholds`) olarak tutulur ve müşteri tarafında ilerleme çubuğu (`getCategoryProgress`) ile reveal guard'ı (`revealReadyCategoryBadge`) tarafından okunur.

**Genel puan:** 5.5 / 10
**Karar:** koru-iyileştir (ileride `/admin/character-test` ile tek bir "Karakter Rozeti Kontrol Merkezi" altında birleştirilmesi önerilir; bkz. son bölüm)

Sayfa küçük, temiz ve sunucu tarafında doğru doğrulanmış (whitelist normalize, ADMIN rolü, audit log). Ama ekonomiyi doğrudan etkileyen bir ayarı (eşik düşerse geriye dönük toplu rozet + ödül puanı basımı) hiçbir etki önizlemesi, sınır, onay veya geçmiş olmadan tek tıkla değiştirtiyor; okuma hatasını "override yok" ile ayırt edemediği için kaydetme mevcut override'ları silebiliyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Oku/düzenle/sıfırla/kaydet döngüsü uçtan uca çalışıyor ve runtime gerçekten bu değerleri kullanıyor; ancak 0 eşiği sessizce atılıyor, okuma hatası "boş" sanılıyor ve kayıt eşzamanlılık korumasız. |
| UX | 4/10 | Admin'e değişikliğin kaç kullanıcıyı nasıl etkileyeceği, etkin değerin ne olduğu ve kimin ne zaman değiştirdiği gösterilmiyor; ekonomik etkisi büyük bir ayar onaysız kaydediliyor. |
| Görsel | 6/10 | Ortak `DashboardPageHero` + shadcn kartlarıyla diğer admin sayfalarıyla tutarlı, sade; ama kategori kimliği (accent rengi, karakter sayısı) kullanılmıyor, bilgi yoğunluğu düşük. |
| Mimari | 6/10 | `getPointsMatrix` desenini izleyen temiz katmanlama (saf sabit modül + DB okuyucu + normalize); ama instance-yerel bellek cache'i, fail-open okuma ve upsert+audit'in ayrı transaction'larda olması zayıf noktalar. |
| Performans | 6/10 | Sayfanın kendisi hafif; fakat `minReviewLength > 0` girilen her kategori, müşteri ilerlemesi her hesaplandığında o kategorinin TÜM yorum metinlerini çeken ek bir `findMany` doğuruyor — admin ayarı doğrudan sıcak yolu pahalılaştırıyor ve sayfa bunu belirtmiyor. |
| Erişilebilirlik + mobil | 5/10 | Mobilde tek sütuna düşüyor ve kullanılabilir; ancak `Label`'lar `htmlFor`/`id` ile input'a bağlı değil (ekran okuyucu alan adını okumaz), yükleme iskeleti `aria-busy` taşımıyor, emoji'ler `aria-hidden` değil. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (hero: ikon, başlık, açıklama) | ÇALIŞIYOR | `app/admin/character-thresholds/page.tsx:98-102` | Ortak `DashboardPageHero` (`components/layout/dashboard-page-hero.tsx:9-13`). Sayfaya özel `<title>`/metadata yok (client component). |
| 2 | Bilgi kartı (boş alan = kod varsayılanı, eşik/uzunluk açıklaması) | KISMİ | `page.tsx:104-113` | "Gizemli … (varsayılan 20)" metni sabit kodlu; koddaki varsayılan (`lib/character-categories.ts:190`) değişirse metin yalan söyler. Veri zaten API'den geliyor (`defaultThreshold`). |
| 3 | Ayarları yükleme (GET) | ÇALIŞIYOR | `page.tsx:29-47`, `app/api/admin/settings/character-thresholds/route.ts:26-52` | Kategoriler + kod varsayılanları + override'lar tek istekte. |
| 4 | Yükleniyor iskeleti (5 kart) | ÇALIŞIYOR | `page.tsx:115-120` | Sabit 5 adet; `aria-busy`/`role="status"` yok. |
| 5 | Yükleme hata durumu | KISMİ | `page.tsx:38-40`, `122-169` | Yalnız toast; ekranda boş grid kalır, "yeniden dene" yok. |
| 6 | Boş durum (kategori listesi boşsa) | EKSİK | `page.tsx:122-169` | `categories=[]` ise hiçbir şey çizilmez, açıklama yok. |
| 7 | Kategori kartı (emoji + ad) | ÇALIŞIYOR | `page.tsx:123-133` | Kategori açıklaması, accent rengi, karakter sayısı gösterilmiyor. |
| 8 | Override vurgusu (kartta ring) | ÇALIŞIYOR | `page.tsx:125-127` | Varsayılana eşit bir değer girilse de "override" olarak işaretlenir. |
| 9 | Eşik (yorum sayısı) alanı | KISMİ | `page.tsx:146-152`, `52-66`; `lib/character-thresholds.ts:22-25` | `min={1}` ama `setField` 0'ı kabul ediyor (`Math.max(0, …)`); sunucu `toPositiveInt` 0'ı sessizce atıyor → kaydettikten sonra alan boşalır, kullanıcıya neden söylenmez. Üst sınır yok. |
| 10 | Min. uzunluk (karakter) alanı | ÇALIŞIYOR | `page.tsx:156-162`; `lib/character-thresholds.ts:26-29` | 0 = şart yok doğru işleniyor. Üst sınır yok; performans etkisi belirtilmiyor (bkz. Bulgu 6). |
| 11 | Varsayılanın placeholder ile gösterimi | KISMİ | `page.tsx:150`, `160` | Değer girildiği anda placeholder (varsayılan) kaybolur; admin referansı göremez, "etkin değer" hiçbir yerde yazmaz. |
| 12 | Kategori bazlı "Varsayılana dön" | ÇALIŞIYOR | `page.tsx:68-74`, `134-141` | Yalnız yerel durumu değiştirir; kaydetmeden etkisizdir (bilgilendirme yok). `type="button"` ve erişilebilir ad tamam ama altı çizili link görünümü buton semantiğiyle tutarsız. |
| 13 | Kaydedilmemiş değişiklik takibi (dirty) | KISMİ | `page.tsx:49` | `JSON.stringify` karşılaştırması anahtar sırasına duyarlı: bir alanı silip aynı değeri yeniden yazmak `{minReviewLength, threshold}` sırasını değiştirir → anlamca aynı veride "değişiklik var" yanlış pozitifi. |
| 14 | Kaydet (PUT) | ÇALIŞIYOR | `page.tsx:76-94`, `route.ts:58-105` | Sunucu normalize sonucunu döner, UI onunla senkronlanır. |
| 15 | "Kaydedilmemiş değişiklikler var" ipucu | ÇALIŞIYOR | `page.tsx:177` | — |
| 16 | Sayfadan ayrılırken kayıp uyarısı | EKSİK | `page.tsx` (beforeunload/router guard yok) | Dirty iken başka admin sayfasına geçmek değişiklikleri sessizce kaybeder. |
| 17 | Sunucu doğrulaması (whitelist + tamsayı) | ÇALIŞIYOR | `lib/character-thresholds.ts:35-49`, `route.ts:65-66`; test: `__tests__/lib/character-thresholds.test.ts` | Bilinmeyen kategori ve geçersiz değerler atılır. Ama hata dönülmez, sessiz atılır. |
| 18 | Audit log | ÇALIŞIYOR | `route.ts:82-92` | `oldData/newData` yazılıyor; upsert ile aynı transaction'da değil; sayfada görünmüyor. |
| 19 | Cache invalidation | KISMİ | `lib/character-thresholds.ts:51-71`, `route.ts:93` | Modül düzeyi bellek cache'i; `clear` yalnız PUT'u işleyen sunucu örneğini temizler, diğer örnekler 60 sn eski değeri kullanır. |
| 20 | Yetki (ADMIN + gizli kapı) | ÇALIŞIYOR | `route.ts:28`, `61`; `proxy.ts:79-88` | Sayfa yolu gate cookie ister; `/api/admin/*` yalnız rol kontrolüne tabi (`proxy.ts:103-117` API'yi authMiddleware'e sokmuyor) — sistem geneli bir durum. |
| 21 | Runtime tüketimi (ilerleme çubuğu + reveal guard aynı override) | ÇALIŞIYOR | `lib/character-badges.ts:344-382`, `424-431` | Override gerçekten kullanılıyor; reveal tx içinde aynı eşikle doğrulanıyor. |
| 22 | Değişikliğin etki önizlemesi (kaç kullanıcı hazır olur / geriler) | EKSİK | — | Bkz. Bulgu 1. |
| 23 | Değişiklik geçmişi / geri alma | EKSİK | — | Audit kaydı var ama sayfada okunmuyor; `Settings` modelinde `updatedBy` yok (`prisma/schema.prisma:899-907`). |
| 24 | Son güncelleyen / zaman bilgisi | EKSİK | `route.ts:41-46` | `updatedAt` veritabanında var ama API dönmüyor. |
| 25 | "Tümünü varsayılana döndür" | EKSİK | — | Yalnız kategori bazlı sıfırlama var. |
| 26 | Mantıklı aralık/sınır uyarısı (ör. eşik 1, uzunluk 5000) | EKSİK | `page.tsx:52-66` | Ekonomi riski; bkz. Bulgu 2. |
| 27 | Eşzamanlı düzenleme koruması (optimistic concurrency) | EKSİK | `route.ts:72-80` | Son yazan kazanır; iki admin birbirinin değişikliğini sessizce ezer. |
| 28 | Toast mesajları | KISMİ | `page.tsx:88`, `lib/admin-toast.ts:18-21` | Önek "Basarili: " / "Dikkat: " Türkçe karaktersiz; metin sonundaki "✓" success ikonuyla tekrar. |
| 29 | Çoklu dil (i18n) | EKSİK | `page.tsx:100-110`, `145`, `155`, `175` | Tüm metinler sabit TR; kenar çubuğu etiketi i18n'den (`messages/tr.json:2513`), komşu sayfalar `useAppT` kullanıyor (`app/admin/gamification-settings/page.tsx:12`). |
| 30 | Form erişilebilirliği (label ↔ input) | KISMİ | `page.tsx:145-152`, `155-162` | `Label` (Radix) `htmlFor` almıyor, `Input` `id` almıyor → alanların erişilebilir adı yok; değer sınır ipuçları `aria-describedby` ile bağlı değil. |
| 31 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:116`, `122`, `143` | `sm:grid-cols-2` ile tek sütuna iner; Kaydet butonu yapışkan değil, en alta kaydırmak gerekir. |
| 32 | Kategori bağlamı (açıklama, karakter sayısı, kullanıcı dağılımı) | EKSİK | `route.ts:32-39` | API yalnız `key/name/emoji/defaults` dönüyor. |
| 33 | Test paneli ile tutarlılık (`/admin/character-test` eşiği) | BOZUK | `app/api/admin/character-test/route.ts:58`, `162`, `206`; `app/admin/character-test/page.tsx:237` | Test paneli sabit `CATEGORY_BADGE_THRESHOLD = 6` gösterir ve "fill" varsayılanı 6'dır; bu sayfadaki override'ları ve Gizemli=20'yi yok sayar → test paneli yanlış eşik gösterir, Gizemli barını doldurmaz. |

**Özet:** 33 özellik — 14 ÇALIŞIYOR, 8 KISMİ, 1 BOZUK, 0 SAHTE, 10 EKSİK.

---

## Bulgular

### 1. Eşik/uzunluk değişikliği GERİYE DÖNÜK uygulanıyor; etki önizlemesi ve onay yok (toplu rozet + puan basımı ya da toplu bar gerilemesi)
- **Önem:** yüksek · **Kategori:** ekonomi / veri bütünlüğü
- **Kanıt:** `lib/character-badges.ts:388-391` (`consumed = takenInCat * threshold; ready = total - consumed >= threshold`), `lib/character-badges.ts:462-481` (reveal tx'inde `creditBadgeRewardInTx` ile ödül puanı), `app/admin/character-thresholds/page.tsx:76-94` (onaysız kaydet).
- **Sorun:** İlerleme tarihsel yorum sayısından her istekte yeniden hesaplanıyor; eşik bir "döngü sayacı" olarak saklanmıyor. Sonuçlar:
  - **Eşik düşürülürse** (ör. 6 → 3), geçmişte 12 yorumu olan ve 1 rozeti alınmış bir kullanıcı için `consumed` 6'dan 3'e iner, kalan 9 yorum anında 3 rozetlik "hazır" kredi demektir. Kullanıcı reveal'i art arda açtıkça her seferinde rozet + `badgeRewardPoints` kadar puan basılır. Bu, ekonomi invaryantlarının (atomik, tek seferlik) teknik olarak ihlali değildir ama tek bir admin tıklamasıyla tüm kullanıcı tabanında toplu puan basımı tetikler.
  - **Eşik yükseltilirse** (ör. 6 → 10) rozeti olan kullanıcıların çubuğu geriler (`consumed` büyür); zaten "karakterin hazır" bildirimi almış kullanıcı (`lib/character-badges.ts:269-299`) reveal'e girdiğinde guard (`:463-465`) reddeder — okunmamış bildirim yalan söyler.
  - **Min. uzunluk girilirse** geçmiş kısa yorumlar da sayımdan düşer (`:360-370`), aynı gerileme.
  - Sayfa bunların hiçbirini söylemiyor; tek "Kaydet" ile canlıya çıkıyor.
- **Profesyonel öneri:** Ayarı "yayınlanan konfigürasyon" gibi ele alın:
  1. `POST /api/admin/settings/character-thresholds/preview` uç noktası: gönderilen taslak override'larla `ConsumptionReview` üzerinde `groupBy(customerId, characterCategory)` + `UserBadge` sayımı yaparak (tek toplu sorgu, kullanıcı başına döngü değil) "X kullanıcı hemen hazır olur (≈Y rozet, ≈Z puan)", "W kullanıcının çubuğu geriler", "V okunmamış 'hazır' bildirimi geçersizleşir" sayılarını döndürsün.
  2. UI'da Kaydet → yan panel/diyalog içinde bu farkı (diff + etki) gösteren onay adımı; puan etkisi eşik üstündeyse ikinci onay ("YAYINLA" yazdırma gibi).
  3. Ürün kararı olarak geriye dönüklüğü seçilebilir kılın: "yalnız yeni döngülere uygula" seçeneği için kullanıcı başına `characterCycleBaseline` (kategori bazlı tüketilmiş yorum sayısı) saklayan bir alan ve eşik değişiminde snapshot alan bir migration. En azından eşik yükseltilirken "hazır" kullanıcıların mevcut hakkını koruyan bir grandfathering kuralı.
- **Efor:** L

### 2. Değer aralığı sınırı yok: eşik 1 ile tüm karakterler hızla "çiftlenebilir"
- **Önem:** yüksek · **Kategori:** ekonomi / doğrulama
- **Kanıt:** `lib/character-thresholds.ts:22-29` (yalnız `>0` / `>=0`), `app/admin/character-thresholds/page.tsx:52-66`, `147-148`.
- **Sorun:** Eşik 1 kabul ediliyor: her sınıflandırılmış yorum bir rozet ve ödül puanı demek; 5 kategoride toplam 43 karakter var (`lib/character-categories.ts:75-185`). Bir yazım hatası (60 yerine 6 değil, 6 yerine 1) üretimde ekonomiyi bozar. Üst sınır da yok (`minReviewLength=100000` kategoriyi fiilen kapatır, uyarısız).
- **Profesyonel öneri:** Sunucu tarafında açık bir şema (zod) ile makul aralık: ör. `threshold ∈ [3, 100]`, `minReviewLength ∈ [0, 2000]`; aralık dışı değer sessizce atılmak yerine 400 + alan bazlı hata dönsün. UI'da aynı aralık `min/max` + alan altı yardım metni; "agresif" değerlerde (eşik < 4) sarı uyarı rozeti. Sınırlar `lib/character-thresholds.ts` içinde tek kaynaktan export edilip hem API hem UI tarafından kullanılsın.
- **Efor:** S

### 3. Okuma hatası "override yok" sanılıyor; ardından yapılan kayıt mevcut override'ları siler
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / hata yönetimi
- **Kanıt:** `lib/character-thresholds.ts:65-70` (`.catch(() => null)` → `normalize(undefined)` → `{}` ve bu boş sonuç 60 sn cache'leniyor), `app/api/admin/settings/character-thresholds/route.ts:31`, `41-46` (`success: true, overrides: {}`), `app/admin/character-thresholds/page.tsx:82` (PUT tüm tabloyu yerine yazar).
- **Sorun:** Runtime için "DB okunamazsa varsayılana düş" mantıklı bir fail-safe; ama admin GET'i de aynı fonksiyonu kullanıyor. Neon anlık erişilemezse admin sayfası tüm override'ları boş görür (hata toast'ı bile çıkmaz, `success: true`). Admin bir kategoride tek bir alan değiştirip kaydederse PUT tam tabloyu `upsert` ettiği için diğer kategorilerin override'ları kalıcı olarak silinir. Ayrıca bu boş değer o sunucu örneğinde 60 sn boyunca müşteri ilerlemesine de "varsayılan" olarak yansır.
- **Profesyonel öneri:** Admin okuma yolu fail-closed olmalı: `getCategoryThresholdOverrides` yanına cache'siz, hatayı fırlatan `readCategoryThresholdsStrict()` ekleyin; GET bunu kullansın ve hata durumunda 503 dönsün, UI ise "Ayarlar okunamadı — düzenleme kilitli, yeniden dene" durumuna geçip formu devre dışı bıraksın. Runtime getter'da hata sonucunu cache'lemeyin (yalnız başarılı okumaları cache'leyin). PUT'u tam-tablo-ezme yerine kategori bazlı patch (`{ set: {...}, unset: [...] }`) semantiğine taşımak da bu sınıf hatayı kökten keser.
- **Efor:** S

### 4. Eşzamanlı düzenleme ve audit tutarlılığı: son yazan kazanır, upsert ile audit ayrı transaction'da
- **Önem:** orta · **Kategori:** veri bütünlüğü / mimari
- **Kanıt:** `route.ts:68-92` (`findUnique` → `upsert` → `auditLog.create` üç ayrı çağrı).
- **Sorun:** İki admin aynı anda düzenlerse ikincisi birincinin değişikliğini sessizce ezer. `previous` okuması ile `upsert` arasında başka bir yazma olursa audit'teki `oldData` yanlış olur; `auditLog.create` başarısız olursa ayar değişmiş ama izi kalmamış olur ve istemci 500 alıp başarısız sanar.
- **Profesyonel öneri:** GET'te `updatedAt` (veya bir `version` alanı) döndürün, PUT `If-Match`/`expectedUpdatedAt` alsın; uyuşmazsa 409 + güncel değer, UI "başka bir admin bu ayarı değiştirdi — farkı gör/üzerine yaz" seçeneği sunsun. `findUnique + upsert + auditLog.create` tek `prisma.$transaction` içinde çalışsın.
- **Efor:** S

### 5. Cache invalidation yalnız tek sunucu örneğinde; Upstash Redis kullanılmıyor
- **Önem:** orta · **Kategori:** mimari / tutarlılık
- **Kanıt:** `lib/character-thresholds.ts:51-57` (modül düzeyi `let cache`), `route.ts:93`.
- **Sorun:** Vercel'de birden çok fonksiyon örneği çalışır; PUT yalnız kendi örneğinin cache'ini temizler. Diğer örnekler 60 sn eski eşikle ilerleme hesaplar; aynı kullanıcının iki isteği farklı eşik görebilir (çubuk zıplar). Admin sayfayı yenilediğinde farklı örneğe düşerse eski değeri görüp kaydın başarısız olduğunu sanabilir. Projede Upstash Redis cache katmanı mevcut ama burada kullanılmıyor.
- **Profesyonel öneri:** Değeri Redis'te sürümlü anahtar (`cfg:character-thresholds:v`) ile tutun ya da en azından bir "config version" anahtarını Redis'te artırın; örnek içi cache her okumada ucuz bir sürüm kontrolüyle geçersizlensin. Admin GET'i cache'siz okusun (Bulgu 3 ile birlikte çözülür).
- **Efor:** M

### 6. `minReviewLength` ayarı müşteri sıcak yolunu sessizce pahalılaştırıyor
- **Önem:** orta · **Kategori:** performans
- **Kanıt:** `lib/character-badges.ts:360-370` (uzunluk şartlı her kategori için kullanıcının o kategorideki TÜM yorum metinlerini çeken `findMany`), `:451-457` (reveal tx içinde aynısı); `getCategoryProgress` her tüketim yorumunda (`:262`) ve rozet sayfasında çağrılıyor.
- **Sorun:** Admin 5 kategoriye de min. uzunluk girerse, ilerleme hesabı 1 `groupBy` yerine 1 + 5 tam metin taraması yapar ve metinler uygulama belleğine taşınır; aktif kullanıcılarda yorum sayısıyla doğrusal büyür. Sayfa bu maliyeti hiç belirtmiyor.
- **Profesyonel öneri:** `ConsumptionReview` üzerinde yazım anında hesaplanan `textLength Int` kolonu (veya Postgres generated column `char_length(trim(text))`) ekleyip sayımı `count({ where: { textLength: { gte: minLen } } })` ile tek sorguda yapın; hatta tüm kategoriler için tek `$queryRaw` `GROUP BY characterCategory` + `FILTER (WHERE length >= $minLen)`. O zamana dek UI'da alanın yanına "performans etkisi" notu konmalı.
- **Efor:** M

### 7. `/admin/character-test` bu sayfanın ayarlarını yok sayıyor
- **Önem:** orta · **Kategori:** tutarlılık / yanlış veri
- **Kanıt:** `app/api/admin/character-test/route.ts:58` (`threshold: CATEGORY_BADGE_THRESHOLD`), `:162` (fill varsayılanı 6), `:206`; `app/admin/character-test/page.tsx:237` ("Bar eşiği: 6 yorum"); sabit: `lib/character-badges.ts:20`.
- **Sorun:** Admin burada Gizemli'yi 20 → 30 yapıp test panelinde reveal akışını denediğinde panel "6 yorum" der, "fill" 6 yorumla Gizemli çubuğunu dolduramaz; test aracı ile yapılandırma aracı birbirini doğrulayamaz.
- **Profesyonel öneri:** Test route'u kategori başına `categoryThreshold(cat, overrides)` döndürsün ve fill varsayılanı seçilen kategorinin etkin eşiği olsun. Uzun vadede iki sayfayı tek "Karakter Rozeti" merkezinde birleştirin (bkz. son bölüm).
- **Efor:** S

### 8. Etkin değer, varsayılan ve sessiz atılan değerler görünmüyor
- **Önem:** orta · **Kategori:** UX
- **Kanıt:** `page.tsx:149-150`, `159-160` (varsayılan yalnız placeholder), `page.tsx:59` + `lib/character-thresholds.ts:22-25` (0 eşiği sessiz atılır), `route.ts:65-66`.
- **Sorun:** Bir değer girildiğinde varsayılan kaybolur; admin "kod varsayılanı neydi, şu an etkin olan ne" sorusunu yanıtlayamaz. Eşiğe 0 yazıp kaydedince alan boşalır, hata yok — admin kaydın işe yaramadığını fark etmeyebilir. Varsayılana eşit girilen değer de "override" olarak saklanır ve kod varsayılanı ileride değişirse donmuş kalır.
- **Profesyonel öneri:** Her alanın altında sabit bir satır: "Varsayılan 6 · Etkin 10 (override)". Varsayılana eşit girişte "bu bir override olmayacak" ipucu ve kaydederken temizleme. Sunucu atılan alanları `rejected: [{key, field, reason}]` olarak döndürsün; UI bunları alan altı hata olarak göstersin.
- **Efor:** S

### 9. Erişilebilirlik: alanların erişilebilir adı yok, yükleme durumu duyurulmuyor
- **Önem:** orta · **Kategori:** erişilebilirlik
- **Kanıt:** `page.tsx:145-152`, `155-162` (`Label` `htmlFor` yok, `Input` `id` yok), `page.tsx:116-119` (iskelet), `page.tsx:131` (emoji `aria-hidden` değil).
- **Sorun:** Ekran okuyucu 10 sayı alanını "düzenleme metni, sayı" diye okur; hangi kategoriye/alana ait olduğu kaybolur. Yükleme ve kayıt durumları canlı bölgeye bağlı değil.
- **Profesyonel öneri:** `id={\`th-${cat.key}\`}` + `htmlFor`, kart başlığını `aria-labelledby` ile grup adı yapın (`role="group"` / `<fieldset><legend>`); yardım metinlerini `aria-describedby` ile bağlayın; iskelet kapsayıcısına `aria-busy="true"`; emoji'ye `aria-hidden`.
- **Efor:** S

### 10. Kaydedilmemiş değişiklik takibi ve korunması zayıf
- **Önem:** düşük · **Kategori:** UX / doğruluk
- **Kanıt:** `page.tsx:49` (sıra duyarlı `JSON.stringify`), sayfada `beforeunload`/router guard yok.
- **Sorun:** Anlamca aynı veride "Kaydedilmemiş değişiklikler var" yanlış pozitifi; tersine gerçek değişiklikler başka sayfaya geçince sessizce kaybolur. Kaydet butonu sayfanın altında ve yapışkan değil.
- **Profesyonel öneri:** Anahtarları sıralı, normalize edilmiş bir karşılaştırma (`stableStringify(normalize(overrides))`); dirty iken yapışkan alt "değişiklik çubuğu" (Stripe/Linear deseni: "2 değişiklik · Vazgeç · Gözden geçir ve yayınla"); `beforeunload` + Next router navigasyon uyarısı.
- **Efor:** S

### 11. Dil tutarlılığı: sabit TR metinler ve ASCII toast önekleri
- **Önem:** düşük · **Kategori:** i18n / tutarlılık
- **Kanıt:** `page.tsx:100-110`, `145`, `155`, `175`, `177`; `lib/admin-toast.ts:18-21` ("Basarili: ", "Dikkat: "); `page.tsx:88` ("✓" tekrarı).
- **Sorun:** Sayfa i18n kullanmıyor (kenar çubuğu etiketi ve komşu `gamification-settings` kullanıyor); toast'larda Türkçe karaktersiz önek ("Basarili") ile Türkçe metin yan yana: "Basarili: Kategori eşikleri kaydedildi ✓".
- **Profesyonel öneri:** Metinleri `adminCharacterThresholds.*` anahtarlarıyla `messages/tr.json`/`en.json`'a taşıyın; `admin-toast` öneklerini düzeltin (sistem genelini etkiler) ve "✓" gibi tekrarları kaldırın.
- **Efor:** S

### 12. API rotası gizli kapıdan muaf (sistem geneli not)
- **Önem:** düşük · **Kategori:** güvenlik (savunma derinliği)
- **Kanıt:** `proxy.ts:103-117` (`/api/` yolları `authMiddleware`'e girmez), `proxy.ts:79-88` (gate yalnız `/admin` sayfa yolları).
- **Sorun:** Sayfa gizli kapı cookie'si ister ama `PUT /api/admin/settings/character-thresholds` yalnız ADMIN rolüyle çağrılabilir. Rolü kazara ADMIN yapılmış bir hesap (gizli kapının tam olarak korumak istediği senaryo) bu ekonomi ayarını doğrudan API'den değiştirebilir. Bu sayfaya özgü değil, tüm `/api/admin/*` için geçerli.
- **Profesyonel öneri:** `requireAuth(['ADMIN'])` içine (veya ayrı `requireAdminGate()`) gate cookie doğrulaması ekleyin; en azından ekonomi etkili yazma uçlarında (puan matrisi, eşikler, ödüller).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Etki önizlemesi / dry-run** (PostHog feature flag rollout önizlemesi, Stripe'ın "bu değişiklik N aboneliği etkiler" deseni): taslak değerlerle kaç kullanıcının hazır olacağı, kaç rozet/puan basılacağı, kimin geriyeceği.
- **Sürümlü konfigürasyon + geçmiş + geri al** (Retool/LaunchDarkly audit trail): kim, ne zaman, ne değiştirdi; tek tıkla önceki sürüme dönüş. Audit verisi zaten var (`route.ts:82-92`), yalnız okunmuyor.
- **Dağılım görselleştirmesi**: her kategori için kullanıcıların mevcut ilerleme histogramı (0..eşik) ve eşik çizgisi; eşiği sürüklerken histogramın canlı kesilmesi.
- **Taslak → onay → yayın akışı** ve "yalnız yeni döngülere uygula / geriye dönük uygula" seçimi.
- **Doğrulama sınırları ve agresif değer uyarısı** (sunucu ve istemci ortak şema).
- **Eşzamanlı düzenleme çakışma tespiti** (409 + fark görünümü).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Admin bu sayfaya geldiğinde "rozetler ne kadar zor kazanılıyor, ve bunu değiştirirsem ne olur?" sorusunu tek ekranda yanıtlayabilmeli. Bir sayı formu değil, bir **ekonomi ayarı kontrol paneli**.

**Yerleşim:**
1. **Üst özet şeridi**: kategori başına küçük KPI'lar — etkin eşik, son 30 günde açılan rozet, şu an "hazır" bekleyen kullanıcı sayısı, kategori başına ortalama süre-rozete. Son değişiklik: "Furkan · 3 gün önce · Gizemli 20→25".
2. **Kategori satırları (tablo/liste, kart yerine)**: sol sütun kategori kimliği (accent rengi şeridi + emoji + ad + karakter sayısı), orta sütun "Varsayılan / Etkin / Taslak" üç değer, sağ sütun mini histogram (kullanıcıların mevcut döngüdeki ilerlemesi) üzerinde eşik çizgisi. Satır tıklanınca sağdan açılan düzenleme paneli: sayı alanı + kaydırıcı, aralık ipucu, uzunluk şartı için performans notu.
3. **Yapışkan değişiklik çubuğu**: "2 kategori değişti · Vazgeç · Etkiyi gör" → onay diyaloğu: diff tablosu + etki özeti (hazır olacak kullanıcı, tahmini puan, gerileyen kullanıcı, geçersizleşecek bildirim) + "geriye dönük uygula" seçimi + Yayınla.
4. **Geçmiş sekmesi**: audit kayıtlarından sürüm listesi, her sürümde diff ve "bu sürüme dön".

**Motion / 3D:** 3D gereksiz; bu bir operatör aracı. Ölçülü framer-motion (`m as Motion`) yeterli: değişiklik çubuğunun alttan girişi, histogramda eşik çizgisinin taslak değere yumuşak kayması, kaydedilen satırda kısa bir onay vurgusu. Tümü `useReducedMotion` ile kapatılabilir olmalı.

**Veri / API değişiklikleri:**
- `GET /api/admin/settings/character-thresholds` → cache'siz, fail-closed; `categories[]` içine `accent`, `characterCount`, `effective`, `updatedAt`, `updatedBy` ekleyin; ayrıca kategori başına ilerleme histogramı (tek `groupBy(customerId, characterCategory)` + `UserBadge` toplu sayımından türetilmiş, Redis'te birkaç dakika cache'li).
- `POST .../preview` → taslak override'larla etki hesabı (yazma yok).
- `PUT ...` → zod şeması + aralık + `expectedUpdatedAt` (409) + tek `$transaction` (oku/yaz/audit) + Redis sürüm artırımı + atılan alanlar için 400.
- `GET .../history` → `AuditLog where action='UPDATE_CATEGORY_THRESHOLDS'` sayfalanmış; `POST .../revert/:auditId`.
- Runtime: `ConsumptionReview.textLength` kolonu ile uzunluk şartlı sayımın tek sorguya indirilmesi; gerekiyorsa kullanıcı-kategori döngü baseline'ı ile geriye dönük etkinin kontrol altına alınması.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/character-test`** (`app/admin/character-test/page.tsx`): aynı alanın (karakter rozeti) test/simülasyon aracı. Şu an eşiği sabit 6 gösterdiği için bu sayfayla çelişiyor (Bulgu 7). Öneri: ikisini **"Karakter Rozetleri"** adlı tek admin merkezinde sekmeler olarak birleştirmek — *Eşikler* (bu sayfa), *Test & Sınıflandırma* (character-test), *Dağılım/Analitik*. Böylece admin eşiği değiştirip aynı ekranda test kullanıcısıyla doğrulayabilir.
- **`/admin/points-matrix`** ve **`/admin/gamification-settings`**: aynı "Settings JSON + 60 sn cache" desenini ve aynı ekonomi alanını paylaşıyor (`lib/character-thresholds.ts:3` yorumunda açıkça belirtiliyor). Birleştirme şart değil, ama "ekonomi konfigürasyonu" sayfaları için ortak bir altyapı (sürümlü config, etki önizlemesi, geçmiş, onay akışı, Redis invalidation) tek bir paylaşılan bileşen/servis olarak yazılmalı; bu sayfa o altyapının ilk ve en küçük kullanıcısı olabilir.
- **`/admin/badges`**: rozet kataloğu; eşik ayarının karakter rozeti kartlarından bağlantıyla erişilebilir olması bilgi mimarisini güçlendirir, fakat birleştirme gerekmez.
- Sayfa **kaldırılmamalı**: yaptığı iş benzersiz ve runtime gerçekten kullanıyor (`lib/character-badges.ts:344-382`).

---

## Doğrulama (şüpheci inceleme)

### İddia 1 — Admin okuma hatası boş override olarak dönüyor; sonraki kayıt tüm override'ları kalıcı siler
- **Karar:** DOĞRULANDI (önem: yüksek kalabilir; veri kurtarılabilir olduğu için "kritik" değil)
- **Kanıt zinciri:**
  - `lib/character-thresholds.ts:65-67` — `findUnique(...).catch(() => null)` hatayı yutuyor; `:68` `normalizeCategoryThresholds(undefined)` → `{}` (`:37`); `:69` bu `{}` 60 sn modül düzeyi cache'e yazılıyor.
  - `app/api/admin/settings/character-thresholds/route.ts:31` admin GET aynı cache'li fonksiyonu kullanıyor; `:41-46` koşulsuz `success: true, overrides: {}` dönüyor. `requireAuth` (`lib/api-auth.ts:52-80`) DB'ye zorunlu bağımlı değil (oturum + Redis sıcak katmanlı token-replay), yani yetki geçip ayar okuması başarısız olabilir.
  - Daha olası yol: aynı fonksiyon runtime'da da çağrılıyor (`lib/character-badges.ts:346`, `:429`). O sunucu örneğinde herhangi bir müşteri isteği sırasında tek bir geçici Neon hatası `{}`'i 60 sn cache'ler; admin bu pencerede aynı örneğe düşerse DB sağlıklı olsa bile boş tablo görür.
  - `app/admin/character-thresholds/page.tsx:36-37` boş tabloyu "temiz" başlangıç kabul ediyor, hata göstermiyor; `:82` PUT tüm `overrides` nesnesini gönderiyor; `route.ts:72-80` `upsert` tüm JSON'u yerine yazıyor (birleştirme yok).
- **Yeniden üretim:** Override'lar `{ gizemli: { threshold: 30 }, x: { minReviewLength: 40 } }` olsun. Bir örnekte ayar okuması bir kez hata versin (bağlantı zaman aşımı) → `{}` 60 sn cache'lenir. Admin bu sürede sayfayı açar, tüm alanlar boş/placeholder görünür, `x` için eşiği 8 yapıp kaydeder → DB'ye `{ x: { threshold: 8 } }` yazılır; gizemli=30 ve x.minReviewLength=40 kalıcı silinir. Aynı 60 sn içinde o örnekteki ilerleme/reveal hesapları da kod varsayılanlarıyla (gizemli 20) yapılır.
- **Hafifletici:** `auditLog.oldData` (`route.ts:88`) önceki değeri saklar; elle geri dönüş mümkün. Ancak UI bunu sunmuyor, fark edilmesi de olası değil.
- **Not:** Önerilen düzeltme (cache'siz, hatayı fırlatan admin okuma yolu + GET'te 503 + UI'da düzenleme kilidi + runtime'da hata sonucunu cache'lememe) yerinde.

### İddia 2 — Eşik düşürme geriye dönük toplu rozet + ödül puanı basımına yol açıyor; sınır ve onay yok
- **Karar:** ÇÜRÜTÜLDÜ (KRİTİK/YÜKSEK hata/güvenlik olarak). Mekanik doğru tarif edilmiş, fakat bu yetkisiz bir basım yolu değil; güvenilir admin'in bilinçli konfigürasyonunun tasarlanmış sonucu. Önem "orta / ürün koruma rayı" seviyesine indirilmeli.
- **Okuyarak doğrulanan kısım:** `lib/character-badges.ts:388-391` ilerlemeyi tarihsel yorum sayısından `total - takenInCat*threshold` ile yeniden hesaplıyor; `:463` reveal guard'ı aynı formülü güncel eşikle uyguluyor; `:467-481` rozet + `creditBadgeRewardInTx` aynı tx'te. 12 yorumlu, 1 rozetli kullanıcıda eşik 6→3 yapılırsa art arda 3 reveal hakkı oluşur — doğru. Eşik yükseltilince okunmamış `character-ready` bildirimi (`:276-300`) kalır ama reveal `:463`'te reddedilir — bu da doğru.
- **Neden kritik/yüksek değil:**
  - Değiştirme yetkisi yalnız ADMIN rolü + gizli kapı çerezi (`proxy.ts:79-84`) + `requireAuth(['ADMIN'])` (`route.ts:61`). Saldırgan kontrollü bir girdi yolu yok.
  - Basım sınırlı: her kategori karakter listesiyle sınırlı (`:384-385`, sahip olunan karakter tükenince kategori atlanır), kullanıcı başına en fazla 43 rozet; puan karakter başına sabit `badgeRewardPoints` (`lib/badge-reward-points.ts:25-31`); çift basıma karşı advisory lock + `skipDuplicates` (`:442`, `:467-471`). Puan ekonomisi değişmezleri (atomik tek-sefer kredi) korunuyor.
  - Rozetler gerçekten yazılmış ve sınıflandırılmış yorumlara karşılık geliyor; "geriye dönük uygulama" sistemin belgelenmiş semantiği (eşik = N yorumda bir karakter).
- **Geçerli kalan kısım (orta):** Sunucuda makul aralık doğrulaması yok (`lib/character-thresholds.ts:22-25` yalnız `>0`), sayfada etki önizlemesi/onay adımı yok. Admin'in yazım hatası (6 yerine 1) tek kayıtta geniş çaplı rozet + puan dağıtımı yapar ve geri alınamaz. Bu, raporun Bulgu 2 (aralık doğrulaması) ve önizleme/onay önerileriyle zaten karşılanıyor; ayrı bir yüksek önemli güvenlik bulgusu olarak sayılmamalı.

---

## Uygulama (Dalga 2)

Sayfa `/admin/badges?tab=esikler` sekmesine taşındı; `/admin/character-thresholds` kalıcı yönlenir (sorgu korunur). Uç: `GET/PUT /api/admin/badges/thresholds`, `POST …/thresholds/preview`, `GET …/thresholds/history` (eski `/api/admin/settings/character-thresholds` silindi). Mantık: `lib/admin-badges/thresholds.server.ts`; UI: `components/admin/a-rozetler/thresholds-tab.tsx`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Başlık | ÇALIŞIYOR | Rozetler `PageHeader` + `metadata.title`. |
| 2 | Bilgi kartı | ÇALIŞIYOR | Sabit "varsayılan 20" metni yok; varsayılan her satırda sunucudan; geriye dönüklük açıkça yazılı. |
| 3 | Yükleme | ÇALIŞIYOR | Cache'siz, fail-closed; sunucu ön yüklemesi. |
| 4 | Yükleniyor iskeleti | ÇALIŞIYOR | QueryState iskeleti (`aria-busy`). |
| 5 | Hata durumu | ÇALIŞIYOR | "Eşikler okunamadı — düzenleme kilitli" + Tekrar dene; form render edilmez. |
| 6 | Boş durum | ÇALIŞIYOR | Kategoriler koddan; geçmiş için boş durum. |
| 7 | Kategori kartı | ÇALIŞIYOR | Accent şeridi, emoji (`aria-hidden`), karakter sayısı, etkin değer. |
| 8 | Override vurgusu | ÇALIŞIYOR | "değişti" etiketi taslağa göre; varsayılana eşit değer override sayılmaz (sunucuda da temizlenir). |
| 9 | Eşik alanı | ÇALIŞIYOR | 3–100 aralığı istemci + sunucu (zod, 400 alan hatası); < 4 "agresif" uyarısı. |
| 10 | Min. uzunluk alanı | ÇALIŞIYOR | 0–2000; performans notu. |
| 11 | Varsayılan gösterimi | ÇALIŞIYOR | Her alanın altında "Varsayılan N", satırda "Etkin". |
| 12 | Kategori sıfırla | ÇALIŞIYOR | Erişilebilir adlı düğme. |
| 13 | Dirty takibi | ÇALIŞIYOR | Anahtar sıralı kararlı karşılaştırma (yanlış pozitif yok). |
| 14 | Kaydet | ÇALIŞIYOR | Önce etki diyaloğu → Yayınla; `baseVersion` 409. |
| 15 | Kaydedilmemiş ipucu | ÇALIŞIYOR | Yapışkan değişiklik çubuğu ("N kategori değişti · Vazgeç · Etkiyi gör"). |
| 16 | Ayrılırken uyarı (EKSİK) | ÇALIŞIYOR | `beforeunload`. |
| 17 | Sunucu doğrulaması | ÇALIŞIYOR | Sessiz atma yok: bilinmeyen kategori/aralık dışı → 400 + alan yolu. |
| 18 | Audit | ÇALIŞIYOR | Yazma ile aynı tx (`writeVersionedSetting`), sayfada geçmiş olarak okunur. |
| 19 | Cache invalidation | KISMİ | Bu örnek temizlenir; diğer örnekler en geç 60 sn'de yeniler (Redis sürüm anahtarı yapılmadı — `lib/character-thresholds.ts` ortak modül). |
| 20 | Yetki | ÇALIŞIYOR | `defineRoute` ADMIN + DB rolü (gizli kapı `requireAuth` içinde, P0-01). |
| 21 | Runtime tüketimi | ÇALIŞIYOR | Değişmedi. |
| 22 | Etki önizlemesi (EKSİK) | ÇALIŞIYOR | Tek toplu SQL: hazır şimdi→sonra, yeni hazır/gerileyen, ek rozet, ~puan, dağılım histogramı; büyük etkide "anladım" onayı. |
| 23 | Geçmiş / geri al (EKSİK) | ÇALIŞIYOR | Denetim kaydından sayfalı geçmiş; "Bu sürümü geri yükle" → etki diyaloğu → yayın (`revertOf` denetimde). |
| 24 | Son güncelleyen (EKSİK) | ÇALIŞIYOR | "Son değişiklik: kişi · ne zaman". |
| 25 | Tümünü varsayılana döndür (EKSİK) | KALDIRILDI | Kategori başına sıfırlama + geçmişten geri yükleme yeterli; ayrı düğme gereksiz. |
| 26 | Aralık uyarısı (EKSİK) | ÇALIŞIYOR | Tek kaynak `THRESHOLD_LIMITS`. |
| 27 | Eşzamanlılık (EKSİK) | ÇALIŞIYOR | 409 + "Güncel hali yükle". |
| 28 | Toast | ÇALIŞIYOR | `sonner`, Türkçe, tekrar ikon yok. |
| 29 | i18n (EKSİK) | KALDIRILDI | Admin panelinin geri kalanı (Dalga 2 yüzeyleri) sabit Türkçe; i18n anahtarı eklenmedi (paylaşılan `messages/*.json` başka ajanların). |
| 30 | Form erişilebilirliği | ÇALIŞIYOR | `label htmlFor`/`id`, `aria-describedby`, `role=group`. |
| 31 | Mobil | ÇALIŞIYOR | Tek sütun, yapışkan çubuk, ≥ 44px. |
| 32 | Kategori bağlamı (EKSİK) | ÇALIŞIYOR | Açıklama/accent/karakter sayısı + önizlemede kullanıcı dağılımı. |
| 33 | Test paneli tutarlılığı (BOZUK) | ÇALIŞIYOR | Test lab üretimdeki `getCategoryProgressDetailed` ile etkin eşik/uzunluğu gösterir ve doldurur. |

### Kapanan bulgular
1 (önizleme + onay; geriye dönüklük açıkça yazılı) · 2 (aralık doğrulaması) · 3 (Dalga 1'de fail-closed; UI kilidi) · 4 (409 + tek tx) · 7 (test lab etkin eşik) · 8 (varsayılan/etkin görünür, sessiz atma yok) · 9 (a11y) · 10 (kararlı dirty + beforeunload + yapışkan çubuk) · 11 (toast Türkçe) · 12 (gizli kapı `requireAuth` içinde — P0-01).

### Kalanlar
- Bulgu 5 (çoklu örnek cache): Redis sürüm anahtarı ortak `lib/character-thresholds.ts`'e dokunmayı gerektirir; 60 sn TTL ile sınırlı.
- Bulgu 6 (`minReviewLength` sıcak yol maliyeti): `ConsumptionReview.textLength` kolonu gerekir → ŞEMA İSTEĞİ. UI uyarısı eklendi.
- "Yalnız yeni döngülere uygula" seçeneği: kullanıcı-kategori baseline tablosu gerekir → ŞEMA İSTEĞİ.

### ŞEMA İSTEKLERİ
- `ConsumptionReview.textLength Int?` (yazımda `char_length(btrim(text))`) — uzunluk şartlı sayımı tek sorguya indirir.
- `CharacterCycleBaseline(userId, categoryKey, consumed)` — eşik değişikliğini yalnız yeni döngülere uygulamak için.
