# /admin/referrals

**Amaç:** Platform operatörünün davet (referral) programını izlemesi: toplam davet hacmi, davet kaynaklı puan maliyeti, en çok kullanılan referans kodları (aktif/pasif yapma) ve son davet kayıtları.

**Genel puan:** 4/10 · **Karar:** yeniden tasarla

Sayfa ince bir CRUD görünümü; API tabanı (`app/api/admin/referrals/route.ts`) kullanılabilir durumda. Ancak sayfa, bir **puan basan (point-minting) ekonomi kanalının** yönetim yüzeyi olmasına rağmen hile sinyali, limit yönetimi, kademe (milestone) maliyeti, denetim kaydı ve kullanıcı bağlamı içermiyor. Arama ve sıralama iki farklı listeye karışık uygulanıyor, hata durumunda sayfa kilitleniyor ve sayfanın izlediği verinin kendisi kayıt akışındaki bir açık yüzünden kirlenebilir (bkz. B1).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Okuma ve tek aksiyon (kod aç/kapa) çalışıyor; fakat arama kodlara uygulanmıyor, toggle yalnız ilk 20 koda erişebiliyor, CSV yalnız mevcut sayfayı alıyor, kademe maliyeti KPI'a girmiyor. |
| UX | 3/10 | Tek sıralama kutusu iki ayrı listeyi yönetiyor, yıkıcı aksiyonda onay yok, boş/hata durumu yok, ilk yüklemede KPI'lar yanıltıcı biçimde "0" gösteriyor. |
| Görsel | 3/10 | Ham `Card` yığını; durum rozeti, sayı biçimlendirme, tablo, grafik yok; diğer admin sayfalarının `AdminPremiumHero` dışındaki görsel diliyle zayıf uyum. |
| Mimari | 4/10 | `useEffect`+`fetch` elle yönetiliyor, try/finally yok, yarış koşulu var; route'larda try/catch ve audit log yok; referral ayarları üç farklı sayfaya dağılmış. |
| Performans | 6/10 | 4 sorgu `Promise.all` ile paralel, sayfalama sunucuda; ama her sayfa değişiminde global aggregate yeniden hesaplanıyor ve "Filtrele" çift istek atabiliyor. |
| Erişilebilirlik + Mobil | 4/10 | Liste düzeni dar ekranda kırılmıyor; fakat arama ve select etiketsiz, kod durumu yalnız buton rengi/metniyle anlatılıyor, Enter ile arama yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa erişim kontrolü (UI) | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-87` | ADMIN rolü + gizli kapı cookie'si. |
| 2 | API erişim kontrolü | KISMİ | `app/api/admin/referrals/route.ts:10`, `:79`; `proxy.ts:105-118` | `requireAuth(['ADMIN'])` var; ancak gizli kapı (gate cookie) `/api/*` için uygulanmıyor (platform geneli, bkz. B4). |
| 3 | Başlık ve açıklama (PageHeader) | ÇALIŞIYOR | `page.tsx:74-77` | "Davet / Referral Yönetimi" — TR/EN karışık. |
| 4 | CSV dışa aktarma | KISMİ | `page.tsx:54-70`, `:77` | Yalnız ekrandaki 20 satır; kod/durum/puan/e-posta kolonları yok; formül enjeksiyonu koruması yok; BOM yok (B5). |
| 5 | Yenile butonu | KISMİ | `page.tsx:77`, `:24-36` | Çalışır; fakat `load` hata verirse `loading` sonsuza kadar `true` kalır ve buton kalıcı olarak devre dışı olur (B3). |
| 6 | Arama kutusu | KISMİ | `page.tsx:81`; `route.ts:19-27` | Yalnız davet loglarını filtreler (kod + referrer/referred e-posta). İsimle aranmaz, "En Çok Kullanılan Kodlar" listesine hiç uygulanmaz; Enter ile tetiklenmez. |
| 7 | Sıralama seçicisi | KISMİ | `page.tsx:82-91`; `route.ts:29-33` | `newest/oldest` yalnız loglara, `usage_desc/usage_asc` yalnız kod listesine etki eder; tek kontrol iki listeyi gizlice yönetir (B6). |
| 8 | Filtrele butonu | KISMİ | `page.tsx:92`, `:37` | `setPage(1); load()` — sayfa ≠1 iken eski `page` ile bir istek, efektten ikinci bir istek; yanıt sırası belirsiz (B2). |
| 9 | KPI: Toplam referral | ÇALIŞIYOR | `page.tsx:96`; `route.ts:36-39`, `:63` | Global sayı; filtreden bağımsız olduğu belirtilmiyor; yüklenirken "0". |
| 10 | KPI: Referrer puanı | KISMİ | `page.tsx:97`; `route.ts:64` | Yalnız `Referral.pointsEarned` toplamı; kademe bonusları (`referral_milestone`, kişi başı 4.600 puana kadar) dahil değil (B7). |
| 11 | KPI: Referred bonus | ÇALIŞIYOR | `page.tsx:98`; `route.ts:65` | Sayı biçimlendirmesi yok (`toLocaleString` yok). |
| 12 | En Çok Kullanılan Kodlar listesi | KISMİ | `page.tsx:100-115`; `route.ts:50-56` | Sabit `take: 20`, sayfalama/arama yok; `maxUsage`, oluşturulma tarihi, aktif/pasif rozeti yok; `usage_asc` seçiliyken başlık "En Çok" kalıyor. |
| 13 | Kod aktif/pasif yapma | KISMİ | `page.tsx:39-52`, `:108-110`; `route.ts:78-96` | Çalışır; fakat onay yok, bekleme durumu yok (çift tık), audit log yok, kod sahibine bildirim yok, sebep alanı yok, hata yolları zayıf (B8, B9). |
| 14 | Son Davet Logları listesi | KISMİ | `page.tsx:116-126` | Yalnız isim→isim + tarih; kullanılan kod, durum, verilen puanlar, kullanıcı linki gösterilmiyor (API bu alanları zaten döndürüyor: `route.ts:40-49`). |
| 15 | Sayfalama (loglar) | ÇALIŞIYOR | `page.tsx:127-147`; `route.ts:15-16`, `:69-74` | Toplam kayıt sayısı (`pagination.total`) gösterilmiyor; sayfa numarası girişi yok. |
| 16 | Yükleniyor durumu | KISMİ | `page.tsx:18`, `:77` | Yalnız buton metni değişiyor; iskelet yok; ilk boyamada KPI'lar "0" (`?? 0`). |
| 17 | Boş durum | EKSİK | `page.tsx:103`, `:119` | Hiç davet/kod yoksa kartlar boş başlıkla kalıyor. |
| 18 | Hata durumu (istemci) | BOZUK | `page.tsx:32-35`, `:45` | try/catch/finally yok; ağ hatası veya JSON olmayan 500 gövdesi → yakalanmamış rejection + kalıcı loading; `!res.ok` sessizce yutuluyor. |
| 19 | GET route hata yönetimi | KISMİ | `route.ts:9-76` | try/catch ve `responseIfDatabaseUnavailable` yok; `page=abc` → `Number()` NaN → `Math.max(1, NaN)` = NaN → `skip: NaN` Prisma hatası. |
| 20 | PATCH route doğrulama | KISMİ | `route.ts:82-93` | zod yok; `Boolean("false") === true`; olmayan id → P2025 → yakalanmamış 500. |
| 21 | Toast geri bildirimi | KISMİ | `page.tsx:47`, `:50`; `lib/admin-toast.ts` | Çalışır; önek "Basarili: " Türkçe karaktersiz. |
| 22 | Mobil yerleşim | KISMİ | `page.tsx:80`, `:95`, `:104` | Grid/flex dar ekranda yığılıyor; uzun e-postalar kırılmadan taşabilir (doğrulanmadı, `break-words` layout'tan geliyor: `app/admin/layout.tsx:38`). |
| 23 | Erişilebilirlik (form) | KISMİ | `page.tsx:81-91`, `:108` | Input ve `<select>` için `label`/`aria-label` yok; durum yalnız buton varyantıyla iletiliyor. |
| 24 | Modül açık/kapalı göstergesi | EKSİK | `app/api/referral/route.ts:26` | `referrals` modülü kapalıyken sayfa bunu hiç söylemiyor. |
| 25 | Davet limitleri yönetimi | EKSİK | `lib/innovation-config.ts:38-41`, `:70-73` | `maxInvitesPerReferrerLifetime` / `maxRedemptionsPerReferralCodePerMonth` hiçbir admin UI'da düzenlenemiyor (`app/admin/innovation/page.tsx` içinde "referral" geçmiyor). |
| 26 | Kademe (milestone) görünürlüğü | EKSİK | `lib/referral-milestones.ts:20-25` | Kademe eşikleri kodda sabit; kim hangi kademeyi aldı, toplam maliyet nedir görünmüyor. |
| 27 | Hile/anomali sinyalleri | EKSİK | — | Aynı IP/cihazdan zincir davet, doğrulanmamış e-posta ile davet, kısa sürede patlama gibi sinyal yok. |
| 28 | Kullanıcıya/koda derin bağlantı | EKSİK | `page.tsx:105`, `:121` | Referrer/referred satırları `/admin/users` detayına gitmiyor. |
| 29 | Zaman serisi / trend grafiği | EKSİK | — | Günlük/haftalık davet ve puan maliyeti eğrisi yok. |

**Sayım:** ÇALIŞIYOR 5 · KISMİ 16 · BOZUK 1 · SAHTE 0 · EKSİK 7 (toplam 29)

---

## Bulgular

### B1 — Kayıt akışı, davet limitlerini, modül kapısını ve e-posta doğrulamasını atlayarak puan basıyor
- **Önem:** kritik · **Kategori:** güvenlik / ekonomi bütünlüğü
- **Kanıt:** `app/api/auth/register/route.ts:56-64` (kullanıcı `emailVerified: null` ile oluşturuluyor), `:99-145` (davet hemen uygulanıp her iki tarafa puan yazılıyor). Karşılaştırma: `app/api/referral/route.ts:26` (modül kapısı), `:164-185` (ömür boyu ve aylık limitler). Kayıt yolunda bu kontrollerin hiçbiri yok; tek koruma IP başına dakikada 5 kayıt (`register/route.ts:14`).
- **Sorun:** Kendi kodunu ele geçiren biri, doğrulanmamış tek kullanımlık e-postalarla kayıt olarak her kayıtta referrer'a varsayılan 1.000 puan (`lib/points-rules.ts:63-66`) bastırabilir; 25 başarılı davette kademe bonusları da (+4.600) açılır. `innovation.referral` limitleri (100 ömür boyu / 30 aylık) bu yolda işlemez, modül kapalı olsa bile çalışır. Admin sayfası bu kirlenmiş veriyi "başarılı" olarak gösterir ve ayırt edecek hiçbir sinyal sunmaz. Bu, `points-economy-invariants` ilkesine (her puan basan yol aynı kurallardan geçmeli) aykırı.
- **Öneri:** Davet uygulama mantığını tek bir sunucu fonksiyonuna (ör. `lib/referral-apply.ts: applyReferral(tx, { referredId, code, source })`) çıkarın; hem `POST /api/referral` hem `register` bunu çağırsın. Kayıtta `Referral` kaydını `status: 'PENDING'` ve puansız oluşturun; puanları e-posta doğrulandığında (`/auth/verify-email` işleyicisi) atomik guard'lı `updateMany({ where: { id, status: 'PENDING' } })` ile `COMPLETED`'a çekip verin. Modül kapısı ve limitler bu ortak fonksiyonda uygulansın. Admin sayfasında PENDING/COMPLETED/EXPIRED ayrımı görünür olsun.
- **Efor:** M

### B2 — "Filtrele" yarış koşulu: çift istek, yanlış sayfanın sonucu kalabiliyor
- **Önem:** yüksek · **Kategori:** doğruluk
- **Kanıt:** `page.tsx:92` `onClick={() => { setPage(1); load(); }}`; `page.tsx:24-37` (`load` closure'ı mevcut `page` değerini okur; `useEffect` `[page, sort]` değişince tekrar `load` çağırır).
- **Sorun:** Kullanıcı 3. sayfadayken arama yapıp "Filtrele"ye basarsa birinci istek `page=3&q=...`, ikinci istek `page=1&q=...` ile gider. Yanıtlar ters sırada dönerse ekranda 3. sayfa sonucu kalır; iç state ise `page=1`'dir, sonraki "Önceki/Sonraki" tıklamaları tutarsızlaşır. Ayrıca yanıt iptali (AbortController) olmadığından hızlı sayfa değişimlerinde eski yanıt yenisini ezebilir.
- **Öneri:** Veri katmanını SWR/React Query'ye taşıyın (anahtar: `{q: debouncedQ, page, sort}`); aramayı `useDeferredValue`/debounce ile anahtar parçası yapın, "Filtrele" butonunu kaldırın veya yalnız `setAppliedQ` yapsın. Böylece istekler anahtar bazında tekilleşir ve eski yanıtlar otomatik olarak yok sayılır.
- **Efor:** S

### B3 — Hata durumunda sayfa kalıcı olarak "Yükleniyor..." durumunda kilitleniyor
- **Önem:** yüksek · **Kategori:** hata yönetimi
- **Kanıt:** `page.tsx:24-36` (try/finally yok), `page.tsx:77` (`disabled={loading}`); `route.ts:9-76` (try/catch yok → yakalanmamış istisna boş gövdeli 500 döner, `res.json()` atar).
- **Sorun:** Neon soğuk başlangıcı, token-replay 403'ü veya ağ kesintisinde `setLoading(false)` hiç çalışmaz; Yenile butonu kalıcı olarak devre dışı kalır ve kullanıcıya hiçbir hata mesajı gösterilmez. `!res.ok` durumunda da sessizce eski veri gösterilmeye devam edilir, admin bayat veriye bakarak karar verebilir.
- **Öneri:** API'de `try/catch` + `responseIfDatabaseUnavailable` (projede `app/api/referral/route.ts:107-112` deseni hazır) ve sayısal parametreler için zod şeması. İstemcide SWR'nin `error` durumu ile kart içi hata paneli + "Tekrar dene"; KPI'lar yüklenirken iskelet, hata sonrası "—".
- **Efor:** S

### B4 — Gizli admin kapısı API katmanında uygulanmıyor (platform geneli)
- **Önem:** yüksek · **Kategori:** güvenlik (savunma derinliği)
- **Kanıt:** `proxy.ts:105-118` (`/api/*` istekleri `authMiddleware`'e hiç girmiyor), `proxy.ts:76-87` (gate cookie kontrolü yalnız `/admin` sayfaları için); `route.ts:10`, `:79` yalnız rol kontrolü yapıyor.
- **Sorun:** Kapının belirtilen amacı "rolü kazara ADMIN yapılan stajyer bile gizli rakamı bilmeden panele giremez" (`proxy.ts:77-78`). Ancak böyle bir kullanıcı `/api/admin/referrals`'a doğrudan GET atarak tüm kullanıcıların e-postalarını sayfalı çekebilir ve PATCH ile herhangi bir referans kodunu kapatabilir. Bu sayfaya özgü değil, fakat bu sayfanın iki ucunu da etkiliyor.
- **Öneri:** `requireAuth` içine `ADMIN` rolü istenen durumlarda gate cookie doğrulaması ekleyin (`gateCookieBelongsTo` mevcut, `lib/admin-gate-edge`), ya da proxy'de `/api/admin/*` için aynı kontrolü yapın. Tek noktadan çözüm tüm admin API'lerini kapsar.
- **Efor:** S

### B5 — CSV dışa aktarma: yalnız ekrandaki sayfa, eksik kolonlar ve formül enjeksiyonu
- **Önem:** orta · **Kategori:** güvenlik / işlevsellik
- **Kanıt:** `page.tsx:55` (`data?.recent` = yalnız mevcut 20 satır), `:56` (yalnız id/referrer/referred/createdAt), `:59` (yalnız `"` kaçışı), `:63` (BOM yok).
- **Sorun:** (a) "CSV" butonu bütün kümeyi dışa aktarıyormuş gibi görünse de 20 satır verir. (b) Kullanıcı adı `=HYPERLINK(...)` veya `+cmd|...` ile başlarsa admin Excel'de açtığında formül çalışır (CSV/formula injection; ad alanı kullanıcı kontrollü). (c) BOM olmadığı için Excel Türkçe karakterleri bozabilir. (d) Kod, durum, puan ve e-posta olmadan analiz değeri düşük.
- **Öneri:** Sunucu tarafı `GET /api/admin/referrals/export?q=&from=&to=` (stream, mevcut filtreleri uygulayan, satır sınırı ve audit kaydı olan). Hücrelerde `= + - @ \t \r` ile başlayan değerlerin başına `'` ekleyin, `﻿` BOM koyun; kolonlar: tarih, kod, referrer adı/e-posta, referred adı/e-posta, durum, referrer puanı, referred bonusu, e-posta doğrulandı mı.
- **Efor:** S

### B6 — Tek sıralama kutusu iki farklı listeyi gizlice yönetiyor; arama kodlara uygulanmıyor
- **Önem:** orta · **Kategori:** UX / bilgi mimarisi
- **Kanıt:** `page.tsx:87-90`; `route.ts:29-33` (`usage_*` seçildiğinde loglar `newest`'e düşer, `oldest` seçildiğinde kodlar `usage_desc`'te kalır); `route.ts:50-56` (kod sorgusunda `where` yok); `page.tsx:101` (başlık her zaman "En Çok Kullanılan Kodlar").
- **Sorun:** Admin "Kod kullanım: Azdan çoğa" seçince loglar sessizce sıfırlanır ve "En Çok Kullanılan" başlığı altında en az kullanılanlar listelenir. Daha önemlisi, belirli bir kullanıcının kodunu bulup kapatmanın yolu yok: arama kodlara uygulanmıyor ve liste 20 ile sınırlı. Hile şüphesi olan orta sıradaki bir kod yönetilemez.
- **Öneri:** İki sekme: "Kodlar" ve "Davetler". Her sekmenin kendi arama/sıralama/sayfalamasını taşıyan veri tablosu (shadcn `Table` + `@tanstack/react-table` veya mevcut admin tablo bileşeni). API'yi iki uca ayırın: `GET /api/admin/referrals/codes?q=&sort=&page=` (kod, sahip adı/e-posta araması) ve `GET /api/admin/referrals/events?...`; KPI'lar ayrı `GET /api/admin/referrals/summary` (Redis cache'li, 60 sn).
- **Efor:** M

### B7 — "Referrer puanı" KPI'ı davet kaynaklı puan maliyetini eksik gösteriyor
- **Önem:** orta · **Kategori:** veri doğruluğu
- **Kanıt:** `route.ts:38`, `:64` (yalnız `Referral.pointsEarned`); kademe bonusları `app/api/referral/route.ts:327-336` içinde `analyticsEvent` `category: 'referral_milestone'` olarak yazılıyor ve `Referral` tablosuna yansımıyor.
- **Sorun:** Ekonomi kararı veren admin, davet programının gerçek maliyetini düşük görür (kademe başına 200–3.000 puan, kişi başı en fazla 4.600).
- **Öneri:** Özet ucunda `analyticsEvent` üzerinde `event='points_credited' AND category IN ('referral','referral_milestone')` toplamını ayrı ayrı döndürün; KPI şeridi "Davet başı ödül", "Kademe bonusu", "Toplam davet maliyeti" ve bunun platform toplam basılan puana oranı şeklinde gösterilsin. Bu sorgu için `analyticsEvent(event, category, createdAt)` indeksinin varlığı doğrulanmalı (doğrulanmadı).
- **Efor:** S

### B8 — Kod aktif/pasif aksiyonu denetim kaydı bırakmıyor, onay ve bekleme durumu yok
- **Önem:** orta · **Kategori:** güvenlik / UX
- **Kanıt:** `route.ts:89-95` (`auditLog.create` yok; karşılaştırma `app/api/admin/coupons/route.ts:79-87`); `page.tsx:108` (onay yok, `disabled` yok).
- **Sorun:** Kimin hangi kodu ne zaman ve neden kapattığı izlenemez; yanlışlıkla tıklanan "Pasife Al" (destructive varyant) anında uygulanır; çift tık iki PATCH atar.
- **Öneri:** PATCH'te `auditLog.create({ action: 'REFERRAL_CODE_TOGGLE', entity: 'ReferralCode', oldData, newData, ...getAuditRequestMeta(request) })` ve isteğe bağlı `reason` alanı (zod). UI'da pasife alma için `AlertDialog` (sebep seçimi: hile şüphesi / kullanıcı talebi / diğer), satır içi iyimser güncelleme + bekleme durumu, başarıda `toast` ile "Geri al" aksiyonu.
- **Efor:** S

### B9 — Kodu kapatılan kullanıcı bunu hiçbir yerde görmüyor
- **Önem:** orta · **Kategori:** ürün tutarlılığı
- **Kanıt:** `app/api/referral/route.ts:98-106` (`isActive` yanıtta yok); `app/customer/referral/page.tsx:113-123` (kod kopyalanıp paylaşılmaya devam ediliyor); kodu girenler İngilizce "This referral code is no longer active" hatası alıyor (`app/api/referral/route.ts:157`).
- **Sorun:** Admin kodu kapattıktan sonra kullanıcı paylaşmaya devam eder, davet ettiği kişiler İngilizce hata görür; destek yükü ve güven kaybı.
- **Öneri:** Kapatma sırasında kod sahibine bildirim (isteğe bağlı, sebep metniyle); `GET /api/referral` yanıtına `codeActive` ekleyip müşteri sayfasında paylaşım alanını kilitleyin; hata mesajlarını i18n anahtarlarına taşıyın.
- **Efor:** S

### B10 — Referral ayarları üç sayfaya dağılmış, biri ölü
- **Önem:** orta · **Kategori:** mimari / bilgi mimarisi
- **Kanıt:** Ödül miktarları `app/admin/points-matrix/page.tsx:650-677`; `app/admin/settings/settings-client.tsx:1792-1798` "Referans Puanı" (`pointsPerReferral`, varsayılan 50) hiçbir sunucu kodunda okunmuyor (grep: yalnız bu dosyada geçiyor); limitler `lib/innovation-config.ts:70-73` ve hiçbir UI'da düzenlenmiyor; kademeler `lib/referral-milestones.ts:20-25` kodda sabit.
- **Sorun:** Admin "Referans Puanı"nı ayarlar sayfasında 50 yapıp etkisiz olduğunu fark etmez; gerçek değer (1.000/500) başka sayfada. Limitler ve kademeler ise hiç yönetilemez.
- **Öneri:** `/admin/referrals` sayfasına "Kurallar" sekmesi: ödül miktarları (points-matrix'in `referral` dalını okuyup yazan), limitler (`saveInnovationPlatformConfig({ referral })`), kademe tablosu (kodda sabit dizi yerine `Settings` anahtarına taşınmış, varsayılanı mevcut dizi). `settings-client.tsx` içindeki ölü `pointsPerReferral` alanı kaldırılmalı veya bu sekmeye yönlendiren bir bağlantıya dönüşmeli.
- **Efor:** M

### B11 — Davet logları, API'nin zaten döndürdüğü kritik alanları göstermiyor
- **Önem:** düşük · **Kategori:** UX
- **Kanıt:** `route.ts:40-49` (`include` ile tüm `Referral` alanları dönüyor: `referralCode`, `status`, `pointsEarned`, `bonusGiven`, `completedAt`); `page.tsx:12` tip ve `:119-124` render yalnız isim + tarih kullanıyor.
- **Sorun:** Admin hangi kodun kullanıldığını, kaç puan dağıtıldığını ve durumu görmek için başka araca gitmek zorunda.
- **Öneri:** Tablo kolonları: tarih (göreli + tooltip'te mutlak), kod (tıklanınca o koda filtre), referrer → referred (kullanıcı detay linkleri), durum rozeti, puanlar, e-posta doğrulandı işareti.
- **Efor:** S

### B12 — Dil ve biçim tutarsızlıkları, erişilebilirlik eksikleri
- **Önem:** düşük · **Kategori:** erişilebilirlik / i18n
- **Kanıt:** `page.tsx:75` "Davet / Referral Yönetimi", `:97-98` "Referrer puanı", "Referred bonus"; sidebar etiketi `messages/tr.json:2479` "Davet Yönetimi" ile başlık farklı; `lib/admin-toast.ts` "Basarili: "; `page.tsx:81-91` etiketsiz input/select; `page.tsx:96-98` sayılar biçimsiz; sayfa i18n (`t()`) kullanmıyor, sabit Türkçe.
- **Öneri:** Terimleri sabitleyin: "Davet eden", "Davet edilen", "Davet ödülü", "Hoş geldin bonusu". `aria-label`/görünür etiketler, kod durumu için metinli rozet (renge bağımlı olmayan), `Intl.NumberFormat('tr-TR')`. Toast önekini "Başarılı" olarak düzeltin (global etki).
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, PostHog, Linear, Retool)

1. **Hile/anomali paneli:** aynı IP/cihaz/e-posta alan adından gelen davet kümeleri, doğrulanmamış e-postalı davetler, bir referrer'ın saatlik/günlük patlaması, davet edilenlerin ilk 7 günde hiç aktivite yapmaması ("boş hesap" oranı). Stripe Radar'ın "risk sinyalleri" yaklaşımı.
2. **Huni ve kohort analizi:** paylaşım → kayıt → e-posta doğrulama → ilk tarama/feedback → 30 gün tutunma; davetle gelen ve organik kullanıcıların tutunma karşılaştırması (PostHog funnel/retention). Projede PostHog zaten kurulu.
3. **Zaman serisi:** günlük davet sayısı ve davet kaynaklı puan maliyeti; dönem seçici (7/30/90 gün) ve önceki dönemle kıyas.
4. **Referrer liderlik tablosu ve kullanıcı çekmecesi:** bir referrer'a tıklayınca yan panelde tüm davet zinciri, kazanılan puan, kademe durumu, hile skoru ve hızlı aksiyonlar (kodu kapat, puan geri al, `fraudStatus` işaretle).
5. **Toplu ve geri alınabilir aksiyonlar:** çoklu kod seçip kapatma, belirli bir davetin puanını ters kayıtla geri alma (ekonomi invariant'larına uygun, `points_credited` karşılığı `points_debited`).
6. **Program kuralları ve limitlerin tek yerden yönetimi:** ödül miktarları, limitler, kademeler, kod başına `maxUsage` düzenleme, değişiklik geçmişiyle (Linear tarzı aktivite akışı).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Admin sayfayı açtığında üç soruya beş saniyede cevap bulmalı: *Davet programı büyüyor mu? Bana kaça mal oluyor? Kötüye kullanan var mı?* Ardından tek tıkla şüpheli bir referrer'ın detayına inip aksiyon alabilmeli.

**Yerleşim:**
- **Üst şerit (`AdminPremiumHero` + dönem seçici):** modül durumu rozeti (açık/kapalı, `/admin/modules`'e link), dönem seçici, "Dışa aktar" (sunucu tarafı).
- **KPI satırı (4 kart, her biri önceki döneme göre değişim yüzdesiyle):** Davet sayısı · Doğrulanmış davet oranı · Toplam davet maliyeti (ödül + kademe) · Şüpheli davet sayısı (tıklanınca Risk sekmesine filtreli geçiş).
- **Trend grafiği:** davet sayısı (çubuk) + maliyet (çizgi), 30 gün varsayılan.
- **Sekmeler:** `Davetler` (sunucu sayfalamalı tablo, URL'e yazılan filtre durumu) · `Kodlar` (arama, durum filtresi, `maxUsage` satır içi düzenleme) · `Referrer'lar` (liderlik + hile skoru) · `Risk` (sinyal listesi) · `Kurallar` (ödül/limit/kademe formu).
- **Sağ çekmece (Sheet):** kullanıcı veya kod detayı; aksiyonlar burada, onay diyaloğuyla.

**Motion / 3D:** Bu bir operasyon ekranı; 3D yersiz. Ölçülü motion yeterli: KPI sayılarında kısa sayaç geçişi, sekme değişiminde `m.div` ile 120–160 ms opaklık/kayma, çekmece açılışında shadcn `Sheet`'in varsayılan geçişi, iyimser toggle'da satır rozetinin renk geçişi. Tümü `useReducedMotion()` ile kapatılabilir olmalı (global LazyMotion `m as Motion` deseni).

**Veri / API değişiklikleri:**
- `lib/referral-apply.ts`: tek davet uygulama fonksiyonu (B1), kayıt ve `POST /api/referral` buradan geçer; PENDING → doğrulamada COMPLETED.
- `GET /api/admin/referrals/summary?from&to`: KPI + trend; Upstash Redis'te 60 sn cache (projedeki cache deseni).
- `GET /api/admin/referrals/events`, `GET /api/admin/referrals/codes`, `GET /api/admin/referrals/referrers`: zod ile doğrulanan sorgu parametreleri, cursor veya offset sayfalama, try/catch + `responseIfDatabaseUnavailable`.
- `PATCH /api/admin/referrals/codes/[id]`: `isActive`, `maxUsage`, `reason`; `auditLog` + isteğe bağlı sahibine bildirim.
- `GET /api/admin/referrals/risk`: IP/UA kümeleri için kayıt sırasında davet edilenin `getAuditRequestMeta` bilgisinin `Referral`'a (veya `analyticsEvent.data`'ya) yazılması gerekir; şu an bu bilgi davet kaydında tutulmuyor (`prisma/schema.prisma:1722-1740`).
- Admin gate kontrolünün API katmanına taşınması (B4).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/points-matrix` (Referral kartı, `page.tsx:650-677`):** davet ödül miktarlarını yönetiyor. Kaynak orada kalabilir, ancak `/admin/referrals` → "Kurallar" sekmesi aynı veriyi okuyup yazmalı veya oraya derin link vermeli; iki yerde bağımsız form olmamalı.
- **`/admin/settings` "Referans Puanı" (`settings-client.tsx:1792-1798`):** ölü ayar; kaldırılmalı. Mevcut haliyle admini yanıltıyor.
- **`/admin/innovation`:** davet limitlerinin sahibi config, ama UI'da yok; limit düzenleme `/admin/referrals` "Kurallar" sekmesine alınmalı.
- **`/admin/fraud-prevention` ve `/admin/trust-command`:** davet hilesi sinyalleri bu sayfalarda yok. Önerilen "Risk" sekmesi `SuspiciousActivity` kayıtları üretip fraud-prevention akışına da düşmeli (tek hile kuyruğu).
- **`/admin/modules`:** `referrals` modülünün aç/kapa durumu burada; davet sayfası en azından durumu göstermeli ve linklemeli.
- **Karar:** Sayfa kaldırılmamalı ya da başka bir sayfayla birleştirilmemeli; tersine, dağınık referral yönetiminin **tek sahibi** olmalı. Mevcut sayfa tabanı (API iskeleti) korunup yukarıdaki sekme yapısıyla yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: İddialar kod okunarak çürütülmeye çalışıldı (salt okunur; DB, build, test, dev server çalıştırılmadı). İncelenen dosyalar: `app/admin/referrals/page.tsx`, `app/api/admin/referrals/route.ts`, `app/api/auth/register/route.ts`, `app/api/referral/route.ts`, `proxy.ts`, `lib/api-auth.ts`, `lib/admin-gate-edge.ts`, `app/api/admin/gate/route.ts`, `lib/points-rules.ts`, `lib/referral-milestones.ts`, `lib/innovation-config.ts`, `lib/auth.ts`, `prisma/schema.prisma`.

### 1. Kayıt yolu davet kurallarını atlayarak puan basıyor (referral farming) — **DOĞRULANDI (YÜKSEK)**

- `app/api/auth/register/route.ts:57-64` kullanıcıyı `emailVerified: null` ile oluşturuyor; aynı istek içinde `:101-145` davet satırını doğrudan `status: 'COMPLETED'` yazıp referrer'a `creditPointsAndXp` ile puan veriyor. E-posta doğrulaması puanın ön koşulu değil.
- Bu yolda yalnız `isActive` ve `maxUsage` kontrolü var (`:106-107`). `POST /api/referral`'daki `assertModuleEnabled('referrals')` (`app/api/referral/route.ts:120`), ömür boyu limit (`:164-171`, varsayılan 100: `lib/innovation-config.ts:71`) ve aylık kod limiti (`:173-185`, varsayılan 30: `lib/innovation-config.ts:72`) kayıt yolunda **hiç yok**. Yani `referrals` modülü kapalıyken bile kayıtla puan basılabiliyor.
- Varsayılan ödül: referrer 1000, davet edilen 500 (`lib/points-rules.ts:63-66`). Kademe bonusları 200+400+1000+3000 = 4600 (`lib/referral-milestones.ts:21-26`); `PUT /api/referral` (`:301-303`) yalnız `status: 'COMPLETED'` sayıyor, doğrulanmamış hesaplar da sayılıyor.
- Tek fren IP başına dakikada 5 kayıt (`register/route.ts:14`) → tek IP'den saatte ~300 kayıt.
- Hafifletici: davet edilen sahte hesap giriş yapamaz (`lib/auth.ts:165-168`), ama kazanç **referrer'da** birikiyor ve referrer gerçek, doğrulanmış bir hesap; kendi 500 puanlık "hoş geldin" kısmı kilitli kalsa da 1000/kayıt + kademe bonusu kullanılabilir.
- **Yeniden üretim:** A kendi kodunu alır (`GET /api/referral`). Betikle `POST /api/auth/register` gövdesine `{name, email: "x1@yok.invalid", password, role: "CUSTOMER", referralCode: "<A_KODU>"}` gönderir (format geçerli herhangi bir e-posta yeter; e-postanın var olması bile gerekmez). 25 istekten sonra A'nın bakiyesi +25 000, ardından `PUT /api/referral` ile +4600. Admin sayfası bu satırları normal davet gibi listeler: `route.ts:45-48` yalnız `id/name/email` seçer, `emailVerified` veya IP sinyali yok.
- Not: Bu bir admin sayfası hatası değil, puan ekonomisi açığı; admin sayfasının rolü yalnız "görünmez kılması". Düzeltme bölüm B1'deki tek `applyReferral` fonksiyonu + PENDING → doğrulamada COMPLETED yaklaşımıyla tutarlı.

### 2. Admin gizli kapısı API katmanında uygulanmıyor — **DOĞRULANDI (ORTA; "kritik" değil)**

- `proxy.ts:105-119`: `/api/*` istekleri `authMiddleware`'e hiç girmiyor; gate cookie kontrolü (`proxy.ts:79-88`) yalnız sayfa yollarında çalışıyor. `requireAuth` (`lib/api-auth.ts:52-80`) yalnız oturum + rol + token-replay kontrolü yapıyor; `admin_gate` cookie'si repo genelinde yalnız `app/api/admin/gate/route.ts` ve `lib/admin-gate*.ts`'te geçiyor, hiçbir API'de okunmuyor.
- **Yeniden üretim:** Rolü ADMIN olan ama gizli cevabı bilmeyen hesap girişten sonra tarayıcı konsolunda `fetch('/api/admin/referrals?pageSize=100&page=1')` çalıştırır → 200, tüm referrer/referred e-postaları döner; `fetch('/api/admin/referrals',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({referralCodeId:'<id>',isActive:false})})` → kod kapanır.
- Şiddet ayarı: Kapının kendisi zayıf bir ikinci faktör — cevap tek rakam (0-9), deneme limiti kullanıcı başına dakikada 8 (`app/api/admin/gate/route.ts:46`); yani aynı saldırgan kapıyı en geç ~2 dakikada deneyerek de aşabilir. Bu yüzden API bypass'ı tehdit modelini (proxy.ts:77-78'de belirtilen "kazara ADMIN yapılan stajyer") pratikte çok az zayıflatıyor. Bulgu gerçek ve tutarlılık açısından düzeltilmeli (ör. `requireAuth(['ADMIN'])` içinde `admin_gate` cookie'sini `lib/admin-gate.ts`'teki HMAC ile Node tarafında tam doğrulamak), ama tek başına KRİTİK değil; asıl önlem kapı cevabının entropisini artırmak ve deneme limitini sıkılaştırmak.

### 3. Hata durumunda istemci kalıcı olarak kilitleniyor — **DOĞRULANDI, KISMEN (DÜŞÜK; "kalıcı" abartılı)**

- Doğru olan: `page.tsx:24-36` `load()`'da try/catch/finally yok. `fetch` ağ hatasıyla reddedilirse veya `res.json()` JSON olmayan gövdede patlarsa `setLoading(false)` çalışmaz; `:77`'deki "Yenile" butonu "Yükleniyor..." durumunda devre dışı kalır, hata mesajı/toast gösterilmez, yakalanmamış Promise reddi oluşur. API tarafında `route.ts:9-76` try/catch içermiyor; DB erişilemezse Next.js gövdesiz/JSON olmayan 500 döner → aynı yol. Ayrıca `res.ok` false ama JSON geçerliyse `setData` yapılmıyor ve hiçbir hata gösterilmiyor (sessiz başarısızlık).
- Yanlış olan: kilit kalıcı değil. "Filtrele" butonu (`:92`) `disabled` değil ve `load()`'ı yeniden çağırıyor; sıralama `select`'i (`:85`) ve sayfa değişimi (`:37` effect) de `load()`'ı tetikliyor. Sonraki başarılı çağrı `setLoading(false)` yapar ve sayfa düzelir.
- `page=abc` → `Number('abc')` = NaN, `Math.max(1, NaN)` = NaN (`route.ts:15`) → `skip: NaN` Prisma doğrulama hatası → 500. Ancak sayfa istemcisi her zaman sayısal `page` gönderiyor (`page.tsx:28`); bu yalnız elle API çağrısında olur, kullanıcıyı etkilemez (girdi doğrulama eksikliği).
- **Yeniden üretim:** Sayfa açıkken ağı kes (DevTools → Offline) ve "Yenile"ye bas → buton "Yükleniyor..." olarak kalır, uyarı yok; ağı geri açıp "Filtrele"ye basınca toparlanır.
