# /admin/menu-groups

**Amaç:** Bayi ve müşteri panellerindeki sol menünün katlanabilir GRUPLARINI yönetmek: grup başlıklarını yeniden adlandırmak ve her menü öğesinin hangi gruba ait olacağını (ya da grupsuz üst düzeyde kalacağını) belirlemek. Kodda tanımlı varsayılanların üstüne `Settings.sidebarNavGroups` anahtarıyla bir override katmanı yazar.

**Genel puan: 4.5/10** · **Karar: birleştir** (`/admin/sidebar-order` ve `/admin/settings` içindeki menü görünürlüğü ile tek bir "Navigasyon Stüdyosu"na)

Sayfa küçük ve temel işini yapıyor: kayıt, audit log ve runtime'da sidebar'a uygulanma uçtan uca bağlı. Ama yükleme hatası sessizce yutuluyor ve bu, kayıtla birlikte veri kaybına yol açabiliyor. Grup adı override'ı çok dilli yapıyı bozuyor. Önizleme, sıfırlama ve değişiklik takibi de yok. Ayrıca aynı "sol menüyü düzenle" işi üç ayrı sayfaya bölünmüş durumda.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Okuma, düzenleme, kayıt ve runtime uygulaması çalışıyor. Ancak yükleme hatası sessizce yutuluyor ve kayıt önceki override'ları silebiliyor. Grup adları tek dilli; sıfırlama ve önizleme yok. |
| UX | 4/10 | Yükleniyor ve hata durumu yok. Değişiklik ve kaydedilmemiş durum göstergesi yok, sonuç önizlenemiyor. Kaydet yalnız aktif sekmeyi kaydettiği hâlde bunu söylemiyor. |
| Görsel | 5/10 | shadcn kartlarıyla düzgün ama sade. Kardeş sayfa `sidebar-order`'ın `AdminPremiumHero` + vurgu kartı dilinden kopuk; native `<select>` diğer kontrollerle uyumsuz. |
| Mimari | 5/10 | API katmanı temiz (zod, normalize, audit). Ama grup anahtarları katalogla doğrulanmıyor, ölü `grouped` hesaplaması duruyor, metinler sabit kodlu TR ve eşzamanlılık kontrolü yok. |
| Performans | 7/10 | Tek GET ve tek PUT var, hafif. Runtime tarafında her sidebar mount'unda önbelleksiz bir DB okuması yapılıyor (küçük ama gereksiz). |
| Erişilebilirlik + Mobil | 4/10 | Grup adı input'ları ve öğe `<select>`'leri etiketsiz (yalnız placeholder/ikon). Dar ekranda satır yerleşimi doğrulanmadı. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Admin menüsünde sayfa girişi ("Menü grupları") | ÇALIŞIYOR | components/dashboard/sidebar.tsx:201 | `LayoutTemplate` ikonunu `design_language` (sidebar.tsx:198) ile paylaşıyor; iki giriş görsel olarak ayırt edilemiyor. |
| 2 | Sayfa başlığı ve açıklaması | KISMİ | app/admin/menu-groups/page.tsx:122-125 | Sabit Türkçe metin, `t()` kullanılmıyor. EN locale'de bile Türkçe görünüyor; kardeş sayfa i18n'li (sidebar-order/page.tsx:105-107). |
| 3 | Kaydet butonu | ÇALIŞIYOR | page.tsx:127-129, 92-114 | Yalnız AKTİF rolü gönderiyor (page.tsx:95-100). Diğer sekmedeki düzenlemeler kaydedilmiyor ve bu söylenmiyor. |
| 4 | "Kaydediliyor…" durumu / çift tıklama kilidi | ÇALIŞIYOR | page.tsx:31, 93, 127-128 | |
| 5 | Rol sekmeleri (Müşteri / Bayi) | ÇALIŞIYOR | page.tsx:132-136 | Sekme metinleri sabit TR. |
| 6 | Admin menüsü için gruplama | EKSİK | sidebar.tsx:146-150 (`admin: []`), api/settings/sidebar-groups/route.ts:16 | Admin menüsünde ~70 düz öğe var (sidebar.tsx:159-232) ve hiç grup yok; bilgi mimarisi açısından en çok grup gereken menü burası. |
| 7 | İlk veri yükleme (GET) | KISMİ | page.tsx:36-57 | `cancelled` koruması doğru. `res.ok` kontrolü yok, hata `.catch(() => {})` ile yutuluyor (page.tsx:52). |
| 8 | Yükleniyor göstergesi | EKSİK | page.tsx:30, 127 | `loading` yalnız Kaydet'i kilitliyor. Form varsayılanlarla dolu ve düzenlenebilir görünüyor; GET dönünce kullanıcının erken yaptığı düzenlemeler eziliyor (page.tsx:43-50). |
| 9 | Yükleme hatası durumu | BOZUK | page.tsx:41, 52-53 | Hata ya da `success:false` gelince sayfa kod varsayılanlarını "kayıtlı ayar" gibi gösteriyor ve Kaydet açılıyor. Ayrıntı Bulgu 1'de. |
| 10 | Grup adı düzenleme (her grup için input) | ÇALIŞIYOR | page.tsx:146-155, 84-85 | |
| 11 | Varsayılan adın placeholder olarak gösterimi | ÇALIŞIYOR | page.tsx:152 | Input'un `value`'su da varsayılan metinle dolu (page.tsx:60-61); hangi grubun özelleştirildiği anlaşılmıyor. |
| 12 | Grup adını boşaltınca varsayılana dönme | KISMİ | page.tsx:97 (boşlar filtreleniyor) | Arayüzde açıklanmıyor. Boşaltılan grup, öğe `<select>`'lerinde boş seçenek olarak görünüyor (page.tsx:60-61 `??` boş string'i geçirmiyor, page.tsx:183). |
| 13 | Grup adı uzunluk sınırı | KISMİ | api/admin/settings/sidebar-groups/route.ts:19 (`max(60)`) | İstemcide `maxLength` yok. 61+ karakter, hangi alanın hatalı olduğunu söylemeyen genel bir "Geçersiz grup payload" hatası döndürüyor (route.ts:62). |
| 14 | Grup adının çok dilli olması | BOZUK | page.tsx:61, 97; sidebar.tsx:471-472; lib/sidebar-groups-settings.ts:17-18 | Override tek bir düz metin ve tüm dillerde aynen gösteriliyor. Ayrıntı Bulgu 2'de. |
| 15 | Öğe → grup atama listesi | ÇALIŞIYOR | page.tsx:164-191, 87-90 | Liste kod dizisi sırasında; admin'in kaydettiği sıra (`sidebarNavOrder`) yansımıyor. |
| 16 | "Üst düzey (grupsuz)" seçeneği | ÇALIŞIYOR | page.tsx:180; sidebar.tsx:481-484 (`'' → undefined`) | |
| 17 | Seçeneklerde canlı grup adı | ÇALIŞIYOR | page.tsx:181-185 | Grup adı değişince seçeneklerdeki metin anında güncelleniyor. |
| 18 | Öğe etiketleri ve ikonları (i18n) | ÇALIŞIYOR | page.tsx:116, 172-173 | |
| 19 | `grouped` hesaplaması (grup bazlı görünüm) | SAHTE / ölü kod | page.tsx:69-82 | Hesaplanıyor ama JSX'te hiç kullanılmıyor; `exhaustive-deps` uyarısı da bastırılmış. Yarım kalmış bir "gruplara göre görünüm" girişimine benziyor. |
| 20 | Başarı toast'ı | ÇALIŞIYOR | page.tsx:108 | Sabit TR. |
| 21 | Hata toast'ı | KISMİ | page.tsx:106-110 | 500'de gövde JSON olmayabilir; bu durumda `res.json()` patlıyor ve kullanıcı "Unexpected token…" gibi İngilizce teknik bir mesaj görüyor. |
| 22 | Sunucu doğrulaması (zod + normalize) | KISMİ | route.ts:18-26; lib/sidebar-groups-settings.ts:29-59 | Şekil ve uzunluk doğrulanıyor. Grup ve öğe anahtarlarının katalogda olup olmadığı doğrulanmıyor (`itemGroups` değeri herhangi bir string olabilir). |
| 23 | Yetki (ADMIN) | ÇALIŞIYOR | proxy.ts:51, 79; route.ts:29, 43 | Proxy gate'i ve route'taki `requireAuth(['ADMIN'])` birlikte uygulanıyor. |
| 24 | Rate limit | KISMİ | route.ts:45-57; lib/rate-limit.ts:12, 303-318 | Bellek içi `Map` kullanıyor; serverless'ta her instance'ın kendi sayacı var. Admin ucu için kabul edilebilir. |
| 25 | Audit log (eski/yeni değer) | ÇALIŞIYOR | route.ts:88-98 | Upsert ile aynı transaction'da değil (route.ts:78-98). |
| 26 | Runtime'da sidebar'a uygulanma | ÇALIŞIYOR | api/settings/sidebar-groups/route.ts:20-34; sidebar.tsx:363-382, 466-505 | Rol bazlı ve yalnız çağıranın rolü döndürülüyor (IDOR yok). Redis önbelleği yok. |
| 27 | Değişikliklerin canlı önizlemesi | EKSİK | — | Bir öğeyi taşımak grubun menüdeki konumunu da değiştirebiliyor (sidebar.tsx:463-467), ama admin bunu göremiyor. |
| 28 | Kaydedilmemiş değişiklik (dirty) göstergesi / çıkış uyarısı | EKSİK | — | `beforeunload` yok, sekme başına dirty rozeti yok. |
| 29 | Varsayılana sıfırla (öğe/grup/rol bazında) | EKSİK | — | |
| 30 | "Özelleştirildi" işareti / varsayılandan fark | EKSİK | — | |
| 31 | Eşzamanlı düzenleme koruması | EKSİK | route.ts:37, 101 `updatedAt` dönüyor; page.tsx kullanmıyor | Son yazan kazanıyor. |
| 32 | Arama / filtre (öğe veya grup) | EKSİK | — | Müşteri tarafında ~30 öğe var; tarama zahmetli. |
| 33 | Görünürlük / modül durumunun gösterimi | EKSİK | sidebar.tsx:422-439 | Modülü kapalı ya da gizli öğeler de listede, normal öğelerden ayırt edilemiyor. |
| 34 | Grup ekleme / silme / ikon değiştirme / grup sırası | EKSİK | lib/sidebar-groups-settings.ts:4-9 | Grup kataloğu kodda sabit. |
| 35 | Sürüm geçmişi / geri alma | EKSİK (sayfada) | api/admin/settings/rollback/route.ts | Genel audit rollback ucu var ama bu sayfadan erişilemiyor. İlk oluşturmadaki `JsonNull` eski değerin geri alınabilirliği doğrulanmadı. |
| 36 | Mobil yerleşim | KISMİ (doğrulanmadı) | page.tsx:145, 170-186 | Grup kartı `sm:grid-cols-2` ile uyumlu. Öğe satırında etiket ile `<select>` yan yana ve `min-w-0`/`w-full` yok; dar ekranda sıkışma ihtimali var. |
| 37 | Erişilebilir etiketler | KISMİ | page.tsx:149-153, 175-179 | Input ve `<select>`'lerde `<label>` ya da `aria-label` yok; ekran okuyucu "düzenleme alanı, Kartım" ya da yalnız seçili değeri okuyor. |
| 38 | Azaltılmış hareket desteği | ÇALIŞIYOR (gerekmiyor) | — | Sayfada animasyon yok. |

