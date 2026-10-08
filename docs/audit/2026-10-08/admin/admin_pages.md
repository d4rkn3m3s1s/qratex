# /admin/pages

**Amaç:** Platform operatörünün "CMS sayfalarını" (başlık, slug, düz metin içerik, yayın durumu) veritabanındaki `Page` modeli üzerinden listeleyip oluşturduğu, düzenlediği ve sildiği basit bir içerik yönetim ekranı.

**Genel puan: 3/10** · **Karar: yeniden inşa** (ya gerçek bir yayın hattına bağlanmış bir "İçerik & Yasal Metinler" stüdyosu olarak yeniden kur ve `/admin/seo` ile tek merkezde topla, ya da gerçekten ihtiyaç yoksa sayfa + API + `Page` modeli birlikte kaldırılsın. Bugünkü hâli iki seçenekten de kötü: veri yazıyor ama hiçbir yerde okunmuyor.)

Kapsam: `app/admin/pages/page.tsx` (287 satır, tek dosya, `'use client'`), `app/api/admin/pages/route.ts` (180 satır; GET/POST/PUT/DELETE), `prisma/schema.prisma:1385-1397` (`model Page`), `app/admin/layout.tsx`, `proxy.ts`, `lib/api-auth.ts`, `components/admin/admin-premium-hero.tsx`, `components/ui/inline-loading-status.tsx`, `components/ui/dialog.tsx`, `lib/admin-toast.ts`, `components/providers.tsx` (global `MotionConfig`), `messages/tr.json`/`en.json` (`adminInlineLoading.pages`), menü kayıtları (`app/admin/admin-utils.ts:125`, `components/dashboard/sidebar.tsx:196`), çakışma adayları (`app/admin/seo/page.tsx`, `lib/seo-settings.ts`, `app/(public)/*` yasal sayfalar, `lib/blog-posts.ts`, `app/sitemap.ts`).

