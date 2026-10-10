# /dealer/products

**Amaç:** Bayinin (restoran/kafe/mağaza) ürün kataloğunu, yani kategorileri ve ürünleri yönetmesi. Bu katalog, `Kart Tara` (`/dealer/scan`) akışında tüketim kaydı açılırken seçenek olarak kullanılıyor. Tüketim (`Consumption.productId`) ve tüketim değerlendirmesi (`ConsumptionReview`) üzerinden de karakter rozeti ve yorum ekranlarına bağlanıyor.

**Genel puan:** 5/10 · **Karar:** koru-iyileştir. Temel CRUD ve sahiplik kontrolleri sağlam. Sayfa, verinin ve API'nin zaten desteklediği yeteneklerin (görsel, aktif/pasif, geri yükleme, ürün başına performans) çok gerisinde kalıyor; bunlar kapanıp bilgi mimarisi yeniden düzenlenmeli.

İncelenen dosyalar: `app/dealer/products/page.tsx`, `app/dealer/products/layout.tsx`, `app/dealer/layout.tsx`, `app/api/dealer/categories/route.ts`, `app/api/dealer/products/route.ts`, `app/api/dealer/products/[id]/route.ts`, `lib/validations.ts`, `lib/api-auth.ts`, `lib/utils.ts`, `components/ui/tabs.tsx`, `components/layout/dashboard-page-hero.tsx`, `components/providers.tsx`, `messages/tr.json` ve `messages/en.json` (`dealerProducts`), `prisma/schema.prisma` (`ProductCategory`, `Product`, `Consumption`), `prisma/seed.ts`, `app/api/search/route.ts`, `app/api/dealer/onboarding/route.ts`, `app/dealer/scan/page.tsx`, `app/api/dealer/consumptions/route.ts`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Ürün oluşturma, düzenleme ve silme çalışıyor. Kategoriler ise yalnızca oluşturulabiliyor. Görsel, aktiflik ve geri yükleme API'de var ama arayüzde yok. Global aramadan gelen `?search=` bağlantısı da çalışmıyor. |
| UX | 4/10 | Düzenle/sil menüsü yalnızca hover ile görünüyor. Boş durum, hata ile filtre sonucunu ayırt etmiyor. Kategori yönetimi ve kataloğun neye hizmet ettiğine dair bağlam zayıf. |
| Görsel | 5/10 | Panelin ortak hero ve kart dilini izliyor, düzenli bir görünümü var. Ancak ürün kartları kategori emojisinden ibaret, fiyat TL olduğu halde `$` ikonuyla gösteriliyor, istatistik kartlarının da bilgi değeri düşük. |
| Mimari | 5/10 | Tek dosyada 660 satırlık istemci bileşeni var. `fetch`/`useEffect` ile elle yazılmış, `res.ok` kontrolü yapmayan bir veri katmanı kullanılıyor. Kullanılmayan importlar var, sunucu hata metinleri tek dilde sabit. API tarafı ise temiz. |
| Performans | 7/10 | Liste 500 kayıtla sınırlı, iki istek paralel gidiyor, katalog küçük olduğu için yeterli. Her değişiklikten sonra iki liste baştan çekiliyor ve her kartta `backdrop-blur` kullanılıyor. |
| Erişilebilirlik + mobil | 3/10 | Kart menüsü dokunmatik ekranda ve klavyede görünmez (`opacity-0`). `Label`/`Input` eşleşmesi, emoji düğmeleri için `aria` ve Enter ile gönderme yok. Sekme listesi taşınca baştaki sekmelere ulaşılamayabiliyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Hero (eyebrow, başlık, açıklama, ikon) | ÇALIŞIYOR | page.tsx:269-292 | `DashboardPageHero` = `AdminPremiumHero` (dashboard-page-hero.tsx:9-13) |
| 2 | Sayfa metadata (başlık/açıklama) | KISMİ | layout.tsx:4-6; tr.json `layoutMetadata.dealerProductsDescription` = "QR akışlarına bağlı katalog, stok ve tüketimler." | Sayfada stok da tüketim de yok; açıklama sayfanın sunmadığı şeyleri vaat ediyor |
| 3 | "Kategori Ekle" butonu | ÇALIŞIYOR | page.tsx:277-285 | Dialog açar |
| 4 | "Ürün Ekle" butonu | ÇALIŞIYOR | page.tsx:286-289 | Dialog açar |
| 5 | Kategori sayısı kartı | KISMİ | page.tsx:296-308 | Global kategorileri de sayıyor (categories/route.ts:21-26), yüklenirken "0" gösteriyor |
| 6 | Ürün sayısı kartı | KISMİ | page.tsx:309-321 | Global ürünleri de sayıyor (products/route.ts:31-37), yüklenirken "0" gösteriyor |
| 7 | Ürün arama | KISMİ | page.tsx:258-263, 330-335 | Yalnızca ada bakıyor, açıklama ve kategori aranmıyor. `toLowerCase()` Türkçe "İ" harfinde bozuluyor (Bulgu 4) |
| 8 | Kategori sekme filtresi | KISMİ | page.tsx:337-346; tabs.tsx:16 | `justify-center` ile `overflow-x-auto` birlikte kullanılıyor; çok kategoride baştaki sekmeler kırpılabilir (Bulgu 7) |
| 9 | İlk veri yükleme (paralel GET) | KISMİ | page.tsx:98-120 | `res.ok` kontrolü yok; 401/500/503 yanıtı sessizce boş liste oluyor (Bulgu 1) |
| 10 | Yükleniyor durumu | KISMİ | page.tsx:352-355 | Yalnızca spinner var; iskelet yok, istatistikler 0 gösteriyor |
| 11 | Hata durumu | KISMİ | page.tsx:115-117 | Yalnızca ağ hatasında toast çıkıyor; sayfa içi hata durumu ve "tekrar dene" yok |
| 12 | Boş durum | KISMİ | page.tsx:356-372 | Hiç ürün olmamasını filtre sonucunun boş olmasından ayırmıyor; filtre varken de "İlk Ürününüzü Ekleyin" diyor |
| 13 | Kart: kategori emojisi avatarı | ÇALIŞIYOR | page.tsx:388-395 | Ürün görseli yerine kategori ikonu gösteriliyor |
| 14 | Kart: ürün adı ve kategori adı | ÇALIŞIYOR | page.tsx:396-399 | |
| 15 | Kart: açıklama (2 satır) | ÇALIŞIYOR | page.tsx:423-427 | |
| 16 | Kart: fiyat gösterimi | BOZUK | page.tsx:429-436 | `product.price &&` fiyat 0 iken ekrana "0" basıyor; TL tutar `$` (`DollarSign`) ikonuyla gösteriliyor |
| 17 | Kart giriş/çıkış animasyonu | ÇALIŞIYOR | page.tsx:375-383; providers.tsx:232 | `MotionConfig reducedMotion="user"` sayesinde azaltılmış hareket tercihine uyuyor; gecikme 10 öğede sınırlı |
| 18 | Kart aksiyon menüsü (⋮) | KISMİ | page.tsx:401-406 | `opacity-0 group-hover:opacity-100`; dokunmatikte ve klavye odağında görünmüyor, `aria-label` yok |
| 19 | Ürün düzenleme (PATCH) | ÇALIŞIYOR | page.tsx:189-233; [id]/route.ts:48-115 | Sahiplik ve kategori erişimi kontrol ediliyor. Global ürünlerde menü yine görünüyor ama 403 dönüyor |
| 20 | Ürün silme ve onay dialogu (soft delete) | ÇALIŞIYOR | page.tsx:235-256, 637-656; [id]/route.ts:122-153 | `isActive=false`; tüketim geçmişi korunuyor |
| 21 | Yeni kategori: ad alanı | ÇALIŞIYOR | page.tsx:456-463; validations.ts:298-305 | Aynı adla tekrar oluşturmaya karşı kontrol yok |
| 22 | Kategori emoji seçici | KISMİ | page.tsx:265, 465-483 | 12 sabit emoji var; seçim yalnızca renkle belli oluyor (`aria-pressed`/`aria-label` yok). Sunucu `icon` alanının uzunluğunu sınırlamıyor (validations.ts:303) |
| 23 | Yeni ürün formu (ad, kategori, açıklama, fiyat) | ÇALIŞIYOR | page.tsx:497-566; products/route.ts:75-138 | |
| 24 | Kategori yokken ürün eklemeye yönlendirme | EKSİK | page.tsx:526-532 | Kategori listesi boşsa Select de boş geliyor, kullanıcıya yol gösterilmiyor |
| 25 | Düzenleme formu | ÇALIŞIYOR | page.tsx:568-635 | Ürünün kategorisi listede yoksa (pasif kategori gibi) Select boş görünüyor |
| 26 | Enter ile form gönderme | EKSİK | page.tsx:455-493 | `<form>` öğesi yok, yalnızca onClick |
| 27 | Sunucu hata mesajlarının gösterimi | KISMİ | page.tsx:139, 174, 221, 244; categories/route.ts:46,88; validations.ts:318-325 | Sunucu hataları sabit Türkçe; `updateProductSchema` ise zod'un varsayılan İngilizce metnini dönüyor. Sonuçta TR/EN karışıyor |
| 28 | Global aramadan derin bağlantı (`?search=`) | BOZUK | search/route.ts:124; page.tsx içinde `useSearchParams` yok | Arama sonucuna tıklanınca sayfa filtrelenmeden açılıyor |
| 29 | Kategori düzenleme, silme ve sıralama | EKSİK | categories/route.ts yalnızca GET/POST içeriyor | Uygulamanın hiçbir yerinde `productCategory.update/delete` yok |
| 30 | Ürün görseli | EKSİK | page.tsx:57 (`image` tanımlı ama kullanılmıyor); validations.ts:315,323 | API URL kabul ediyor, arayüzde yükleme ve gösterim yok |
| 31 | Aktif/pasif ("tükendi") geçişi | EKSİK | validations.ts:324 (`isActive` destekli) | Arayüzde yalnızca "Sil" var |
| 32 | Arşiv ve silineni geri alma | EKSİK | [id]/route.ts:135-138 soft delete | Silinen ürün listelenemiyor, geri alınamıyor |
| 33 | Ürün performansı (tüketim sayısı, ortalama puan) | EKSİK | schema.prisma:1574-1594 (`Consumption.productId`) | Veri hazır ama bu sayfada hiç kullanılmıyor |
| 34 | Toplu işlem, CSV içe/dışa aktarma | EKSİK | — | |
| 35 | Sıralama seçenekleri (ad/fiyat/popülerlik) | EKSİK | products/route.ts:45 | Liste sabit olarak ada göre sıralı |
| 36 | API yetki ve sahiplik kontrolü | ÇALIŞIYOR | [id]/route.ts:13-42, 70-92; products/route.ts:101-105 | IDOR kontrolü doğru |
| 37 | Global ve bayiye özel kayıt ayrımı | EKSİK | categories/route.ts:21-26; seed.ts:998-1050 | Global kategoriler gizlenemiyor, düzenlenemiyor ve görsel olarak ayırt edilmiyor |
| 38 | Onboarding "ürün" adımı | KISMİ | onboarding/route.ts:35,50 | `product.count({ where: { dealerId } })` `isActive` filtresi içermiyor; silinmiş ürün de adımı "tamamlandı" sayıyor |
| 39 | Form erişilebilirliği (label ilişkisi) | KISMİ | page.tsx:457-462, 509-514 vb. | `Label` ögelerinde `htmlFor`/`id` yok; zorunluluk yalnızca "*" ile belirtiliyor |
| 40 | Çift gönderim koruması | ÇALIŞIYOR | page.tsx:86, 490, 561, 630, 651 | Ortak `submitting` durumu kullanılıyor |
| 41 | Sayfalama / büyük katalog | KISMİ | products/route.ts:46; categories/route.ts:28 | 500 kayıttan sonrası sessizce kesiliyor; sayfalama yok |

