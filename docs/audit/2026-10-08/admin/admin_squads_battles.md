# /admin/squads/battles

**Amaç:** Platform operatörünün klan (squad) savaşlarını listelemesi, iki klan arasında savaş planlaması, aktif savaşı elle bitirmesi ve bekleyen savaşı iptal etmesi.
**Genel puan:** 3.5/10
**Karar:** yeniden inşa (ve `/admin/squads` altında "Savaşlar" sekmesi olarak birleştir)

> Kısa özet: Sayfa görünüşte çalışıyor ama ekonomik olarak yanıltıcı. Admin'in oluşturduğu savaşın "ödül havuzu" **hiçbir zaman ödenmiyor** (escrow yok, `rewardFunded=false`). Kullanıcılar ise bu savaşı "X size meydan okudu! Ödül havuzu: 500 puan" diye görüyor. "İptal" düğmesi, oyuncunun başlattığı fonlanmış bir meydan okumayı **iade yapmadan hard-delete ediyor**, yani kullanıcının puanı yok oluyor. "Detaylar" linki 404 veriyor, sayfa hiçbir menüden erişilebilir değil (yetim). Klan seçici yalnızca ilk 20 klanı gösteriyor.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Liste ve "Bitir" çalışıyor. Oluşturma akışının ödül ve başlangıç alanları sahte, iptal ekonomiyi bozuyor, detay linki kırık. |
| UX | 3/10 | Native `confirm()`, sessiz hatalar, formda gizli eski değerler kalıyor, durumlar ham İngilizce enum, kazanan gösterilmiyor, filtre/sekme yok. |
| Görsel | 4/10 | shadcn kartları temiz ama diğer admin sayfalarındaki `PageHeader` deseni yok. "VS + XP" kartı her durumda aynı görünüyor, durumlar görsel olarak ayrışmıyor. |
| Mimari | 3/10 | `any[]` state, istemci tarafında tek doğrulama, POST/PATCH/DELETE uçlarında escrow ve invariant ihlalleri var, denetim izi yok, tek dosyada fetch + UI. |
| Performans | 5/10 | Savaş listesi sınırsız `findMany`. Dropdown için tüm üyeler ve puanlarıyla birlikte ağır `/api/admin/squads` çağrılıyor. Ölçek küçükken sorun hissedilmez. |
| Erişilebilirlik + mobil | 4/10 | `Label` ile input/select arasında bağ yok, onay için native dialog kullanılıyor. 400px'te başlık ve düğme sarmıyor, dialog `grid-cols-2` sıkışıyor. Reduced-motion global olarak var (`components/providers.tsx:232`). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı ve açıklama | ÇALIŞIYOR | `app/admin/squads/battles/page.tsx:134-135`, `messages/tr.json:3996-3997` | i18n'li. `PageHeader` bileşeni kullanılmıyor (`app/admin/squads/page.tsx:75` ile tutarsız). |
| 2 | İlk yükleme göstergesi | ÇALIŞIYOR | `page.tsx:122-128` | Yalnızca ilk yüklemede var. Sonraki `fetchData()` çağrılarında gösterge yok. |
| 3 | Savaş listesini yükleme | KISMİ | `page.tsx:42-58`, `app/api/admin/squads/battles/route.ts:13-19` | `take`, sayfalama ve filtre yok. Tüm geçmiş tek seferde geliyor. |
| 4 | Yükleme hata durumu | KISMİ | `page.tsx:52-56` | 401/500'de JSON parse başarılı oluyor ama `success` yok. Toast çıkmıyor ve "devam eden savaş yok" boş durumu gösteriliyor, yani hata ile boş liste ayırt edilemiyor. |
| 5 | Klan seçeneklerinin kaynağı | BOZUK | `page.tsx:46`, `app/api/admin/squads/route.ts:15,43` | `pageSize` varsayılanı 20, bu yüzden 21. klandan sonrası seçilemiyor. Ayrıca her klanın tüm üyeleri ve puanları gereksiz yere çekiliyor. |
| 6 | "Yeni Savaş Başlat" düğmesi ve dialog | ÇALIŞIYOR | `page.tsx:138-145` | |
| 7 | Klan 1 seçimi | KISMİ | `page.tsx:154-159` | Kontrolsüz `Select` (`value` yok). Dondurulmuş klanlar ayırt edilmiyor, arama yok. |
| 8 | Klan 2 seçimi | KISMİ | `page.tsx:163-168` | Klan 1 ile aynı sorunlar. Seçilen klan diğer listeden çıkarılmıyor. |
| 9 | Başlangıç zamanı | SAHTE | `page.tsx:174`, `app/api/customer/squads/battles/[id]/respond/route.ts:148` | Rakip kabul ettiğinde `startTime: now` ile eziliyor. Girilen değer yalnızca süre hesabında fark olarak kullanılıyor. |
| 10 | Bitiş zamanı | KISMİ | `page.tsx:178`, `battles/route.ts:46`, `respond/route.ts:127-128` | `datetime-local` saat dilimi olmadan gönderiliyor ve sunucu (UTC) yerel saati UTC sanıyor, bu da TR'de 3 saat kayma demek. Kabulde mutlak değer değil, süre olarak yorumlanıyor. |
| 11 | Ödül havuzu alanı | SAHTE | `page.tsx:183`, `battles/route.ts:47` (`rewardFunded` yazılmıyor), `lib/gamification-engine.ts:46` | Admin savaşı `rewardFunded=false` olduğu için `payoutPool = 0`. Girilen 500 asla ödenmiyor. |
| 12 | Aynı klan doğrulaması | KISMİ | `page.tsx:62-65` | Yalnızca istemcide yapılıyor. İki alan da boşsa (`'' === ''`) "Aynı klan kendiyle savaşamaz" gibi yanlış bir mesaj çıkıyor. |
| 13 | Oluştur düğmesi ve spinner | ÇALIŞIYOR | `page.tsx:188-191`, `67-86` | `i18n creating` anahtarı (`tr.json:4009`) kullanılmıyor. |
| 14 | Form sıfırlama | BOZUK | `page.tsx:30-36`, `77` | Başarıdan ya da kapatmadan sonra `newBattle` sıfırlanmıyor. Kontrolsüz alanlar boş görünürken state eski klan ID'lerini ve tarihleri tutuyor. Tekrar "Oluştur"a basınca görünmeyen eski değerlerle savaş yaratılıyor. |
| 15 | Dialog "İptal" düğmesi | ÇALIŞIYOR | `page.tsx:187` | |
| 16 | Sunucu tarafı oluşturma doğrulaması | BOZUK | `app/api/admin/squads/battles/route.ts:34-50` | Şunların hiçbiri kontrol edilmiyor: squad1≠squad2, geçerli tarih, end>start, `rewardPool` sınırı ya da negatifliği, klanın var olması, dondurulmuş klan, "klan başına tek açık savaş" invariant'ı (`challenge/route.ts:101-113`). Geçersiz tarih veya ID 500 döndürüyor. |
| 17 | Rakip klan sahibine bildirim | EKSİK | `battles/route.ts:41-52` | Oyuncu meydan okumasında bildirim var (`challenge/route.ts:151-159`), admin akışında yok. |
| 18 | Boş durum | KISMİ | `page.tsx:198-202`, `tr.json:4011` | Metin "Şu an devam eden savaş yok" diyor ama liste tüm statüleri (tamamlanan/iptal) içeriyor. CTA yok. |
| 19 | Durum rozeti | KISMİ | `page.tsx:215-217` | Ham `pending/active/completed/cancelled` gösteriliyor. `statusPending` gibi i18n anahtarları (`tr.json:4014-4016`) kullanılmıyor. `cancelled` için stil yok. |
| 20 | Tarih gösterimi | KISMİ | `page.tsx:220` | Yalnızca başlangıç günü/ayı gösteriliyor. Saat, bitiş, kalan süre ve yıl yok. |
| 21 | Klan adları ve skorlar | ÇALIŞIYOR | `page.tsx:230-231`, `245-246` | Skorlar `addToActiveBattleScore` ile gerçekten birikiyor (`lib/gamification-engine.ts:173-216`). |
| 22 | Ödül rozeti ("500 XP") | BOZUK | `page.tsx:237`, `tr.json:4006` | Havuz **puan** cinsinden. Etiket "XP" diyor. Ödenen XP ise havuzun yarısı (`gamification-engine.ts:56`). Fonlanmamışsa gösterilen değer zaten sahte. |
| 23 | Kazanan / beraberlik gösterimi | EKSİK | `battles/route.ts:13-19`, `tr.json:4020-4021` | `winnerId` dönüyor ama UI kullanmıyor. "Kazanan/Berabere" anahtarları ölü. |
| 24 | "Detaylar" linki | BOZUK | `page.tsx:253` | `app/admin/squads/battles/[id]/page.tsx` yok, bu yüzden 404. Metin sabit Türkçe. `<a>` kullanıldığı için tam sayfa yeniden yükleniyor. `GET /api/admin/squads/battles/[id]` var ama hiçbir yerden çağrılmıyor. |
| 25 | "Savaşı Bitir" | KISMİ | `page.tsx:89-107`, `[id]/route.ts:54-57`, `gamification-engine.ts:16-23` | Atomik claim doğru. Ama `finishSquadBattle` `null` döndüğünde (zaten bitmiş) de "Savaş tamamlandı ve ödüller dağıtıldı!" deniyor. Admin savaşında hiç ödül dağıtılmadığı hâlde de aynı mesaj çıkıyor. |
| 26 | Bekleyen savaşı "İptal" | BOZUK | `page.tsx:109-120`, `[id]/route.ts:85-102` | Hard `delete` yapılıyor. Fonlanmış bir meydan okumanın escrow'u **iade edilmiyor**, bildirim yok. `res.ok` false olduğunda sessiz kalıyor. Toast "Deleted" İngilizce. Onay metni "İptal?". |
| 27 | Kart giriş animasyonu | ÇALIŞIYOR | `page.tsx:205-209`, `components/providers.tsx:232` | Ölçülü. `reducedMotion="user"` global olarak geçerli. |
| 28 | Yenile düğmesi | EKSİK | `tr.json:3999` (`refresh` anahtarı var) | Canlı skorları görmek için sayfayı yeniden yüklemek gerekiyor. |
| 29 | Aktif / geçmiş ayrımı (sekme) | EKSİK | `tr.json:4010,4018-4019` | Anahtarlar hazır, UI tek düz liste. |
| 30 | Filtre / arama / sayfalama / sıralama | EKSİK | `page.tsx:197-284` | |
| 31 | Yetki kontrolü | ÇALIŞIYOR | `battles/route.ts:10,31`, `[id]/route.ts:14,47,90`, `squads/route.ts:9` | Tüm uçlarda `requireAuth(['ADMIN'])` var. |
| 32 | Navigasyon girişi | EKSİK | `components/dashboard/sidebar.tsx:176` (yalnızca `/admin/squads`), `app/admin/squads/page.tsx` (link yok) | Sayfa yetim. Yalnızca URL ile ve e2e testiyle erişiliyor. |
| 33 | Mobil yerleşim | KISMİ | `page.tsx:132`, `151`, `171`, `212`, `251` | Başlık ve düğme satırı `flex-wrap` olmadan duruyor. Dialog'da iki sütunlu select/datetime 400px'te sıkışıyor. Kart `md` altında dikey yığılıyor (iyi). |
| 34 | Form erişilebilirliği | KISMİ | `page.tsx:153`, `162`, `173`, `177`, `182` | `Label` için `htmlFor` ve kontrollere `id` yok. Ekran okuyucu alan adını okumuyor. Skor değişimi `aria-live` ile duyurulmuyor. |
| 35 | Denetim izi (audit log) | EKSİK | `[id]/route.ts` (yok); kıyas: `app/api/admin/api-keys/route.ts:74` | Ekonomiyi etkileyen bitir/iptal/oluştur işlemleri kayıtsız. |
| 36 | Skor/durum/ödül düzenleme (PATCH genel dalı) | EKSİK (UI) | `[id]/route.ts:59-76` | API'de var, UI'da yok. API kendi başına risk taşıyor (bkz. B4). |
| 37 | Onay diyalogları | KISMİ | `page.tsx:90`, `110` | Native `confirm()` kullanılıyor. Proje genelinde shadcn `AlertDialog` deseniyle tutarsız, ayrıca etkiyi (ödeme/iade miktarı) göstermiyor. |

