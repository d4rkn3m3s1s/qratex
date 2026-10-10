# /customer/ekip/departmanlar

**Amaç** · İç ekip (stajyer/çalışan) yönetim modülünün "Departmanlar & Roller" ekranı: departman oluşturma/silme, ekibe kullanıcı ekleme/çıkarma, üyelere çoklu departman ve ekip rolü (Yönetici / Üye) atama. Tüketici (QR okutan son kullanıcı) özelliği DEĞİLDİR; müşteri paneline yalnızca `adminTeamRole` atanmış ve `CUSTOMER` rolündeki ekip üyeleri için gömülmüştür. Aynı bileşen `/admin/ekip/departmanlar`'da da birebir render edilir.

**Genel puan: 5/10** · **Karar: koru-iyileştir** (kavram doğru ve gerekli; ancak yetki/PII sızıntısı, yıkıcı işlemlerde onay eksikliği, rol-farkındasız UI ve veri bütünlüğü zinciri giderilmeden "üretim kalitesi" sayılmaz).

> Not: Görev tanımındaki kıyas ürünleri (Starbucks Rewards, Duolingo, Revolut, Spotify Wrapped) bu sayfa için uygun değildir; bu bir iç operasyon/yönetim ekranıdır. Kıyas bu yüzden Linear (Teams), Notion (Members & groups), Slack (User groups), Asana (Teams) ve Monday (Workspace members) üzerinden yapılmıştır.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Temel CRUD akışları çalışıyor; ancak departman düzenleme yok, silme sonrası bayat slug zinciri PUT'u 500'e düşürüyor, e-posta büyük/küçük harf hatası üye eklemeyi bozuyor. |
| UX | 5/10 | Onaysız tek tık silme/çıkarma, her mutasyonda tüm sayfanın spinner'a dönmesi, "Üye" rolüne yönetim kontrollerinin gösterilip 403 ile cezalandırılması. |
| Görsel | 6/10 | Ortak `AdminPremiumHero` + shadcn kartlarla temiz ve tutarlı; ama yoğunluk/hiyerarşi zayıf, beyaz yazı + açık departman renklerinde kontrast sorunu, tamamen statik. |
| Mimari | 4/10 | Müşteri rolündeki yöneticilere `/api/admin/*` altında tüm kullanıcı tabanını arama yetkisi; işlemler transaction'sız; `isActive`/`order`/`description` şemada var UI'da yok; ADMIN dalı ölü kod. |
| Performans | 6/10 | Tek GET (Promise.all) ve küçük veri; fakat her işlemde tam yeniden yükleme + bileşen ağacının söküp yeniden kurulması, aramada iptal (AbortController) yok. |
| Erişilebilirlik + Mobil | 4/10 | Departman silme butonu `opacity-0 group-hover` → dokunmatikte görünmez, klavyede görünmez odak; rol `Select`'inde etiket yok; 16px ikon-butonlar 44px dokunma hedefinin çok altında. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa giriş noktası (ince sarmalayıcı) | ÇALIŞIYOR | `app/customer/ekip/departmanlar/page.tsx:1-5` | Sadece `<TeamDepartments />`; metadata yok. |
| 2 | Ekip erişim kapısı (layout) | KISMİ | `app/customer/ekip/layout.tsx:12-24`, `proxy.ts:50-73` | DB'den güncel rol doğrulanıyor (iyi). "ADMIN de erişir" dalı ölü: proxy `/customer` için `CUSTOMER` zorunlu tutup ADMIN'i `/admin`'e yönlendiriyor. |
| 3 | Hero başlık (eyebrow/başlık/açıklama/ikon) | ÇALIŞIYOR | `components/team/team-departments.tsx:154-160` | `tone="auto"`, azaltılmış hareketi `useReducedMotion` ile destekliyor (`components/admin/admin-premium-hero.tsx:9,35`). |
| 4 | Yükleniyor durumu | KISMİ | `team-departments.tsx:38,162-165` | Tam sayfa spinner; her `load()` çağrısında (her ekle/sil/seed sonrası) içerik sökülüp spinner'a dönüyor; skeleton yok, `aria-live` yok. |
| 5 | Yükleme hatası durumu | KISMİ | `team-departments.tsx:41-43` | Sadece ağ hatasında toast; `json.success === false` (ör. 403) sessizce yutuluyor ve "Henüz departman yok" boş durumu gösteriliyor (yanıltıcı). |
| 6 | İstatistik: Toplam Üye | ÇALIŞIYOR | `team-departments.tsx:146-150,171` | Sunucu `take: 200` ile kesiyor (`app/api/admin/team/departments/route.ts:43`); 200 üstünde yanlış sayı, uyarı yok. |
| 7 | İstatistik: Yönetici | ÇALIŞIYOR | `team-departments.tsx:147,172` | |
| 8 | İstatistik: Departman | ÇALIŞIYOR | `team-departments.tsx:149,173` | |
| 9 | İstatistik: Departmansız | KISMİ | `team-departments.tsx:148,174` | Silinmiş departmanın bayat slug'ını taşıyan üye "departmanlı" sayılıyor (bkz. #24). `stats.members` hesaplanıyor ama kullanılmıyor (ölü alan). |
| 10 | Yeni departman ekleme (input + buton + Enter) | KISMİ | `team-departments.tsx:113-125,190-193`; `departments/route.ts:95-102` | `upsert` → aynı slug'a düşen ad mevcut departmanı sessizce yeniden adlandırıp `description`'ı `null`'lar, toast yine "Departman eklendi". Ad `trim` edilmeden gönderiliyor. Sunucu hata mesajı gösterilmiyor (hep "Eklenemedi"). Renk/açıklama seçilemiyor. |
| 11 | Slug üretimi | KISMİ | `departments/route.ts:11-14` | `"İ".toLowerCase()` JS'te `i + U+0307` üretir → "İnsan Kaynakları" slug'ı `i-nsan-kaynaklari` olur. Tümü Latin dışı ad → boş slug → 400. |
| 12 | Departman listesi (renk dairesi, ad, üye sayısı) | ÇALIŞIYOR | `team-departments.tsx:195-205` | `description` alanı hiç gösterilmiyor. |
| 13 | Departman başına avatar yığını (+N) | ÇALIŞIYOR | `team-departments.tsx:206-216` | |
| 14 | Departman silme | KISMİ | `team-departments.tsx:126-130,217-219`; `departments/route.ts:119-130` | Onay yok, geri alma yok, `res.ok` kontrolü yok, başarı/hata bildirimi yok; buton yalnız hover'da görünür. Silme `UserDepartment`'ı cascade siler ama `User.adminDepartment`, `CompanyTask.department`, şablon ve otomasyonlardaki slug'lar bayat kalır (`prisma/schema.prisma:2866,2925,3015`). `isActive` alanı (soft delete için ideal) kullanılmıyor (`schema.prisma:2835`). |
| 15 | Boş durum + "Varsayılan departmanları yükle (8)" | ÇALIŞIYOR | `team-departments.tsx:223-228`; `departments/route.ts:75-88` | İdempotent upsert, iyi. Üye rolüne de gösteriliyor → 403 → "Yüklenemedi". Seed işlemi audit log'a yazılmıyor. |
| 16 | "Üye Ekle" popover + debounce'lu arama | KISMİ | `team-departments.tsx:49-62,238-270`; `members/route.ts:12-29` | Popover açılır açılmaz `q=''` ile istek → API filtresiz ilk 20 platform kullanıcısını (ad/e-posta/rol) döndürüyor. Yarış koşulu: AbortController yok, eski yanıt yenisini ezebilir. "Aramak için yazın" metni pratikte görünmüyor. |
| 17 | Aranan kullanıcıyı ekibe ekleme | KISMİ | `team-departments.tsx:65-79`; `members/route.ts:54-94` | E-posta ile yeniden arama `email.toLowerCase()` + `findUnique` → büyük harfli kayıtlı e-postalarda 404 (kayıt e-postayı küçültmüyor: `lib/validations.ts:26-29`, `app/api/auth/register/route.ts:40-60`). DEALER/STAFF/ADMIN kullanıcılar da eklenebiliyor ama proxy yüzünden `/customer/ekip`'e giremiyorlar. |
| 18 | Ekip üyeleri listesi | ÇALIŞIYOR | `team-departments.tsx:273-336` | Arama/filtre/sıralama/sayfalama yok; 200 sınırı. |
| 19 | Rol değiştirme (Yönetici/Üye Select) | KISMİ | `team-departments.tsx:101-111,286-292`; `members/route.ts:104-141` | Kendini düşürme, son yöneticiyi düşürme, diğer yöneticileri düşürme serbest; hiyerarşi yok. Select'te erişilebilir etiket yok. |
| 20 | Ekipten çıkarma | KISMİ | `team-departments.tsx:81-85,293-295`; `members/route.ts:144-156` | Onay yok, `res.ok` kontrolü yok, toast yok; kendini çıkarınca sayfa sessizce boşalıyor. Son yönetici koruması yok. |
| 21 | Departman rozetine tıklayıp departmandan çıkarma | ÇALIŞIYOR | `team-departments.tsx:298-308` | Optimistik; `aria-label` yerine yalnız `title`. |
| 22 | "+ Departman" popover (çoklu seçim, check) | KISMİ | `team-departments.tsx:310-332` | Bayat slug'lı üyede PUT 500 ile düşüyor (bkz. #24). Seçili durum ekran okuyucuya bildirilmiyor (`aria-pressed`/`role="menuitemcheckbox"` yok). |
| 23 | Optimistik güncelleme + hata halinde geri çekme | KISMİ | `team-departments.tsx:88-99,101-111` | Geri çekme `load()` ile tam yeniden yükleme; eşzamanlı PUT'lar (replace-all) sıra dışı gelirse son yazan kazanır. |
| 24 | Silinmiş departmanın bayat rozeti | BOZUK | `departments/route.ts:50`; `team-departments.tsx:300-305`; `members/route.ts:39-48,118-120` | Tek departmanlı üyenin departmanı silinince junction boşalır, GET `adminDepartment`'a düşer → UI ham slug'ı mor rozetle gösterir; üyeye yeni departman eklemek `[bayatSlug, yeni]` gönderir → `createMany` FK ihlali → yakalanmamış 500. |
| 25 | Boş üye durumu | ÇALIŞIYOR | `team-departments.tsx:337-339` | |
| 26 | Toast bildirimleri | KISMİ | `lib/admin-toast.ts:13-20` | Önekler ASCII: "Basarili:", "Dikkat:" (Türkçe karakter yok); bazı işlemlerde hiç toast yok (#14, #20). |
| 27 | Sunucu tarafı audit log | ÇALIŞIYOR | `departments/route.ts:104-113,126-128`; `members/route.ts:86-91,133-138,152-154` | Seed ve GET araması loglanmıyor. |
| 28 | Rol farkındalığı (Üye için salt-okunur görünüm) | EKSİK | `team-departments.tsx` (hiç `isManager` yok) vs `components/team/team-board.tsx:124,623-700` | Pano üyeden yönetici kontrollerini gizliyor (commit `b1746c7`), bu sayfa gizlemiyor. |
| 29 | Departman düzenleme (ad, renk, açıklama, sıra, arşiv) | EKSİK | `schema.prisma:2828-2842` | `color`, `description`, `order`, `isActive` alanları var, UI'da yok. |
| 30 | Yıkıcı işlemler için onay / geri al | EKSİK | `team-departments.tsx:217,293` | |
| 31 | Sayfa başlığı (metadata) | EKSİK | `page.tsx:1-5` | Sekme başlığı panel varsayılanı kalıyor. |
| 32 | Panodan sayfaya giriş linki | KISMİ | `components/team/team-board.tsx:697-699` | `<a href>` → tam sayfa yeniden yükleme (Next `Link` değil); üye rolüne de gösteriliyor. |
| 33 | Mobil yerleşim | KISMİ | `team-departments.tsx:169,185,277-295,217` | Grid'ler kırılıyor (iyi); ancak silme butonu dokunmatikte görünmez, ikon butonlar ~16px, üye satırında ad + `w-28` Select + çöp kutusu dar ekranda sıkışıyor. |
| 34 | Erişilebilirlik (klavye/kontrast/aria) | KISMİ | `team-departments.tsx:199,217,286,302-304` | Beyaz metin + `#f59e0b`/`#06b6d4`/`#10b981` arka planlar WCAG AA altında; görünmez odaklanabilir buton; durum değişiklikleri duyurulmuyor. |
| 35 | i18n | EKSİK | `team-departments.tsx` tamamı; `app/customer/layout.tsx:10,19` | Müşteri paneli `t(locale, …)` kullanıyor; bu sayfa sabit Türkçe. |

**Sayım:** ÇALIŞIYOR 11 · KISMİ 17 · BOZUK 1 · SAHTE 0 · EKSİK 6 (toplam 35).

---

## Bulgular

### 1. Müşteri rolündeki ekip yöneticisi tüm platform kullanıcılarını (ad, e-posta, rol) listeleyebiliyor
- **Önem:** Yüksek · **Kategori:** Güvenlik / KVKK (PII sızıntısı)
- **Kanıt:** `app/api/admin/team/members/route.ts:12-28` (filtre: yalnız `adminTeamRole: null`; `q` boşsa hiç arama filtresi yok, `role` alanı da dönüyor); `components/team/team-departments.tsx:49-57` (popover açılınca `q=''` ile istek atılıyor); `lib/team-access.ts:12,29` (`CUSTOMER` + `adminTeamRole='yonetici'` = yönetici).
- **Sorun:** Ekip yöneticisi bir stajyer/çalışandır ve rolü `CUSTOMER`'dır. "Üye Ekle"yi açtığı anda filtresiz ilk 20 kullanıcıyı görür; `?q=a`, `?q=b`… ile tüm müşteri/bayi/ADMIN tabanının e-postalarını ve rollerini çekebilir. `role` alanı ADMIN hesaplarını da ifşa ediyor (gizli kapı mimarisinin amacıyla çelişir).
- **Profesyonel öneri:** Ekip eklemeyi "tabandan arama" modelinden "davet" modeline taşıyın: (a) arama için minimum 3 karakter ve **tam e-posta eşleşmesi** (veya e-posta için tam, ad için yalnız mevcut ekip/aday havuzu içinde arama); (b) yanıttan `role` alanını çıkarın, e-postayı maskelenmiş döndürün (`a***@gmail.com`); (c) yalnız `role === 'CUSTOMER'` kullanıcıları aday yapın (proxy zaten diğerlerinin UI'a girmesine izin vermiyor); (d) uç noktaya Redis tabanlı oran sınırlama + audit log ekleyin; (e) kalıcı çözüm: `TeamInvite` modeli (e-posta, rol, departmanlar, token, son kullanma) ile kayıtlı olmayanları da davet eden bir akış. Uç noktayı `/api/team/*` altına taşıyıp `/api/admin/*` adlandırmasını gerçekten ADMIN'e ayırın.
- **Efor:** M

### 2. Departman silme: onaysız tek tık, geri dönüşsüz ve veri bütünlüğünü bozuyor
- **Önem:** Yüksek · **Kategori:** Veri bütünlüğü / UX
- **Kanıt:** `team-departments.tsx:126-130,217`; `departments/route.ts:125` (hard delete, hata `.catch(() => null)` ile yutuluyor); `schema.prisma:2853` (junction cascade), `schema.prisma:39,2866,2925,3015` (`User.adminDepartment`, `CompanyTask.department`, şablon ve otomasyon `department` alanları FK'siz string).
- **Sorun:** Tek tıkla departman ve tüm üyelik bağları silinir; görevler, şablonlar ve otomasyonlar artık var olmayan bir slug'ı işaret eder (panoda departman filtresi/rozeti yetim kalır, otomasyonlar hiç tetiklenmez). İstemci `res.ok`'a bakmıyor; başarı ya da hata bildirilmiyor.
- **Profesyonel öneri:** Hard delete yerine şemadaki `isActive` ile **arşivleme** yapın (GET `isActive: true` filtrelesin, arşiv sekmesi olsun). Silme gerçekten gerekiyorsa: etki özetli onay diyaloğu ("3 üye, 12 görev, 1 otomasyon etkilenecek — görevleri şuna taşı: [departman seç]"), sunucuda tek `prisma.$transaction` içinde görev/şablon/otomasyon `department` alanlarını hedefe taşıma veya `null`'lama ve `User.adminDepartment` temizliği. İstemcide 5 sn'lik "Geri al" toast'ı (sonner action) ile optimistik kaldırma.
- **Efor:** M

### 3. Bayat slug zinciri: silinmiş departmanlı üyeye departman eklemek 500 veriyor
- **Önem:** Yüksek · **Kategori:** Hata / Veri bütünlüğü
- **Kanıt:** `departments/route.ts:50` (junction boşsa `adminDepartment`'a düşüş); `members/route.ts:39-48` (`deleteMany` → `createMany`, transaction yok, slug doğrulaması yok), `members/route.ts:118-120` (sync, `user.update`'ten ÖNCE çalışıyor, try/catch yok); `team-departments.tsx:88-99`.
- **Sorun:** Tek departmanlı üyenin departmanı silinince GET onu hâlâ eski slug'la döndürür; UI ham slug'ı mor rozetle gösterir. Yönetici bu üyeye yeni departman eklediğinde istemci `[bayat, yeni]` gönderir → FK ihlali → yakalanmamış 500 → "Güncellenemedi". Kullanıcı önce anlamsız rozeti silmesi gerektiğini bilemez. Ayrıca `syncUserDepartments` ile `user.update` ayrı işlemler olduğundan, herhangi bir hata yarım güncelleme bırakabilir.
- **Profesyonel öneri:** (a) Sunucuda gelen slug listesini `prisma.department.findMany({ where: { slug: { in } } })` ile süzün, bilinmeyenleri 400 ile reddedin veya sessizce atın; (b) `syncUserDepartments` + `user.update` + audit'i tek `$transaction`'a alın; (c) GET'te `adminDepartment` düşüşünü yalnız mevcut departmanlar için yapın veya bir kerelik migrasyonla junction'ı tek doğruluk kaynağı yapıp `adminDepartment`'ı türetilmiş alan olarak bırakın; (d) departman silme rotası `User.adminDepartment = null` temizliğini de yapsın.
- **Efor:** S

### 4. "Üye" rolü yönetim kontrollerini görüyor, her tıklama 403 ile düşüyor
- **Önem:** Orta · **Kategori:** UX / Yetki tutarlılığı
- **Kanıt:** `team-departments.tsx` (dosyada hiç `isManager`/rol kontrolü yok); `departments/route.ts:24-29` (GET tüm üyelere açık), `:72`, `members/route.ts:13,55,105,145` (yazmalar yönetici ister); karşılaştırma `team-board.tsx:124,623,675,700` ve `team-board.tsx:697-699` (Departmanlar linki herkese görünür).
- **Sorun:** Üye; ekle/sil/rol değiştir/seed butonlarını görür, optimistik güncelleme anlık başarılı görünür, ardından "Güncellenemedi" + geri alma. "Üye Ekle" araması 403'ü yuttuğu için "Kullanıcı bulunamadı" der (yanlış teşhis). Pano bu sorunu `b1746c7` ile çözmüştü; bu sayfa geride kalmış.
- **Profesyonel öneri:** GET yanıtına `viewer: { isManager, isAdmin, userId }` ekleyin (veya `useSession`'daki `adminTeamRole`'ü kullanın, ama DB doğrulamalı sunucu bilgisi tercih edilir). Bileşen `canManage` ile iki moda girsin: yönetici için düzenlenebilir, üye için "Ekip rehberi" salt-okunur görünüm (departman kartları, kim nerede, yöneticiye ulaşma). Board'daki "Departmanlar" linki de bu ayrıma göre etiketlensin ("Ekip rehberi" / "Departmanlar & Roller").
- **Efor:** S

### 5. Yönetici hiyerarşisi ve "son yönetici" koruması yok
- **Önem:** Orta · **Kategori:** Güvenlik / İş kuralı
- **Kanıt:** `members/route.ts:104-141` (herhangi bir `id` için `teamRole` değiştirilebilir, kendisi dahil), `members/route.ts:144-156` (herhangi bir üyeyi, diğer yöneticiler ve kendisi dahil çıkarabilir); `team-departments.tsx:5` sonrası onay yok.
- **Sorun:** Bir stajyer-yönetici diğer tüm yöneticileri düşürüp tek yetkili kalabilir; ya da yanlışlıkla kendini düşürüp/çıkarıp ekibi yöneticisiz bırakabilir (kendini çıkarınca `load()` 403 alır, sayfa sessizce boş "Henüz departman yok" durumuna düşer).
- **Profesyonel öneri:** Sunucuda kurallar: (a) yönetici başka bir yöneticiyi düşüremez/çıkaramaz — yalnız ADMIN veya "sahip" (yeni `owner` rolü) yapabilir; (b) kendini düşürme/çıkarma ayrı onaylı "Ekipten ayrıl" akışına taşınsın; (c) son yönetici düşürülemez (`count({ where: { adminTeamRole: 'yonetici' } }) > 1` kontrolü transaction içinde). UI'da kendi satırını "Sen" etiketiyle işaretleyip kontrollerini kilitleyin.
- **Efor:** S

### 6. Büyük harfli e-postayla kayıtlı kullanıcı ekibe eklenemiyor
- **Önem:** Orta · **Kategori:** Hata
- **Kanıt:** `members/route.ts:65` (`findUnique({ where: { email: email.toLowerCase() } })`); `lib/validations.ts:26-29` ve `app/api/auth/register/route.ts:40-60` (kayıtta e-posta küçültülmüyor); istemci aramadan gelen ham e-postayı gönderiyor (`team-departments.tsx:70`).
- **Sorun:** "Ali@Gmail.com" olarak kayıtlı kullanıcı aramada görünür, tıklanınca "Bu e-posta ile kayıtlı kullanıcı yok" hatası alınır — kullanıcı açısından açıklanamaz bir hata.
- **Profesyonel öneri:** İstemci zaten kullanıcının `id`'sini biliyor; POST'u `userId` ile çalışacak şekilde genişletin (e-posta yalnız davet akışında kullanılsın). E-posta yolu kalacaksa `findFirst({ where: { email: { equals, mode: 'insensitive' } } })` kullanın. Platform genelinde e-posta normalizasyonu ayrı bir iş kalemi olmalı.
- **Efor:** S

### 7. Departman ekleme mevcut departmanı sessizce eziyor; düzenleme UI'ı hiç yok
- **Önem:** Orta · **Kategori:** İşlevsellik / Veri bütünlüğü
- **Kanıt:** `departments/route.ts:98-102` (`upsert` update dalı `description: ... ?? null`); `team-departments.tsx:113-125` (yalnız `name` gönderiliyor, `trim` yok, toast her zaman "Departman eklendi"); `departments/route.ts:11-14` (slugify `İ` sorunu); şema alanları `schema.prisma:2832-2835`.
- **Sorun:** "Ar-Ge" varken "ar ge" eklemek mevcut kaydı yeniden adlandırır ve açıklamasını siler; kullanıcıya "eklendi" denir. Renk her zaman varsayılan mor, açıklama/sıra hiç ayarlanamıyor; şemadaki alanlar ölü.
- **Profesyonel öneri:** POST'u `create`'e çevirip çakışmada 409 + "Bu ada sahip departman zaten var" döndürün; düzenleme için ayrı `PATCH /departments/:slug` ekleyin. UI'da her departman kartına "Düzenle" sheet'i: ad, 8-10 renk paleti (kontrast doğrulamalı), açıklama, departman lideri, sürükle-bırak sıralama (`order`). Slugify için `toLocaleLowerCase('tr')` + Unicode `normalize('NFKD')` + birleştirici işaret temizliği kullanın ve slug'ı oluşturma sonrası sabit (rename'den bağımsız) tutun.
- **Efor:** M

### 8. Her mutasyon tüm sayfayı spinner'a döndürüyor; hata yönetimi tutarsız
- **Önem:** Orta · **Kategori:** UX / Performans
- **Kanıt:** `team-departments.tsx:37-45` (`load` her çağrıda `setLoading(true)`), `:76,84,98,110,122,129,136` (her işlemden sonra `load()`), `:162-166` (loading'de tüm içerik sökülüyor), `:83,128` (`res.ok` kontrolsüz fire-and-forget), `:41-42` (`success:false` yutuluyor), `:52-59` (AbortController yok).
- **Sorun:** Üye ekleyince/departman silince kartlar kaybolur, spinner görünür, kaydırma pozisyonu ve açık popover durumları sıfırlanır. Silme/çıkarma hata verse bile kullanıcı bilgilendirilmez.
- **Profesyonel öneri:** Veri katmanını SWR/React Query ile yeniden kurun: `useSWR('/api/team/departments')` + `mutate` ile optimistik güncelleme ve `rollbackOnError`; ilk yüklemede skeleton, sonraki yenilemelerde arka plan revalidasyonu (spinner yok). Tüm mutasyonlar tek bir `teamApi` yardımcı modülünden geçsin (tipli yanıt, ortak hata → toast eşlemesi, sunucu mesajını gösterme). Arama için `AbortController` veya SWR anahtarı ile iptal.
- **Efor:** M

### 9. DEALER/STAFF/ADMIN kullanıcıları ekibe eklenebiliyor ama ekip arayüzüne giremiyorlar
- **Önem:** Orta · **Kategori:** Mimari / Yetki
- **Kanıt:** `members/route.ts:17-26` (rol filtresi yok), `:76-78` (yorum "müşteri/bayi" diyor); `proxy.ts:50-73` (`/customer` yalnız CUSTOMER, `/admin` yalnız ADMIN); `components/dashboard/sidebar.tsx:203,281` (ekip menüsü yalnız admin ve customer kenar çubuklarında); `app/customer/ekip/layout.tsx:9,21` (ADMIN dalı proxy nedeniyle ölü).
- **Sorun:** Bir bayi hesabı ekibe eklenirse listede görünür, görev atanabilir, ama hiçbir panelden ekip modülüne ulaşamaz. ADMIN `/customer/ekip`'e asla ulaşamaz; layout'taki ADMIN istisnası yanıltıcı ölü koddur.
- **Profesyonel öneri:** Kısa vade: aday aramasını `role: 'CUSTOMER'` ile sınırlayın ve POST/PUT'ta aynı kuralı doğrulayın. Orta vade: ekip modülünü rol-bağımsız bir çalışma alanına taşıyın (`/ekip` veya `/workspace`, kendi layout'u ve `requireTeamAccess` kapısıyla); müşteri/bayi/staff kenar çubuklarına koşullu tek giriş noktası ekleyin. Böylece tüketici panelinin bilgi mimarisi de iç araçlardan arınır.
- **Efor:** L

### 10. Erişilebilirlik ve mobil dokunma hedefleri
- **Önem:** Orta · **Kategori:** Erişilebilirlik / Mobil
- **Kanıt:** `team-departments.tsx:217` (`opacity-0 group-hover:opacity-100` — dokunmatikte ve klavye odağında görünmez; `focus-visible` stili yok), `:217-219,293-295` (padding'siz 16px ikon butonlar), `:286-287` (Select'te `aria-label` yok, hangi üyenin rolü olduğu belirtilmiyor), `:199,302-304` (beyaz metin + `#f59e0b`, `#06b6d4`, `#10b981` gibi açık zeminler — AA 4.5:1 altında), `:302,322` (seçili/aç-kapa durumu `aria-pressed` ile bildirilmiyor), `:162-165` (yükleme `aria-live` ile duyurulmuyor).
- **Sorun:** Mobilde departman silmenin keşfedilemez olması, klavye kullanıcısının görünmez butona odaklanması, ekran okuyucunun "düğme, düğme" diye anlamsız kontroller okuması.
- **Profesyonel öneri:** Satır sonu aksiyonlarını her zaman görünür bir `DropdownMenu` ("…") altında toplayın (Düzenle / Arşivle / Sil), en az 40-44px hedef. Rozet metin rengini zemin parlaklığına göre otomatik seçen yardımcı (`getContrastText(hex)`), departman paletini kontrast doğrulamalı sabit setle sınırlayın. Rol seçicide `aria-label={\`${name} ekip rolü\`}`; çoklu departman listesinde `role="menuitemcheckbox" aria-checked`. Yükleme/başarı durumları için `aria-live="polite"` bölge.
- **Efor:** S

### 11. Dil ve tutarlılık kusurları
- **Önem:** Düşük · **Kategori:** İçerik / i18n
- **Kanıt:** `lib/admin-toast.ts:13-20` ("Basarili: ", "Dikkat: " — Türkçe karakter yok); `team-departments.tsx` tamamı sabit metin, oysa müşteri layout'u i18n kullanıyor (`app/customer/layout.tsx:10,19`); `page.tsx:1-5` metadata yok; `team-board.tsx:698` `<a>` ile tam sayfa yükleme; `team-departments.tsx:149` kullanılmayan `stats.members`; `departments/route.ts:24-29` yorumu "POST/DELETE yönetici ister" doğru ama seed loglanmıyor.
- **Sorun:** "Basarili: Departman eklendi" gibi metinler ürün kalitesini düşürüyor; sekme başlığı sayfayı tanımlamıyor.
- **Profesyonel öneri:** `admin-toast` öneklerini "Başarılı"/"Dikkat" olarak düzeltin ya da tamamen kaldırın (sonner zaten ikon/renk ile türü belirtiyor). Ekip modülü metinlerini `team.*` i18n anahtarlarına taşıyın; `export const metadata = { title: 'Departmanlar & Roller' }`; panodaki linki `next/link` yapın.
- **Efor:** S

### 12. Eşzamanlı rozet tıklamalarında son-yazan-kazanır yarışı
- **Önem:** Düşük · **Kategori:** Yarış koşulu
- **Kanıt:** `team-departments.tsx:88-99` (her tıklama tam listeyi PUT eder, istekler sıralanmaz); `members/route.ts:39-48` (deleteMany + createMany atomik değil).
- **Sorun:** Hızlı art arda iki rozet değişikliğinde istekler ters sırada işlenirse sunucu ilk durumda kalır, UI ikinci durumu gösterir (sonraki yüklemeye kadar tutarsız). İki yönetici aynı anda aynı üyeyi düzenlerse biri diğerini sessizce ezer.
- **Profesyonel öneri:** Replace-all yerine delta API (`{ add: [slug], remove: [slug] }`) ve sunucuda tek transaction; istemcide üye başına istek kuyruğu veya SWR `mutate` ile sıralama. İsteğe bağlı: `updatedAt` tabanlı iyimser kilit.
- **Efor:** S

---

## Eksik özellikler (kıyas: Linear Teams, Notion Members, Slack User Groups, Asana Teams)

1. **Davet akışı:** Kayıtlı olmayan kişiyi e-postayla davet etme, bekleyen davetler listesi, davet linki süresi/iptali (Notion, Linear, Slack standardı). Şu an yalnız mevcut kullanıcı eklenebiliyor (`members/route.ts:66-68`).
2. **Departman detay sayfası/çekmecesi:** Departman lideri, açıklama, üyeler, açık görev sayısı, iş yükü dağılımı, son aktivite; panodaki departman filtresine tek tıkla geçiş (Asana Teams sayfası).
3. **Departman düzenleme ve arşiv:** Yeniden adlandırma, renk/ikon, sıralama, arşivle/geri getir (şemada alanlar hazır: `schema.prisma:2832-2835`).
4. **Üye listesinde arama, departman/rol filtresi ve toplu işlem:** Çoklu seçimle departmana atama/rol değiştirme; 200 üstü için sayfalama (Linear Members).
5. **Yetki matrisi ve değişiklik geçmişi:** "Kim neyi yapabilir" açıklaması (Yönetici/Üye/Sahip), ekip değişiklik geçmişi (audit log zaten yazılıyor; görüntüleyicisi yok).
6. **Rol-uyarlamalı salt-okunur "Ekip Rehberi":** Üyeler için kim hangi departmanda, kime danışmalı (Slack profil kartı benzeri).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Yönetici için 30 saniyede "ekibimin yapısı sağlıklı mı?" sorusunu cevaplayan, hatayı affeden (onay + geri al) bir yönetim ekranı; üye için ise "kim nerede, kime sorayım" sorusunu cevaplayan sakin bir rehber. Aynı rota, rol-uyarlamalı iki mod.

**Yerleşim (masaüstü):**
- Üstte kompakt hero (mevcut `AdminPremiumHero`, daha kısa) + sağda birincil aksiyon "Üye davet et".
- Sağlık şeridi: Toplam üye · Yönetici · Departmansız (tıklanabilir filtre) · Bekleyen davet · Yöneticisi olmayan departman uyarısı.
- İki sütun: solda departman kartları ızgarası (renk şeridi, lider avatarı, üye yığını, açık görev sayısı, "…" menüsü: Düzenle/Arşivle/Sil); sağda filtrelenebilir üye tablosu (ad, departman rozetleri, rol, son aktivite) — bir departman kartına tıklamak sağ listeyi o departmana filtreler.
- Departman ya da üye tıklanınca sağdan açılan `Sheet` (mevcut `task-detail-sheet` desenine paralel) ile detay/düzenleme.

**Mobil:** Sekmeli yapı (Departmanlar / Üyeler), kartlar tam genişlik, tüm satır aksiyonları her zaman görünür "…" menüsünde, alttan açılan `Drawer` ile düzenleme; 44px dokunma hedefleri.

**Motion (ölçülü):** Bu bir iş aracı; 3D veya gösterişli efekt yersiz. Yalnızca anlamlı geri bildirim: liste ekleme/çıkarmada `m` (global LazyMotion) ile `layout` + 150-200ms opacity/height geçişi, departman rozetinin bir üyeye eklendiğinde küçük bir "pop" (scale 0.9→1), silmede "Geri al" toast'ı süresince satırın soluklaşması. Hepsi `useReducedMotion` ile kapatılabilir; sayfa açılışında stagger yok.

**Veri/API değişiklikleri:**
- Uçları `/api/team/departments`, `/api/team/members`, `/api/team/invites` altına taşıyın; `/api/admin/*` yalnız ADMIN'e kalsın.
- GET yanıtı: `{ viewer: { isManager, isAdmin, userId }, departments: [{ ..., memberCount, openTaskCount, leadId }], members: [...] }` — sayımlar sunucuda `groupBy` ile.
- `PATCH /departments/:slug` (ad/renk/açıklama/sıra/lider), `POST /departments/:slug/archive`; silme yalnız arşivlenmiş ve görevi taşınmış departman için, tek transaction.
- `PATCH /members/:id` delta gövdesi (`addDepartments`, `removeDepartments`, `teamRole`), slug doğrulaması, son-yönetici ve hiyerarşi kuralları, tek transaction.
- Aday arama: min 3 karakter, yalnız `CUSTOMER`, `role` alanı yok, maskeli e-posta, oran sınırı; eklemede `userId`.
- `TeamInvite` modeli (email, teamRole, departmentSlugs[], token, expiresAt, invitedById) + kabul sayfası.
- Bir kerelik migrasyon: junction'ı tek doğruluk kaynağı yapın; `User.adminDepartment` bayat değerlerini temizleyin; görev/şablon/otomasyon `department` alanlarındaki yetim slug'ları raporlayın.
- İstemci: SWR + tipli `teamApi` modülü, skeleton yükleme, ortak hata eşleme.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ekip/departmanlar`** (`app/admin/ekip/departmanlar/page.tsx:1-5`): Aynı `TeamDepartments` bileşenini birebir render ediyor. Bu bilinçli "çift panel" mimarisi (paylaşılan bileşen) olduğu için kod kopyası yok; ancak iki rota iki ayrı bakım/erişim yüzeyi demek. Uzun vadede ekip modülünün rol-bağımsız tek bir çalışma alanına (`/ekip`) taşınması ve iki panelden de oraya yönlendirme yapılması önerilir (bkz. Bulgu 9). Kısa vadede iki rota korunabilir; bileşene `viewer` bilgisi geldiğinde iki panel otomatik olarak doğru davranır.
- **Pano "Kişiler" görünümü** (`components/team/team-board.tsx:1247-1248`): Yönetici için "kim ne yapıyor" görünümü; departman sayfasındaki üye listesiyle kısmen örtüşüyor (doğrulanmadı: alan bazında tam karşılaştırma yapılmadı). Önerilen departman detay çekmecesi, Kişiler görünümüne derin link vererek ikisini tamamlayıcı hale getirmeli; birleştirme gerekli değil.
- **`/customer/squads`** ile isim/konsept benzerliği yok sayılabilir: o tüketici sosyal grubu, bu iç ekip yönetimi. Ancak tüketici panelinde iç araç barındırmak bilgi mimarisini bulandırıyor; bu da çalışma alanına taşıma önerisini destekliyor.
- **Karar:** Kaldırma veya birleştirme değil; **koru-iyileştir** (öncelik sırası: Bulgu 1 → 3 → 2 → 4/5 → 6 → 8 → 7 → 9 → 10-12).

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı (kod değiştirilmedi, veritabanına dokunulmadı). Okunan dosyalar: `app/customer/ekip/departmanlar/page.tsx`, `components/team/team-departments.tsx`, `app/api/admin/team/members/route.ts`, `app/api/admin/team/departments/route.ts`, `lib/team-access.ts`, `proxy.ts`, `prisma/schema.prisma` (Department/UserDepartment/CompanyTask/TaskTemplate/TeamAutomation).

### İddia 1 — Ekip yöneticisi (CUSTOMER rolü) tüm kullanıcı tabanının PII'sini çekebiliyor → **DOĞRULANDI**

- `proxy.ts:105-119`: `/api/*` istekleri rol kontrolünden geçmez, yalnız güvenlik/CORS başlığı eklenir. Yani `/api/admin/...` ön eki ADMIN koruması sağlamaz; tek kapı route içindeki kontroldür.
- `lib/team-access.ts:12` `requireAuth(['ADMIN','DEALER','CUSTOMER','STAFF'])`; `:29` `isManager = isAdmin || teamRole === 'yonetici'`. CUSTOMER rolündeki bir stajyere `adminTeamRole='yonetici'` atanmışsa `manager:true` kapısını geçer.
- `app/api/admin/team/members/route.ts:15-26`: `q` boşsa isim/e-posta filtresi hiç uygulanmaz; tek koşul `adminTeamRole: null`. Dönen alanlar `id, name, email, image, role` — `role` ADMIN hesaplarını da etiketler. `take: 20`, `orderBy: name asc`. Oran sınırı, rol (yalnız CUSTOMER) filtresi, minimum sorgu uzunluğu yok.
- `components/team/team-departments.tsx:49-60, 238`: Popover açılınca `setSearch('')` + effect → `?q=` isteği; normal kullanımda bile alfabetik ilk 20 kullanıcı (rastgele değil, isim sırasıyla) listelenir.
- Yeniden üretim: yönetici (CUSTOMER + `adminTeamRole='yonetici'`) oturumuyla `GET /api/admin/team/members?q=@gmail`, `?q=a`, `?q=ab` … çağrıları; her biri 20 kayıt döner, iki harfli kombinasyonlar ve alan adlarıyla (`@`, `.com`, `bayi`) tüm müşteri/bayi/ADMIN e-postaları ve rolleri toplanabilir. Projenin kendi tehdit modeli (`proxy.ts:76-77` yorumu: "kötü niyetle ADMIN yapılan stajyer") stajyerleri tam güvenilir saymadığı için bu gerçek bir yetki-aşımı/veri ifşasıdır. Ek not: aynı yönetici `POST` ile herhangi bir kullanıcıyı ekibe alıp `PUT` ile `yonetici` yapabildiği için yetki zinciri kendi kendini genişletebilir.
- Önem: YÜKSEK (KVKK kapsamında kişisel veri ifşası). Öneri raporun önceki bölümündeki "aday arama" maddesiyle uyumlu: min 3 karakter, yalnız ekibe alınabilir hedef kitle, `role` alanını kaldırma, maskeli e-posta, oran sınırı, eklemede `userId`.

### İddia 2 — Bayat departman slug'ı PUT /members'ı yakalanmamış 500'e düşürüyor → **DOĞRULANDI** (önem: ORTA)

- `prisma/schema.prisma:2853` `UserDepartment.department` → `Department.slug`, `onDelete: Cascade`; `User.adminDepartment` (`:39`) FK'siz düz string. `departments/route.ts:125` departman silinince junction satırları silinir, `adminDepartment` temizlenmez (repo genelinde departman silmede `adminDepartment`'ı sıfırlayan başka kod yok; tek `adminDepartment: null` yazımı `members/route.ts:150` üye çıkarmada).
- `departments/route.ts:49-50`: junction boşsa `adminDepartment`'a düşülür → silinmiş slug istemciye geri gelir; UI rozeti `d?.name ?? slug` ile ham slug olarak gösterir (`team-departments.tsx:305`).
- `team-departments.tsx:88-95`: yeni departman eklenince `next = [bayatSlug, yeniSlug]` gönderilir. `members/route.ts:39-48` önce `deleteMany`, sonra `createMany(skipDuplicates)`; `skipDuplicates` Postgres'te `ON CONFLICT DO NOTHING`'dir ve yalnız unique çakışmayı yutar, FK ihlalini (P2003) yutmaz. `PUT` (`:118-120`) çağrıyı try/catch'siz yapar → işlenmemiş istisna → 500. `user.update`'e hiç ulaşılmaz.
- Yeniden üretim: tek departmanlı üye (ör. `pazarlama`) → `pazarlama` departmanını sil → sayfayı yenile (üyede `pazarlama` rozeti ham slug olarak kalır) → üyeye `ar-ge` ekle → PUT 500, "Güncellenemedi" toast'ı, `load()` sonrası değişiklik kaybolur. Bayat rozet önce tıklanıp kaldırılırsa (`next=[]`) akış düzelir; yani geçici çözüm var ama kullanıcı nedenini bilemez.
- Yarım güncelleme riski de gerçek: istemci durumu bayatken (başka sekmede departman silinmiş) üyenin `['ar-ge','silinen','yeni']` gönderilmesi `deleteMany`'nin geçerli `ar-ge` satırını silip `createMany`'nin patlamasıyla sonuçlanır; transaction olmadığı için junction boş, `adminDepartment` eski değerde kalır. Ayrıca API'ye doğrudan rastgele slug gönderen her çağrı da 500 üretir (slug doğrulaması yok).
- Not: canlı şemada FK'nin varlığı doğrudan doğrulanmadı (repo'da migration SQL yok, `db push` varsayımı; `relationMode` tanımsız → varsayılan `foreignKeys`). FK yoksa cascade de çalışmaz ve bu senaryo farklı biçimde (yetim junction satırı) ortaya çıkar.
- Önem gerekçesi: güvenlik açığı değil; sınırlı veri tutarsızlığı + kurtarılabilir hata. KRİTİK/YÜKSEK yerine ORTA.

### İddia 3 — Departman silme onaysız hard delete ve referansları yetim bırakıyor → **DOĞRULANDI** (önem: ORTA; bir kısmı abartılı)

- `team-departments.tsx:126-130, 217`: silme butonu tek tık, onay/geri al yok; `opacity-0 group-hover:opacity-100` olduğu için masaüstünde görünmez ama tıklanabilir, dokunmatik cihazlarda satırın sağına dokunmak görünmez butonu tetikleyebilir. `fetch(...).catch(() => {})` → `res.ok` kontrol edilmez, hata/başarı bildirimi yok.
- `departments/route.ts:125-129`: `prisma.department.delete(...).catch(() => null)` hatayı yutar, yine de audit log yazar ve `success: true` döner (olmayan slug için de).
- Gerçek kullanıcı etkisi: yanlışlıkla tek tık → departmanın tüm üye atamaları (UserDepartment, cascade) geri dönüşsüz silinir; yönetici bunu toast bile görmeden kaybeder.
- Abartılı kısım: `CompanyTask.department` (`schema.prisma:2866`), `TaskTemplate.department` (`:2925`), `TeamAutomation.department` (`:3015`) FK'siz string; slug korunduğu için aynı adla departman yeniden oluşturulursa (`POST` slug üzerinden `upsert`, `departments/route.ts:98`) görevler/şablonlar/otomasyonlar kendiliğinden yeniden bağlanır — yani görev verisi kaybolmaz, yalnızca üye atamaları kaybolur. Yetim slug'ın etkisi görsel (ham slug görünür, departman filtresinde seçilemez) ve departman-kapsamlı otomasyonun sessizce eşleşmeyi sürdürmesidir; güvenlik etkisi yok.
- Önem gerekçesi: KRİTİK değil; geri alınamaz üye-atama kaybı + sessiz hata nedeniyle ORTA.

## Uygulama (Dalga 2)

Özellik envanteri yeni durumları:
- Önceden ÇALIŞIYOR satırlar (1, 3, 6-8, 12-13, 15, 18, 21, 25, 27): **ÇALIŞIYOR** (`components/team/departments/*`; sayfa sunucu bileşeni, ilk veri sunucuda).
- 24 Silinmiş departmanın bayat rozeti (BOZUK): **ÇALIŞIYOR** — `loadTeamMeta` bilinmeyen slug'ları süzer (testli).
- 28 Rol farkındalığı (EKSİK): **ÇALIŞIYOR** — üyeye salt-okunur görünüm, yönetici aksiyonları `can.*` ile.
- 29 Departman düzenleme (ad/renk/açıklama/sıra/arşiv) (EKSİK): **ÇALIŞIYOR** — `department-card.tsx` + PATCH.
- 30 Yıkıcı işlemlere onay (EKSİK): **ÇALIŞIYOR** — etki önizlemeli onay (`?impact=`).
- 31 Sayfa başlığı (EKSİK): **ÇALIŞIYOR** — `metadata`.
- 35 i18n (EKSİK): **KISMI** — metinler tam Türkçe; `t()` anahtarlarına taşınmadı (iç araç, yalnız Türkçe).
- Ek: değişiklik geçmişi paneli (`audit-panel.tsx`), üye arama/filtre; 200 üye sessiz kesilmesi → 500 + `membersTruncated` uyarısı.

Kapanan bulgular (6): 24, 28, 29, 30, 31, sessiz kesilme. Kalan: 35 (i18n).

**Mimari:** Tek paylaşılan çalışma alanı `components/team/team-workspace.tsx` (+ `board/`, `task-detail/`, `departments/`, `dialogs/`, `initiatives/`, `lib/`) iki panelde de kullanılır; sayfalar sunucu bileşeni, ilk boyama verisi `lib/team/page-bootstrap.ts` + `lib/team/meta.ts` ile sunucuda yüklenir. teamOnly erişim (`lib/team/access.ts` requireTeamViewer, `capabilitiesFor` yetenekleri) korunur; yazma uçları `defineRoute` (rol + zod + rate limit). Test: `__tests__/team/meta.test.ts` (2/2).

**Kalanlar:**
- Eski monolit bileşenler (`components/team/team-board.tsx`, `task-detail-sheet.tsx`, `team-departments.tsx`, `team-activity.tsx`, `team-performance.tsx`, `team-files.tsx`, `ai-qa-dialog.tsx`, `ai-summary-dialog.tsx`, `automations-dialog.tsx`, `tags-dialog.tsx`, `templates-dialog.tsx`) hiçbir rotadan import edilmiyor (ölü kod); silme bu oturumda izin sınırına takıldı, sonraki temizlikte kaldırılmalı.
- Canlı tarayıcı doğrulaması yapılmadı (dev server yasak); tip denetimi temiz.