**Sayım:** 38 özellik. ÇALIŞIYOR 15 · KISMİ 10 · BOZUK 2 · SAHTE 1 · EKSİK 10

---

## Bulgular

### 1. Yükleme hatası yutuluyor ve kayıt önceki override'ları sessizce siliyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / hata yönetimi · **Efor:** S
- **Kanıt:** app/admin/menu-groups/page.tsx:38-53 (`r.json()` öncesinde `res.ok` kontrolü yok, `if (!data?.success) return`, `.catch(() => {})`, `finally` her durumda `setLoading(false)`); page.tsx:95-99 (aktif rolün TÜM state'i gönderiliyor); api/admin/settings/sidebar-groups/route.ts:72-75 (verilen rolün payload'ı öncekini "tamamen" değiştiriyor).
- **Sorun:** GET geçici bir Neon hatası, oturum süresinin dolması ya da 5xx yüzünden başarısız olursa sayfa hata göstermiyor. Kod varsayılanlarını kayıtlı ayar gibi gösteriyor ve Kaydet açılıyor. Admin tek bir öğeyi değiştirip kaydettiğinde o rolün daha önce kaydedilmiş bütün grup adları ve atamaları siliniyor. Audit log'da eski değer duruyor, yani kurtarılabilir; ama admin'in bundan haberi olmuyor.
- **Öneri:** Yükleme state'ini `idle | loading | ready | error` olarak modelleyin. `error` durumunda formu kilitleyin, "Ayarlar yüklenemedi, tekrar dene" bandı gösterin (sidebar-order/page.tsx:51-66 bu deseni kısmen uyguluyor) ve Kaydet'i yalnız `ready` iken açın. Sunucu tarafında GET'in döndürdüğü `updatedAt`'i PUT'ta `baseUpdatedAt` olarak isteyin; uyuşmazsa 409 dönün (bkz. Bulgu 6). Böylece bayat ya da boş bir state ile üstüne yazma iki katmanda engellenir.

