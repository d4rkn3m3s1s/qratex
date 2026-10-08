# /admin/api-catalog

**Amaç:** `app/api/admin/**/route.ts` altındaki tüm admin API uç noktalarını (yol + export edilen HTTP metodları + kaynak dosya), build sırasında üretilmiş statik bir JSON'dan okuyup aranabilir bir liste olarak göstermek; geliştirici/operatör için referans ve JSON dışa aktarımı.

**Genel puan:** 5.0/10 · **Karar:** koru-iyileştir. Ayrıca `/admin/api-keys`, `/admin/webhooks` ve `openapi.yaml` ile birlikte tek bir "Geliştirici" merkezinde birleştirilmesi önerilir; ayrıntısı en sondaki "Çakışmalar" bölümünde.

Sayfa küçük, temiz ve büyük ölçüde doğru çalışıyor. Ancak gösterdiği veri kısmen yanlış: metod tespit eden betik `export const GET = …` desenini kaçırıyor. Sayfanın "OpenAPI ile birlikte kullanın" vaadi de gerçeği yansıtmıyor, çünkü `openapi.yaml` içinde hiçbir `/api/admin` yolu yok. Sayfa, kıyas ürünlerdeki (Stripe API reference, Retool resource listesi) bir API kataloğunun en temel bilgilerini de içermiyor: yetki modeli, ilgili sayfa, metod filtresi ve alan bazında gruplama.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Listeleme, arama, kopyalama ve indirme çalışıyor. Ama metod verisi bazı route'larda boş (`—`), hata durumunda ekran tamamen boş kalıyor, filtre ve gruplama yok. |
| UX | 4/10 | 142 satır düz bir liste olarak geliyor. Arama kartının başlığı placeholder metniyle aynı. Hata durumunda içerik yok, yeniden dene düğmesi yok. Kopyalama hatasında yanlış mesaj çıkıyor. |
| Görsel | 6/10 | Ortak `AdminPremiumHero` ve shadcn tablosu düzgün ve tutarlı. Ancak DELETE gibi yıkıcı metodlar görsel olarak ayrışmıyor; bilgi yoğunluğu düşük. |
| Mimari | 5/10 | Prebuild ile üretilen JSON ve ADMIN korumalı route doğru bir fikir. Ama regex ile metod tespiti kırılgan, çalışma anında `fs.readFileSync` kullanılıyor ve OpenAPI ile bir bağı yok. |
| Performans | 8/10 | Tek bir küçük JSON isteği atılıyor, istemcide `useMemo` ile filtreleniyor. 142 satır için sanallaştırma gerekmiyor. |
| Erişilebilirlik + Mobil | 5/10 | Arama inputunun etiketi yok. Liste tablo semantiği taşımıyor (`ul`/`div` ızgarası). Kopyala düğmesi mobilde yalnızca ikon ve `aria-label` içermiyor. Mobil yerleşim makul. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (başlık/açıklama, TR/EN) | ÇALIŞIYOR | `app/admin/api-catalog/layout.tsx:4-6`, `messages/tr.json:165-166` | `adminLayoutSectionMetadata` kullanılıyor. |
| 2 | Sayfa erişim koruması (ADMIN + gizli kapı) | ÇALIŞIYOR | `proxy.ts:51,79-84,124` | `/admin/*` ADMIN rolü ve gate cookie istiyor. |
| 3 | API yetkisi (yalnızca ADMIN) | ÇALIŞIYOR | `app/api/admin/api-catalog/route.ts:15-16` | `requireAuth(['ADMIN'])` ve token-replay kontrolü (`lib/api-auth.ts:52-77`). |
| 4 | Önbellek kapalı yanıt | ÇALIŞIYOR | `route.ts:22`, `page.tsx:25` | `PRIVATE_NO_STORE_HEADERS` ve `cache: 'no-store'`. |
| 5 | Katalog verisi (yol listesi) | ÇALIŞIYOR | `lib/data/admin-api-catalog.json` (142 route); `find app/api/admin -name route.ts` de 142 sonuç veriyor | Dosya kümesi bugünkü repo ile birebir aynı (diff ile doğrulandı). |
| 6 | Katalog tazeliği (otomatik yeniden üretim) | ÇALIŞIYOR | `package.json:8` `"prebuild": "npm run catalog:admin-api"` | Her build'de yeniden üretiliyor; canlıdaki veri build anındaki route'ları gösterir. |
| 7 | HTTP metod tespiti | KISMİ | `scripts/generate-admin-api-catalog.mjs:36-38` | Yalnızca `export (async) function GET` kalıbını yakalıyor. `export const GET = createApiRoute(...)` kaçıyor: `app/api/admin/users/hall-of-fame/route.ts:14,27` katalogda `"methods": []` (`admin-api-catalog.json:1044-1046`). `export { h as GET }` ve `route.tsx` de desteklenmiyor. |
| 8 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:127-130` | Ortada tek spinner var; iskelet ve `aria-busy` yok. |
| 9 | Hata durumu | KISMİ | `page.tsx:28-31,34-38,131` | Yalnızca toast gösteriliyor, sonra `!catalog ? null` ile içerik alanı boş kalıyor. Kalıcı hata kartı ve "yeniden dene" yok. Sunucunun döndürdüğü hata metni (`route.ts:27`) kullanıcıya hiç gösterilmiyor. |
| 10 | Uç nokta sayısı rozeti (hero chip) | ÇALIŞIYOR | `page.tsx:88-94` | Filtrelenmiş sayıyı değil, toplamı gösteriyor ("142 içinden 12" bilgisi yok). |
| 11 | JSON indir | ÇALIŞIYOR | `page.tsx:60-70,97-100` | Blob ve `a.click()` ile indiriyor. Dosya adında tarih yok. Filtrelenmiş görünüm değil, katalogun tamamı iniyor. |
| 12 | Arama (yol / metod / dosya) | KISMİ | `page.tsx:48-58` | Alt dize araması. "get" yazınca `budget`, `widgets` gibi yolları da getiriyor, çünkü metod ve yol aynı kutuda aranıyor. Ayrı metod filtresi yok. |
| 13 | Arama durumunu URL'de tutma | EKSİK | `page.tsx:19` | `q` yalnızca yerel state'te; paylaşılabilir link oluşmuyor. |
| 14 | Arama kartı başlığı | BOZUK (UX) | `page.tsx:107` | `CardTitle` olarak `searchPlaceholder` ("Yol veya metod ara…") kullanılmış; başlık bir placeholder cümlesi. |
| 15 | OpenAPI ipucu | SAHTE / YANILTICI | `page.tsx:108`, `messages/tr.json` `adminApiCatalog.openapiHint`, `openapi.yaml` (292 satır, `grep -c /api/admin` = 0) | "Genel sözleşme için openapi.yaml'a bakın" deniyor, ama dosyada hiçbir admin yolu yok ve UI'dan dosyaya bağlantı da yok. |
| 16 | Üretim zamanı gösterimi | KISMİ | `page.tsx:117-122` | `toLocaleString('tr-TR')` sabit; EN dilde de TR biçimi çıkıyor. Göreli zaman ("3 gün önce") yok. |
| 17 | "Yeniden üret" ipucu | KISMİ | `page.tsx:123` | Operatöre `npm run catalog:admin-api` yazıyor; canlı ortamda bir anlamı yok (prebuild zaten çalıştırıyor). Hedef kitle karışık. |
| 18 | Tablo başlık satırı | ÇALIŞIYOR | `page.tsx:135-139` | Mobilde "Metodlar" ve "Kopyala" başlıkları gizleniyor. |
| 19 | Metod rozetleri | KISMİ | `page.tsx:143-152` | GET ikincil, POST/PUT/PATCH birincil, DELETE/HEAD/OPTIONS hepsi `outline`. Yıkıcı DELETE ayrışmıyor; metod boşsa `—` gösteriliyor (bkz. #7). |
| 20 | Yol ve kaynak dosya gösterimi | ÇALIŞIYOR | `page.tsx:154-159` | `break-all` ve `truncate` ile `title` tooltip'i var. `[id]` dinamik segmentleri vurgulanmıyor. |
| 21 | Yolu kopyala | KISMİ | `page.tsx:72-79,160-165` | Çalışıyor. Ancak hata durumunda yanlış mesaj çıkıyor ("Katalog yüklenemedi", `page.tsx:77`). Mobilde etiketsiz ikon düğmesi; `aria-label` yok. |
| 22 | Kaydırılabilir liste alanı | ÇALIŞIYOR | `page.tsx:140` | `max-h-[min(70vh,720px)]`; iç içe scroll var, başlık satırı yapışkan değil ama liste dışında kaldığı için görünür kalıyor. |
| 23 | Boş arama sonucu | ÇALIŞIYOR | `page.tsx:131-132` | Düz metin; "aramayı temizle" eylemi yok. |
| 24 | Toast önekleri | KISMİ | `lib/admin-toast.ts` (`'Basarili: '`, `'Dikkat: '`) | Türkçe karakter yok ("Başarılı" olmalı). EN dilde de Türkçe önek çıkıyor; dil karışıklığı. |
| 25 | Menü / navigasyon girişleri | ÇALIŞIYOR | `components/dashboard/sidebar.tsx:223`, `app/admin/admin-utils.ts:116`, `app/admin/ecosystem/page.tsx:19`, `lib/data/product-roadmap.json:34` | Dört farklı yerden bağlanıyor. |
| 26 | Yetki modeli sütunu (ADMIN / takım / herkese açık) | EKSİK | `app/api/admin/team/*/route.ts` → `requireTeamAccess` (`app/api/admin/team/tasks/route.ts:4,40`) | Bu yolda 16 route ADMIN değil, takım erişimiyle korunuyor; katalog bunu göstermiyor. |
| 27 | Metod filtresi / alan (domain) gruplaması / sıralama | EKSİK | n/a | 142 satır düz liste. |
| 28 | Uç noktadan ilgili admin sayfasına geçiş | EKSİK | n/a | 60 admin sayfası `/api/admin` çağırıyor; hangi sayfanın hangi uç noktayı kullandığı görünmüyor. |
| 29 | Tıklayınca detay (parametre, body şeması, yanıt örneği) | EKSİK | n/a | Zod şemaları route'larda var ama kataloğa çıkarılmıyor. |
| 30 | Motion / azaltılmış hareket | ÇALIŞIYOR (minimal) | `components/admin/admin-premium-hero.tsx:9,35` | Hero `useReducedMotion` destekli; sayfa gövdesinde motion yok. Bu sayfa için uygun bir seçim. |

**Sayım:** ÇALIŞIYOR 15 · KISMİ 9 · BOZUK 1 · SAHTE 1 · EKSİK 4

---

## Bulgular

### 1. Yüksek: veri doğruluğu. Metod tespiti `export const` desenini kaçırıyor, katalog yanlış "metodsuz" route gösteriyor
- **Kanıt:** `scripts/generate-admin-api-catalog.mjs:36-38` yalnızca `export\s+(async\s+)?function\s+${m}\b` kalıbını tanıyor. `app/api/admin/users/hall-of-fame/route.ts:14` `export const GET = createApiRoute(['ADMIN'], …)` ve `:27` `export const PATCH = …` ise katalogda `"methods": []` olarak çıkıyor (`lib/data/admin-api-catalog.json:1044-1046`). UI bunu `—` olarak gösteriyor (`page.tsx:144`).
- **Sorun:** Katalog "tüm metodlar" iddiasında, ama `createApiRoute` sarmalayıcısı yaygınlaştıkça yanlış bildirilen uç nokta sayısı da büyüyecek. Hata sessiz: ne build'i kırıyor ne de uyarı veriyor. Referans aracının tek değeri doğruluğu.
- **Öneri:** Regex yerine TypeScript AST taraması. `typescript` derleyici API'si ya da `ts-morph` ile modülün export edilen sembollerini okuyun: `export function`, `export const`, `export { x as GET }` desenlerinin hepsi yakalanır. Aynı geçişte `requireAuth([...])`, `createApiRoute([...])` ve `requireTeamAccess(...)` çağrılarının rollerini de çıkarın (bkz. Bulgu 4). Betiğe bir kontrol ekleyin: metodsuz route bulunursa `process.exitCode = 1` ile prebuild'i kırsın, ya da en azından CI'da uyarı versin. Jest'e "her route en az bir metod export eder" testi eklenebilir.
- **Efor:** M

### 2. Yüksek: yanıltıcı içerik. "OpenAPI ile birlikte kullanın" vaadi boş
- **Kanıt:** Açıklama metni (`messages/tr.json` `adminApiCatalog.description`: "OpenAPI ile birlikte kullanın") ve `openapiHint` (`page.tsx:108`). `openapi.yaml` 292 satır ve yalnızca 9 genel yol içeriyor (`/api/health`, `/api/feedbacks` …); `/api/admin` geçişi yok. UI'dan `openapi.yaml`'a bağlantı da yok.
- **Sorun:** Operatöre var olmayan bir sözleşme belgesini işaret ediyor. Bu, güveni zedeleyen bir "SAHTE" vaat.
- **Öneri:** Kısa vadede metni düzeltin ("admin uç noktaları OpenAPI'de belgelenmemiştir"). Doğru çözüm ise üreticinin tek kaynak olması: route'lardaki zod şemalarından (`zod-to-openapi` veya `zod-openapi`) admin OpenAPI belgesi üretip `lib/data/admin-openapi.json` olarak yazmak. Katalog sayfası bu belgeden beslenir ve "OpenAPI indir" düğmesi gerçek bir sözleşme verir.
- **Efor:** M (metin S, üretim L)

### 3. Orta: hata yönetimi. Hata durumunda boş ekran ve sunucu mesajı kayboluyor
- **Kanıt:** `page.tsx:28-31` ve `:34-38` yalnızca toast gösteriyor, `:131` `!catalog ? null` hiçbir şey render etmiyor. Sunucu, 503'te Türkçe açıklayıcı bir mesaj (`route.ts:27`) döndürüyor ama istemci bunu okumuyor. `res.json()` HTML ya da boş gövdede de patlıyor (catch'e düşüyor). Bu doğru ele alınıyor, fakat sebep bilgisi kayboluyor.
- **Sorun:** Toast kapandıktan sonra kullanıcı yalnızca hero ve arama kartını görüyor. Arama kutusu etkin ama sonuç alanı yok; neyin yanlış gittiği ve ne yapılacağı belirsiz.
- **Öneri:** `loading | error | ready` diye üç durumlu bir state makinesi kurun. Hata durumunda kalıcı bir `Alert` kartı gösterin: sunucunun `error` alanı, HTTP kodu ve "Yeniden dene" düğmesi (aynı fetch'i tetikler). Hata anında arama inputunu `disabled` yapın. Diğer admin sayfalarıyla tutarlılık için ortak bir `AdminLoadState` bileşeni çıkarılabilir.
- **Efor:** S

### 4. Orta: eksik kritik bilgi. Yetki modeli görünmüyor
- **Kanıt:** `app/api/admin/team/**` altındaki 16 route `requireAuth` değil `requireTeamAccess` kullanıyor (ör. `app/api/admin/team/tasks/route.ts:4,40,100`), yani ADMIN olmayan ekip üyelerine de açık. Katalog her şeyi "admin API" olarak sunuyor.
- **Sorun:** Bir admin API kataloğunun en değerli bilgisi "bunu kim çağırabilir". Güvenlik denetimi yapan operatör, `/api/admin` önekinin ADMIN anlamına gelmediğini bu sayfadan öğrenemiyor. Ayrıca yetki kontrolü hiç olmayan bir route eklenirse bu da görünmez kalıyor.
- **Öneri:** Üretici (Bulgu 1'deki AST geçişi) her route için bir `auth` alanı çıkarsın: `{ kind: 'role', roles: ['ADMIN'] } | { kind: 'team', manager?: boolean } | { kind: 'cron-secret' } | { kind: 'none' }`. UI'da renkli bir "Erişim" sütunu ve filtre olsun. `kind: 'none'` olan bir `/api/admin` route'u kırmızı uyarı bandıyla en üste çıksın. Bu, sayfayı pasif bir listeden yetki denetim aracına dönüştürür.
- **Efor:** M

### 5. Orta: bilgi mimarisi. 142 satır düz liste; gruplama, metod filtresi ve sıralama yok
- **Kanıt:** `page.tsx:140-167` tek bir `ul`; arama `page.tsx:48-58` metod ile yolu aynı alt dizede eşliyor ("get" araması `budget` içeren yolları da getiriyor).
- **Sorun:** Operatör "AI ile ilgili tüm yazma uçları" ya da "tüm DELETE'ler" gibi sorulara hızlı yanıt alamıyor. Kıyas ürünler (Stripe API reference, PostHog API docs) kaynak ya da alan bazında gruplayıp metod çipleriyle filtreliyor.
- **Öneri:** Yolun `/api/admin/` sonrasındaki ilk segmentine göre alan grupları oluşturun (ai, team, users, inbox …). Sol tarafta sayaçlı bir alan listesi (masaüstünde yapışkan, mobilde `Select`) olsun. Üstte çoklu seçimli metod çipleri (GET/POST/PUT/PATCH/DELETE) ve erişim filtresi bulunsun. Filtre durumu `useSearchParams` ile URL'de tutulsun ki link paylaşılabilsin. Arama, `method:delete ai` gibi önek sözdizimini desteklesin ya da metod yalnızca çiplerden filtrelensin. Hero chip'i "12 / 142" biçimine geçsin.
- **Efor:** M

### 6. Orta: mimari. Çalışma anında `fs.readFileSync`; dosya izleme (tracing) bağımlılığı
- **Kanıt:** `route.ts:19-20` `path.join(process.cwd(), 'lib', 'data', 'admin-api-catalog.json')`. `next.config` içinde bu dosya için `outputFileTracingIncludes` yok (yalnızca `outputFileTracingExcludes` var).
- **Sorun:** Dosyanın Vercel lambda paketine girip girmediği NFT'nin `process.cwd()` çözümlemesine bağlı (**doğrulanmadı**; canlıda çalışıyorsa izleme yakalıyordur). Girmezse sayfa sessizce 503 verir. Bulgu 3'te anlatıldığı gibi kullanıcı da yalnızca "Katalog yüklenemedi" görür. Senkron fs okuması gereksiz bir I/O.
- **Öneri:** Route'ta JSON'u statik `import catalog from '@/lib/data/admin-api-catalog.json'` ile alın. Böylece bundler dosyayı garanti eder, fs ve try/catch kalkar, tip güvenliği gelir. Alternatif olarak sayfa server component'e çevrilip veri doğrudan prop olarak verilebilir; ayrı API isteği de kalkar (ADMIN kontrolü proxy ve layout'ta zaten yapılıyor, yine de route'taki `requireAuth` eşdeğeri server component'te `getServerSession` ile korunmalı).
- **Efor:** S

### 7. Düşük: dil karışıklığı ve mesaj hataları
- **Kanıt:**
  - Kopyalama başarısız olunca `t('adminApiCatalog.loadError')` ("Katalog yüklenemedi") çıkıyor (`page.tsx:77`); bağlamla ilgisiz bir mesaj.
  - Tarih her dilde `toLocaleString('tr-TR')` ile biçimleniyor (`page.tsx:120`); `useAppLocale` kullanılmıyor (`app/admin/ecosystem/page.tsx:24` doğru örneği gösteriyor).
  - `lib/admin-toast.ts` önekleri `'Basarili: '` / `'Dikkat: '` (Türkçe karakter yok) ve EN arayüzde de Türkçe çıkıyor (bu global bir sorun, bu sayfayı da etkiliyor).
  - `route.ts:27` hata metni yalnızca Türkçe.
  - `CardTitle` placeholder metniyle aynı (`page.tsx:107`).
  - `regenerateHint` operatöre bir npm komutu öneriyor (`page.tsx:123`); canlıda uygulanamaz.
- **Öneri:** `copyError` anahtarı ekleyin. Tarihi locale'e duyarlı `Intl.DateTimeFormat` ve göreli zamanla gösterin. `admin-toast` öneklerini i18n'e taşıyın ya da tamamen kaldırın (sonner zaten ikonla tür belirtiyor). Kart başlığını "Uç noktaları keşfet" gibi gerçek bir başlık yapın. `regenerateHint`'i yalnızca `process.env.NODE_ENV === 'development'` iken gösterin ya da "Katalog her deploy'da otomatik yenilenir" diye değiştirin.
- **Efor:** S

### 8. Düşük: erişilebilirlik
- **Kanıt:** Arama `Input`'unda `aria-label` veya `<label>` yok (`page.tsx:111-116`; placeholder etiket sayılmaz). Mobilde kopyala düğmesi yalnızca ikon (`page.tsx:163` `hidden sm:inline`) ve `aria-label` taşımıyor. Liste `div` ızgarası; tablo semantiği (`role="table"`/`columnheader`) yok. Spinner'da `role="status"` / `aria-live` yok (`page.tsx:128-129`). Kopyalandıktan sonra düğmede görsel bir onay (ikonun ✓'ye dönmesi) yok, yalnızca toast var.
- **Öneri:** Gerçek bir `<table>` (shadcn `Table`) ya da `role="table"` kullanın. `aria-label={t('copyPath') + ': ' + path}` ekleyin. Arama için görünmez bir `<label>` koyun. Yükleme durumunda `aria-busy` ve `sr-only` metin kullanın. Kopyalama sonrası 1,5 sn boyunca `Check` ikonu gösterin (mikro-etkileşim). `/` kısayolu ile aramaya odaklanma eklenebilir.
- **Efor:** S

### 9. Düşük: DELETE ve yıkıcı metodlar görsel olarak ayrışmıyor
- **Kanıt:** `page.tsx:147` DELETE, HEAD ve OPTIONS aynı `outline` varyantını kullanıyor.
- **Öneri:** Metod başına semantik bir renk ölçeği kullanın (GET nötr/mavi, POST yeşil, PUT/PATCH amber, DELETE kırmızı/`destructive`). Bu, Stripe/Swagger konvansiyonuyla uyumlu ve ilk bakışta "yazma yüzeyi"ni görünür kılar. Renk tek başına bilgi taşımamalı; metin rozeti zaten var.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Uç nokta detay paneli (Stripe API reference / Swagger UI):** Satıra tıklayınca bir yan panel (Sheet) açılsın: parametreler (dinamik `[id]` segmentleri), zod'dan türetilmiş istek gövdesi şeması, yanıt örneği, yetki gereksinimi ve kaynak dosyaya bağlantı.
2. **Erişim/yetki sütunu ve "korumasız route" alarmı:** ADMIN / takım / cron-secret / yok sınıflandırması olsun. Güvenlik denetimini sayfanın asıl değeri hâline getirir (Bulgu 4).
3. **Kullanım ve sağlık metrikleri (PostHog / Vercel Observability):** Uç nokta başına son 24 saatteki çağrı sayısı, p95 gecikme ve 5xx oranı gösterilsin. `/admin/observability` verisiyle birleştirilebilir; hiç çağrılmayan ölü uç noktalar işaretlenir.
4. **Sayfa ↔ uç nokta eşlemesi (Retool resource usage):** "Bu uç noktayı hangi admin sayfası kullanıyor" bilgisi verilsin. Üretici `app/admin/**/page.tsx` dosyalarındaki `fetch('/api/admin/…')` dizelerini tarayıp ters indeks oluşturabilir; ölü ve yetim route'lar ortaya çıkar.
5. **Katalog farkı / değişiklik günlüğü (Linear changelog):** Son deploy'a göre eklenen, silinen ve metodu değişen uç noktalar gösterilsin. Prebuild önceki JSON'u okuyup `diff` alanı yazabilir.
6. **Gerçek OpenAPI dışa aktarımı ve "cURL kopyala":** Ham JSON yerine OpenAPI 3.1 belgesi indirilebilsin; her satırda çerez/oturum gerektiren bir cURL şablonu kopyalanabilsin.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Admin API'nin canlı haritası". Operatör tek ekranda şu üç soruya saniyeler içinde yanıt alır: hangi uç noktalar var, kim çağırabiliyor, ve sağlıklı mı ya da kullanılıyor mu.

**Yerleşim (masaüstü):**
- **Üst:** `AdminPremiumHero`. Chip'ler: toplam uç nokta, yazma uç noktası sayısı, korumasız route sayısı (sıfır değilse kırmızı) ve "son üretim: 3 gün önce". Sağda "OpenAPI indir" ve "JSON indir" düğmeleri.
- **Sol sütun (yapışkan, ~220px):** sayaçlı alan listesi (ai 18, team 16, users 9 …). Seçili alan URL'de tutulur.
- **Ana alan:** üstte arama, metod çipleri ve erişim filtresi; altında yoğun bir tablo. Sütunlar: Metod rozetleri | Yol (dinamik segmentler vurgulu) | Erişim | Kullanan sayfa(lar) | 24s çağrı ve p95 (varsa) | Eylemler (kopyala ✓, cURL, detay).
- **Satır tıklaması:** sağdan açılan bir `Sheet` içinde şema, örnek ve kaynak dosya.

**Mobil:** Alan listesi `Select` olur. Satırlar kart biçimine geçer: metod rozetleri üstte, yol monospace, alt satırda erişim rozeti. Eylemler `aria-label`'lı ikon düğmeleri olarak kalır.

**Motion/3D:** 3D bu sayfa için yerinde değil; bir referans aracı yoğunluk ve hız ister. Motion ölçülü olmalı:
- Filtre değişiminde satırlar için `m as Motion` ile 120-150 ms'lik `layout` ve opaklık geçişi.
- Kopyala ikonunda `Copy` → `Check` morph'u.
- Detay `Sheet`'inde standart kayma.

Hepsi `useReducedMotion` ile kapatılabilir olmalı. Sayfa gövdesinde dekoratif animasyon gerekmiyor.

**Veri/API değişiklikleri:**
1. `scripts/generate-admin-api-catalog.mjs` → `ts-morph` tabanlı üretici. Çıktı şeması: `{ path, methods, file, domain, params[], auth: {...}, usedBy: string[], schemas?: {...} }`. Metodsuz ya da korumasız route'ta prebuild uyarı veya hata verir.
2. Route ya da server component, JSON'u statik `import` ile okur (fs yok).
3. Opsiyonel: `/api/admin/api-catalog/metrics` uç noktası, observability kaynağından (Redis sayaçları ya da log toplayıcı) uç nokta başına 24 saatlik özet döndürür, 60 sn cache'li.
4. `zod-to-openapi` ile `lib/data/admin-openapi.json` üretilir; "OpenAPI indir" bu dosyayı sunar ve `openapiHint` gerçek olur.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/api-keys`, `/admin/webhooks` ve bu sayfa:** Üçü de "geliştirici/entegrasyon" yüzeyi ve sidebar'da art arda duruyor (`components/dashboard/sidebar.tsx:221-223`). Sekmeli tek bir **"Geliştirici"** merkezi önerilir: Katalog | API anahtarları | Webhook'lar | OpenAPI. Menü kalabalığı azalır ve bağlam bir arada kalır.
- **`/admin/observability`:** Uç nokta başına sağlık verisi orada üretiliyorsa, katalog satırları oraya derin bağlantı vermeli (`?route=/api/admin/...`). Veriyi iki yerde ayrı ayrı göstermemek gerekir.
- **`/admin/ecosystem`** (`app/admin/ecosystem/page.tsx:19`) ve **`/admin/roadmap`** (`lib/data/product-roadmap.json:34`) bu sayfaya yalnızca link veriyor; çakışma yok.
- **Çift navigasyon tanımı:** `app/admin/admin-utils.ts:116` sabit Türkçe etiketli ikinci bir menü listesi tutuyor, sidebar ise i18n anahtarı kullanıyor (`admin_api_catalog`). Bu sayfaya özgü değil ama bakım borcu; tek kaynağa indirilmeli.
- **Kaldırma gerekmez:** sayfanın değeri gerçek. Ancak bugünkü hâliyle `npm run catalog:admin-api` çıktısının bir görüntüleyicisinden ibaret. Bulgu 1, 4 ve 5 uygulanırsa, operatörün yetki denetimi için kullanacağı bir araca dönüşür.