**Sayım:** ÇALIŞIYOR 8 · KISMİ 13 · BOZUK 6 · SAHTE 2 · EKSİK 8 (toplam 37)

---

## Bulgular

### B1. Kritik · Ekonomi/veri bütünlüğü: "İptal" fonlanmış meydan okumayı iade etmeden siliyor, kullanıcı puanı yok oluyor
- **Kanıt:** `app/admin/squads/battles/page.tsx:268-276` (`pending` için İptal düğmesi), `:112` (`DELETE`), `app/api/admin/squads/battles/[id]/route.ts:95-97` (`prisma.squadBattle.delete`). Escrow tahsilatı: `app/api/customer/squads/challenge/route.ts:116-118,127-129` (`debitPoints` + `rewardFunded: true`). Doğru iade deseni: `respond/route.ts:77-103` ve `app/api/cron/squad-battles/route.ts:70-87`.
- **Sorun:** Oyuncu tarafından açılmış her meydan okuma `status='pending'` olarak listede görünüyor (admin savaşından ayırt edilmiyor). Admin "İptal"e bastığında satır siliniyor ve meydan okuyandan tahsil edilen `rewardPool` puanı hiçbir hesaba geri dönmüyor. Bu, "escrow net-sıfır" invariant'ının doğrudan ihlali. Ayrıca kullanıcıya bildirim gitmiyor ve kayıt silindiği için iz de kalmıyor. DELETE ucu statü bile kontrol etmiyor: API üzerinden `active` bir savaş da katılımcılarıyla birlikte (cascade) silinebiliyor.
- **Öneri:** Hard delete'i kaldırın. `POST /api/admin/squads/battles/[id]/cancel` gibi bir uç, mevcut `respond` ve cron iptal mantığını paylaşan tek bir `cancelSquadBattle(tx, id, { reason, actorId })` fonksiyonunu (`lib/gamification-engine.ts`) çağırmalı. Bu fonksiyon `updateMany where status in ['pending','active']` ile atomik claim almalı, `rewardFunded && !rewardRefunded` ise iade etmeli, `points_credited` olayını yazmalı, iki klan sahibine bildirim göndermeli ve `AuditLog` satırı eklemeli. Silme yalnızca "soft" olmalı (status `cancelled` + `cancelledReason`). UI'da onay diyaloğu "Meydan okuyana 500 puan iade edilecek" etkisini açıkça göstermeli.
- **Efor:** M