> Not: Sayfa canlı veriye bağlı olduğu ve `.env` canlı Neon'u gösterdiği için hiçbir şey çalıştırılmadı; tüm bulgular kod okunarak doğrulandı.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | CRUD backend'i doğru çalışıyor ama "Yayınla" hiçbir şeyi yayınlamıyor (`Page` hiçbir public rotada okunmuyor) ve form her tuş vuruşunda odağı kaybediyor. |
| UX | 3/10 | Onaysız silme, hatalarda `[object Object]` mesajı, diyaloglar arası form kalıntısı, önizleme/canlı link yok; operatör yaptığı işin sonucunu hiçbir yerde göremiyor. |
| Görsel | 5/10 | Premium hero + shadcn kart ızgarası paneldeki diğer sayfalarla tutarlı ve temiz; ancak içerik düz `Textarea`, kart önizlemesi ham metin ve hiyerarşi "liste" değil "galeri" gibi. |
| Mimari | 3/10 | Bileşen gövdesinde tanımlanan `PageForm` her render'da yeniden mount ediliyor; şema "block-based" + `meta` vaat ederken API `{ body: string }` yazıyor; tüketicisi olmayan bir model. |
| Performans | 7/10 | Tek istek, küçük tablo; fakat liste uç noktası her sayfanın 100 KB'a kadar tam içeriğini sınırsız `findMany` ile döndürüyor ve denetim günlüğü her güncellemede tam içeriği iki kez kopyalıyor. |
| Erişilebilirlik + mobil | 4/10 | Label'lar input'a bağlı değil, sil butonunun erişilebilir adı yok, arama alanının etiketi yok, form 400 px'te de sabit iki sütun; tek artı global `reducedMotion="user"`. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota yetkisi (ADMIN rolü + gizli kapı cookie'si) | ÇALIŞIYOR | `proxy.ts:50-87`, `proxy.ts:124` | `/admin/pages` için rol + `admin_gate` HMAC cookie kontrolü uygulanıyor. |
| 2 | API yetkisi (`requireAuth(['ADMIN'])` + token-replay) | KISMİ | `app/api/admin/pages/route.ts:53,65,105,159`; `lib/api-auth.ts:52-80`; `proxy.ts:105-118` | Rol ve replay kontrolü var; ancak `/api/*` yolları proxy'de gate cookie kontrolünden geçmiyor (`proxy.ts:107-117` doğrudan `NextResponse.next()`). Sistem geneli bir boşluk, bu sayfaya özgü değil. |
| 3 | Sekme başlığı / metadata | EKSİK | `app/admin/pages/` yalnız `page.tsx` içeriyor; dosya `'use client'` (`page.tsx:1`) | Sekmede yalnızca layout'un varsayılan "Admin" başlığı görünür (`app/admin/layout.tsx:15-18`). |
| 4 | Premium hero (başlık + açıklama + ikon) | ÇALIŞIYOR | `page.tsx:200-204` | Metinler sabit Türkçe; `useAppT` kullanılmıyor (bkz. #28). |
| 5 | Liste yükleme (`GET /api/admin/pages`) | ÇALIŞIYOR | `page.tsx:50-66`; `route.ts:52-62` | `cache: 'no-store'` + `PRIVATE_NO_STORE_HEADERS`. |
| 6 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:234-235`; `components/ui/inline-loading-status.tsx:28-33` | `role="status"` + `aria-live`; iskelet (skeleton) yok, sadece spinner. |
| 7 | Hata durumu | KISMİ | `page.tsx:57-59`, `236-238` | Yükleme hatası yalnız toast; ardından ekranda "Sayfa bulunamadı." görünüyor — hata ile boş liste ayırt edilemiyor, "Tekrar dene" yok. |
| 8 | Boş durum | KISMİ | `page.tsx:236-238` | "Hiç sayfa yok" ile "aramayla eşleşen yok" aynı metin; ilk sayfayı oluşturma CTA'sı yok. |
| 9 | Arama (başlık + slug, istemci tarafı) | ÇALIŞIYOR | `page.tsx:68-72`, `207-214` | Yalnız `placeholder`; `aria-label` yok. Türkçe büyük/küçük harf (`İ`/`ı`) için `toLocaleLowerCase('tr')` kullanılmıyor (`page.tsx:69,71`). |
| 10 | Sıralama (önce yayında, sonra `updatedAt desc`) | ÇALIŞIYOR | `route.ts:55-57` | Sunucuda sabit; kullanıcı sıralama seçemiyor. |
| 11 | Durum filtresi (yayında/taslak) | EKSİK | — | Rozet var, filtre yok. |
| 12 | Sayfa kartı (başlık, `/slug`, durum rozeti, içerik önizlemesi, güncelleme tarihi) | ÇALIŞIYOR | `page.tsx:244-259` | Önizleme ham metin `line-clamp-3`; oluşturma tarihi / son düzenleyen yok. |
| 13 | Kart giriş animasyonu (stagger, tavanlı) | ÇALIŞIYOR | `page.tsx:243`; `components/providers.tsx:232` | `delay` 10 kartta tavanlanıyor; azaltılmış hareket global `MotionConfig reducedMotion="user"` ile karşılanıyor. Ölçülü, yerinde. |
| 14 | "Yeni Sayfa" diyaloğunu açma | KISMİ | `page.tsx:217-223`, `276` | Açılışta form sıfırlanmıyor; düzenleme diyaloğu ESC/dış tıklama ile kapatılınca (`onOpenChange={setEditOpen}`) `formData` düzenlenen sayfanın verisiyle kalıyor ve "Yeni Sayfa" formu önceki sayfanın başlık/slug/içeriğiyle dolu açılıyor. |
| 15 | Form alanları (başlık, slug, içerik, yayınla anahtarı) | BOZUK | `page.tsx:150-196`, `229`, `282` | `PageForm` bileşen gövdesinde tanımlı bir bileşen; her `setFormData` sonrası yeni fonksiyon kimliği → React alt ağacı unmount/mount ediyor → her tuş vuruşunda input odağı kayboluyor. React Compiler etkin değil (`next.config.*` içinde `reactCompiler` yok). |
| 16 | Slug normalizasyonu | KISMİ | `page.tsx:164` | Boşluk → `-`, diğer karakterler siliniyor: "Gizlilik Şartı" → `gizlilik-art`. Türkçe transliterasyon yok, başlıktan otomatik slug üretimi yok, `---` gibi anlamsız slug'lar geçerli (`route.ts:14`). |
| 17 | İstemci doğrulaması | KISMİ | `page.tsx:77-80` (yalnız oluşturma); `101-103` (güncellemede yok) | Güncellemede başlık silinirse istek sunucuya gidiyor ve #18'deki anlamsız hata dönüyor. |
| 18 | Sayfa oluşturma (`POST`) | KISMİ | `page.tsx:76-99`; `route.ts:64-102` | Mutlu yol çalışıyor. Zod hatasında sunucu `error: parsed.error.flatten()` (nesne) döndürüyor (`route.ts:71`), istemci `new Error(data?.error)` yapıyor (`page.tsx:89`) → toast: "Dikkat: [object Object]". |
| 19 | Sayfa düzenleme (diyalog + `PUT`) | KISMİ | `page.tsx:101-122`, `139-148`, `276-284`; `route.ts:104-155` | #15 odak hatası, #18 hata mesajı, eşzamanlı düzenleme kontrolü yok (son yazan kazanır; `updatedAt` karşılaştırması yok). |
| 20 | Sayfa silme | KISMİ | `page.tsx:124-137`, `265` | Tek tıkla, onaysız, geri alınamaz kalıcı `delete` (`route.ts:168`). Yayındaki bir sayfa da aynı şekilde silinir. |
| 21 | "Yayınla" anahtarı + "Yayında" rozeti | SAHTE | `page.tsx:176`, `251-253`; `grep prisma.page` yalnız `app/api/admin/pages/route.ts` içinde eşleşiyor | `Page` modelini okuyan hiçbir public rota, sitemap girdisi ya da bileşen yok. Yasal sayfalar (`app/(public)/kullanim-sartlari/page.tsx` vb.) ve blog (`lib/blog-posts.ts`) sabit kodlu. "Yayında" görünen sayfa internette yok. |
| 22 | Denetim günlüğü (CREATE/UPDATE/DELETE_PAGE) | ÇALIŞIYOR | `route.ts:90-99`, `140-150`, `169-178` | Kaydediliyor; ancak `oldData` + `newData` tam satırı (100 KB'a kadar içerik) iki kez kopyalıyor. Sayfada bu geçmişe bağlantı yok. |
| 23 | Slug benzersizliği | KISMİ | `route.ts:75-78`, `120-125`; `schema.prisma:1387` | Kontrol-sonra-yaz; eşzamanlı istekte `@unique` ihlali (P2002) yakalanmıyor → işlenmemiş 500. |
| 24 | SEO meta alanı (`Page.meta`) | EKSİK | `schema.prisma:1390`; `route.ts` içinde `meta` hiç geçmiyor | Şemada var, API ve UI'da yok. |
| 25 | Önizleme / "Canlı görüntüle" bağlantısı | EKSİK | — | Gösterilecek public rota da yok (#21). |
| 26 | Zengin içerik düzenleyici (şemadaki "Block-based content") | EKSİK | `schema.prisma:1389` (yorum: "Block-based content"); `route.ts:85`; `page.tsx:172` | Gerçekte düz `Textarea` + `{ body: string }`. Markdown/blok/görsel yok. |
| 27 | Sürüm geçmişi / geri alma / zamanlanmış yayın | EKSİK | — | Yasal metinler için (KVKK, kullanım şartları) sürümleme mevzuat açısından değerli. |
| 28 | Çoklu dil (TR/EN) | KISMİ | `page.tsx:40`, `235` | Yalnızca yükleme etiketi `t()` ile; tüm diğer metinler sabit Türkçe. EN locale'de sayfa karışık dil gösterir. |
| 29 | Sayfalama / sanal liste | EKSİK | `route.ts:55-57` | `findMany` limitsiz ve her satırın tam içeriğini dönüyor. Şu an tablo küçük, ölçekte sorun. |
| 30 | Erişilebilirlik (form etiketleri, ikon buton adı) | KISMİ | `page.tsx:154`, `158`, `171`, `175` (`Label` → `htmlFor` yok); `265` (yalnız ikon, `aria-label` yok) | Ekran okuyucu sil butonunu "button" olarak okur; `Switch` etiketsiz. Diyalog odak tuzağı Radix sayesinde var. |
| 31 | Mobil yerleşim | KISMİ | `page.tsx:152` (`grid-cols-2` kırılımsız), `206` (`flex-col sm:flex-row` uygun), `241` (`md:grid-cols-2` uygun) | Diyalog formunda başlık/slug ~400 px'te sıkışık iki sütun. Liste mobilde düzgün tek sütun. |
| 32 | Kaydetme sırasında spinner + disabled | ÇALIŞIYOR | `page.tsx:190-193`, `265` | İptal butonu kaydetme sürerken diyaloğu kapatabiliyor (`page.tsx:179-188`), istek arka planda tamamlanıyor — küçük tutarsızlık. Ortak `saving` tüm kartlardaki sil butonlarını da kilitliyor. |

**Durum sayımı:** ÇALIŞIYOR 10 · KISMİ 13 · BOZUK 1 · SAHTE 1 · EKSİK 7 (toplam 32)

---

## Bulgular

### 1. Yayın hattı yok: `Page` modeli hiçbir yerde okunmuyor ("Yayınla" sahte)
- **Önem:** kritik · **Kategori:** işlevsellik / ürün bütünlüğü · **Efor:** L
- **Kanıt:** `prisma.page.*` çağrılarının tamamı `app/api/admin/pages/route.ts:55,75,80,115,121,132,165,168` içinde; `app/`, `lib/`, `components/` altında başka eşleşme yok. Public dinamik rotalar yalnız `app/(public)/blog/[slug]` (statik `lib/blog-posts.ts`'den beslenir, `blog/[slug]/page.tsx:5,9`), `experience/[token]`, `feedback/[code]`. Yasal sayfalar sabit JSX (`app/(public)/kullanim-sartlari/page.tsx:20-30`). `app/sitemap.ts:13-67` `Page` kayıtlarını içermiyor.
- **Sorun:** Operatör bir sayfa oluşturup "Yayında" rozetini görüyor (`page.tsx:251-253`), ama bu içerik hiçbir URL'de yayınlanmıyor. Yanıltıcı bir arayüz: kullanıcı yaptığı işin canlıda olduğunu sanıyor. Ayrıca `isPublished` UI'da varsayılan `true` (`page.tsx:37`), API'de `false` (`route.ts:16`) — anlam tutarsızlığı da var.
- **Öneri:** Önce ürün kararı: (a) **Gerçek CMS** — `app/(public)/[...slug]/page.tsx` (veya çakışmayı önlemek için `app/(public)/p/[slug]`) ile `isPublished=true` kayıtları ISR + `revalidateTag('page:'+slug)` ile render et; POST/PUT/DELETE sonrası tag'i geçersiz kıl; sitemap'e `Page` kayıtlarını ekle (build-time DB fail-safe kuralına uygun try/catch + varsayılan). Yasal sayfaları (KVKK, gizlilik, çerez, kullanım şartları) bu modele taşı ki metin değişikliği deploy gerektirmesin. (b) **İhtiyaç yoksa kaldır** — sayfa, API, menü girdileri (`admin-utils.ts:125`, `sidebar.tsx:196`), API kataloğu girdisi (`lib/data/admin-api-catalog.json:511-518`) ve `Page` modeli birlikte silinsin. Ara çözüm olarak en azından rozet "Yayında" yerine "Yayın hattı bağlı değil" uyarısı göstermeli.

### 2. Form her tuş vuruşunda odağı kaybediyor (iç içe tanımlı bileşen)
- **Önem:** kritik · **Kategori:** hata / UX · **Efor:** S
- **Kanıt:** `page.tsx:150` `const PageForm = ({ onSubmit, submitLabel }) => (...)` ana bileşen gövdesinde; `page.tsx:229` ve `282`'de `<PageForm .../>` olarak JSX element tipi kullanılıyor. Her input `setFormData` çağırıyor (`155`, `161-166`, `172`, `176`). React Compiler kapalı.
- **Sorun:** Her render'da `PageForm` yeni bir fonksiyon kimliği → React bunu farklı bir bileşen tipi sayar → `Input`/`Textarea` DOM'u yeniden oluşturulur → odak ve imleç konumu kaybolur. Pratikte kullanıcı her karakterden sonra alana tekrar tıklamak zorunda; 10 satırlık içerik yazmak neredeyse imkânsız.
- **Öneri:** `PageForm`'u modül seviyesine taşı, `value`/`onChange`/`saving`/`onCancel` prop'larıyla kontrol edilen saf bir bileşen yap (ya da JSX'i `{renderForm()}` olarak fonksiyon çağrısıyla göm). Daha iyisi: `react-hook-form` + `zodResolver` ile sunucudaki `createSchema`'yı paylaşılan `lib/validation/page.ts` içine çıkar ve hem istemcide hem API'de aynı şemayı kullan.

### 3. Onaysız, geri alınamaz silme
- **Önem:** yüksek · **Kategori:** UX / veri güvenliği · **Efor:** S
- **Kanıt:** `page.tsx:265` `onClick={() => void handleDelete(page.id)}`; `route.ts:168` kalıcı `prisma.page.delete`.
- **Sorun:** Tek yanlış tıklama yayındaki bir sayfayı (gelecekte yasal metin olabilir) kalıcı siler. Paneldeki diğer yıkıcı işlemlerle tutarsız.
- **Öneri:** `AlertDialog` ile onay ("`/slug` kalıcı olarak silinecek"); yayındaki sayfalar için slug'ı yazarak onaylama. Tercihen yumuşak silme (`deletedAt`) + 30 gün "Çöp kutusu" + sonner toast'ında "Geri al" aksiyonu; denetim günlüğünde zaten `oldData` var, geri yükleme uç noktası buna dayanabilir.

### 4. Doğrulama hatalarında `[object Object]` mesajı
- **Önem:** yüksek · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `route.ts:71` ve `112` `{ error: parsed.error.flatten() }` (nesne); `page.tsx:89`, `111` `throw new Error(data?.error || ...)` → `Error` mesajı nesnenin string hâli; `lib/admin-toast.ts:17-18` "Dikkat: " ön ekiyle gösteriyor.
- **Sorun:** 180 karakterden uzun başlık, 120'den uzun slug, 100 000'den uzun içerik veya düzenlemede silinmiş başlık → kullanıcı "Dikkat: [object Object]" görür; hangi alanın hatalı olduğu bilinmez.
- **Öneri:** API hata sözleşmesini tekleştir: `{ error: string, fieldErrors?: Record<string,string[]> }`. İstemcide `fieldErrors`'ı alan altında satır içi göster (`aria-invalid` + `aria-describedby`), genel mesajı toast'a ver. Paylaşılan zod şeması (#2) sayesinde çoğu hata istek atılmadan yakalanır; alanlara karakter sayacı ekle.

### 5. Diyaloglar arası form durumu sızıyor
- **Önem:** orta · **Kategori:** hata / durum yönetimi · **Efor:** S
- **Kanıt:** `page.tsx:276` `onOpenChange={setEditOpen}` (kapanışta `resetForm`/`setSelectedPage(null)` yok); `page.tsx:217` "Yeni Sayfa" açılışında da `resetForm` yok. Sıfırlama yalnız İptal butonunda (`page.tsx:181-186`).
- **Sorun:** Düzenleme diyaloğu ESC veya dışarı tıklama ile kapatılınca, "Yeni Sayfa" formu önceki sayfanın verisiyle dolu açılır; "Oluştur" denirse "Bu slug zaten kullanılıyor" hatası alınır ya da yanlışlıkla kopya içerik üretilir.
- **Öneri:** Oluşturma ve düzenlemeyi tek bir `PageEditor` durum makinesiyle yönet (`mode: 'closed' | 'create' | {edit: id}`), form durumunu diyaloğun içinde, `key={mode}` ile her açılışta temiz mount edilen bileşende tut. Kapatmada kaydedilmemiş değişiklik varsa "Değişiklikleri at?" onayı.

### 6. Eşzamanlılık: slug yarışı 500 veriyor, düzenlemeler sessizce eziliyor
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** M
- **Kanıt:** `route.ts:75-78` ve `120-125` kontrol-sonra-yaz; `route.ts:80`, `132` etrafında `try/catch` yok; `schema.prisma:1387` `slug @unique`. PUT'ta sürüm/`updatedAt` kontrolü yok (`route.ts:132-139`).
- **Sorun:** İki eşzamanlı istekte P2002 yakalanmaz → işlenmemiş 500, istemci `res.json()` boş gövdeyle patlar. İki operatör aynı sayfayı düzenlerse son kaydeden diğerinin değişikliğini fark ettirmeden siler.
- **Öneri:** `Prisma.PrismaClientKnownRequestError` `P2002` → 409 "Slug kullanımda". PUT'a `expectedUpdatedAt` ekle, `updateMany({ where: { id, updatedAt } })` ile optimistik kilitleme; `count === 0` ise 409 + "Bu sayfa siz düzenlerken değişti — farkı gör" akışı.

### 7. Şema ile uygulama arasında sözleşme kayması (blok içerik, `meta`)
- **Önem:** orta · **Kategori:** mimari · **Efor:** M
- **Kanıt:** `schema.prisma:1389` `content Json // Block-based content`, `1390` `meta Json? // SEO metadata`; API yalnız `{ body: string }` yazıyor (`route.ts:85`, `128-131`) ve okurken üç farklı biçimi tolere ediyor (`route.ts:32-38`); `meta` hiç kullanılmıyor.
- **Sorun:** Model "blok tabanlı + SEO'lu CMS" vaat ediyor, gerçek uygulama düz metin. Gelecekte biri blok formatı yazarsa bu ekran içeriği sessizce boş string'e çevirir (`route.ts:38`) ve PUT ile eski içeriği ezer.
- **Öneri:** İçerik formatını sürümlü bir tipe bağla: `content: { v: 1, format: 'markdown', body: string }` (yasal metin + basit sayfalar için Markdown yeterli; blok editörü gerçekten gerekirse `v: 2` ile TipTap/ProseMirror JSON). `meta` için `title`, `description`, `canonical`, `noindex`, `ogImage` alanlarını zod ile tipleyip formda "SEO" sekmesi olarak aç ve `/admin/seo` sayfa geçersiz kılmalarıyla (`lib/seo-settings.ts:139-143`) tek kaynakta birleştir.

### 8. Çoklu dil desteği yarım: sabit Türkçe metinler
- **Önem:** orta · **Kategori:** i18n / tutarlılık · **Efor:** S
- **Kanıt:** `page.tsx:40` `useAppT` var ama yalnız `235`'te kullanılıyor; `201-202`, `210`, `221`, `226-227`, `238`, `253`, `257`, `259`, `263`, `154-188` sabit TR. `messages/en.json:1908` EN çevirisi mevcut, yani uygulama EN'i destekliyor. Tarih `toLocaleDateString('tr-TR')` sabit (`page.tsx:259`).
- **Sorun:** EN locale seçen operatör karışık dilli ekran görür. Ayrıca `lib/admin-toast.ts:15` "Basarili:" Türkçe karaktersiz — sistem geneli küçük kusur.
- **Öneri:** Tüm metinleri `adminPages.*` anahtarlarına taşı; tarih için `Intl.DateTimeFormat(locale, { dateStyle: 'medium' })` + göreli zaman ("3 gün önce"). Admin toast ön eklerini kaldır veya doğru Türkçeleştir.

### 9. Erişilebilirlik ve mobil eksikleri
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil · **Efor:** S
- **Kanıt:** `page.tsx:154`, `158`, `171`, `175` `Label` → `htmlFor` yok, input'larda `id` yok; `page.tsx:265` yalnız ikonlu sil butonu (`aria-label` yok); `page.tsx:209-214` arama alanı yalnız `placeholder`; `page.tsx:152` `grid-cols-2` kırılımsız.
- **Sorun:** Ekran okuyucu alanları adlandıramaz, sil butonu "düğme" olarak okunur, `Switch`'in ne yaptığı duyurulmaz. 400 px genişlikte başlık ve slug yan yana sıkışır.
- **Öneri:** `useId` ile `Label htmlFor` ↔ `Input id`; sil butonuna `aria-label={`${page.title} sayfasını sil`}`; aramaya `aria-label` + sonuç sayısını `aria-live="polite"` ile duyur; form ızgarasını `grid-cols-1 sm:grid-cols-2` yap; mobilde diyalog yerine tam ekran `Sheet`/`Drawer` kullan.

### 10. Hata ve boş durumları ayrışmıyor
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** `page.tsx:57-59` (yalnız toast), `236-238` (tek "Sayfa bulunamadı." kartı).
- **Sorun:** Ağ hatası, hiç kayıt olmaması ve aramanın eşleşmemesi aynı görünüyor; yeniden deneme yok.
- **Öneri:** Üç ayrı durum: hata (ikon + mesaj + "Tekrar dene"), ilk kullanım (açıklama + "İlk sayfanı oluştur" + şablon önerileri: KVKK, Çerez, Kullanım Şartları), arama boş ("'x' için sonuç yok — aramayı temizle"). Veri katmanında SWR/React Query ile `isError`/`retry` kullan.

### 11. Liste uç noktası tam içerik döndürüyor; denetim günlüğü içeriği iki kez kopyalıyor
- **Önem:** düşük · **Kategori:** performans / depolama · **Efor:** S
- **Kanıt:** `route.ts:55-61` `findMany` limitsiz, `select` yok → her sayfanın tam `content`'i; `route.ts:96`, `146-147` `oldData`/`newData` tam satır.
- **Sorun:** Bugün tablo küçük; ancak 100 KB'lık yasal metinlerle liste yükü ve `AuditLog` tablosu (canlı Neon) hızla şişer.
- **Öneri:** Liste için `select: { id, slug, title, isPublished, updatedAt }` + 200 karakterlik özet (veya `excerpt` kolonu); tam içerik yalnız `GET /api/admin/pages/[id]`. Denetim günlüğüne içerik yerine `contentHash` + uzunluk + değişen alan listesi yaz; tam içerik sürüm tablosunda (`PageRevision`) dursun (bkz. Yeniden tasarım vizyonu).

### 12. Sistem geneli: `/api/admin/*` gizli kapı cookie'sini zorunlu kılmıyor
- **Önem:** düşük (bu sayfa için) · **Kategori:** güvenlik · **Efor:** M
- **Kanıt:** `proxy.ts:105-118` `/api/` yollarında yalnız güvenlik/CORS başlıkları, gate kontrolü yok; gate kontrolü yalnız `/admin` UI yollarında (`proxy.ts:79-87`). `route.ts` yalnız `requireAuth(['ADMIN'])`.
- **Sorun:** Gizli kapının amacı "rolü ADMIN yapılmış ama rakamı bilmeyen" kişiyi durdurmak; bu kişi UI'a giremese de API'yi doğrudan çağırarak sayfa oluşturup silebilir. Bu sayfaya özgü değil, tüm admin API'leri için geçerli — doğrulanmış ama etki bu sayfanın kapsamı dışında.
- **Öneri:** `requireAuth(['ADMIN'])` içine (veya `requireAdmin` sarmalayıcısına) `admin_gate` cookie doğrulamasını ekle; böylece tek noktadan tüm admin API'leri kapanır.

---

## Eksik özellikler (kıyas ürünlerle)

- **Gerçek yayın + canlı önizleme (Stripe/Webflow/Sanity kalıbı):** taslak için imzalı önizleme URL'i (`/p/slug?preview=token`), yayın için ISR + tag revalidation, kartta "Canlı görüntüle ↗".
- **Sürüm geçmişi ve fark görünümü (Linear doküman geçmişi, Notion):** her kayıt bir `PageRevision`; yan yana diff, tek tıkla geri yükleme, "kim, ne zaman, neyi değiştirdi". Yasal metinlerde KVKK açısından "hangi tarihte hangi metin yürürlükteydi" kanıtı.
- **Zamanlanmış yayın ve durum iş akışı:** `draft → in_review → scheduled → published → archived`; `publishAt`/`unpublishAt`.
- **Zengin editör + SEO paneli:** Markdown (veya blok) editörü, canlı önizleme bölmesi, slug'ın başlıktan Türkçe transliterasyonla otomatik üretimi, meta başlık/açıklama karakter sayaçları, SERP önizlemesi, `noindex`.
- **Liste ergonomisi (Retool/Linear tablo kalıbı):** tablo görünümü, durum filtresi, sıralama seçimi, sayfalama, çoklu seçim + toplu yayınla/arşivle, `/` ile aramaya odak, `N` ile yeni sayfa.
- **Güvenli silme:** çöp kutusu + geri al toast'ı + yayındaki sayfa için yazarak onay; silinen slug için otomatik 301 yönlendirme önerisi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör "İçerik" sekmesine girdiğinde sitedeki tüm yayınlanabilir metinleri (yasal metinler, bilgi sayfaları, ileride blog) tek listede görür; birini açtığında solda editör, sağda gerçek public şablonla canlı önizleme vardır; "Yayınla" dediğinde birkaç saniye içinde URL güncellenir ve önceki sürüm geçmişte durur. Her eylemin sonucu görünür ve geri alınabilir.

**Yerleşim:**
1. **Üst şerit (hero yerine kompakt başlık):** "İçerik" başlığı + üç sayaç çipi (Yayında · Taslak · Zamanlanmış) + sağda "Yeni sayfa" ve şablondan oluştur menüsü. Büyük premium hero bu yoğun bir iş ekranı için fazla dikey alan kaplıyor; çipli kompakt varyant yeterli.
2. **Liste:** kart galerisi yerine tablo (masaüstü) — Başlık / Slug (kopyala) / Durum / Son düzenleyen / Güncellenme (göreli) / satır menüsü (Düzenle, Canlı görüntüle, Çoğalt, Arşivle, Sil). Mobilde aynı veri kompakt satır kartlarına düşer. Üstte arama + durum segment kontrolü + sıralama.
3. **Editör rotası:** diyalog değil, ayrı rota `/admin/pages/[id]` (derin bağlantı, tarayıcı geri tuşu, kaydedilmemiş değişiklik uyarısı). Sekmeler: İçerik · SEO · Geçmiş. Sağ panelde canlı önizleme (public sayfanın aynı render bileşeni). Alt yapışkan çubuk: otomatik taslak kaydı göstergesi + "Yayınla"/"Değişiklikleri yayınla".

**Motion / 3D:** 3D'nin burada yeri yok. Motion yalnız işlevsel olmalı: liste satırlarında mevcut tavanlı stagger korunabilir; yayınla sonrası durum çipinin `layout` geçişi (Taslak → Yayında) ve kaydetme göstergesinin kısa crossfade'i yeterli. Hepsi mevcut global `MotionConfig reducedMotion="user"` altında kalır.

**Veri / API değişiklikleri:**
- Prisma: `Page`'e `status` enum, `publishAt`, `publishedAt`, `updatedById`, `deletedAt`, `currentRevisionId`; yeni `PageRevision { id, pageId, content Json, meta Json, authorId, createdAt }`. Şema değişikliği canlı Neon'a dokunacağı için `DIRECT_URL` ile kontrollü migration.
- API: `GET /api/admin/pages` (özet `select`, `?status&q&cursor`), `GET/PATCH/DELETE /api/admin/pages/[id]` (optimistik kilit: `expectedUpdatedAt`), `POST /api/admin/pages/[id]/publish`, `GET /api/admin/pages/[id]/revisions`, `POST .../revisions/[rid]/restore`. Hata sözleşmesi `{ error, fieldErrors }`. P2002 → 409.
- Public: `app/(public)/p/[slug]/page.tsx` (veya yasal sayfaların mevcut yollarını `Page` kayıtlarına bağlayan ortak bir `LegalPage` render'ı), `unstable_cache`/`'use cache'` + `revalidateTag`, build-time DB fail-safe (try/catch + sabit varsayılan metin), sitemap'e yayındaki sayfalar.
- İstemci: modül seviyesinde `PageEditor`, `react-hook-form` + paylaşılan zod şeması, veri katmanı SWR/React Query, tüm metinler `adminPages.*` i18n anahtarlarında.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/seo` (SEO Motoru):** sayfa bazlı başlık/açıklama/canonical geçersiz kılmalarını `pageOverrides` olarak ayrı bir kaynakta tutuyor (`lib/seo-settings.ts:139-143`, `app/(public)/kullanim-sartlari/page.tsx:10,23`). `Page.meta` ile aynı işi yapmaya aday iki ayrı kaynak oluşuyor. Öneri: içerik sayfalarının SEO'su `Page.meta`'da yaşasın; `/admin/seo` küresel ayarlar + sağlık/denetim ekranı olarak kalsın ve sayfa bazlı satırlarda "İçerikte düzenle" bağlantısı versin.
- **`/admin/compliance` (KVKK & 5651):** uyum talepleri ve logları yönetiyor; yasal metinlerin kendisi ise sabit kodlu public sayfalarda. Yasal metinler `Page` modeline taşınırsa, compliance ekranından "Aydınlatma metni sürümleri" kartıyla bu sayfaya bağlanmalı.
- **Blog (`lib/blog-posts.ts`):** statik; ileride CMS'e taşınacaksa aynı modelin `type` alanıyla (page/legal/post) karşılanabilir.
- **Karar özeti:** Bugünkü `/admin/pages` tek başına değer üretmiyor. Ürün yasal metin/bilgi sayfası yönetimi istiyorsa → "İçerik" stüdyosu olarak yeniden inşa et ve `/admin/seo`'nun sayfa geçersiz kılmalarını içine al. İstemiyorsa → sayfa, API, menü girdileri, katalog girdisi ve `Page` modeli birlikte kaldırılsın; ara dönemde en azından "Yayında" rozetinin yanıltıcı olduğu belirtilsin.

---

## Doğrulama (şüpheci inceleme)

Yöntem: `app/admin/pages/page.tsx`, `app/api/admin/pages/route.ts`, `prisma/schema.prisma:1385-1397`, `next.config.js` ve tüm depo genelinde `prisma.page` / ham SQL `"Page"` / `[slug]` rotaları okunarak her iddia çürütülmeye çalışıldı. Kod değiştirilmedi, DB'ye dokunulmadı.

### 1. Form inputları her tuş vuruşunda unmount olup odak kaybediyor — **DOĞRULANDI (KRİTİK korunur)**
- `PageForm`, `AdminPagesPage` gövdesinde ok fonksiyonu olarak tanımlı (`app/admin/pages/page.tsx:150`) ve JSX element tipi olarak kullanılıyor (`:229`, `:282`). Her `onChange` → `setFormData` (`:155`, `:161-166`, `:172`, `:176`) üst bileşeni yeniden render eder → `PageForm` yeni fonksiyon kimliği alır → React aynı konumda farklı tip gördüğü için alt ağacı unmount/mount eder; `Input`/`Textarea` DOM düğümü yenilenir ve odak düşer.
- Çürütme denemesi: React Compiler yok (`next.config.js:293-309` `experimental` içinde yalnız `optimizePackageImports`/`serverActions`; `package.json`'da `babel-plugin-react-compiler` yok). Olsaydı bile `PageForm` kapanışı `formData`'ya bağlı olduğundan kimlik her değişimde yine yenilenirdi.
- Yeniden üretim: "Yeni Sayfa" → "Sayfa başlığı" alanına "Hakkımızda" yazmayı dene → ilk karakterden sonra odak kaybolur, her harf için yeniden tıklamak gerekir. Aynısı düzenleme diyaloğunda ve 10 satırlık içerik alanında; form fiilen kullanılamaz.
- Düzeltme yönü: `PageForm`'u modül seviyesine taşı (`value`/`onChange`/`saving`/`onCancel` prop'larıyla) veya JSX'i fonksiyon çağrısı gibi değil düz değişken olarak satır içine al; tercihen `react-hook-form` + paylaşılan zod şeması.

### 2. "Yayınla" sahte: `Page` modeli hiçbir public rotada okunmuyor — **DOĞRULANDI (YÜKSEK; yanıltıcı UI)**
- Depo genelinde `prisma.page` erişimi yalnız `app/api/admin/pages/route.ts` içinde (`:55, :75, :80, :115, :121, :132, :165, :168`). Ham SQL'de `"Page"` okuyan yer yok; tek dinamik slug rotası `app/(public)/blog/[slug]/page.tsx` ve o da statik `lib/blog-posts.ts`'ten (`getPostBySlug`) okuyor. Tek diğer dokunuş `scripts/db-backup-json.mjs:59,88` (yedek; okuma amaçlı genel döngü, yayın değil).
- Yeniden üretim: slug `hakkimizda`, "Yayınla" açık bir sayfa oluştur → kartta "Yayında" rozeti (`page.tsx:251-253`) görünür → `/hakkimizda` veya başka herhangi bir URL içerik göstermez; sitemap'te de yok.
- Not: güvenlik açığı değil, veri kaybı da değil; operatörü yanıltan ve iş değeri üretmeyen bir ekran. Ana rapordaki "ya Content Studio olarak yeniden inşa et ya da sayfa+API+model birlikte kaldır" kararı geçerli.

### 3. Onaysız kalıcı silme — **DOĞRULANDI (ancak etki: ORTA'ya düşürülmeli)**
- `page.tsx:265` çöp kutusu doğrudan `handleDelete(page.id)` çağırıyor; onay yok. `route.ts:168` `prisma.page.delete` sert silme; şemada `deletedAt` yok (`schema.prisma:1385-1397`). Yalnız `AuditLog.oldData`'da iz kalıyor (`route.ts:169-178`), UI'dan geri yükleme yolu yok. Projede `components/ui/alert-dialog.tsx` mevcut ama kullanılmamış.
- Yeniden üretim: kart üzerinde yanlışlıkla çöp ikonuna tıkla → kayıt anında silinir, "Sayfa silindi" toast'ı, geri al yok.
- Şiddet notu: Bulgu 2 nedeniyle silinen içerik hiçbir public yüzeyde yayında olmadığından son kullanıcıya etkisi yok; kayıp yalnız admin'in yazdığı metin ve audit log'dan elle geri alınabilir. Bu yüzden KRİTİK/YÜKSEK değil ORTA. Sayfa gerçekten yayın yapan bir CMS'e dönüşürse YÜKSEK olur.

### 4. Eşzamanlı slug çakışmasında yakalanmayan P2002 → işlenmemiş 500 — **DOĞRULANDI (ancak etki: DÜŞÜK'e düşürülmeli)**
- Kontrol-sonra-yaz deseni gerçek: POST `route.ts:75-78` → `:80` `create`, PUT `:120-125` → `:132` `update`; ikisi de try/catch'siz. `slug @unique` (`schema.prisma:1387`) yarışta P2002 fırlatır → Next route handler 500 ve JSON olmayan gövde döner → istemcide `res.json()` (`page.tsx:88`, `:110`) SyntaxError atar → catch'te toast "Unexpected end of JSON input" benzeri anlamsız bir mesaj gösterir. PUT'ta `updatedAt`/sürüm kontrolü yok; son yazan kazanır.
- Yeniden üretim: iki admin aynı anda aynı slug ile "Oluştur"a basar → biri başarılı, diğeri 500 + anlamsız toast. Veya A düzenleme diyaloğunu açık tutarken B kaydeder, sonra A kaydeder → B'nin değişikliği sessizce ezilir (her iki değer `AuditLog`'da kalır).
- Şiddet notu: unique kısıt veri bütünlüğünü korur (çift slug oluşmaz); senaryo milisaniyelik eşzamanlılık veya iki adminin aynı kaydı aynı anda düzenlemesini gerektirir ve içerik zaten yayınlanmıyor (Bulgu 2). Kod olgusu doğru ama KRİTİK/YÜKSEK değil, DÜŞÜK. Düzeltme yönü: `create`/`update`'i try/catch ile sar, `Prisma.PrismaClientKnownRequestError` + `code === 'P2002'` → 409 `{ error: 'Bu slug zaten kullanılıyor' }`; PUT'a `expectedUpdatedAt` ile `updateMany({ where: { id, updatedAt } })` optimistik kilidi, `count === 0` → 409; istemcide `res.json()`'u `.catch(() => null)` ile güvenli parse et.

### Özet
| # | İddia | Karar | Önerilen şiddet |
|---|---|---|---|
| 1 | PageForm remount / odak kaybı | Doğrulandı | KRİTİK |
| 2 | "Yayınla" hiçbir yerde okunmuyor | Doğrulandı | YÜKSEK (yanıltıcı UI) |
| 3 | Onaysız kalıcı silme | Doğrulandı | ORTA |
| 4 | P2002 yarışı / optimistik kilit yok | Doğrulandı | DÜŞÜK |