---

## Doğrulama (şüpheci inceleme)

### İddia: Katalog üreticisi `export const` ile tanımlanan HTTP handler'larını kaçırıyor; yanlış/eksik metod verisi

**Karar: doğrulandı. Önem derecesi abartılmış: KRİTİK/YÜKSEK değil, DÜŞÜK (veri doğruluğu, güvenlik etkisi yok).**

**Kanıt:**
- `scripts/generate-admin-api-catalog.mjs:37`: metod tespiti yalnızca `export (async) function GET` biçimini yakalıyor: `new RegExp(\`export\s+(async\s+)?function\s+${m}\b\`)`. `export const GET = ...` ve `export { handler as GET }` biçimleri eşleşmiyor.
- `app/api/admin/users/hall-of-fame/route.ts:14` `export const GET = createApiRoute(['ADMIN'], ...)` ve `:27` `export const PATCH = createApiRoute(['ADMIN'], ...)`.
- `lib/data/admin-api-catalog.json:1044-1046`: `"path": "/api/admin/users/hall-of-fame", "methods": []`.
- `app/admin/api-catalog/page.tsx:144`: boş dizi `['—']` olarak çiziliyor. Ayrıca `:55` metoda göre arama yapıldığında ("get", "patch") bu satır sonuçlara hiç girmiyor.
- `app/api/admin` altında `export const|let <METHOD>` ya da `export { x as <METHOD> }` kullanan tek dosya bu (grep ile doğrulandı). Katalogda `"methods": []` olan da tek kayıt bu. Route sayısı (142) ile katalog kaydı sayısı (142) şu an eşit.