### 2. Grup adı override'ı tek dilli: çok dilli menüyü bozuyor
- **Önem:** yüksek · **Kategori:** i18n / veri modeli · **Efor:** M
- **Kanıt:** lib/sidebar-groups-settings.ts:6, 17-18 ("i18n yerine düz metin"); sidebar.tsx:471-472 (override varsa `t()` hiç çağrılmıyor); messages/en.json:2445-2459 (EN grup adları mevcut); lib/app-locale.tsx (TR/EN locale desteği).
- **Sorun:** Admin "Ödüller & Mağaza" grubunu "Ödül Dünyası" yaptığında İngilizce kullanan müşteri de "Ödül Dünyası" görüyor. Başka bir yol daha var: admin bir input'a dokunup metni varsayılanla aynı bırakırsa, o metin override olarak donuyor (page.tsx:97 varsayılanla aynı olan değeri ayıklamıyor). Sonrasında yapılan i18n güncellemeleri o gruba hiç ulaşmıyor.
- **Öneri:** Veri modelini `groupLabels: Record<groupKey, Partial<Record<Locale, string>>>` yapın. Sayfada her grup için TR/EN yan yana iki alan gösterin; boş dil alanı o dilin i18n varsayılanına düşsün. Sidebar `groupLabelsOverride[g.key]?.[locale] ?? t(...)` ile çözsün. Normalize fonksiyonunda eski düz string şeklini `{ tr: value }`'ya taşıyan geriye uyumlu bir migrasyon yazın. Kayıt sırasında i18n varsayılanıyla birebir aynı olan değerleri override olarak saklamayın.