### B2. Yüksek · Sahte işlev / ekonomi: Admin savaşının "Ödül Havuzu" asla ödenmiyor, kullanıcılara ise ödül vaat ediliyor
- **Kanıt:** `app/api/admin/squads/battles/route.ts:41-50` (`rewardFunded` yazılmıyor, varsayılan `false`: `prisma/schema.prisma:451-454`), `lib/gamification-engine.ts:44-46` (`payoutPool = battle.rewardFunded ? battle.rewardPool : 0`). Kullanıcı yüzü: `components/customer/squad-battle-panel.tsx:224` ("…size meydan okudu! Ödül havuzu: 500 puan") ve `:250`. Admin yüzü: `page.tsx:237`, `tr.json:4027` ("ödüller dağıtıldı!").
- **Sorun:** Formun ana ekonomik alanı tümüyle dekoratif. Admin 500 yazıyor, kartta "500 XP" görüyor, "Bitir" dediğinde "ödüller dağıtıldı" toast'ı çıkıyor, ama kimse bir şey almıyor. Kullanıcılar da ödül vaadi görüyor. Bu sessiz bir güven kırılması. Ayrıca squad1 üyelerine "X klanına meydan okudunuz" yazıyor (`squad-battle-panel.tsx:222-223`), çünkü admin savaşında `challengedById=null` olduğu hâlde `isChallenger` = squad1.
- **Öneri:** İki seçenekten biri bilinçli olarak seçilmeli. (a) **Platform fonlu havuz:** admin oluşturduğunda havuz, bir "platform hazinesi" defterinden escrow'a alınsın (`rewardFunded=true`, `fundingSource='platform'`). Kazanan yoksa iade hazineye dönsün. Böylece mint, kayıtlı ve sınırlı (günlük/haftalık bütçe) bir kaynaktan gelir ve `points_credited` fraud görünürlüğü korunur. (b) **Ödülsüz "itibar savaşı":** havuz alanı formdan kaldırılsın ve kullanıcı UI'sı "Ödül yok – onur savaşı" desin. Her iki durumda da `SquadBattle`'a `origin: 'admin' | 'challenge'` alanı eklenmeli, müşteri paneli metinleri buna göre ayrışmalı. "Bitir" toast'ı sunucudan dönen gerçek `paidOut/refunded` değerini göstermeli.
- **Efor:** L

### B3. Yüksek · Mimari/veri bütünlüğü: Admin POST "klan başına tek açık savaş" invariant'ını ve tüm doğrulamaları atlıyor
- **Kanıt:** `app/api/admin/squads/battles/route.ts:34-50`. Kıyas: `challenge/route.ts:15-21` (zod), `:60-65` (self), `:77-82` (frozen), `:101-113` (açık savaş). Tüketiciler tek savaş varsayıyor: `app/api/customer/squads/battles/current/route.ts:36-43` (`findFirst`), `lib/gamification-engine.ts:187-195` (`findFirst`, `orderBy` yok).
- **Sorun:** Admin aynı klana birden çok açık savaş açabiliyor. O durumda puan katkısı belirsiz bir savaşa yazılıyor (`findFirst` sırası tanımsız) ve müşteri yalnızca en yenisini görüyor. Oyuncu meydan okumaları 409 ile kilitleniyor. `squad1Id === squad2Id` sunucuda reddedilmiyor (yalnızca istemci kontrol ediyor, `page.tsx:62`). `rewardPool` negatif ya da 10⁹ olabiliyor (PATCH'teki `clampInt` POST'ta yok, `[id]/route.ts:62-73`). Geçersiz tarih ve var olmayan klan Prisma hatasıyla 500'e düşüyor. `endTime < startTime` kabul ediliyor.
- **Öneri:** POST'u zod şemasıyla (`squad1Id≠squad2Id`, ISO tarih + `endTime > startTime`, süre 1–168 saat, havuz 0–100000) ve challenge ile **aynı transaction içi** açık savaş kontrolüyle yeniden yazın. Ortak kuralları `lib/squad-battle-rules.ts` içine çıkarıp iki ucun da aynı fonksiyonu çağırmasını sağlayın. Hataları 400/404/409 ve alan bazlı mesajlarla döndürün. UI bu mesajları ilgili alanın altında göstersin.
- **Efor:** M

### B4. Yüksek · Güvenlik/ekonomi (API): PATCH genel dalı statüyü serbest yazıyor, çift ödeme ve iadesiz iptal mümkün
- **Kanıt:** `app/api/admin/squads/battles/[id]/route.ts:59-76`. Claim: `lib/gamification-engine.ts:16-19` (yalnızca `status:'active'` olanı claim ediyor). Ödeme ve iade bayrağı: `:47-91`, `:105`, `:118-123`.
- **Sorun:** UI bu dalı kullanmıyor, ama ADMIN rolüyle `PATCH {status:'active'}` tamamlanmış bir savaşı tekrar `active` yapabiliyor. Ardından `finish` çağrısı `rewardFunded` savaşın kazananlarına havuzu **ikinci kez** ödüyor. İade bayrağı ödemeyi korumuyor, dolayısıyla puan basılıyor. `{status:'cancelled'}` ise escrow iadesini atlıyor. `squad1Score/squad2Score` de kayıtsız şekilde elle değiştirilebiliyor, yani kazanan manipüle edilebiliyor. Gizli kapı ve admin rolü riski azaltsa da hesap ele geçirme ya da hatalı otomasyon durumunda ekonomi korumasız ve hiç iz kalmıyor.
- **Öneri:** Statüyü bir durum makinesine bağlayın (`pending→active|cancelled`, `active→completed|cancelled`; `completed/cancelled` terminal). Statü değişikliğini yalnızca adlandırılmış aksiyonlar (`finish`, `cancel`, `extend`) yapabilsin. Skor düzeltmesini ayrı bir `adjust-score` aksiyonuna taşıyın, zorunlu `reason` alanı ve `AuditLog` ile. `finishSquadBattle` içine bir `paidOutAt` bayrağı ya da `SquadBattlePayout` tablosuyla ödeme idempotency'si ekleyin.
- **Efor:** M