**Yeniden üretim:** ADMIN olarak `/admin/api-catalog` sayfasını açın, `hall-of-fame` diye arayın. Satır "—" ile görünür. Arama kutusuna `patch` yazın: satır listeden kaybolur. Oysa uç nokta canlıda GET ve PATCH'e yanıt veriyor.

**Etki sınırı (neden YÜKSEK değil):**
- Sayfa yalnızca ADMIN'e açık bir iç referans görüntüleyicisi (`app/api/admin/api-catalog/route.ts:15` `requireAuth(['ADMIN'])`). Katalog yetki ya da yönlendirme kararlarına girdi olmuyor. Uç noktanın kendisi `createApiRoute(['ADMIN'], ...)` ile korunuyor ve doğru çalışıyor.
- Hiçbir son kullanıcı ya da veri etkilenmiyor. Tek somut zarar, bir operatörün bu uç noktayı "ölü/metodsuz" sanıp denetimden atlaması veya yanlışlıkla kaldırmaya aday görmesi. Bugün etkilenen route sayısı 1.
- "Sarmalayıcı yaygınlaştıkça artacak" kısmı doğru bir eğilim uyarısı ama spekülatif. Bugün başka `export const` handler yok.

**Öneri (ürün seviyesi):** Regex'i genişletmek kısa vadede yeter: `export\s+(async\s+function|const|let)\s+METHOD\b` ve `export\s*\{[^}]*\bas\s+METHOD\b`. Kalıcı çözüm, raporun "Veri/API değişiklikleri" maddesindeki AST tabanlı (`ts-morph`) üreticiye geçmek. Üretici `methods.length === 0` olan her route için hata koduyla çıkmalı ve bu kontrol prebuild/CI adımına bağlanmalı. Böylece hata sessiz kalmaz. UI tarafında "—" yerine "tespit edilemedi" uyarı rozeti göstermek, operatörün bunu "metodsuz route" diye okumasını engeller.

**Ek gözlem (iddia dışı, bilgi):** Katalog `generatedAt: 2026-08-25` (`lib/data/admin-api-catalog.json:2`) ve üretim elle yapılıyor (`package.json:27` `catalog:admin-api`). Build/CI'a bağlı olmadığı için katalog zamanla bayatlayabilir. Şu an route sayıları tutuyor ama bu bir garanti değil.
