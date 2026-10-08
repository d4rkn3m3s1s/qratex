# /admin/ekip/departmanlar

**Amaç:** İç ekip modülünün organizasyon katmanı: departman oluşturma/silme, platform kullanıcılarını ekibe ekleme/çıkarma, üyelere çoklu departman ve ekip rolü (Yönetici / Üye) atama. Aynı bileşen `/customer/ekip/departmanlar` altında da çalışır (çift panel).

**Genel puan:** 5,0 / 10 · **Karar:** yeniden tasarla (sayfa yerinde kalmalı ama "departman yönetimi" ile "üye/erişim yönetimi" ayrıştırılmalı ve API katmanı sertleştirilmeli)

Dosya zinciri:
- `app/admin/ekip/departmanlar/page.tsx:1-5` → yalnızca `<TeamDepartments />` döndürür
- `components/team/team-departments.tsx` (347 satır, tüm mantık; `'use client'`)
- `app/customer/ekip/departmanlar/page.tsx` aynı bileşeni render eder; erişim kapısı `app/customer/ekip/layout.tsx:12-24`
- API: `app/api/admin/team/departments/route.ts` (GET/POST/DELETE), `app/api/admin/team/members/route.ts` (GET/POST/PUT/DELETE)
- Yetki: `lib/team-access.ts:11-34`; sayfa kapısı `proxy.ts:50-90` (ADMIN rolü + gizli kapı cookie'si)
- Prisma: `Department` (`prisma/schema.prisma:2828-2842`), `UserDepartment` (`:2846-2858`), `User.adminDepartment/adminTeamRole` (`:39-40`)

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Temel CRUD çalışıyor; ama departman düzenleme (ad/renk/açıklama/sıra/arşiv) yok, silme yetim veri bırakıyor, büyük harfli e-postalı kullanıcı eklenemiyor. |
| UX | 5/10 | İki panelli düzen anlaşılır; fakat onaysız yıkıcı aksiyonlar, sessiz hata yutma, yalnız hover ile görünen sil butonu ve "birincil departman"ın örtük olması güveni zayıflatıyor. |
| Görsel | 6/10 | Ortak `AdminPremiumHero` ve kart dili tutarlı; istatistik şeridi sade ama düz; renkli rozetlerde beyaz metin kontrastı zayıf. |
| Mimari | 4/10 | Tüm mantık tek istemci bileşeninde; API'ler işlem (transaction) kullanmıyor, slug'lar doğrulanmıyor, `/api/admin/*` uçları ADMIN olmayan ekip yöneticilerine açık ve tüm kullanıcı tabanını aratıyor. |
| Performans | 7/10 | GET iki paralel sorgu, veri küçük; her mutasyonda tam `load()` yeniden çekme ve arama yarışı dışında sorun yok. |
| Erişilebilirlik + Mobil | 4/10 | Departman sil butonu dokunmatikte ve klavyede görünmez, `+` butonunda `aria-label` yok, input etiketsiz, rozetlerde renk kontrastı WCAG altında. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota sarmalayıcı | ÇALIŞIYOR | `app/admin/ekip/departmanlar/page.tsx:3-5` | İnce sarmalayıcı; metadata (`title`) tanımlı değil, sekme başlığı yalnız "Admin" kalır. |
| 2 | Sayfa erişim kapısı (ADMIN + gizli kapı) | ÇALIŞIYOR | `proxy.ts:59-90` | Sayfa için doğru. API uçları ise bu kapının dışında (bkz. Bulgu 1). |
| 3 | Hero başlığı | ÇALIŞIYOR | `components/team/team-departments.tsx:154-160` | "Departmanlar & Roller"; azaltılmış hareketi destekliyor (`components/admin/admin-premium-hero.tsx:35`). |
| 4 | Yükleniyor durumu | ÇALIŞIYOR | `team-departments.tsx:162-165` | Tam sayfa spinner; iskelet (skeleton) yok, düzen kayması var. |
| 5 | Yükleme hata durumu | KISMİ | `team-departments.tsx:37-45` | Ağ hatasında toast var; `json.success === false` (403/500 JSON) olursa sessizce boş kalır ve "Henüz departman yok" + seed butonu gösterir; yanıltıcı. Tekrar dene yok. |
| 6 | İstatistik: Toplam Üye | ÇALIŞIYOR | `:146-149, :171` | |
| 7 | İstatistik: Yönetici | ÇALIŞIYOR | `:147, :172` | |
| 8 | İstatistik: Departman | ÇALIŞIYOR | `:149, :173` | |
| 9 | İstatistik: Departmansız | KISMİ | `:148, :174` + `app/api/admin/team/departments/route.ts:50` | Silinmiş departmanın slug'ı `adminDepartment`'ta kaldığında üye "departmanlı" sayılır. `stats.members` hesaplanıp hiç gösterilmiyor (`:149`, ölü kod). |
| 10 | Yeni departman input + Enter | KISMİ | `:191` | Enter, `savingDep` true iken de `addDepartment()` çağırır → çift POST mümkün. Etiket (`<label>`) yok. |
| 11 | Departman ekle butonu (+) | KISMİ | `:192`, `departments/route.ts:98-101` | `aria-label` yok. Sunucu `upsert` yapıyor: aynı slug'a düşen ad mevcut departmanı sessizce yeniden adlandırır ve açıklamasını `null`'a sıfırlar. |
| 12 | Departman listesi (renkli baş harf, ad, üye sayısı) | ÇALIŞIYOR | `:195-205` | `order` + `createdAt` sıralı (`departments/route.ts:32`). |
| 13 | Departman avatar yığını (+N) | ÇALIŞIYOR | `:206-216` | |
| 14 | Departman silme | KISMİ | `:126-130, :217-219`, `departments/route.ts:125-129` | Onay yok, hata yutuluyor (`.catch(() => {})`), `res.ok` kontrolü yok, başarı/başarısızlık bildirimi yok; buton `opacity-0 group-hover:opacity-100` → dokunmatikte ve klavyede görünmez. Görev/şablon/otomasyonlarda yetim slug bırakır (Bulgu 3). |
| 15 | Boş durum + "Varsayılan departmanları yükle (8)" | ÇALIŞIYOR | `:223-228`, `departments/route.ts:75-88` | İdempotent upsert; seed için audit log yazılmıyor. |
| 16 | Departman rengi seçme | EKSİK | API destekli: `departments/route.ts:19, 100-101` | UI renk göndermiyor; her yeni departman `#8b5cf6`. |
| 17 | Departman açıklaması | EKSİK | Tip: `team-departments.tsx:19`; API: `departments/route.ts:18` | Ne girilebiliyor ne gösteriliyor. |
| 18 | Departman yeniden adlandırma / düzenleme | EKSİK | — | Slug addan türediği için yeniden adlandırma = yeni departman. |
| 19 | Departman sıralama | EKSİK | `order` alanı: `schema.prisma:2834` | Yalnız seed'de set ediliyor. |
| 20 | Departman arşivleme (`isActive`) | EKSİK | `schema.prisma:2835`; okuyan tek yer `app/api/admin/team/ai/route.ts:61` | Alan var, hiçbir UI/API onu `false` yapmıyor. |
| 21 | "Üye Ekle" popover | KISMİ | `:238-270` | Yalnız `uye` rolüyle ve departmansız ekler. |
| 22 | Kullanıcı arama (250 ms debounce) | KISMİ | `:49-62` | `AbortController` yok → eski yanıt yenisini ezebilir; boş sorguda platformdan rastgele 20 kullanıcı listelenir (`members/route.ts:17-26`). |
| 23 | Arama durumları (Aranıyor / Bulunamadı / Aramak için yazın) | KISMİ | `:250-253` | Boş sorgu da sonuç döndürdüğü için "Aramak için yazın" pratikte görünmez; popover yeniden açıldığında önceki sonuçlar bir an görünür. |
| 24 | Aramadan ekleme (POST e-posta ile) | KISMİ | `:65-79`, `members/route.ts:65` | Sunucu `email.toLowerCase()` ile `findUnique` yapıyor; kayıt e-postayı küçültmüyor (`app/api/auth/register/route.ts:40-60`, `app/api/admin/users/route.ts:239-256`) → büyük harfli e-postalı kullanıcı aramada görünür ama eklenemez (404). |
| 25 | Eklerken departman/rol seçimi | EKSİK | `addMember(user, deptSlug?)` `:65`; çağrı `:255` | `deptSlug` parametresi hiç verilmiyor (ölü parametre). |
| 26 | Ekip üyeleri listesi | ÇALIŞIYOR | `:273-336`, `departments/route.ts:36-44` | `take: 200` sessiz sınır; sayfalama/uyarı yok. |
| 27 | Rol değiştirme (Yönetici/Üye) | ÇALIŞIYOR | `:101-111, :286-292` | İyimser güncelleme + hata geri alma var. Kendini düşürme / son yöneticiyi düşürme koruması yok. |
| 28 | Ekipten çıkarma | KISMİ | `:81-85, :293-295`, `members/route.ts:144-156` | Onay yok, hata yutuluyor, bildirim yok; sunucu kullanıcı yoksa da `success: true` + audit döner. |
| 29 | Departman rozeti tıkla = çıkar | KISMİ | `:299-308, :88-99` | Replace-all PUT + işlemsiz `deleteMany/createMany` → hızlı ardışık tıklamalarda yarış (Bulgu 4). Rozet tıklanınca çıkıyor, geri al yok. |
| 30 | Departman ekle popover (çoklu seçim, ✓) | ÇALIŞIYOR | `:310-332` | |
| 31 | Birincil departman | KISMİ | `members/route.ts:72, 120` | Birincil = dizinin ilk elemanı (tıklama sırasına bağlı); UI'da ne gösteriliyor ne seçilebiliyor; ama AI/performans uçları bunu kullanıyor (`app/api/admin/team/performance/route.ts:21,59`, `ai/route.ts:62-65`). |
| 32 | Silinmiş departman "hayalet" rozeti | BOZUK | `departments/route.ts:50`, `team-departments.tsx:304-305` | Junction cascade ile silinir ama `adminDepartment` kalır → GET fallback'i silinmiş slug'ı döndürür, UI ham slug'ı mor rozetle gösterir. |
| 33 | Üye boş durumu | ÇALIŞIYOR | `:337-339` | |
| 34 | Üye listesinde arama / departman filtresi / sıralama | EKSİK | — | 200 üyeye kadar düz liste. |
| 35 | Toplu işlem (çoklu seçip departmana ata / rol ver) | EKSİK | — | |
| 36 | Değişiklik geçmişi görüntüleme | EKSİK | Audit yazılıyor: `departments/route.ts:104-113`, `members/route.ts:86-91` | Kimin kimi ne zaman yönetici yaptığı sayfada görünmüyor. |
| 37 | Pano'ya dönüş / breadcrumb | EKSİK | Gelen link: `components/team/team-board.tsx:697-699` (düz `<a>`, tam sayfa yenileme) | Bu sayfada geri bağlantı yok. |
| 38 | Yetkiye duyarlı arayüz (üye rolü) | EKSİK | Link herkese: `team-board.tsx:697`; bileşende `isManager` kontrolü yok | Customer ikizinde `uye` tüm yazma kontrollerini görür, hepsi 403 alır. |
| 39 | Toast metinleri | KISMİ | `lib/admin-toast.ts:17-20` | Ön ek "Basarili: " / "Dikkat: " → Türkçe karakter eksik ("Başarılı"); "Rol güncellendi" gibi mesajlarla birleşince "Basarili: Rol güncellendi". |
| 40 | Mobil yerleşim | KISMİ | `:169, :185, :277-298` | Grid kırılıyor; ama sil butonu dokunmatikte görünmez, rozet satırı `pl-12` ile dar ekranda sıkışık, popover `w-80` 400 px'de kenara dayanıyor. |
| 41 | Klavye / ekran okuyucu | KISMİ | `:192, :217, :191` | İkon butonlarının bir kısmında `aria-label` var; `+` butonunda yok; görünmez-ama-odaklanabilir sil butonu; rozetler renk + beyaz metin (kontrast < 3:1). |
| 42 | Azaltılmış hareket | ÇALIŞIYOR | `admin-premium-hero.tsx:35` | Sayfada framer-motion yok; yalnız spinner. |
| 43 | Sunucu tarafı audit log | KISMİ | `departments/route.ts:104-113, 125-128` | Seed'de log yok; silme başarısız olsa da "delete" logu yazılıyor (`.catch(() => null)` sonrası koşulsuz). |

**Özet:** 43 özellik · ÇALIŞIYOR 15 · KISMİ 16 · BOZUK 1 · SAHTE 0 · EKSİK 11

---

## Bulgular

### 1. Ekip yöneticisi (ADMIN olmayan) tüm platform kullanıcı tabanını arayıp e-posta + rol listeleyebiliyor
- **Önem:** yüksek · **Kategori:** güvenlik / gizlilik
- **Kanıt:** `app/api/admin/team/members/route.ts:12-28`; `lib/team-access.ts:12, 23-31`; `proxy.ts:105-119` (API yolları yalnız başlık ekler, rol/gizli kapı kontrolü yapmaz)
- **Sorun:** `GET /api/admin/team/members?q=` `requireTeamAccess({ manager: true })` ile korunuyor; `adminTeamRole === 'yonetici'` olan bir **CUSTOMER** bu kapıyı geçiyor. Sorgu ekipte olmayan TÜM kullanıcıları (bayiler, müşteriler, ADMIN hesapları) `name, email, image, role` ile döndürüyor; boş sorgu bile 20 kayıt veriyor, rate limit yok. `role` alanı ADMIN hesaplarını işaretlediği için hedefli oltalama listesi çıkarılabilir. "Admin" yolu altındaki bir uç, admin gizli kapısının hiçbir korumasından yararlanmıyor.
- **Öneri:** (a) Aday araması için ayrı, daraltılmış bir uç: en az 3 karakter zorunlu, sonuçta e-postayı maskele (`a***@alan.com`) ya da yalnız tam e-posta eşleşmesinde göster; `role` alanını döndürme. (b) ADMIN olmayan yöneticiler için aday havuzunu kısıtla (ör. yalnız CUSTOMER rolü, çünkü ekip arayüzü zaten yalnız `/customer` altında açılıyor) veya davet tabanlı akışa geç (e-posta ile davet → kullanıcı kabul eder). (c) `checkRateLimitDb` ile kullanıcı başına dakikalık sınır. (d) Uzun vadede `/api/admin/team/*` yerine `/api/team/*` ad alanı: "admin" ön ekli uçların ADMIN olmayanlara açık olması denetim ve log analizinde yanıltıcı.
- **Efor:** M

### 2. Üye PUT işlemsiz ve slug doğrulamasız: geçersiz/silinmiş slug kullanıcının TÜM departmanlarını siler
- **Önem:** yüksek · **Kategori:** veri bütünlüğü
- **Kanıt:** `app/api/admin/team/members/route.ts:39-48` (`deleteMany` → `createMany`, transaction yok), `:99, 118-120` (slug'lar yalnız `max(50)`), `prisma/schema.prisma:2853` (FK `departmentSlug → Department.slug`)
- **Sorun:** Bir yönetici rozet eklerken başka bir yönetici o departmanı silmişse (ya da istemci bayat listeyle gönderirse) `deleteMany` başarılı olur, `createMany` FK ihlaliyle patlar → yakalanmamış 500; kullanıcı tüm departman üyeliklerini kaybeder, `adminDepartment` ise güncellenmez (PUT `user.update`'e hiç ulaşmaz). Ayrıca iki eşzamanlı PUT'ta silme/ekleme adımları iç içe geçer; `skipDuplicates` nedeniyle sonuç iki isteğin birleşimi olur, UI'daki son durumla uyuşmaz.
- **Öneri:** `syncUserDepartments` + `user.update` + `auditLog.create` tek `prisma.$transaction` içinde; önce `department.findMany({ where: { slug: { in } } })` ile bilinmeyen slug'ları 400 ile reddet. API'yi replace-all yerine delta tasarla (`POST /members/:id/departments {slug}` / `DELETE ...`) — rozet tıklaması zaten tekil işlem; böylece yarış ortadan kalkar. İstemcide aynı üye için istekleri sıraya al (per-member promise kuyruğu) veya `If-Match`/`updatedAt` ile iyimser kilit.
- **Efor:** M

### 3. Departman silme onaysız ve yetim veri bırakıyor (görevler, şablonlar, otomasyonlar, birincil departman)
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / UX
- **Kanıt:** UI `components/team/team-departments.tsx:126-130, 217`; API `app/api/admin/team/departments/route.ts:125`; yetim alanlar `prisma/schema.prisma:2866` (`CompanyTask.department`), `:2925` (`TaskTemplate.department`), `:3015` (`TeamAutomation.department`), `:39` (`User.adminDepartment`); hayalet rozet `departments/route.ts:50` + `team-departments.tsx:304-305`
- **Sorun:** Tek tıkla, onaysız, geri alınamaz silme. Junction satırları cascade ile gider ama görevler/şablonlar/otomasyonlar düz string slug tuttuğundan "departmanı olmayan" hale gelir; Pano'daki departman filtresinde artık seçilemezler (yalnız "Tüm departmanlar" altında görünürler). Birincil departmanı silinen üye GET fallback'i yüzünden ham slug'lı mor "hayalet" rozetle görünür ve "Departmansız" sayacına girmez. Sunucu hatası yutulur ve buna rağmen "delete" audit logu yazılır.
- **Öneri:** Hedef deneyim: silme butonu → "Bu departmanda 4 üye, 23 açık görev, 2 otomasyon var" etki özeti gösteren onay diyaloğu; seçenekler "Başka departmana taşı" (select) veya "Arşivle" (önerilen varsayılan; `isActive=false`). API: `DELETE` yerine `POST /departments/:slug/archive` ve `POST /departments/:slug/merge { into }`; birleştirmede tek transaction içinde `companyTask.updateMany`, `taskTemplate.updateMany`, `teamAutomation.updateMany`, `user.updateMany({ adminDepartment })` ve junction taşıma. Gerçek silme yalnız referanssız departmana izinli. GET fallback'i yalnız var olan departman slug'larına düşmeli.
- **Efor:** M

### 4. Departman oluşturma `upsert` ile mevcut departmanı sessizce eziyor
- **Önem:** orta · **Kategori:** veri bütünlüğü
- **Kanıt:** `app/api/admin/team/departments/route.ts:11-14` (slugify), `:95-102` (`upsert` + `description: ... ?? null`)
- **Sorun:** "Ar-Ge", "AR GE", "ar ge" hepsi `ar-ge` slug'ına düşer; ikinci "oluşturma" yeni departman yaratmaz, var olanın adını değiştirir ve açıklamasını `null`'a sıfırlar. Kullanıcı "Departman eklendi" toast'ı görür, sayı artmaz. Ayrıca büyük `İ` → `i̇` (birleşik nokta) → slug'da `i-nsan` gibi bozuk parçalar oluşur (doğrulanmadı: çalışma zamanında denenmedi, `toLowerCase` davranışına dayanıyor).
- **Öneri:** `create` için `prisma.department.create` + benzersizlik çakışmasında 409 ("Bu ada çok benzeyen 'Ar-Ge' zaten var"). Güncelleme ayrı `PATCH /departments/:id` olsun. Slug'ı `slugify` paketi veya `normalize('NFKD')` + Türkçe eşleme ile üret; slug'ı oluşturma anında sabitle ve ad değişse de değiştirme (referans bütünlüğü için).
- **Efor:** S

### 5. Büyük harfli e-postaya sahip kullanıcılar eklenemiyor
- **Önem:** orta · **Kategori:** hata
- **Kanıt:** `app/api/admin/team/members/route.ts:65` (`findUnique({ where: { email: email.toLowerCase() } })`); kayıt e-postayı olduğu gibi saklıyor: `app/api/auth/register/route.ts:40-60`, `lib/validations.ts:26-29`, `app/api/admin/users/route.ts:239-256`
- **Sorun:** Arama `mode: 'insensitive'` ile `Ali@Firma.com`'u bulur, istemci bu e-postayı POST eder, sunucu küçültüp tam eşleşme arar → 404 "Bu e-posta ile kayıtlı kullanıcı yok". Arama sonucu tıklanabilir ama işlem hep başarısız.
- **Öneri:** POST'u `userId` alacak şekilde değiştir (istemci zaten `user.id` biliyor, `team-departments.tsx:65-70`); e-posta yolunu yalnız "e-posta ile davet" senaryosuna bırak ve orada `mode: 'insensitive'` `findFirst` kullan. Sistem genelinde e-postayı kayıt anında normalize etmek ayrı bir iş kalemi.
- **Efor:** S

### 6. DEALER/STAFF kullanıcılar ekibe eklenebiliyor ama ekip arayüzüne hiç erişemiyor
- **Önem:** orta · **Kategori:** mantık / UX
- **Kanıt:** Aday araması rol filtresi yok `members/route.ts:17-26`; ekip arayüzü yalnız `/admin/ekip` ve `/customer/ekip` (`components/dashboard/sidebar.tsx:203, 281`); `/customer/*` CUSTOMER rolü ister `proxy.ts:50-55, 61-73`
- **Sorun:** Bir bayi ekibe "üye" olarak eklenir, görev atanabilir hale gelir (Pano'da listelenir) ama `/customer/ekip`'e girmeye çalıştığında proxy onu `/dealer`'a yönlendirir. Görev atanmış ama göremeyen "ölü üye" oluşur.
- **Öneri:** Kısa vade: aday aramasında rolü göster ve CUSTOMER/ADMIN dışını devre dışı bırak (açıklayıcı tooltip ile). Doğru çözüm: ekip arayüzünü rol bağımsız bir yola taşımak (ör. `/ekip`, kendi layout kapısıyla) — bu sayfa ve Pano için ortak.
- **Efor:** S (kısa vade) / L (rol bağımsız yol)

### 7. Yıkıcı aksiyonlarda sessiz hata ve geri bildirim eksikliği
- **Önem:** orta · **Kategori:** UX / hata yönetimi
- **Kanıt:** `team-departments.tsx:81-85` (çıkar), `:126-130` (sil): `await fetch(...).catch(() => {})`, `res.ok` kontrolü yok, toast yok; `:37-45` `json.success` false iken sessiz
- **Sorun:** 403 (ör. customer ikizinde `uye`) veya 500 durumunda öğe iyimser olarak kaybolur, ardından `load()` ile sessizce geri gelir; kullanıcı "yanıp sönen" bir satır görür, ne olduğunu anlamaz. Başarı durumunda da onay mesajı yok. Yükleme başarısızken boş durum + seed butonu gösterilmesi yanlış eyleme davet eder.
- **Öneri:** Tüm mutasyonları tek bir `mutate()` yardımcısına topla (iyimser güncelle → `res.ok`/`json.success` kontrol → hata mesajını sunucudan göster → snapshot'a geri dön). Yıkıcı işlemler için onay diyaloğu veya Linear tarzı "Geri al" düğmeli toast (5 sn ertelenmiş commit). Yükleme hatası için ayrı hata kartı + "Tekrar dene". SWR/React Query'ye geçiş bunu `mutate(optimistic, { rollbackOnError })` ile bedavaya getirir.
- **Efor:** M

### 8. Rol hiyerarşisi ve öz-kilitlenme koruması yok
- **Önem:** orta · **Kategori:** yetki
- **Kanıt:** `members/route.ts:104-141` (PUT herhangi bir `id` kabul eder), `:144-156` (DELETE herhangi bir `id`); UI `team-departments.tsx:286-295`
- **Sorun:** CUSTOMER rolündeki bir ekip yöneticisi (a) diğer yöneticileri düşürebilir/çıkarabilir, (b) ADMIN'in ekip rolünü silebilir, (c) kendini düşürüp sayfaya erişimini kaybedebilir, (d) son yöneticiyi düşürerek ekibi yöneticisiz bırakabilir; ayrıca PUT, ekipte olmayan bir kullanıcının `id`'sine `teamRole: 'yonetici'` yazarak POST akışını atlayıp doğrudan yönetici atayabilir. Hepsi audit'e yazılıyor ama geri bildirim/kısıt yok.
- **Öneri:** Sunucuda kurallar: yalnız ADMIN başka bir yöneticiyi düşürebilir/çıkarabilir; kişi kendi rolünü düşüremez; son yönetici korunur; PUT yalnız `adminTeamRole != null` kullanıcıya uygulanır (aksi 404). UI'da kendi satırında rol seçiciyi kilitle ve "Sen" rozeti göster.
- **Efor:** S

### 9. Ortak bileşen yetki durumunu bilmiyor (customer ikizinde üye tüm yazma kontrollerini görüyor)
- **Önem:** orta · **Kategori:** mimari / UX
- **Kanıt:** `components/team/team-departments.tsx` içinde `isManager`/`useSession` yok; link herkese açık `components/team/team-board.tsx:697-699`; yazma uçları `manager: true` (`departments/route.ts:72, 120`, `members/route.ts:13, 55, 105, 145`)
- **Sorun:** Admin rotasında sorun görünmez (ADMIN = yönetici), ama aynı bileşen `/customer/ekip/departmanlar`'da `uye`'ye de render edilir: input, sil, rol seçici, Üye Ekle hepsi görünür ve 403 alır. Ayrıca "Üye Ekle" popover'ı açıldığında üye için arama 403 döner, "Aramak için yazın" görünür.
- **Öneri:** GET `/departments` yanıtına `viewer: { isManager, isAdmin, id }` ekle (Pano zaten benzer bilgi kullanıyor); bileşende salt-okur mod: üye kendi departmanlarını ve ekip haritasını görsün, düzenleme kontrolleri gizlensin.
- **Efor:** S

### 10. Erişilebilirlik: görünmez odak hedefi, etiketsiz kontroller, düşük kontrast
- **Önem:** orta · **Kategori:** erişilebilirlik / mobil
- **Kanıt:** sil butonu `team-departments.tsx:217` (`opacity-0 group-hover:opacity-100`, `focus-visible` stili yok); `+` butonu `:192` (`aria-label` yok); input `:191` (etiket yok, yalnız placeholder); rozet `:303-304` 11 px beyaz metin, seed renkleri `departments/route.ts:59-68` (ör. `#f59e0b` üzerinde beyaz ≈ 2,1:1, `#06b6d4` ≈ 2,4:1 — WCAG AA 4,5:1 gereksinimi altında, hesaplanmış değer)
- **Sorun:** Klavye kullanıcısı Tab ile görünmeyen bir butona odaklanır; dokunmatikte departman silme imkânsız; ekran okuyucu `+` butonunu "button" olarak okur; açık renkli departman rozetleri okunaksız. Rozetin "tıkla = çıkar" davranışı yalnız `title` ile anlatılıyor.
- **Öneri:** Satır aksiyonlarını her zaman görünen bir `DropdownMenu` (⋯) içine al; `focus-visible:opacity-100` minimum düzeltme. Rozet metin rengini departman renginin parlaklığına göre (`getContrastText(color)`) siyah/beyaz seç veya rozeti "renkli nokta + nötr zemin" yapısına çevir. Rozet butonlarına `aria-label="{ad} departmanından çıkar"`; `+` butonuna `aria-label="Departman ekle"`; input'a görsel olarak gizli `<label>`.
- **Efor:** S

### 11. Arama yarışı ve boş sorgu davranışı
- **Önem:** düşük · **Kategori:** hata / performans
- **Kanıt:** `team-departments.tsx:49-62` (AbortController yok, `setResults` koşulsuz), `members/route.ts:19` (boş `q` filtresiz)
- **Sorun:** Yavaş dönen eski bir istek, yeni yazılan sorgunun sonuçlarını ezebilir. Popover her açıldığında boş sorguyla rastgele 20 kullanıcı çekilir; önceki açılıştan kalan `results` bir an görünür.
- **Öneri:** Effect içinde `AbortController`, cleanup'ta `abort()`; minimum 2-3 karakter; popover kapanınca `results` temizlensin. shadcn `Command` (cmdk) bileşeniyle klavye gezinmeli combobox'a geçiş.
- **Efor:** S

### 12. Dil/karakter tutarsızlığı ve küçük kusurlar
- **Önem:** düşük · **Kategori:** içerik / ölü kod
- **Kanıt:** `lib/admin-toast.ts:17-20` ("Basarili: ", "Dikkat: "); `team-departments.tsx:149` (`stats.members` kullanılmıyor); `:65` (`deptSlug` hiç geçilmiyor); `app/admin/ekip/departmanlar/page.tsx` (metadata yok); `team-board.tsx:698` (düz `<a>`, `next/link` değil)
- **Sorun:** Türkçe karakterleri eksik ön ek her başarı mesajında görünüyor; ölü kod ve ölü parametre niyet/gerçek uyumsuzluğu yaratıyor; sekme başlığı ayırt edici değil; Pano → Departmanlar geçişi tam sayfa yenilemesi yapıyor.
- **Öneri:** Toast ön ekini kaldır veya "Başarılı"/"Uyarı" yap (sistem geneli, tek dosya). `export const metadata = { title: 'Departmanlar' }`. `next/link` kullan ve bu sayfaya "← Pano" breadcrumb'ı ekle.
- **Efor:** S

### 13. Kaynak-doğruluk çakışması: admin kullanıcı düzenleme `adminDepartment` yazıyor, junction'ı yazmıyor
- **Önem:** düşük · **Kategori:** mimari
- **Kanıt:** `app/api/admin/users/route.ts:30-31` (şema alanları), `:336-338` (`data: validatedData.data` doğrudan); bu sayfa ise junction'ı öncelikli okuyor `departments/route.ts:49-50`
- **Sorun:** İki farklı yerden departman atanabiliyor; kullanıcılar ekranından yapılan değişiklik, kullanıcının junction kaydı varsa bu sayfada hiç görünmez.
- **Öneri:** `adminDepartment`'ı türetilmiş alan yap (yalnız `syncUserDepartments` yazsın) ve users API'sindeki bu iki alanı kaldır ya da aynı yardımcıya yönlendir; uzun vadede `UserDepartment.isPrimary` sütunu ile birincil kavramını açık hale getir.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Departman detay görünümü (Linear "Teams" / Stripe "Team" sayfası gibi):** departmana tıklayınca üyeler, departman yöneticisi (head), açık görev sayısı, son 30 gün tamamlanma oranı, bağlı otomasyonlar. Şu an departman satırı tıklanamıyor.
- **Departman düzenleme seti:** ad, renk paleti seçici, açıklama, sürükle-bırak sıralama (`order`), arşivle/geri al (`isActive`) — veri modelinde alanlar hazır, UI yok.
- **Davet akışı:** henüz hesabı olmayan kişiyi e-posta ile davet et, bekleyen davetler listesi, süre aşımı (Linear/Retool üye daveti).
- **Üye tablosunda arama, filtre (departman/rol/departmansız), sıralama ve toplu işlem** (çoklu seç → departmana ata / rol ver / çıkar).
- **Erişim denetim izi:** üye/rol/departman değişikliklerinin kim-ne-zaman listesi (audit verisi zaten yazılıyor; PostHog/Stripe "Events" tarzı yan panel).
- **Geri al (undo) ve etki önizlemeli onay** yıkıcı aksiyonlar için.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Yönetici bu sayfayı "organizasyon şeması + erişim yönetimi" olarak kullanır: bir bakışta hangi departmanda kim var, kim yönetici, kim boşta; her değişiklik güvenli, geri alınabilir ve izlenebilir.

**Yerleşim:**
1. Üstte kompakt başlık (hero küçültülmüş, `← Pano` breadcrumb), sağda birincil aksiyonlar: "Üye davet et", "Departman oluştur".
2. **İki sekme:** "Departmanlar" ve "Üyeler & Erişim".
   - *Departmanlar:* kart ızgarası (renk şeridi, ad, açıklama, yönetici avatarı, üye yığını, açık görev sayısı). Kart tıklanınca sağdan `Sheet` ile detay: üyeler, görev özeti, düzenleme formu (ad/renk/açıklama), "Arşivle" / "Başka departmanla birleştir". Sürükle-bırak sıralama.
   - *Üyeler & Erişim:* TanStack tablo (ad, e-posta, rol, departman çipleri, birincil yıldızı, son aktivite). Üstte arama + departman/rol/"Departmansız" filtreleri; satır seçimiyle toplu işlem çubuğu. Satır aksiyonları her zaman görünen ⋯ menüsünde. Kendi satırında "Sen" rozeti ve kilitli rol.
3. İstatistik şeridi tıklanabilir filtre olsun ("Departmansız 3" → üye tablosunu o filtreyle açar).

**Motion:** Ölçülü. Kart/satır ekleme-çıkarmada `m as Motion` + `AnimatePresence` ile 150-200 ms `layout` geçişi; rozet ekle/çıkar için küçük ölçek-fade; geri al toast'ı. `useReducedMotion` ile tümü kapanabilir. three.js / 3D burada yersiz — iş aracı ekranı, yoğun veri; dekoratif 3D dikkat dağıtır.

**Veri/API değişiklikleri:**
- `/api/team/*` ad alanına taşı (veya en azından mevcut uçları sertleştir); her yazma işlemi `prisma.$transaction`.
- Departman: `POST` (yalnız create, 409 çakışma), `PATCH /:id` (ad/renk/açıklama/sıra), `POST /:slug/archive`, `POST /:slug/merge`; GET'e `taskCount`, `automationCount` (tek `groupBy` ile, N+1 yok).
- Üye: `POST` `userId` ile; delta uçları (`/members/:id/departments`), `isPrimary` sütunu; hiyerarşi kuralları sunucuda.
- Aday araması: min 3 karakter, rol filtresi, maskeli e-posta, rate limit.
- GET yanıtına `viewer` (isManager/isAdmin/id) ekleyerek salt-okur modu sürmek.
- İstemcide SWR/React Query: iyimser güncelleme + otomatik geri alma; tek kaynak.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/ekip/departmanlar`** — aynı bileşenin ikizi (bilinçli çift panel mimarisi). Birleştirme gerekmez; ama yetki farkı (yönetici/üye) bileşende ele alınmalı (Bulgu 9).
- **`/admin/users` (kullanıcı düzenleme)** — `adminDepartment`/`adminTeamRole` alanlarını ayrı ve tutarsız biçimde yazıyor (`app/api/admin/users/route.ts:30-31`). Ekip erişimi tek yerden yönetilmeli: bu alanlar users ekranından kaldırılıp bu sayfaya derin bağlantı ("Ekip erişimini yönet →") verilmeli.
- **`/admin/ekip` Pano → "Kişiler" görünümü** (`components/team/team-board.tsx:1247-1275`) görev odaklı kişi gruplaması yapıyor; bu sayfa organizasyon odaklı. Çakışma kısmi: departman detay sheet'i Pano'nun kişi kartlarını yeniden kullanabilir; sayfa ayrı kalmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: salt okunur kod okuması. `app/api/admin/team/members/route.ts`, `app/api/admin/team/departments/route.ts`, `lib/team-access.ts`, `lib/api-auth.ts`, `lib/auth.ts` (jwt callback), `proxy.ts`, `prisma/schema.prisma` (Department / UserDepartment / CompanyTask / TaskTemplate / TeamAutomation), `components/team/team-departments.tsx`, `components/team/team-board.tsx` baştan okundu. DB'ye, dev server'a, teste dokunulmadı.

### 1. Ekip yöneticisi (CUSTOMER olabilir) tüm platform kullanıcılarının ad/e-posta/rolünü listeleyebiliyor — **DOĞRULANDI** (çerçeve kısmen abartılı, önem: yüksek-orta)

- `lib/team-access.ts:12` yalnızca `requireAuth(['ADMIN','DEALER','CUSTOMER','STAFF'])` ister; `:29` `teamRole === 'yonetici'` olan herkesi (rolü CUSTOMER/DEALER olsa da) yönetici sayar.
- `app/api/admin/team/members/route.ts:17-26`: filtre yalnızca `adminTeamRole: null`; `q` boşsa da 20 kayıt döner; `select` içinde `email` ve `role` var. Rate limit yok; `contains` + `mode: 'insensitive'` olduğundan `q=a`, `q=ab`, `q=@gmail` gibi alt dizgilerle kullanıcı tabanı parça parça numaralandırılabilir.
- `proxy.ts:105-119`: `/api/*` yolları için rol/gizli kapı kontrolü yok — doğru; ancak bu bilinçli: aynı uç `/customer/ekip/departmanlar` (`app/customer/ekip/departmanlar/page.tsx`) tarafından da kullanılıyor, yani "admin gizli kapısının atlanması" bir sızıntı değil, çift panel tasarımının sonucu. Asıl sorun, yanıtın amaca göre fazla veri döndürmesi.
- İstemci `role` alanını hiç kullanmıyor (`components/team/team-departments.tsx:20` tipte var, render'da yok) — tamamen gereksiz sızıntı; `adminTeamRole: null` olan ADMIN hesaplarını işaretler.
- Ek ağırlaştırıcı: yönetici yetkisi admin onayı olmadan yayılabiliyor — herhangi bir `yonetici`, `PUT {id, teamRole:'yonetici'}` (`members/route.ts:100,116`) veya `POST teamRole:'yonetici'` (`:35`) ile başka bir CUSTOMER'ı yönetici yapabiliyor.

**Yeniden üretim:** CUSTOMER rolündeki bir stajyere `adminTeamRole='yonetici'` atanır → `/customer/ekip/departmanlar` oturumuyla tarayıcı konsolundan `fetch('/api/admin/team/members?q=@')` ve ardından `q=a…z`, `q=aa…zz` döngüsü → her istekte 20 müşteri/bayi/admin adı + e-postası + rolü döner.

**Öneri:** Aday aramasını "kişi bulma" değil "davet" akışına çevir: min 3 karakter, boş `q` → boş liste; yanıttan `role`'ü çıkar, e-postayı maskele (`f***@gmail.com`) ve tam eşleşme dışında yalnızca ad + maskeli e-posta göster; kullanıcı başına Redis tabanlı rate limit (ör. dakikada 20); yönetici atamasını (`teamRole:'yonetici'`) yalnızca `isAdmin` olan oturuma izin ver. Uzun vadede uçları `/api/team/*` altına taşıyıp adlandırma ile yetki modelini hizala.

### 2. Üye departman PUT'u işlemsiz: geçersiz/silinmiş slug kullanıcının tüm departman üyeliklerini siler ve 500 döner — **DOĞRULANDI** (önem: yüksek)

- `members/route.ts:39-48`: `deleteMany` ve `createMany` ayrı ayrı çalışır, `$transaction` yok. `skipDuplicates` Postgres'te `ON CONFLICT DO NOTHING` üretir; yalnızca unique çakışmasını yutar, FK ihlalini (`schema.prisma:2853`, `departmentSlug → Department.slug`) yutmaz.
- `:99` slug yalnızca `max(50)`; varlık kontrolü yok. `:118-120` hata yakalanmadan fırlar → Next 500; `:127` `user.update` ve `:133` audit çalışmaz, yani `adminDepartment` eski değerde kalır ve kayıp iz bırakmaz.
- Somut senaryo (yarış gerekmez, deterministik): Departman silindiğinde `UserDepartment` satırları cascade ile gider ama `User.adminDepartment` temizlenmez (`departments/route.ts:125`). Üyenin junction'ı boş kaldıysa GET `departmentSlugs`'ı `adminDepartment`'a düşürür (`departments/route.ts:50`). UI bu hayalet slug'ı rozet olarak gösterir; yönetici bu üyeye yeni bir departman eklemek istediğinde `next = [silinmişSlug, yeniSlug]` gönderilir (`team-departments.tsx:89-95`) → `createMany` FK ile patlar → 500, "Güncellenemedi". Üyeye departman eklemek kalıcı olarak imkânsız hale gelir (önce hayalet rozeti kaldırmak gerekir; kullanıcı bunu bilemez).
- Yarış senaryosu: A sekmesi eski departman listesiyle açık; B departmanı siler; A, üç departmanlı bir üyeye silinen departmanı ekler → `deleteMany` üç geçerli üyeliği siler, `createMany` patlar → üye tüm junction üyeliklerini kaybeder.
- Eşzamanlı iki PUT'un birleşim üretmesi (delete A, delete B, create A, create B) kodla tutarlı ama düşük olasılıklı; ikincil.

**Öneri:** `syncUserDepartments` + `user.update` + audit tek `prisma.$transaction` içinde; yazmadan önce `department.findMany({ where: { slug: { in } } })` ile slug'ları doğrula, bilinmeyen slug'da 422 + hangi slug'ın geçersiz olduğu. Replace-all yerine delta uçları (ekle/çıkar tek slug) yarışları büyük ölçüde ortadan kaldırır.

### 3. Departman silme yetim veri ve hayalet departman bırakıyor — **DOĞRULANDI** (önem: orta; "kritik" değil)

- `departments/route.ts:125`: `delete(...).catch(() => null)`; `:126-128` audit koşulsuz → olmayan slug'ı silme isteği de "delete" audit'i ve `success: true` üretir. Doğru.
- UI'da onay yok: `team-departments.tsx:126-130, 217` — tek tıkla silme, iyimser kaldırma, geri al yok. Doğru.
- `CompanyTask.department` (`schema.prisma:2866`), `TaskTemplate.department` (`:2925`), `TeamAutomation.department` (`:3015`) düz `String?`; silmede temizlenmiyor. Pano filtresi yalnızca mevcut departmanları listeler (`team-board.tsx:624-628`) → bu görevler departman filtresiyle seçilemez, kartta ham slug görünür (`:1040`, `:1222`), "Departmana göre" gruplamada ayrı bir grup olarak yine "Departmansız" etiketiyle ikinci kez görünür (`:313`).
- `User.adminDepartment` (`schema.prisma:39`) temizlenmiyor → yalnızca o departmanda olan üye mor (`#8b5cf6`) rozetle ham slug olarak görünür (`team-departments.tsx:304-305`) ve `memberDepts` uzunluğu 1 olduğundan "Departmansız" sayacına girmez (`:148`). Doğru; ayrıca Bulgu 2'deki kalıcı 500'ün tetikleyicisi budur.

**Yeniden üretim:** Tek departmanlı üyesi olan "Ar-Ge"yi sil → üye kartında "ar-ge" mor rozeti kalır, Departmansız sayacı artmaz; Pano'da Ar-Ge görevleri filtre listesinde yoktur.

**Öneri:** Silmeyi "arşivle" (`isActive=false`, alan zaten var: `schema.prisma:2835`) olarak yeniden tanımla; kalıcı silme yalnızca boş departmanda veya "görevleri/şablonları/otomasyonları şu departmana taşı" seçimiyle, tek transaction'da `CompanyTask/TaskTemplate/TeamAutomation.department` ve `User.adminDepartment` güncellenerek. Silme öncesi etki özeti (N görev, M üye, K otomasyon) gösteren onay diyaloğu; audit yalnızca gerçek silmede ve `oldData` ile.

### 4. Departman oluşturma upsert ile aynı slug'lı mevcut departmanı yeniden adlandırıp açıklamasını siliyor — **DOĞRULANDI** (önem: düşük-orta)

- `departments/route.ts:11-14` slugify: "Ar-Ge" → `ar-ge`, "AR GE" → `ar-ge`, "Satış & Pazarlama" ile "Satış Pazarlama" → `satis-pazarlama`. `:98-102` `upsert` mevcut kaydın `name`'ini ezer, `description`'ı `?? null` ile null'a çeker. UI (`team-departments.tsx:119`) yalnızca `{ name }` gönderdiği için `color` korunur ama ad değişir ve "Departman eklendi" toast'ı (`:122`) gösterilir; liste sayısı artmaz.
- Nüans: Açıklama alanı için şu an UI'da giriş yok ve render da edilmiyor; açıklama yalnızca API ile yazılmışsa silinir — bu kısım bugün pratikte etkisiz. Yeniden adlandırma kısmı ise gerçek ve sessiz.

**Yeniden üretim:** "Ar-Ge" varken yeni departman alanına "AR GE" yaz → toast "Departman eklendi", ancak listede yeni kart yok, mevcut kartın adı "AR GE" oldu; audit `action: 'upsert'`.

**Öneri:** `POST` yalnızca `create`; slug çakışmasında 409 ve "Bu ada çok benzeyen 'Ar-Ge' departmanı zaten var" mesajı, UI'da mevcut departmana yönlendirme. Yeniden adlandırma ayrı `PATCH /departments/:id` ile.

### Ek gözlem (iddialarda yok, kodla doğrulandı)

- `lib/team-access.ts:21`: `const teamRole = user?.adminTeamRole ?? sessionRole;` — DB'de `adminTeamRole` null'a çekilmiş (ekipten çıkarılmış, `members/route.ts:150`) bir kullanıcı için `??` JWT'deki bayat role düşer. JWT'deki `adminTeamRole` yalnızca girişte (`lib/auth.ts:214,252`) ve `trigger === 'update'` (`:272`) ile yenileniyor. Sonuç: ekipten çıkarılan bir yönetici, oturumu yaşadıkça ekip API'lerine (bu sayfadaki üye arama/ekleme/silme dahil) yönetici olarak erişmeye devam eder. Yorumdaki niyet ("Session bayat olabilir; DB'den güncel rolü doğrula") ile kod çelişiyor. Düzeltme: kullanıcı DB'de bulunduğunda yalnızca DB değerini kullan (`const teamRole = user ? user.adminTeamRole : null`).