**Toplam 41 özellik:** 14 ÇALIŞIYOR · 15 KISMİ · 2 BOZUK · 0 SAHTE · 10 EKSİK

---

## Bulgular

### 1. Yükleme hatası sessizce "henüz ürün yok" durumuna düşüyor
- **Önem:** yüksek · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** page.tsx:105-114. `fetch` sonucunda `res.ok` kontrol edilmiyor; `if (catData.success)` yanlışsa hiçbir şey yapılmıyor. `toast.error` yalnızca ağ hatasında, yani `catch` bloğunda çalışıyor (page.tsx:115-117).
- **Sorun:** Oturum süresi dolduğunda (401), token-replay reddinde (403, api-auth.ts:70-76) ya da Neon erişilemezken (503, `responseIfDatabaseUnavailable`) kullanıcı "Henüz ürün eklememişsiniz" metnini ve "İlk Ürününüzü Ekleyin" çağrısını görüyor. Bu durumda yinelenen ürün oluşturmaya itiliyor ve gerçek sorunu fark etmiyor.
- **Öneri:** Veri katmanı SWR/React Query desenine (panelde hangisi standartsa) taşınmalı. `!res.ok` durumu hata olarak fırlatılmalı ve üç ayrı durum gösterilmeli: `error` (sayfa içi kart, hata kodu ve "Tekrar dene"), `empty` (gerçekten hiç kayıt yok) ve `filtered-empty`. 401 geldiğinde giriş sayfasına yönlendirilmeli.