### 3. Aynı "sol menü" yapılandırması üç ayrı sayfaya bölünmüş ve tutarsız
- **Önem:** orta · **Kategori:** bilgi mimarisi · **Efor:** L
- **Kanıt:** Sıra `/admin/sidebar-order` (sidebar.tsx:200), grup `/admin/menu-groups` (sidebar.tsx:201), görünürlük `/admin/settings` (app/admin/settings/settings-client.tsx, `menuVisibility`); ayrıca `/admin/modules` ve `/admin/features` da sidebar filtresine giriyor (sidebar.tsx:422-439). Sidebar bu ayarları 3-4 ayrı istekle birleştiriyor (sidebar.tsx:346-417).
- **Sorun:** Sıra, grup ve görünürlük birbirini etkiliyor: grubun konumu, ona ait ilk öğenin sıradaki yeriyle belirleniyor (sidebar.tsx:463-467). Admin bir sayfada öğeyi taşıyor, ama sonucu ancak diğer sayfadaki sırayla birlikte ve sidebar'a bakarak anlayabiliyor. Ayrıca iki sayfa farklı tasarım ve i18n standardında: sidebar-order hero, i18n, loading ve reload sunuyor; menu-groups hiçbirini sunmuyor.
- **Öneri:** Bu sayfayı ve sidebar-order'ı tek bir "Navigasyon Stüdyosu"nda (`/admin/navigation`) birleştirin. Rol sekmesi altında grup kartları ve grupsuz öğeler yer alsın. Öğeler gruplar arasında ve grup içinde sürüklenerek taşınsın (sıra + grup tek hareket). Grup başlığı yerinde düzenlensin, görünürlük anahtarı satırın üzerinde dursun. Sağda canlı sidebar önizlemesi olsun. API'de tek bir `GET/PUT /api/admin/settings/navigation` iki anahtarı tek transaction'da yazsın; runtime için de tek bir `GET /api/settings/navigation` olsun (bkz. Bulgu 9).

### 4. Önizleme yok; grup konumunun yan etkisi görünmüyor
- **Önem:** orta · **Kategori:** UX · **Efor:** M
- **Kanıt:** sidebar.tsx:463-467, 478-505 (blok sırası = gruba düşen ilk öğenin konumu); page.tsx:166 (liste kod sırasında, `applySidebarOrder` uygulanmıyor).
- **Sorun:** Örneğin listenin başındaki "Kartım" öğesini "Oyunlar" grubuna taşımak, Oyunlar grubunu menünün en üstüne çıkarıyor. Admin bu sonucu ancak bir müşteri hesabıyla giriş yapınca fark edebiliyor.
- **Öneri:** Sidebar'ın blok oluşturma mantığını (sidebar.tsx:474-505) saf bir fonksiyon olarak çıkarın (`buildNavBlocks(items, order, groupOverride, visibility)`, örn. `lib/nav/build-nav-blocks.ts`). Hem runtime sidebar hem editör bunu kullansın. Editörün sağına, mevcut `Sidebar` görünümünün salt-okunur ve küçültülmüş bir kopyasını koyun (sticky, masaüstünde 280px, mobilde "Önizleme" sekmesi). Yeni konuma geçen grubu kısa bir `layout` animasyonuyla (framer-motion `m` + `layout`, `useReducedMotion` ile kapatılabilir) vurgulayın.

### 5. Kaydet yalnız aktif sekmeyi kaydediyor; değişiklik durumu görünmüyor
- **Önem:** orta · **Kategori:** UX / veri kaybı riski · **Efor:** S
- **Kanıt:** page.tsx:95-100 (`[role]` dışında hiçbir şey gönderilmiyor); page.tsx'de dirty takibi ve `beforeunload` yok.
- **Sorun:** Admin Müşteri sekmesinde düzenleme yapıp Bayi sekmesine geçiyor ve orada Kaydet'e basıyor. "Kaydedildi" toast'ı geliyor ama müşteri değişiklikleri kaydedilmemiş durumda; sayfadan çıkınca kayboluyor.
- **Öneri:** Yüklenen payload'ın bir kopyasını `baseline` olarak saklayın ve rol başına `isDirty`'i türetin. Sekme etiketlerinde nokta rozeti gösterin. Kaydet her iki rolün değişikliklerini tek PUT'ta göndersin (API zaten kısmi rol kabul ediyor; route.ts:23-26). Dirty iken alta yapışkan bir "N değişiklik · Vazgeç · Kaydet" çubuğu (Linear/Stripe ayar deseni) ve `beforeunload` uyarısı ekleyin.