### B5. Orta · İşlev: "Detaylar" linki 404, sayfa da hiçbir menüden erişilemiyor (yetim)
- **Kanıt:** `page.tsx:253` → `/admin/squads/battles/${id}`. `app/admin/squads/battles/` altında yalnızca `page.tsx` var. Detay API'si (`[id]/route.ts:9-40`) kullanılmıyor. `components/dashboard/sidebar.tsx:176` yalnızca `/admin/squads`'a gidiyor. `app/admin/squads/page.tsx` savaşlara link vermiyor.
- **Sorun:** Her kartın birincil sekonder aksiyonu kırık. Operatör sayfayı ancak URL'yi bilerek bulabiliyor.
- **Öneri:** Detayı ayrı sayfa yerine sağdan açılan bir **drawer** (shadcn `Sheet`) olarak kurgulayın: iki klanın katılımcı listesi ve bireysel skorları (API zaten `participants.user` dönüyor), zaman çizelgesi (oluşturuldu → kabul → bitti/iptal), ödeme/iade dökümü (`analyticsEvent` `category in ['squad_battle','squad_battle_refund']` + `battleId`), aksiyonlar (bitir/iptal/süre uzat). URL `?battle=<id>` ile derin bağlantıya izin versin. Navigasyonu `/admin/squads` sayfasına sekme olarak bağlayın (bkz. Çakışmalar).
- **Efor:** M

### B6. Orta · Veri: Klan seçici yalnızca ilk 20 klanı gösteriyor ve gereksiz ağır veri çekiyor
- **Kanıt:** `page.tsx:46` (`/api/admin/squads` parametresiz), `app/api/admin/squads/route.ts:15` (`pageSize` varsayılan 20), `:43` (`members: { include: { user: { name, email, points } } }`).
- **Sorun:** 21. klandan itibaren savaş planlanamıyor. Dropdown için tüm üyelerin e-posta ve puanları istemciye taşınıyor (gereksiz PII + yük). Dondurulmuş klanlar işaretlenmiyor.
- **Öneri:** `GET /api/admin/squads/options?q=` gibi hafif bir uç (`id, name, memberCount, isFrozen, hasOpenBattle`) yazın. UI'da `Command` tabanlı aranabilir combobox kullanın. Dondurulmuş ve zaten savaşta olan klanlar devre dışı ve gerekçesiyle gösterilsin.
- **Efor:** S

### B7. Orta · UX/hata yönetimi: Form gizli eski state tutuyor, hatalar sessiz, toast'lar yanıltıcı
- **Kanıt:** Form sıfırlanmıyor: `page.tsx:30-36,77`. Kontrolsüz alanlar: `:154,163,174,178`. Boş-boş yanlış mesaj: `:62`. `parseInt('')→NaN`: `:183`. Yükleme hatası sessiz: `:52-53`. Silme hatası sessiz: `:113-116`. "Deleted" İngilizce: `:114`. "Bitir"de `null` dönüşünde de başarı mesajı: `:98-99` + `[id]/route.ts:55-56`.
- **Sorun:** Admin ikinci savaşı oluştururken alanlar boş görünüyor ama state'te önceki savaşın klanları duruyor. Doğrudan "Oluştur" eski çifti yeniden yaratıyor. HTTP hataları boş liste gibi görünüyor, dolayısıyla operatör yanlış sonuca varıyor.
- **Öneri:** Formu `react-hook-form` + zod (POST ile aynı şema) ile kontrollü hâle getirin. Dialog kapanınca `reset()` çağrılsın. Oluştur düğmesi şema geçerli olana kadar devre dışı kalsın. Veri katmanını SWR'a (veya projedeki fetch hook'una) taşıyıp `error` durumunu ayrı bir hata kartı ve "Tekrar dene" ile gösterin. Mutasyonlarda `res.ok` kontrol edilsin, sunucunun `{ result: 'finished'|'noop', paidOut, refunded }` yanıtına göre doğru mesaj seçilsin. `lib/admin-toast` kullanılarak diğer admin sayfalarıyla tutarlı olunsun.
- **Efor:** M