### 2. Kart aksiyon menüsü dokunmatik ekranda ve klavyede görünmüyor
- **Önem:** yüksek · **Kategori:** mobil/erişilebilirlik · **Efor:** S
- **Kanıt:** page.tsx:403. Düğme `opacity-0 group-hover:opacity-100` sınıflarını taşıyor; `focus-visible:opacity-100` yok, `aria-label` yok.
- **Sorun:** Bayilerin çoğu paneli telefondan kullanıyor (layout.tsx'te alt gezinme için `pb-[calc(6.5rem+…)]` boşluğu var). Telefonda hover olmadığı için düzenle/sil seçenekleri görünmüyor; düğme yalnızca rastgele bir dokunuşla ortaya çıkıyor. Klavyeyle odaklanıldığında da görünmez kalıyor.
- **Öneri:** Menü dokunmatik cihazlarda her zaman görünür olmalı (`opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100`), `aria-label` almalı. Daha iyisi, kartın tamamı tıklanınca bir düzenleme sayfası/çekmecesi açılmalı (mobilde alttan açılan sheet). Hızlı aksiyonlar ("Tükendi" anahtarı, fiyat) doğrudan kart üzerinde durmalı.

### 3. Global aramadan gelen `?search=` bağlantısı çalışmıyor
- **Önem:** orta · **Kategori:** işlevsellik/kırık bağlantı · **Efor:** S
- **Kanıt:** app/api/search/route.ts:124 bayiye `/dealer/products?search=<q>` döndürüyor. page.tsx'te `useSearchParams` yok; `searchQuery` başlangıç değeri `''` (page.tsx:74).
- **Sorun:** Başlıktaki arama bir ürünü buluyor, tıklanınca sayfa filtresiz açılıyor ve kullanıcı ürünü yeniden aramak zorunda kalıyor.
- **Öneri:** Arama ve kategori filtresi URL durumuna bağlanmalı (`useSearchParams` + `router.replace`, debounce ile). Böylece hem derin bağlantı hem paylaşılabilir/geri tuşuyla korunan filtre durumu elde edilir. İleride arama içeren ilgili sayfalarda da aynı desen kullanılmalı.

### 4. Arama Türkçe "İ/I" harflerinde bozuk
- **Önem:** orta · **Kategori:** yerelleştirme/hata · **Efor:** S
- **Kanıt:** page.tsx:261: `product.name.toLowerCase().includes(searchQuery.toLowerCase())`.
- **Sorun:** `"İskender".toLowerCase()` sonucu `"i̇skender"` olur (i + U+0307 birleşik nokta). Bu yüzden "iskender" araması eşleşmiyor. "IRMIK" → "irmik" dönüşümü de Türkçe kurala ("ırmık") uymuyor. Türkçe ürün adlarıyla çalışan bir katalogda bu, sık karşılaşılacak bir sorun.
- **Öneri:** `toLocaleLowerCase('tr-TR')` ve aksan/nokta normalizasyonu (`normalize('NFD').replace(/\p{M}/gu,'')`) içeren ortak bir `matchesSearch` yardımcı fonksiyonu yazılmalı. Arama açıklama ve kategori adını da kapsamalı.

### 5. Fiyat 0 iken "0" basılıyor ve TL tutarı `$` ikonuyla gösteriliyor
- **Önem:** orta · **Kategori:** görsel/doğruluk · **Efor:** S
- **Kanıt:** page.tsx:429 `{product.price && (…)}`. React, 0 değerini metin olarak render eder. Formdaki `"0"` metni truthy olduğu için 0 kaydedilebiliyor (page.tsx:167, 214). page.tsx:431 `DollarSign`; `formatCurrency` ise sabit `TRY` ve `tr-TR` kullanıyor (lib/utils.ts:77-81).
- **Sorun:** Ücretsiz ürünlerde (ikram, su) kartın altında yalnız bir "0" görünüyor. "₺45,00" yanında dolar ikonu duruyor. EN arayüzde de para birimi tr-TR biçiminde kalıyor.
- **Öneri:** `price != null` kontrolüyle render edilmeli. 0 için "Ücretsiz" etiketi kullanılmalı. `DollarSign` kaldırılmalı ya da para birimine göre ikon seçilmeli. `formatCurrency` arayüz diline ve bayi para birimine göre parametrelenmeli. Fiyat alanı `Float` yerine `Decimal`/kuruş olarak tutulmalı (para tutarı Float olmamalı); bu orta vadeli bir şema işi.

### 6. Kategori yaşam döngüsü yok: düzenleme, silme, sıralama ve global kategoriyi gizleme
- **Önem:** orta · **Kategori:** işlevsellik · **Efor:** M
- **Kanıt:** categories/route.ts yalnızca GET (14) ve POST (54) içeriyor. Uygulamada `productCategory.update`/`delete` çağrısı hiç yok (grep). Global kategoriler (seed.ts:998-1050, `dealerId: null`) her bayiye gösteriliyor.
- **Sorun:** Yazım hatasıyla oluşturulan bir kategori kalıcı oluyor. Bayi kullanmadığı global "Kahveler" kategorisini sekmeden kaldıramıyor ve kendi "Yemekler" kategorisiyle globali ayırt edemiyor. `order` alanı var ama yönetilemiyor.
- **Öneri:** `PATCH/DELETE /api/dealer/categories/[id]` uçları eklenmeli: sahiplik kontrolü olmalı, içinde ürün varsa "ürünleri şu kategoriye taşı" adımı sorulmalı, silme soft delete olmalı. Sürükle-bırak sıralama ile toplu `order` güncellemesi yapılmalı. Global kategoriler için bayi başına `hiddenGlobalCategoryIds` (ya da bir `DealerCategoryPreference` tablosu) tutulmalı. Arayüzde kategoriler, sol sütunda yönetilebilir bir liste olarak sunulmalı.

### 7. Sekme listesi taşınca baştaki sekmeler kırpılıyor (doğrulanmadı, CSS davranışı)
- **Önem:** orta · **Kategori:** mobil · **Efor:** S
- **Kanıt:** tabs.tsx:16 `inline-flex … justify-center`; page.tsx:338 `overflow-x-auto`.
- **Sorun:** Flex kapsayıcıda `justify-center` ile taşma birlikte kullanıldığında sol taraftaki taşma kaydırılamaz. Kategori sayısı arttıkça, özellikle telefonda, "Tümü" ve ilk kategoriler erişilemez hale gelebilir. Bu bilinen bir tarayıcı davranışı; ekranda gözle doğrulanmadı.
- **Öneri:** Burada `justify-start` kullanılmalı (ya da `safe center`). Mobilde yatay kaydırılan "chip" satırı tercih edilmeli. 8'den fazla kategoride bir `Select`'e geçilmeli.

### 8. Arayüz dil karışıklığı (TR/EN) ve sunucu hata metinleri
- **Önem:** düşük · **Kategori:** i18n · **Efor:** S
- **Kanıt:** categories/route.ts:46, 88; products/route.ts:67, 98, 104, 136; [id]/route.ts:25, 36 sabit Türkçe. `updateProductSchema` (validations.ts:318-325) özel mesaj içermiyor, zod'un varsayılan İngilizce metnini dönüyor (örneğin açıklama 500 karakteri aşınca). page.tsx:139/174/221/244 `toast.error(data.error)` doğrudan gösteriyor.
- **Sorun:** EN arayüzde Türkçe hata çıkıyor, TR arayüzde zod İngilizcesi çıkabiliyor. Ayrıca istemci tarafında `maxLength` sınırı olmadığı için kullanıcı sınırı ancak gönderdikten sonra öğreniyor.
- **Öneri:** API'ler hata kodu (`code: 'CATEGORY_NOT_FOUND'`) dönmeli, istemci bu kodu `t()` ile çevirmeli. Formlar `react-hook-form` + `zodResolver` ile aynı şemayı kullanmalı ve sınır değerlerini (`maxLength={100}`, karakter sayacı) önceden göstermeli.

### 9. Global ürün ve kategoriler için arayüz yanlış aksiyon sunuyor
- **Önem:** düşük · **Kategori:** UX/yetki yansıması · **Efor:** S
- **Kanıt:** GET global ürünleri döndürüyor (products/route.ts:32-34). Menü her kartta gösteriliyor (page.tsx:401-420). PATCH/DELETE global ürünlerde 403 dönüyor ([id]/route.ts:30-40). Üretimde global ürün olup olmadığı **doğrulanmadı**; seed yalnızca global kategori oluşturuyor.
- **Öneri:** API her kayda `isGlobal`/`canEdit` alanı eklemeli. Arayüz global kayıtlara "Sistem" rozeti koymalı, düzenle/sil yerine "Kendi kopyamı oluştur" seçeneği sunmalı.

### 10. Kategori `_count` alanı başka bayilerin ürünlerini de sayıyor
- **Önem:** düşük · **Kategori:** veri doğruluğu/sızıntı · **Efor:** S
- **Kanıt:** categories/route.ts:30-34. `_count.products` filtre içermiyor; global kategoride tüm bayilerin ve pasif ürünlerin sayısını döndürüyor. Arayüz bu alanı kullanmıyor (page.tsx:50 tanımlı ama render edilmiyor).
- **Sorun:** Platform genelindeki ürün hacmi dolaylı olarak her bayiye açılıyor. Alan ileride kategori rozetinde gösterilirse de yanlış sayı çıkar.
- **Öneri:** `_count: { select: { products: { where: { isActive: true, dealerId: session.user.id } } } }` kullanılmalı ya da alan kaldırılmalı.

### 11. Ölü kod ve sessiz `catch` blokları
- **Önem:** düşük · **Kategori:** mimari · **Efor:** S
- **Kanıt:** Kullanılmayan importlar: `Badge` (22), `CardDescription/CardHeader/CardTitle` (23). `useSession` sonucu kullanılmıyor (69). `catch (err)` blokları hatayı loglamıyor (115, 147, 182, 228, 251). `useEffect` bağımlılıkları eksik (98-100). `any` tipi kullanılıyor (products/route.ts:31).
- **Öneri:** Sayfa `ProductsToolbar`, `ProductGrid`, `ProductCard`, `ProductFormSheet`, `CategoryManager` bileşenlerine ve `useCatalog()` hook'una bölünmeli. Oluşturma ve düzenleme formları tek bir `ProductForm` bileşeninde birleşmeli; şu an iki form kopya halde (page.tsx:507-554 ve 576-623). Hatalar telemetriye gönderilmeli; `where` için `Prisma.ProductWhereInput` kullanılmalı.

### 12. Onboarding "ürün" adımı silinmiş ürünü de sayıyor
- **Önem:** düşük · **Kategori:** veri doğruluğu · **Efor:** S
- **Kanıt:** app/api/dealer/onboarding/route.ts:35 `prisma.product.count({ where: { dealerId } })` (`isActive` filtresi yok), 50. satırda `/dealer/products` adımına bağlanıyor.
- **Öneri:** Sayıma `isActive: true` eklenmeli.

### 13. Metadata açıklaması sayfanın sunmadığı özellikleri vaat ediyor
- **Önem:** düşük · **Kategori:** içerik tutarlılığı · **Efor:** S
- **Kanıt:** tr.json'da `layoutMetadata.dealerProductsDescription` "…katalog, stok ve tüketimler." diyor; sayfada stok da tüketim de yok.
- **Öneri:** Ya ürün başına tüketim özelliği eklenmeli (Vizyon bölümü) ya da metin düzeltilmeli.

---

## Eksik özellikler (kıyas ürünlerle)

- **Ürün görseli ve zengin kart** (Toast, Square, Google Business Profile Menü): Görsel yükleme (R2 altyapısı projede var), alerjen ve diyet etiketleri (vegan, glutensiz), varyant ve porsiyon seçenekleri. API `image` alanını zaten kabul ediyor (validations.ts:315).
- **Stok ve uygunluk durumu** ("Tükendi", "Bugün yok", zamanlı uygunluk) (Toast/Square "86'd item"): `isActive` API'de hazır (validations.ts:324). Pasif ürünü silmekten ayıran bir durum alanı (`status: active | soldOut | archived`) eklenmeli.
- **Ürün başına müşteri deneyimi analitiği** (Medallia/Qualtrics'teki ürün/tema bazlı deneyim, Yelp'teki "Popular dishes"): Tüketim sayısı, `ConsumptionReview` ortalama puanı, son 30 gün trendi ve en çok şikâyet alan ürün. Veri `Consumption.productId` üzerinden hazır (schema.prisma:1579, 1588); şu an yalnız yorum listesinde ürün adı gösteriliyor (app/dealer/reviews/page.tsx:354-358).
- **Toplu işlemler ve içe/dışa aktarma** (Square Item Library CSV, Toast menu import): CSV/Excel içe aktarma, toplu fiyat güncelleme (yüzde artış), toplu kategori taşıma.
- **Arşiv ve geri alma** (Square "Archived items"): Soft delete yapılan ürünler için bir "Arşiv" sekmesi ve geri yükleme; ayrıca silmeden hemen sonra toast içinde "Geri al" seçeneği.
- **Sıralama ve menü düzeni** (Google Business Profile menü bölümleri): Kategori ve ürün sırasını sürükle-bırak ile belirleme. `Kart Tara` ekranında bayinin kendi önceliklendirdiği sıranın kullanılması (`QuickScanPreset` API'si var: app/api/dealer/quick-presets/route.ts).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Bu sayfa "ürün listesi" olmaktan çıkıp bir "Menü ve Ürün Deneyimi" ekranına dönüşmeli. Bayi menüsünü 2 dakikada kurabilmeli (şablon kategoriler, CSV veya fotoğraftan AI ile içe aktarma). Her ürünün müşteride nasıl karşılık bulduğunu (tüketim sayısı, puan, şikâyet teması) aynı yerde görmeli ve tek dokunuşla "Tükendi" diyebilmeli.

**Yerleşim:**
- **Masaüstü (≥1024px):** Sol sütunda yönetilebilir kategori listesi bulunmalı: sürükle-bırak sıralama, ürün sayısı, global kategoriyi gizleme ve "+ Kategori". Sağda araç çubuğu olmalı: URL'ye bağlı arama, durum filtresi (Aktif/Tükendi/Arşiv), sıralama (ad/fiyat/popülerlik/puan), ızgara/tablo görünüm geçişi, "İçe aktar". Altında ürün ızgarası ya da yoğun tablo. Kartta görsel, ad, fiyat, ⭐ ortalama ve tüketim sayısı mini-metriği, satır içi "Tükendi" anahtarı yer almalı.
- **Mobil:** Üstte yatay kategori chip şeridi olmalı (`justify-start`, kaydırılabilir). Kartlar tek sütunda dizilmeli; karta dokununca alttan düzenleme sheet'i açılmalı. Ekranın altında sabit bir "+ Ürün" FAB'ı durmalı (safe-area ve alt gezinme boşluğu hesaba katılarak).
- **Üst şerit:** Değeri düşük iki sayaç kartının yerine eyleme dönük 3 içgörü gelmeli: "En çok tüketilen", "En düşük puanlı ürün (son 30 gün)", "Fiyatı girilmemiş N ürün".

**Motion/3D:** 3D gereksiz; bu bir operasyon ekranı. Ölçülü motion yeterli: `layout` animasyonuyla filtre değişiminde yerinde yeniden düzenleme, "Tükendi" anahtarında kartın gri tonlamaya geçmesi, silmede "Geri al" toast'ı ve kartın daralarak çıkması. Azaltılmış hareket tercihi `MotionConfig reducedMotion="user"` ile zaten karşılanıyor (providers.tsx:232). Her kartta kullanılan `backdrop-blur-sm` kaldırılmalı (çok kartlı ızgarada düşük donanımlı telefonlarda maliyetli).

**Veri/API değişiklikleri:**
1. `GET /api/dealer/products?q=&categoryId=&status=&sort=&cursor=`: Sunucu tarafında arama (`mode: 'insensitive'`), sayfalama, `canEdit/isGlobal` bayrakları ve isteğe bağlı `include=stats` ile `consumptionCount30d` ve `avgRating` (tek `groupBy` sorgusuyla, N+1 olmadan). Sonuç Upstash Redis'te bayi başına kısa TTL ile önbelleklenmeli ve mutasyonda geçersiz kılınmalı.
2. `PATCH/DELETE /api/dealer/categories/[id]` ve toplu `PATCH /api/dealer/categories/reorder`.
3. `POST /api/dealer/products/import` (CSV; doğrulama raporu ile önizleme → onay).
4. Görsel yükleme: mevcut R2 akışıyla imzalı yükleme (`image` URL'si).
5. Şema: `Product.status` enum'u (`ACTIVE | SOLD_OUT | ARCHIVED`), `Product.order`, para için `Decimal`. Global kategori gizleme tercihi tablosu.
6. Hata yanıtlarında `code` alanı ve istemci tarafında i18n eşlemesi.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/scan`:** Aynı `/api/dealer/categories` ve `/api/dealer/products?categoryId=` uçlarını tüketiyor (scan/page.tsx:118, 130). Çakışma yok; bu sayfa scan akışının veri kaynağı. Ancak scan tarafının kullandığı sıralama ve hızlı seçim ayarları (`QuickScanPreset`, API'si var, arayüzü bulunamadı) mantıken bu sayfada bir "Kart Tara'da öne çıkanlar" bölümü olarak yönetilmeli.
- **`/dealer/reviews` ve `/dealer/consumptions`:** Ürün adını gösteriyor ama ürün bazlı özet sunmuyor. Ürün performans özeti burada (ürün kartında ve ürün detayında) toplanıp oradaki listelere filtreli derin bağlantı verilmeli (`/dealer/reviews?productId=`). Ayrı bir "ürün analitiği" sayfası açmaya gerek yok.
- **Admin tarafı:** Global kategori ve ürünleri yönetecek bir admin ekranı yok (`app/admin` altında katalog sayfası bulunamadı). Global kayıtlar yalnız seed ile geliyor. Ya bir admin "Global katalog şablonları" ekranı eklenmeli ya da global kayıtlar bayi onboarding'inde kopyalanan şablonlara dönüştürülmeli.
- **Kaldırma veya birleştirme önerilmiyor:** Sayfanın yeri doğru (sidebar.tsx:238, visibility-controls.ts:47, onboarding adımı). Yapılması gereken, kapsamını genişletmek.

---

## Uygulama (Dalga 2)

**Hedef rota:** `/dealer/products` ("Ürünler ve menü"). Sunucu bileşeni ilk sayfayı, kategorileri ve içgörüleri `loadCatalogPage` ile hazırlar (React Query `HydrationBoundary`); istemci adası `components/dealer/b-urunler/**`. Düzenleyici, detay, kategori yönetimi, içe aktarma ve toplu işlem çubuğu `next/dynamic` ile ayrı parça. Ops kaydı (QDL v2): `PanelPage` + `PageHeader`, `QueryState`, `EntityEditorSheet`, `DetailSheet`, `ConfirmAction`, `MoneyField`, `PhotoPicker`; hareket yalnız durum değişimini anlatır (filtrede `layout` ile yerinde yeniden düzen, arşivde solarak çıkış), `useReducedMotionPref` ile statik; kartlarda `backdrop-blur` yok.

**Yeni sunucu katmanı:** `lib/dealer/catalog/`: `core.ts` (saf: İstanbul pencereleri, ürün başına 30 gün / önceki 30 gün tüketim + puan, Türkçe arama/sıralama/sayfa, içgörüler, CSV içe aktarma raporu, görsel alanı denetimi), `server.ts` (okuma; iki `groupBy` + tek değerlendirme sorgusu, N+1 yok), `mutations.ts` (yazma; sahiplik, kategori erişimi, aynı ad 409, `baseUpdatedAt` 409, arşiv, silme yok), `schemas.ts` (sunucu ve form ortak zod; fiyat **kuruş** `priceMinor`), `money.ts`, `csv.ts`, `text.ts`, `types.ts`.

**Yeni BFF uçları** (hepsi `defineRoute`: rol + zod + rate limit + kiracı kapsamı; ADMIN yalnız `?dealerId=` ile salt-okunur):
`GET /api/dealer/catalog` · `POST /api/dealer/catalog/products` · `GET|PATCH /api/dealer/catalog/products/[id]` · `POST …/products/[id]/copy` · `POST …/products/bulk` · `POST /api/dealer/catalog/images` (multipart → sharp ile yeniden kodlama, EXIF silme → R2 `products/<bayi>/…`) · `POST /api/dealer/catalog/categories` · `PATCH …/categories/[id]` · `POST …/categories/[id]/archive` · `POST …/categories/[id]/restore` · `POST …/categories/reorder` · `POST /api/dealer/catalog/import` (önizleme → commit, tek işlem) · `GET /api/dealer/catalog/export` (CSV, Excel Türkçe).

**Eski uçlar:** `app/api/dealer/products/[id]/route.ts` kaldırıldı (yalnız eski sayfa kullanıyordu; görsel alanına her URL'yi kabul ediyordu). `/api/dealer/products` ve `/api/dealer/categories` yalnız GET olarak kaldı (Kart Tara tüketiyor); POST'lar emekli. Kategori `_count` artık yalnız bu bayinin + sistemin aktif ürünlerini sayıyor (Bulgu 10; Kart Tara'daki sayı da düzeldi). `any` yerine `Prisma.ProductWhereInput`.

**Test:** `__tests__/lib/dealer-catalog.test.ts`, 23 test (zaman pencereleri, istatistik/içgörü, Türkçe arama, sıralama/sayfa, sorgu anahtarı gidiş-dönüş, kuruş/CSV/formül kaçışı, içe aktarma raporu, görsel alanı, şemalar, yazma kuralları: 409/403/404, arşivlenmiş kategori, hedefsiz kategori arşivi, toplu fiyat).

### Özellik envanteri: yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Hero | ÇALIŞIYOR | Ops sayfası olduğu için `PageHeader` compact (hero yalnız ana sayfalarda) |
| 2 | Sayfa metadata | ÇALIŞIYOR | Sayfa kendi `generateMetadata`'sını veriyor; "stok" vaadi kalktı, ürün bazlı tüketim/puan gerçekten var |
| 3 | "Kategori Ekle" | ÇALIŞIYOR | "Kategoriler" çekmecesi (oluştur + yönet) |
| 4 | "Ürün Ekle" | ÇALIŞIYOR | Masaüstünde başlıkta, mobilde alt gezinmenin üstünde FAB |
| 5 | Kategori sayısı kartı | KALDIRILDI | Bilgi değeri düşüktü; yerine kategori çiplerinde bayi kapsamlı ürün sayıları ve eyleme dönük içgörü şeridi |
| 6 | Ürün sayısı kartı | KALDIRILDI | Yerine Aktif/Arşiv sayaçları (durum anahtarında) ve sonuç sayısı; yüklenirken "0" yok (iskelet) |
| 7 | Ürün arama | ÇALIŞIYOR | Ad + açıklama + kategori, `tr-TR` + işaret atma (İ/I/Ş…), çok kelimeli; URL'de (`q`), 300 ms gecikmeli, sonuç sayısı duyurulur |
| 8 | Kategori filtresi | ÇALIŞIYOR | `justify-start`, yatay kaydırılan çip şeridi (Bulgu 7), `aria-pressed`, URL'de (`category`) |
| 9 | İlk veri yükleme | ÇALIŞIYOR | SSR ön-yükleme + React Query; `!res.ok` / `success:false` hata olarak fırlatılır |
| 10 | Yükleniyor durumu | ÇALIŞIYOR | Statik iskelet; filtre değişiminde önceki veri kalır (`keepPreviousData`, `aria-busy`) |
| 11 | Hata durumu | ÇALIŞIYOR | `QueryState`: sayfa içi hata, kod sınıflaması, "Tekrar dene"; 401/403/503 ayrı |
| 12 | Boş durum | ÇALIŞIYOR | Üç ayrı durum: ilk kullanım (ürün ekle / önce kategori / CSV), filtre boşu (temizle), arşiv boş |
| 13 | Kart avatarı | ÇALIŞIYOR | Ürün görseli (lazy), yoksa kategori simgesi; arşivde gri tonlama |
| 14 | Ad ve kategori adı | ÇALIŞIYOR | Arşivlenmiş kategori "(arşivde)" etiketli |
| 15 | Açıklama | ÇALIŞIYOR | |
| 16 | Fiyat gösterimi | ÇALIŞIYOR | `null` → "Fiyat yok", 0 → "Ücretsiz", `$` ikonu kalktı; kuruştan `Intl` TRY |
| 17 | Kart animasyonu | ÇALIŞIYOR | `m.li layout="position"` + `AnimatePresence`; azaltılmış harekette statik |
| 18 | Kart aksiyon menüsü | ÇALIŞIYOR | Her zaman görünür, `aria-label`'lı `IconButton` (44px); kartın tamamı detayı açar |
| 19 | Ürün düzenleme | ÇALIŞIYOR | Tek form çekmecesi, `baseUpdatedAt` ile eşzamanlılık 409; sistem ürününde düzenle sunulmaz |
| 20 | Silme | ÇALIŞIYOR | Arşivle (silme yok) + toast'ta "Geri al"; tüketim geçmişi korunur |
| 21 | Yeni kategori adı | ÇALIŞIYOR | Aynı adla (Türkçe duyarlı, sistem dahil) kategori varsa 409 |
| 22 | Kategori simge seçici | ÇALIŞIYOR | 32 simge, `radiogroup` + ok tuşları + `aria-checked`; sunucu `z.enum` ile sınırlar |
| 23 | Yeni ürün formu | ÇALIŞIYOR | `MoneyField` (tam sayı kuruş), sınırlar ve karakter sayacı önceden görünür |
| 24 | Kategori yokken yönlendirme | ÇALIŞIYOR | Formda "Kategori oluştur" kutusu, boş durumda "Önce kategori oluştur" |
| 25 | Düzenleme formu | ÇALIŞIYOR | Arşivlenmiş kategorideki ürünün kategorisi seçimde "(arşivde)" olarak görünür |
| 26 | Enter ile gönderme | ÇALIŞIYOR | Tüm formlar gerçek `<form>` |
| 27 | Sunucu hata mesajları | ÇALIŞIYOR | Zarf v2 `code` + Türkçe mesaj; alan hataları alana (`details.path`), zod mesajları Türkçe |
| 28 | `?search=` derin bağlantı | ÇALIŞIYOR | `parseCatalogQuery`, `search`'ü `q` olarak okur (SSR + istemci) |
| 29 | Kategori düzenle/sil/sırala | ÇALIŞIYOR | Yeniden adlandır, simge, ↑/↓ sıralama (klavye/dokunmatik; Kart Tara `order` ile listeler), arşivle (aktif ürün varsa hedefe taşıyarak), geri yükle |
| 30 | Ürün görseli | ÇALIŞIYOR | `PhotoPicker` → `/api/dealer/catalog/images` (bayt doğrulama, EXIF/konum silme, R2); ürüne yalnız bu bayinin `products/` alanı yazılabilir; R2 yoksa bölüm gizlenir |
| 31 | Aktif/pasif ("tükendi") | ÇALIŞIYOR (kısmen ŞEMA) | Tek dokunuşla arşivle/geri yükle ve toplu arşiv var. Arşivden ayrı geçici "Tükendi" durumu şema gerektirir (aşağıda) |
| 32 | Arşiv ve geri alma | ÇALIŞIYOR | Arşiv sekmesi, tekli/toplu geri yükleme; kategorisi arşivde olan ya da aynı adlı aktif ürünü bulunanlar açıkça reddedilir |
| 33 | Ürün performansı | ÇALIŞIYOR | Kartta 30 günlük ortalama puan, değerlendirme ve tüketim sayısı, eğilim; detayda dağılım, 8 haftalık seri, son 5 yorum, tüm zamanlar |
| 34 | Toplu işlem, CSV | ÇALIŞIYOR | Seç → arşivle/geri yükle/taşı/% fiyat (yuvarlamalı); CSV içe aktarma (önizleme raporu, atla/güncelle, yeni kategori) ve dışa aktarma (gidiş-dönüş) |
| 35 | Sıralama | ÇALIŞIYOR | Ad, fiyat (fiyatsız sonda), tüketim, puan, eklenme; URL'de |
| 36 | API yetki/sahiplik | ÇALIŞIYOR | `defineRoute` + `resolveDealerScope`; yazmalar yalnız DEALER, ADMIN salt-okunur |
| 37 | Global/bayi ayrımı | ÇALIŞIYOR (gizleme ŞEMA) | "Sistem" rozeti, düzenle yerine "Kopyamı oluştur"; sistem kategorileri çekmecede salt-okunur. Bayi başına gizleme şema gerektirir |
| 38 | Onboarding "ürün" adımı | ÇALIŞIYOR | Doğrulandı: sayım artık `lib/dealer-today/load.ts`'te `isActive: true` (başka yüzeyin işi) |
| 39 | Form erişilebilirliği | ÇALIŞIYOR | QDL alanları: `label for`, `aria-describedby`, `aria-invalid`, `aria-required`, ilk hatalı alana odak |
| 40 | Çift gönderim | ÇALIŞIYOR | Form `isSubmitting` + oluşturma/toplu/içe aktarma uçlarında `Idempotency-Key` |
| 41 | Sayfalama | ÇALIŞIYOR | Sunucu sayfalaması (12/24/48/96), URL'de; 2.000 ürün üst sınırı aşılırsa dürüst uyarı bandı |

**Sonuç:** 41 satırın 39'u ÇALIŞIYOR, 2'si KALDIRILDI (#5, #6: düşük değerli sayaç kartları; yerlerine eyleme dönük içgörüler geldi). #31 ve #37'nin yalnız şema gerektiren alt parçaları açık.

### Kapanan bulgular (13/13)

1. Yükleme hatası "ürün yok"a düşüyordu → `readEnvelope` + `QueryState`; üç ayrı boş durum.
2. Menü dokunmatikte ve klavyede görünmüyordu → her zaman görünür ve etiketli; karta dokununca detay açılıyor.
3. `?search=` çalışmıyordu → URL durumu (`q`, `category`, `status`, `sort`, `page`, `size`, `missing`); `search` de okunuyor.
4. Türkçe İ/I araması → `normalizeForSearch` (`tr-TR`, işaret atma, `ı→i`); açıklama ve kategori de aranıyor.
5. "0" ve `$` → "Ücretsiz" / "Fiyat yok"; API ve formlar kuruş (`priceMinor`), Float yalnız sınırda (ŞEMA İSTEĞİ: Decimal).
6. Kategori yaşam döngüsü → düzenle, sırala, arşivle (taşıyarak), geri yükle; sistem kategorileri ayırt ediliyor.
7. Sekme kırpılması → `justify-start` kaydırılan çip şeridi.
8. TR/EN karışık hata → Türkçe zod mesajları, kodlu zarf, alan eşleme, sınırlar formda önceden görünüyor. (EN arayüz çevirisi açık, aşağıda.)
9. Global kayıtlarda yanlış aksiyon → `isGlobal`/`canEdit`, "Sistem" rozeti, "Kopyamı oluştur".
10. `_count` sızıntısı → katalog BFF'i sayıları bellekte kapsamlı hesaplıyor; eski GET'teki `_count` filtrelendi.
11. Ölü kod / iki kopya form → 660 satırlık sayfa silindi; tek `ProductEditor`, bileşenlere bölündü, `useCatalog` kancası, `Prisma.ProductWhereInput`.
12. Onboarding sayımı → doğrulandı, `isActive: true` (başka ajan kapattı).
13. Metadata vaadi → dürüst açıklama; vaat edilen ürün bazlı tüketim de gerçekten eklendi.

### Kalanlar (gerekçeli)

- **ŞEMA İSTEKLERİ:** (a) `Product.price Float → Decimal(10,2)` ya da `priceMinor Int` (API zaten kuruş; dönüşüm tek noktada, `money.ts`); (b) `Product.status` (`ACTIVE | SOLD_OUT | ARCHIVED`): arşivden ayrı, geçici "Tükendi"; (c) `Product.order Int`: ürün sırası (şu an yalnız kategori sırası var); (d) `DealerCategoryPreference { dealerId, categoryId, hidden }`: sistem kategorilerini bayi başına gizleme; (e) isteğe bağlı alerjen/diyet etiketleri (`Product.tags String[]`).
- **EN arayüz:** yüzey metinleri Türkçe (sunucu mesajları da). İngilizce çeviri ayrı bir i18n turu ister.
- **Sürükle-bırak sıralama:** yerine ↑/↓ düğmeleri var (klavyede ve dokunmatikte erişilebilir); DnD kütüphanesi eklenmedi (npm install yasak).
- **Kart Tara "öne çıkanlar" (`QuickScanPreset`)** ve **`/dealer/reviews?productId=`** derin bağlantısı başka yüzeylerin sahipliğinde. Detay çekmecesi son 5 yorumu kendisi gösteriyor ve tüm yorumlara bağlanıyor.
- **Fotoğraftan AI ile menü içe aktarma:** yapılmadı (yeni bir AI geçidi gerektirir; CSV yolu var).
- **Redis önbellek:** katalog küçük ve sorgular indeksli (`groupBy`); gerek görülmedi. Yazmadan sonra React Query geçersiz kılma yeterli.