### 6. Eşzamanlı düzenlemede son yazan kazanıyor
- **Önem:** orta · **Kategori:** veri bütünlüğü · **Efor:** S
- **Kanıt:** route.ts:67-86 (okuma ve upsert arasında sürüm kontrolü yok); route.ts:37 `updatedAt` dönüyor ama page.tsx:40-50 kullanmıyor.
- **Sorun:** İki admin aynı rolü düzenlerse ikincisinin kaydı, ilkinin değişikliklerini haber vermeden siliyor.
- **Öneri:** PUT gövdesine `baseUpdatedAt` ekleyin; sunucu `existing.updatedAt` ile karşılaştırıp uyuşmazlıkta 409 ve güncel payload dönsün. İstemci "Bu ayar sen düzenlerken değişti" diyalogunda farkı gösterip "Benimkini uygula / Yeniden yükle" seçeneği sunsun.

### 7. Hata yönetimi: sarmalanmamış DB çağrıları ve teknik İngilizce toast
- **Önem:** orta · **Kategori:** hata yönetimi / dil karışıklığı · **Efor:** S
- **Kanıt:** route.ts:28-40 ve 42-104 içinde try/catch yok (rollback route'u sarmalıyor: api/admin/settings/rollback/route.ts:19); page.tsx:106 `await res.json()` koşulsuz; page.tsx:110 `e.message`.
- **Sorun:** Prisma hatası Next'in genel 500 yanıtına düşüyor; istemci JSON parse edemiyor ve kullanıcıya "Unexpected token '<'…" benzeri İngilizce teknik bir metin gösteriliyor. Upsert ile audit log ayrı yazıldığı için audit kaydı başarısız olursa ayar değişmiş ama izi kalmamış oluyor (route.ts:78-98).
- **Öneri:** Route'ları try/catch ile sarın ve hep `{ success:false, error:'<TR mesaj>' }` JSON'u dönün. Upsert ile `auditLog.create`'i `prisma.$transaction` içine alın. İstemcide `res.headers.get('content-type')` kontrolüyle güvenli bir parse yazın ve hata metinlerini i18n anahtarlarından alın. zod hatasında `issues[0].path` ile hangi alanın geçersiz olduğunu döndürüp ilgili input'u kırmızıya boyayın.

### 8. Grup ve öğe anahtarları katalogla doğrulanmıyor; varsayılanla aynı atamalar dondurulup saklanıyor
- **Önem:** düşük · **Kategori:** mimari / drift · **Efor:** M
- **Kanıt:** route.ts:19-20 (anahtar ve değer serbest string); page.tsx:98 (`itemGroups: assign[role]`, varsayılanla aynı olan girdiler de gönderiliyor); sidebar.tsx:485-488 (bilinmeyen grup sessizce üst düzeye düşüyor).
- **Sorun:** Bir geliştirici koddaki bir grubu yeniden adlandırır ya da kaldırırsa DB'deki override'lar öğeleri sessizce grupsuz bırakıyor. Admin bir öğenin grubunu değiştirip eski hâline döndürdüğünde bile o değer override olarak kalıyor ve gelecekte koddaki varsayılan değişse de onu ezmeye devam ediyor.
- **Öneri:** `NavItem`/`NavGroup` kataloğunu istemci bileşeninden (`components/dashboard/sidebar.tsx`) ikon içermeyen, paylaşılan bir `lib/nav/catalog.ts`'e taşıyın; ikonları anahtar → bileşen haritasıyla istemcide bağlayın. Sunucu zod şemasını bu katalogdan üretin (`z.enum(groupKeys)`). Kayıtta yalnız varsayılandan farklı olan girdileri saklayın. Editörde "artık var olmayan grup/öğe" uyarısı ve tek tıkla temizleme sunun.

### 9. Runtime okuması her sidebar mount'unda önbelleksiz DB sorgusu
- **Önem:** düşük · **Kategori:** performans · **Efor:** S
- **Kanıt:** api/settings/sidebar-groups/route.ts:27-30 (her istekte `prisma.settings.findUnique`); sidebar.tsx:363-382 (`cache: 'no-store'`); aynı desen sidebar-order (sidebar.tsx:346-361) ve visibility (sidebar.tsx:394) için de tekrarlanıyor.
- **Sorun:** Her bayi ve müşteri oturumunda ve her layout mount'unda 3 ayrı ağ isteği ve 3 DB okuması yapılıyor; değerler ise nadiren değişiyor. Sidebar ilk boyamada kod varsayılanıyla çiziliyor, override gelince yeniden düzenleniyor (kısa bir layout sıçraması). Bu son nokta görsel olarak doğrulanmadı.
- **Öneri:** Üç ayarı tek bir `GET /api/settings/navigation?role=` ucunda birleştirin ve Upstash Redis'te (projede 9 yolda kullanılan cache deseniyle) kısa TTL ile önbelleğe alın; PUT'ta invalidate edin. Daha iyisi, layout sunucu bileşeninde okuyup `Sidebar`'a prop olarak geçirin; ilk boyama doğru gelir ve istemci isteğine gerek kalmaz.

### 10. Ölü kod: kullanılmayan `grouped` hesaplaması
- **Önem:** düşük · **Kategori:** kod kalitesi · **Efor:** S
- **Kanıt:** page.tsx:69-82 (sonuç JSX'te kullanılmıyor, `eslint-disable-next-line react-hooks/exhaustive-deps` ile susturulmuş).
- **Sorun:** Her render'da boşuna hesaplanıyor ve okuyucuyu bir "gruplu görünüm" varmış gibi yanıltıyor. Bastırılan uyarı `effectiveGroup` kapanışının bağımlılık eksikliğini gizliyor.
- **Öneri:** Kaldırın ya da gerçek bir "gruplara göre görünüm" için kullanın (bkz. Yeniden tasarım vizyonu). Kullanılacaksa ortak `buildNavBlocks` fonksiyonuyla değiştirin.

### 11. Erişilebilirlik: etiketsiz form kontrolleri
- **Önem:** düşük · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** page.tsx:149-153 (`Input` için `<Label>` ya da `aria-label` yok), page.tsx:175-179 (`<select>` etiketsiz).
- **Sorun:** Ekran okuyucu ~40 adet "açılır kutu" okuyor ama hangi öğeye ait olduklarını söylemiyor. Native `<select>`, shadcn `Select` dilinden de kopuk.
- **Öneri:** Her satırı `<Label htmlFor>` ile bağlayın ya da `aria-label={\`${itemLabel(it)} grubu\`}` ekleyin. Grup input'una `aria-label={\`${varsayılan ad} grup adı\`}` verin. Önerilen sürükle-bırak tasarımında klavye alternatifi (`@dnd-kit` klavye sensörü veya "Gruba taşı" menüsü) ve `aria-live` duyurusu ("Rozetler, Oyunlar grubuna taşındı") ekleyin.

### 12. Görsel ve metin tutarsızlığı
- **Önem:** düşük · **Kategori:** görsel tutarlılık / i18n · **Efor:** S
- **Kanıt:** page.tsx:122-136, 143, 162, 180, 108, 128 (sabit TR metin); sidebar-order/page.tsx:104-122 (`AdminPremiumHero` + i18n); sidebar.tsx:198 ve 201 (aynı `LayoutTemplate` ikonu).
- **Sorun:** Kardeş sayfayla farklı başlık dili kullanılıyor, EN admin Türkçe metin görüyor ve menüde iki giriş aynı ikonla gösteriliyor.
- **Öneri:** Birleştirme yapılmayacaksa bile `AdminPremiumHero` ile bir `adminMenuGroups.*` i18n ad alanına geçin ve menü girişine ayırt edici bir ikon (ör. `FolderTree`) verin.

---

## Eksik özellikler (kıyas ürünlerle)

1. **Canlı önizleme:** Retool ve Stripe'ın navigasyon/branding ayarlarında değişiklik anında önizlenir. Bu sayfada sonuç ancak başka bir hesaba giriş yapınca görülüyor.
2. **Sürükle-bırak gruplama + sıra (tek yüzey):** Linear'ın sidebar özelleştirmesi ve Notion'ın teamspace düzeni gibi. Şu an sıra ve grup iki ayrı sayfada.
3. **Varsayılana sıfırla + "özelleştirildi" işareti + fark (diff) görünümü:** PostHog ve Stripe ayarlarında standart.
4. **Sürüm geçmişi ve tek tıkla geri alma:** Audit ve rollback altyapısı var (api/admin/settings/rollback/route.ts) ama bu sayfaya bağlı değil.
5. **Grup yaşam döngüsü:** Yeni grup oluşturma, silme, ikon seçme, grup sırasını belirleme, "varsayılan açık/kapalı" ayarı.
6. **Segment/rol hedefli menü:** Örneğin yalnız belirli bayi segmenti ya da planı için farklı gruplama; kademeli yayılım (PostHog feature flag mantığı). Ayrıca admin menüsünün de gruplanabilmesi.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Navigasyon Stüdyosu". Admin, bayi ya da müşteri menüsünü gerçekte göründüğü biçimde düzenlesin, sonucu anında görsün ve yayınlamadan önce farkı incelesin.

**Yerleşim (masaüstü):**
- **Üst çubuk:** Rol segment kontrolü (Admin · Bayi · Müşteri; her birinde dirty noktası), arama kutusu ("öğe veya grup ara"), "Geçmiş" düğmesi (audit tabanlı sürüm listesi + geri al).
- **Sol (ana) kolon, yapı ağacı:** Grupsuz öğeler ve grup kartları gerçek runtime sırasında listelenir. Her grup kartında yerinde düzenlenebilir başlık (TR/EN), ikon seçici, "varsayılan açık" anahtarı, öğe sayısı ve "özelleştirildi" rozeti olur. Öğeler grup içinde ve gruplar arasında sürüklenir. Her satırda görünürlük anahtarı, modül kapalıysa "Modül kapalı" etiketi ve "Gruba taşı ▾" menüsü (klavye ve mobil alternatifi) bulunur.
- **Sağ kolon (sticky), canlı önizleme:** Ortak `buildNavBlocks` ile çizilmiş küçültülmüş sidebar; locale değiştirici (TR/EN) ile her iki dilde nasıl göründüğü denetlenebilir.
- **Alt yapışkan çubuk:** "N değişiklik · Farkı gör · Vazgeç · Yayınla". "Farkı gör", varsayılandan ve son kayıttan farkı listeleyen bir sheet açar.
- **Mobil:** Yapı ağacı tam genişlikte; önizleme ayrı sekmede. Sürükle-bırak yerine "Gruba taşı" ve yukarı/aşağı düğmeleri.

**Motion (ölçülü):** Öğe taşınınca framer-motion `m` + `layout` / `LayoutGroup` ile 150-200 ms'lik bir konum geçişi ve önizlemede ilgili satırın kısa bir vurgu halkası yeterli. `useReducedMotion` ile tamamen anlık geçişe düşülmeli. Bu bir yapılandırma aracı; 3D ya da dekoratif animasyon gereksiz ve dikkat dağıtır.

**Veri / API değişiklikleri:**
- Katalog: `lib/nav/catalog.ts` (ikonsuz, sunucu ve istemcide paylaşılan); `components/dashboard/sidebar.tsx` buradan okur.
- Saf fonksiyon: `lib/nav/build-nav-blocks.ts`. Sidebar ve önizleme bunu kullanır; birim testi yazılabilir.
- Ayar modeli: tek `Settings.key = 'navigationConfig'` → `{ [role]: { order: string[], groups: { [key]: { labels: {tr?,en?}, icon?, defaultOpen? } }, itemGroups: { [id]: groupKey|'' }, hidden: string[] }, version }`. Eski `sidebarNavOrder` ve `sidebarNavGroups` anahtarlarından tek seferlik okunarak migre edilir; geçiş süresince eski anahtarlar da okunur.
- `GET/PUT /api/admin/settings/navigation`: zod şeması katalogdan türetilir, `baseUpdatedAt` ile iyimser kilit uygulanır (409), yazma + audit tek `$transaction`'da yapılır, yanıtlar hep JSON olur.
- `GET /api/settings/navigation`: Upstash Redis'te önbelleklenir, PUT'ta invalidate edilir. Tercihen layout sunucu bileşeninde okunup `Sidebar`'a prop olarak geçirilir; böylece ilk boyamadaki sıçrama ve 3 ayrı istek ortadan kalkar.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/sidebar-order`:** Doğrudan kardeş sayfa. Aynı katalog, aynı rol sekmeleri, aynı "sol menüyü düzenle" amacı; tek fark sıra ile grup. Grup konumu sıradan türediği için (sidebar.tsx:463-467) ikisi ayrı ayrı anlamlı biçimde düzenlenemiyor. **Birleştirilmeli.**
- **`/admin/settings` (menü görünürlüğü, `menuVisibility`):** Aynı öğelerin göster/gizle durumu burada yönetiliyor. Navigasyon Stüdyosu'na satır üstü anahtar olarak taşınmalı ya da en azından oradan bu ayara derin bağlantı verilmeli.
- **`/admin/modules` ve `/admin/features`:** Öğeleri dolaylı olarak gizliyor (sidebar.tsx:428-438). Bunlar ürün kapsamlı anahtarlar oldukları için birleştirilmemeli, ama stüdyoda "Modül kapalı olduğu için gizli → Modüllere git" bağlantısıyla salt-okunur gösterilmeli.
- **Sonuç:** `/admin/menu-groups` ve `/admin/sidebar-order` tek bir `/admin/navigation` sayfasında birleşmeli; eski iki rota buraya yönlendirilmeli (`redirect`). Admin menüsündeki iki giriş (sidebar.tsx:200-201) tek girişe indirilmeli.

---

## Doğrulama (şüpheci inceleme)

### 1. "Başarısız GET sonrası Kaydet, rolün mevcut menü grup override'larını sessizce siliyor" — **Karar: doğrulandı** (önem: YÜKSEK yerine ORTA önerilir)

**Kod okuması (zincir baştan sona doğrulandı):**
- `app/admin/menu-groups/page.tsx:38-39`: `fetch(...).then((r) => r.json())` öncesinde `r.ok` kontrolü yok.
- `page.tsx:41`: `!data?.success` ise sessizce `return`; state başlangıç değeri olan `{ dealer: {}, customer: {} }` (page.tsx:33-34) kalıyor.
- `page.tsx:52-53`: `.catch(() => {})` hatayı yutuyor, `finally` her durumda `setLoading(false)` yapıyor → `page.tsx:127` Kaydet düğmesi etkinleşiyor. Ekranda hata/uyarı yok; inputlar `t()` varsayılan başlıklarını, select'ler `item.groupKey` varsayılanlarını gösteriyor (page.tsx:60-67), yani "kayıtlı ayar yok" ile "yüklenemedi" ayırt edilemiyor.
- `page.tsx:95-99`: aktif rol için `labels[role]` ve `assign[role]` (yalnızca bu oturumda dokunulanlar) tam payload olarak gönderiliyor.
- `app/api/admin/settings/sidebar-groups/route.ts:73-76`: `merged[role] = parsed.data[role]` — verilen rolün nesnesi birleştirilmiyor, tamamen değiştiriliyor. Ardından `upsert` (route.ts:78-86) kalıcı yazıyor.
- GET başarısızlık yolları: `requireAuth` hatası (lib/api-auth.ts:58-77) `{ error }` JSON döner, `success` alanı yok → page.tsx:41 sessiz return. `prisma.settings.findUnique` (route.ts:31) fırlatırsa try/catch yok → Next.js 500 (JSON olmayan gövde) → `r.json()` fırlatır → page.tsx:52 yutar.

**Yeniden üretim senaryosu:**
1. Kayıtlı durum: `customer.itemGroups = { A: 'g1', B: '' }`, `customer.groupLabels = { g1: 'Kampanyalar' }`.
2. Admin `/admin/menu-groups` açar; GET sırasında Neon soğuk başlangıç/zaman aşımı → route.ts:31 fırlatır → 500.
3. Sayfa hatasız açılır, varsayılanları gösterir. Admin yalnızca C öğesini 'g2'ye taşıyıp Kaydet'e basar (bu anda DB tekrar erişilebilir).
4. PUT gövdesi `{ customer: { groupLabels: {}, itemGroups: { C: 'g2' } } }` → route.ts:75 müşteri rolünü bununla değiştirir. A ve B atamaları ile "Kampanyalar" başlığı kaybolur; tüm müşterilerin sol menüsü varsayılana döner. "Menü grupları kaydedildi." toast'ı görünür (page.tsx:108).

**Sınırlamalar / iddianın abartılı kısımları:**
- "Oturum düşmesi" senaryosu zayıf: oturum düşmüşse PUT da aynı `requireAuth` ile 401/403 alır ve hata toast'ı görünür (page.tsx:107-110); veri yazılmaz. Gerçek tetikleyici, GET'te geçici DB/ağ hatası olup PUT anında düzelmiş olmasıdır.
- Kayıp, `auditLog.oldData` (route.ts:94) içinde tam olarak duruyor; elle kurtarılabilir. Etki: yalnızca aktif rol, yalnızca görsel menü gruplaması (yetki/veri sızıntısı yok). Bu nedenle KRİTİK değil, ORTA önem daha isabetli.
- İki admin arasında sessiz üstüne yazma: doğrulandı (route.ts:67-86'da `updatedAt`/sürüm karşılaştırması yok; GET `updatedAt` döndürüyor ama istemci kullanmıyor, page.tsx:40). Ancak aynı rolü eşzamanlı düzenleyen iki admin gerektirdiği için olasılığı düşük.

**Önerilen düzeltme (ürün seviyesi):**
- İstemci: yükleme durumunu `'loading' | 'ready' | 'error'` olarak modelle; `!r.ok` veya `!data.success` durumunda hata durumuna geç, içerik yerine "Ayarlar yüklenemedi — Tekrar dene" paneli göster ve Kaydet'i `status !== 'ready'` iken devre dışı bırak. Böylece varsayılanlar asla kayıtlı ayar gibi sunulmaz.
- Sunucu: PUT gövdesine `baseUpdatedAt` ekle; mevcut satırın `updatedAt` değeri farklıysa 409 dön (iyimser kilit). İstemci GET'ten aldığı `updatedAt`'ı saklayıp gönderir; 409'da "Başka bir admin değiştirdi, yeniden yükle" diyaloğu gösterir. Okuma + yazma + audit tek `prisma.$transaction` içinde yapılmalı.
- GET handler'ını try/catch ile sar, her durumda `{ success: false, error }` JSON döndür (yanıt sözleşmesi tutarlı olsun).
- İsteğe bağlı: PUT'u "rolün tam durumu" yerine yalnızca değişen anahtarların farkı (patch) olarak tasarlamak, kısmi yükleme hatalarında kaybı yapısal olarak engeller.