### B8. Orta · Veri: `datetime-local` saat dilimi kayması ve anlamsız başlangıç alanı
- **Kanıt:** `page.tsx:174,178` değeri `"2026-10-08T14:00"` (TZ yok) olarak gönderiyor. `battles/route.ts:45-46` bunu sunucu saat diliminde (`new Date`, Vercel'de UTC) yorumluyor. Kabulde başlangıç `now` ile eziliyor ve süre korunuyor (`respond/route.ts:126-128`).
- **Sorun:** TR operatörünün girdiği saat 3 saat kayıyor. Bu, bekleyen savaşın cron tarafından iptal anını (`cron/squad-battles/route.ts:51-55`, `endTime<=now`) etkiliyor. "Başlangıç zamanı" alanı ise gerçekte hiçbir şey planlamıyor.
- **Öneri:** Domain modelini netleştirin. Admin savaşları ya **zamanlanmış** olmalı (kabul gerekmeden `startTime`'da otomatik `active`, cron'a `pending && origin=admin && startTime<=now → active` adımı eklenir) ya da **davet** olmalı (alanlar "Süre (saat)" + "Davet geçerlilik süresi" olur). İstemci tarihi `toISOString()` ile göndersin ve UI saat dilimini açıkça göstersin ("Europe/Istanbul").
- **Efor:** M

### B9. Orta · UX/bilgi mimarisi: Durum, kazanan ve zaman bilgisi eksik ya da ham
- **Kanıt:** Ham enum: `page.tsx:215-217` (anahtarlar `tr.json:4014-4016` kullanılmıyor). Kazanan yok: `:224-248` (`tr.json:4020-4021` ölü). Yalnızca başlangıç günü: `:220`. Birim hatası "XP": `:237`. Boş durum metni yanlış: `:201`.
- **Sorun:** Operatör tek bakışta "hangisi canlı, ne kadar kaldı, kim kazandı, ödendi mi?" sorularına cevap alamıyor. Bitmiş, iptal ve aktif kartlar görsel olarak neredeyse aynı.
- **Öneri:** Kartı statüye göre farklılaştırın. Aktif: canlı nabız noktası, kalan süre geri sayımı, iki skor arasında oransal ilerleme çubuğu. Tamamlanan: kazanan vurgusu (kupa), ödenen/iade edilen puan. İptal: soluk + gerekçe. Bekleyen: "Rakibin yanıtı bekleniyor · X saat içinde düşecek". Birim "puan" olsun, fonlanmamışsa "Ödülsüz" rozeti gösterilsin.
- **Efor:** M

### B10. Düşük · Erişilebilirlik/tutarlılık: Native `confirm()`, bağsız label'lar, mobil başlık, dil karışıklığı
- **Kanıt:** `page.tsx:90,110` (`confirm`). Label'larda `htmlFor` yok: `:153,162,173,177,182`. `:132` başlık satırında `flex-wrap` yok. `:151,171` `grid-cols-2` mobilde de geçerli. Sabit metinler: `"Detaylar"` (`:253`), `"Deleted"` (`:114`), `"VS"` (`:235`), `"XP"` (`:237`). `any[]`: `:24-25`. e2e TR'de eşleşmiyor: `e2e/squad-management.spec.ts:37` `/Savaş Planla|Start New Battle/` bekliyor, TR metni ise "Yeni Savaş Başlat" (`tr.json:3998`).
- **Öneri:** shadcn `AlertDialog` ile etkiyi yazan onaylar ("Kazanan klanın 4 üyesine kişi başı 125 puan ödenecek") kullanılsın. Her alana `id/htmlFor` verilsin. Başlık `flex-col sm:flex-row` olsun, dialog alanları `grid-cols-1 sm:grid-cols-2` olsun. Tüm metinler i18n'e taşınsın. `SquadBattleRow` tipi (Prisma `Prisma.SquadBattleGetPayload`) tanımlansın. e2e regex'i güncellensin.
- **Efor:** S

### B11. Düşük · Performans: Sınırsız liste, polling ya da canlılık yok
- **Kanıt:** `app/api/admin/squads/battles/route.ts:13-19` (`take` yok). `page.tsx:38-40` (yalnızca mount'ta yükleniyor).
- **Sorun:** Geçmiş büyüdükçe yük doğrusal olarak artıyor. Aktif savaş skorları canlı izlenemiyor.
- **Öneri:** Uçta `status` filtresi + cursor sayfalama (`@@index([status, endTime])` zaten var, `schema.prisma:470`) kullanılsın. Aktif sekmede 30 saniyelik SWR `refreshInterval` olsun (görünür sekmedeyken). Özet sayaçları için `groupBy status` eklensin.
- **Efor:** S

### B12. Düşük · Gözlemlenebilirlik: Denetim izi yok
- **Kanıt:** `[id]/route.ts` ve `battles/route.ts` içinde `auditLog` yok. Kıyas: `app/api/admin/api-keys/route.ts:74,108`. Model: `prisma/schema.prisma:1106`.
- **Öneri:** Oluştur, bitir, iptal ve skor düzeltme işlemleri `AuditLog`'a aktör, önceki/sonraki değer ve gerekçeyle yazılsın. Drawer'daki zaman çizelgesi bu kayıtları göstersin.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Durum sekmeleri ve sayaçlar** (Linear/Stripe tarzı): Canlı · Bekleyen · Tamamlanan · İptal, her sekmede sayaç. Arama (klan adı), tarih aralığı filtresi, sıralama (bitişe kalan süre, havuz).
- **Detay drawer'ı ve zaman çizelgesi** (Stripe ödeme detayı benzeri): katılımcılar ve bireysel katkı, olay akışı, ödeme/iade dökümü ve ilgili `points_credited` olaylarına bağlantı.
- **Güvenli aksiyonlar:** iptal + otomatik iade, süre uzatma, gerekçeli skor düzeltme. Hepsi etki önizlemeli onay ve audit log ile.
- **Ekonomi görünürlüğü** (PostHog/Retool tarzı): toplam escrow'daki puan, bu hafta ödenen/iade edilen, fonlanmamış savaş sayısı. Anomali uyarısı (tek savaşta olağan dışı skor sıçraması, fraud dedektörüyle bağlantılı).
- **Toplu işlemler ve dışa aktarma:** seçili bekleyenleri toplu iptal (iadeli), CSV export (`/admin/squads`'ta zaten CSV deseni var: `app/admin/squads/page.tsx:55-71`).
- **Turnuva/sezon bağlamı:** savaşı sezonluk etkinlik veya turnuvaya bağlama ve eşleştirme önerisi (benzer üye sayısı ve puan seviyesi).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya 3 saniyede cevap alabilmeli: "Şu an hangi savaşlar canlı ve kim önde?", "Bekleyen ya da sorunlu bir şey var mı (kilitli escrow, süresi geçmiş pending, cron'un kaçırdığı)?", "Bu hafta savaşlardan ekonomiye ne aktı?". Her ekonomik aksiyon geri alınabilir ya da etkisi önceden görülebilir olmalı.

**Yerleşim:**
1. `/admin/squads` sayfasında `PageHeader` + sekmeler: **Klanlar | Savaşlar**. Bu route, `?tab=battles` ile aynı içeriği gösteren bir yönlendirme olarak kalabilir.
2. Savaşlar sekmesinin üstünde 4 KPI kartı: Canlı savaş · Bekleyen davet · Escrow'da kilitli puan · Son 7 günde ödenen/iade edilen.
3. Filtre çubuğu: durum segmentleri (sayaçlı), klan arama, tarih aralığı, "Yalnızca fonlu" anahtarı.
4. Liste: yoğun ve taranabilir satırlar (Linear tarzı). Satırda iki klan, oransal skor çubuğu, kalan süre, havuz (fonlu/ödülsüz rozeti) ve köken (oyuncu meydan okuması / admin) bulunur. Satıra tıklayınca sağdan detay drawer'ı açılır.
5. "Savaş planla" dialog'u: aranabilir klan combobox'ları (savaştaki/dondurulmuş klanlar gerekçeli devre dışı), mod seçimi (Zamanlanmış / Davet), süre, havuz kaynağı (Platform hazinesi / Ödülsüz) ve "Özet: X vs Y, 24 saat, 1000 puan platformdan escrow'a alınacak" önizlemesi.
6. Mobil: satırlar kart düzenine geçer, drawer tam ekran sheet olur, aksiyonlar alt kenara sabitlenir.

**Motion:** Ölçülü kalmalı. Aktif satırda skor değiştiğinde sayı `layout` + kısa sayaç (tween 300 ms), skor çubuğu genişlik animasyonu, canlı rozet için yumuşak nabız. Kazanan için tamamlanma anında tek seferlik kupa vurgusu (konfeti yok, burası bir admin aracı). 3D gerekmez. Global `MotionConfig reducedMotion="user"` zaten var, sayaç ve nabız buna uymalı.

**Veri/API değişiklikleri:**
- Şema: `SquadBattle.origin ('admin'|'challenge')`, `fundingSource ('challenger'|'platform'|null)`, `cancelledReason`, `cancelledById`, `paidOutAt`. Gerekirse `SquadBattlePayout` tablosu (idempotent ödeme kaydı).
- `lib/squad-battle-service.ts`: `createBattle`, `activateBattle`, `finishBattle`, `cancelBattle`, `extendBattle`, `adjustScore`. Hepsi transaction içinde, durum makinesi, escrow invariant'ı ve audit log ile. Admin, müşteri ve cron uçları yalnızca bu servisi çağırır (bugün iptal/iade mantığı `respond` ve cron'da kopyalanmış durumda).
- `GET /api/admin/squads/battles?status=&q=&cursor=` + `GET .../summary` (sayaçlar ve ekonomi KPI'ları).
- `POST /api/admin/squads/battles/[id]/{finish|cancel|extend|adjust-score}`. Genel `PATCH` kaldırılır.
- Cron: admin zamanlanmış savaşları `startTime<=now` olduğunda `active` yapacak adım.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/squads`** (`app/admin/squads/page.tsx`): Aynı domain (klan yönetimi). Sayfalar birbirine bağlı değil ve görsel dilleri farklı (`PageHeader`/`admin-toast` ile özel başlık/`sonner`). **Öneri:** Battles, `/admin/squads` altında "Savaşlar" sekmesi olarak birleştirilsin. Klan satırından "Bu klanın savaşları" filtresine derin bağlantı verilsin.
- **`/customer/squads`** + `components/customer/squad-battle-panel.tsx`: Müşteri tarafı aynı veriyi okuyor. Admin'in oluşturduğu savaşı "meydan okuma" metniyle ve vaat edilen ödülle gösteriyor (B2). Birleştirme değil, **ortak servis ve `origin` alanı** ile tutarlılık gerekiyor.
- Cron (`app/api/cron/squad-battles/route.ts`) ve Inngest (`app/api/internal/inngest/squad-battles-finish/route.ts`) ile admin "Bitir" aynı `finishSquadBattle`'ı kullanıyor (iyi). İptal/iade mantığı ise üç yerde ayrı ayrı yazılmış ya da hiç yok (admin). Tek servise toplanmalı.

---

## Doğrulama (şüpheci inceleme)

Her iddia, çağıran ve çağrılan taraflar baştan okunarak çürütülmeye çalışıldı: sayfa, admin API'leri, `lib/gamification-engine.ts`, müşteri `challenge`/`respond`/`current` uçları, cron, `proxy.ts`, `prisma/schema.prisma`. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Admin iptali (DELETE) fonlanmış escrow'u iade etmeden siliyor. Karar: **DOĞRULANDI** (KRİTİK)

- `app/api/admin/squads/battles/route.ts:13-19`: GET, tüm savaşları köken ayrımı yapmadan döndürüyor. Oyuncunun açtığı `pending` meydan okuma da listede.
- `app/admin/squads/battles/page.tsx:268-276`: Her `pending` satırda "İptal" düğmesi var. `:112` doğrudan `DELETE` çağırıyor.
- `app/api/admin/squads/battles/[id]/route.ts:95-97`: `prisma.squadBattle.delete`. Statü kontrolü, `rewardFunded`/`rewardRefunded` kontrolü, iade, bildirim ve audit log yok.
- Escrow tahsilatı `app/api/customer/squads/challenge/route.ts:116-118` (`debitPoints`) ve `:128` (`rewardFunded: rewardPool > 0`).
- Doğru desen `respond/route.ts:77-103` ile cron `squad-battles/route.ts:69-89` içinde (atomik claim, `creditPointsAndXp`, `rewardRefunded`, `points_credited`). Admin yolunda bu desen hiç yok.
- **Yeniden üretim:** A klanı sahibi B'ye 1000 puanlık meydan okuma açar; bakiyesinden 1000 düşer. Admin, listede `pending` satırda "İptal"e basar. Satır silinir, 1000 puan geri dönmez. Satır silindiği için cron'un `stalePending` taraması (`cron:51-55`) da onu bulamaz. Puan kalıcı olarak yok olur. Rakibin bildirimindeki `battleId` (`challenge:157`) artık var olmayan bir kaydı gösterir.
- API düzeyinde `active` savaş da silinebilir. `SquadBattleParticipant` `onDelete: Cascade` (`schema.prisma:484`) olduğu için katılımcı skorları da gider ve fonlanmış havuz yine iade edilmez. Bu yol UI'dan erişilebilir değil, yalnızca doğrudan istekle.

### 2. PATCH genel dalı ile tamamlanmış savaş yeniden açılıp ikinci kez ödeme alınabiliyor. Karar: **DOĞRULANDI**, ama ciddiyet **ORTA'ya düşürülmeli**

- `[id]/route.ts:61-76`: `status` yalnızca enum ile sınırlanıyor, geçiş kuralı yok. `completed` → `active` yazılabiliyor.
- `lib/gamification-engine.ts:16-19`: Claim yalnızca `status:'active'` koşuluna bakıyor. `:47` `payoutPool = rewardFunded ? rewardPool : 0`. Ödeme için "ödendi" bayrağı yok, yalnızca iade bayrağı var (`:102`, `:122`).
- **Yeniden üretim (yalnızca API):** Fonlu ve tamamlanmış bir savaşta `PATCH {status:'active'}` → `PATCH {action:'finish'}`. Claim tekrar geçer, kazanan katılımcılara havuz ikinci kez yazılır (`:59-63`) ve `squad.totalPoints` tekrar artar. İade, `rewardRefunded=true` olduğu için atlanır. Sonuç, tahsil edilmemiş puanın basılmasıdır. `{status:'cancelled'}` ise `pending` fonlu savaşı iadesiz kapatır (iddia 1 ile aynı kayıp, satır silinmeden).
- **Ciddiyeti düşüren etkenler:** Uç `requireAuth(['ADMIN'])` ve `proxy.ts:76-84` gizli-kapı cookie'si arkasında. UI bu dala hiç ulaşmıyor. Admin zaten `app/api/admin/users/route.ts:399-427` üzerinden doğrudan puan ekleyebiliyor (audit log ile). Bu yüzden bu bir yetki yükseltme değil. Asıl sorun şu: denetlenmeyen, `auditLog` yazmayan ve durum makinesi olmayan bir yol escrow net-sıfır invariant'ını delebiliyor. Hatalı bir admin script'i ya da çalınmış bir admin oturumu iz bırakmadan puan basabilir. `points_credited` olayları yine de yazıldığı için (`:67-74`) fraud dedektörü kısmen görür.

### 3. Admin'in oluşturduğu savaşın ödül havuzu hiç ödenmiyor, ama ödül gösteriliyor. Karar: **DOĞRULANDI** (YÜKSEK, ürün güveni)

- `app/api/admin/squads/battles/route.ts:41-50`: `rewardFunded` ve `challengedById` set edilmiyor, şema varsayılanı `false` (`schema.prisma:454`; yorum `:453` bunu bilinçli bir karar olarak belgeliyor).
- `lib/gamification-engine.ts:47`: `payoutPool = 0` → `:50` koşulu sağlanmıyor, kimse puan almıyor. `:101` iade de 0.
- Admin tarafında form varsayılanı `rewardPool: 500` (`page.tsx:35`), kartta `{rewardPool} XP` gösteriliyor (`page.tsx:237`; birim de yanlış). Bitirince `messages/tr.json:4027` "Savaş tamamlandı ve ödüller dağıtıldı!" toast'ı çıkıyor. Ayrıca `finishSquadBattle` `null` döndürse bile (aktif değil) API `success:true` veriyor (`[id]/route.ts:55-56`).
- Müşteri tarafında `components/customer/squad-battle-panel.tsx:224` "Ödül havuzu: 500 puan" ve `:250` "Ödül: 500 puan" vaadi var. `current/route.ts:64` `isChallenger = squad1 === mySquad` olduğundan admin'in squad1 seçtiği klanın üyeleri `:223` "…klanına meydan okudunuz" metnini görüyor, oysa meydan okumadılar.
- **Yeniden üretim:** Admin A vs B, havuz 500 ile savaş oluşturur. B sahibi kabul eder (`respond` yalnızca `squad2.ownerId` kontrol ediyor, köken bakmıyor). Savaş bitince A kazanır. Hiçbir üye puan almaz, "Savaş Galibiyeti" bildirimi de oluşmaz (`:78-85` yalnızca `payoutPool>0` dalında). Admin "ödüller dağıtıldı" görür. Mint engeli kasıtlı, ama UI/kopya bunu yansıtmıyor ve admin'e ödülü fonlama yolu sunulmuyor.

### 4. Admin POST "klan başına tek açık savaş" invariant'ını ve sunucu doğrulamalarını atlıyor. Karar: **DOĞRULANDI** (ORTA-YÜKSEK, veri bütünlüğü)

- `app/api/admin/squads/battles/route.ts:34-50`: Zod yok, açık-savaş kontrolü yok, `squad1Id !== squad2Id` kontrolü yok (yalnızca istemcide, `page.tsx:62`), `isFrozen` kontrolü yok, `startTime < endTime` kontrolü yok. `rewardPool || 0` negatif ya da sınırsız değeri olduğu gibi yazıyor.
- Invariant müşteri tarafında `challenge/route.ts:101-113`. **Kritik ek bulgu:** `respond/route.ts:143-158` kabulde açık-savaş kontrolünü tekrarlamıyor. Bu yüzden admin'in açtığı `pending` savaş, mevcut bir `active` savaşın yanında `active`'e geçebiliyor.
- **Yeniden üretim:** A ve C arasında fonlu (C'nin 2000 puanı escrow'da) `active` bir savaş var. Admin A vs B `pending` oluşturur, B sahibi kabul eder. Artık A iki `active` savaşta. `addToActiveBattleScore` (`lib/gamification-engine.ts:187-195`) `orderBy` olmayan `findFirst` kullandığı için A üyelerinin kazandığı puanlar belirsiz biçimde fonsuz admin savaşına yazılabilir. Bu, gerçek parası olan A–C savaşının kazananını değiştirebilir. `current/route.ts:36-41` `createdAt desc` ile yalnızca yeni (admin) savaşı gösterir, A–C savaşı panelden kaybolur.
- **Yan etkiler:** `squad1Id == squad2Id` ile oluşturulan savaşta `addToActiveBattleScore` her zaman `squad1Score` artırır, savaş anlamsızlaşır. Negatif `rewardPool` `rewardFunded=false` olduğu için ödemeye yansımaz, yalnızca UI'da "-500 XP" gibi yanlış görünür. Bu yüzden ekonomik etkisi yok. Geçersiz tarih (`new Date('x')`) ya da var olmayan klan ID'si Prisma hatasıyla 500 döner (`route.ts:53-56`); 400 olmalıdır. Bu doğru ama düşük önemli.

### Özet

| # | İddia | Karar | Önerilen ciddiyet |
|---|---|---|---|
| 1 | DELETE escrow'u iadesiz siliyor | Doğrulandı | KRİTİK (UI'dan tek tıkla oyuncu puanı kaybı) |
| 2 | PATCH ile yeniden açıp çift ödeme | Doğrulandı | ORTA (yalnızca admin + API; admin zaten audit'li puan ekleyebiliyor; asıl sorun audit/durum makinesi eksikliği) |
| 3 | Admin savaşı ödülsüz ama ödül vaat ediliyor | Doğrulandı | YÜKSEK (kullanıcı güveni, yanıltıcı kopya) |
| 4 | Admin POST invariant/doğrulama atlıyor | Doğrulandı | ORTA-YÜKSEK (`respond` kabulünde kontrol eksikliğiyle birleşince fonlu savaşın skorunu bozabiliyor) |

Düzeltme önceliği: (1) admin DELETE'i `cancelBattle` servisine çevirip atomik claim + escrow iadesi + bildirim + `auditLog` eklemek, hard delete'i kaldırmak; (2) `respond` kabulüne ve admin POST'a aynı transaction içinde açık-savaş kontrolü eklemek; (3) genel PATCH'i kaldırıp açık durum geçişli uçlara bölmek ve ödemeye `paidOutAt` idempotency bayrağı eklemek; (4) admin savaşları için `origin` alanı ekleyip ödül kopyasını `rewardFunded` durumuna göre koşullamak ya da platform hazinesinden gerçek fonlama akışı kurmak.


---

## Uygulama (Dalga 2)

Sayfa `/admin/squads` Klan Merkezi'nin **Savaşlar** sekmesine taşındı; `app/admin/squads/battles/page.tsx` artık `permanentRedirect('/admin/squads?tab=battles&…')` (sorgu korunur). İptal ve ödeme çekirdeği `lib/squad-battle-service.ts` (P0-20 durum makinesi: atomik claim, `paidOutAt`, `rewardRefunded`, soft-cancel); admin uçları `defineRoute` ile yeniden yazıldı (`lib/admin-squads/actions.server.ts`). Hard DELETE ucu kaldırıldı.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Başlık | ÇALIŞIYOR — ortak QDL `PageHeader` |
| 2 | Yükleme göstergesi | ÇALIŞIYOR — her sorguda (DataTable + QueryState) |
| 3 | Savaş listesi | ÇALIŞIYOR — sunucu sayfalama, durum sekmeleri, arama, köken, klan süzgeci |
| 4 | Hata durumu | ÇALIŞIYOR — hata ile boş liste ayrışır (ErrorState + Tekrar dene) |
| 5 | Klan seçeneklerinin kaynağı | ÇALIŞIYOR — `GET /api/admin/squads/options?q=` (hafif, PII yok, aranabilir) |
| 6 | Yeni savaş düğmesi | ÇALIŞIYOR — "Onur savaşı planla" |
| 7-8 | Klan seçimleri | ÇALIŞIYOR — aranabilir seçici; dondurulmuş / açık savaşlı / üyesiz klan gerekçeyle devre dışı, seçilen diğer listeden çıkar |
| 9 | Başlangıç zamanı | KALDIRILDI (sahteydi) — yerine mod: "Davet gönder" (kabulde başlar) / "Hemen başlat" (kadro şimdi donar) |
| 10 | Bitiş zamanı | ÇALIŞIYOR — süre ön ayarları (6 sa–7 gün); saat dilimi kayması yok (sunucu `now + süre`) |
| 11 | Ödül havuzu alanı | KALDIRILDI — yönetici savaşı ödülsüz "onur savaşı" (mint yok); arayüz ve bildirimler bunu açıkça söyler |
| 12 | Aynı klan doğrulaması | ÇALIŞIYOR — istemci + sunucu (zod refine; aynı lidere ait iki klan da reddedilir) |
| 13 | Oluştur + spinner | ÇALIŞIYOR |
| 14 | Form sıfırlama | ÇALIŞIYOR — kapanınca tüm durum sıfırlanır |
| 15 | Dialog iptal | ÇALIŞIYOR |
| 16 | Sunucu doğrulaması | ÇALIŞIYOR — zod, var olmayan klan 404, dondurulmuş 409, tek açık savaş 409 (kilit altında, transaction içinde) |
| 17 | Rakip lidere bildirim | ÇALIŞIYOR — davette rakip lider + kendi lider; hemen başlatta iki kadro |
| 18 | Boş durum | ÇALIŞIYOR — sekmeye göre doğru metin, filtreliyse "Süzgeçleri temizle" |
| 19 | Durum rozeti | ÇALIŞIYOR — Canlı / Yanıt bekliyor / Süresi doldu·kapanmadı / Tamamlandı / İptal |
| 20 | Tarih gösterimi | ÇALIŞIYOR — Europe/Istanbul tarih+saat, kalan/geçen süre |
| 21 | Klan adları + skorlar | ÇALIŞIYOR — oransal skor çubuğu (azaltılmış harekete uyan tween) |
| 22 | Ödül rozeti | ÇALIŞIYOR — "puan" birimi; fonlu havuz tutarı ya da "Ödülsüz" |
| 23 | Kazanan / beraberlik | ÇALIŞIYOR — liste vurgusu + detayda kupa satırı |
| 24 | "Detaylar" linki | ÇALIŞIYOR — 404 veren sayfa yerine `?battle=<id>` derin linkli detay paneli (kadro, katkı, puan defteri dökümü, zaman çizelgesi) |
| 25 | Savaşı bitir | ÇALIŞIYOR — etki önizlemeli onay; toast sunucunun gerçek `paidOut/refunded` değerini söyler, aktif değilse 409 |
| 26 | İptal | ÇALIŞIYOR — **iade durum makinesi (B3 talimatı)**: soft-cancel, fonlu havuz meydan okuyana tek sefer iade, liderlere bildirim, gerekçe zorunlu, AuditLog |
| 27 | Kart animasyonu | ÇALIŞIYOR — dekoratif giriş yerine yalnız skor çubuğu tween'i |
| 28 | Yenile | ÇALIŞIYOR — başlıkta; canlı sekme ve canlı detay 30 sn'de bir (görünürken) tazelenir |
| 29 | Aktif/geçmiş ayrımı | ÇALIŞIYOR — sayaçlı durum sekmeleri |
| 30 | Filtre/arama/sayfalama | ÇALIŞIYOR |
| 31 | Yetki | ÇALIŞIYOR — `defineRoute(['ADMIN'])` |
| 32 | Navigasyon | ÇALIŞIYOR — Klan Merkezi sekmesi (sidebar kaydı navigasyon ajanının) |
| 33 | Mobil | ÇALIŞIYOR — kart düzeni, tek sütun form, tam genişlik sheet |
| 34 | Form erişilebilirliği | ÇALIŞIYOR — `fieldset/legend`, `htmlFor/id`, skor `aria-live` |
| 35 | Denetim izi | ÇALIŞIYOR — oluştur/bitir/iptal/uzat/skor düzeltme |
| 36 | Skor/durum düzenleme | ÇALIŞIYOR — yalnız `adjust_score` (aktif savaş, gerekçe ≥5) ve `extend` (gerekçeli); ham durum yazımı yok |
| 37 | Onay diyalogları | ÇALIŞIYOR — `ConfirmAction`/gerekçe diyaloğu, etki önizlemeli; native `confirm()` yok |

### Kapanan bulgular
B1 (iadesiz silme), B2 (sahte ödül: admin savaşı açıkça ödülsüz), B3 (doğrulama + tek açık savaş), B4 (ham PATCH → adlandırılmış geçişler), B5 (kırık detay linki + yetim sayfa), B6 (20 klan sınırı), B7 (form/hata/toast), B8 (saat dilimi + sahte başlangıç), B9 (durum/kazanan/zaman), B10 (a11y, dil), B11 (sınırsız liste, canlılık), B12 (denetim). Eksik özelliklerden durum sekmeleri + sayaç, detay paneli + puan hareketi dökümü, güvenli aksiyonlar, ekonomi görünürlüğü (escrow, 7 günlük ödenen/iade, süresi dolan) uygulandı.

### Kalanlar
- **Müşteri paneli metni** (`components/customer/squad-battle-panel.tsx`): yönetici savaşında squad1 üyelerine "meydan okudunuz" deniyor (`challengedById=null` ayrımı yapılmıyor) — müşteri klan yüzeyinin dosyası; bildirimler artık "Qratex ekibinin onur savaşı" diyor.
- **Platform fonlu havuz** (seçenek a) bilinçli olarak yapılmadı: kayıtlı bütçe kaynağı olmadan puan basmak ekonomi değişmezlerine aykırı.
- **Zamanlanmış (ileri tarihli) yönetici savaşı**: cron adımı + köken alanı gerektirir — ŞEMA İSTEĞİ (`SquadBattle.origin`, isteğe bağlı `scheduledStart`); köken şimdilik `challengedById` boş/dolu ile türetiliyor.
- Toplu iptal ve savaş CSV'si uygulanmadı (tek tek iadeli iptal güvenli yol).
- `e2e/squad-management.spec.ts` eski düğme metnini (`/Savaş Planla|Start New Battle/`) bekliyor; yeni metin "Onur savaşı planla" — e2e dosyası bu yüzeyin sahipliğinde değil.
