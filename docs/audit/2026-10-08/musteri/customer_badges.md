# /customer/badges

**Amaç** · Müşterinin kazandığı rozetleri (genel/emoji rozetleri + AI karakter rozetleri) tek yerde göstermek, karakter rozeti "gizemli bar → küre/maskot reveal" akışını barındırmak ve karakter nadirlik/haftalık liderliğini sunmak. "TAM SÜRPRİZ" politikası gereği kilitli rozetler gösterilmez; kullanıcı yalnızca kazandıklarını görür.

**Genel puan: 4.5/10** · **Karar: yeniden tasarla**

Sayfa iki farklı çağdan kalma iki sistemi üst üste yığıyor: (1) yeni, özenli, sürpriz-odaklı karakter koleksiyonu (`CharacterCard` + `CharacterLeaderboard`) ve (2) "kilitli/ilerleme/puanla aç" dünyası için yazılmış, API artık yalnızca kazanılmış rozet döndürdüğü için yarısı ölü kalmış 882 satırlık eski koleksiyon gövdesi (`badges-client.tsx`). Sonuç: hero istatistikleri her zaman yanlış (X/X, %100, "Sıradaki %0"), "+N puan" değeri gerçek ödül puanı değil, filtrelerin biri işlevsiz, "puanla aç" anlatılıyor ama hiçbir zaman görünmüyor. Ayrıca beslendiği API'de kimlik doğrulamasız bir IDOR var.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Liste, arama, kategori filtresi ve karakter akışı çalışıyor; ama hero'daki 4 metriğin 3'ü yanlış, puan değeri yanlış alan, durum filtresi işlevsiz, kilit/ilerleme/puanla-aç yolları ölü. |
| UX | 4/10 | Bilgi mimarisi ters (başkalarının liderliği kullanıcının kendi rozetlerinden önce), "puanla aç" yanıltıcı metni, hata = boş durum, arama sonucu yok = "koleksiyonun seni bekliyor". |
| Görsel | 6/10 | Nadirlik paletleri ve karakter vitrini emek kokuyor; ama iki koleksiyon iki farklı görsel dil konuşuyor, kartlar aşırı efektli (yıldız alanı + 2 blur küre + shimmer + pulse aynı anda). |
| Mimari | 4/10 | 160 satırlık kart işaretlemesi iki kez kopyalanmış; politika istemci yerine API filtresinde uygulanıp istemcide ölü dallar bırakılmış; admin ve müşteri aynı uç noktayı paylaşıyor ve yetki ayrımı yok. |
| Performans | 5/10 | `ssr:false` code-split iyi; ama 500 rozetin hepsi + kullanıcı sayımları çekilip yalnız kazanılanlar gösteriliyor, karakter/liderlik uçları önbelleksiz, 1324 satırlık reveal modali her girişte yükleniyor, kart başına sonsuz animasyon + blur. |
| Erişilebilirlik + Mobil | 4/10 | Kartlar klavyeyle açılamıyor (`div onClick`), detay modalında `role="dialog"`/Escape/odak tuzağı yok, mobilde h1 sayfanın ortasında, mobilde tek sütun ve ~330px kartlarla uzun kaydırma; karakter bileşenleri yalnız Türkçe. |

---

## Özellik envanteri

Durum: ÇALIŞIYOR / KISMİ / BOZUK / SAHTE / EKSİK

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota yetkisi (yalnız CUSTOMER) | ÇALIŞIYOR | `proxy.ts:50-75` | `/customer` öneki rol kontrolünden geçer. |
| 2 | Sayfa metadata (başlık/açıklama) | KISMİ | `app/customer/badges/layout.tsx:5`, `messages/tr.json` `layoutMetadata.customerBadgesDescription` = "Kazanılan rozetler, nadirlik ve vitrin sırası." | Bu sayfada "vitrin sırası" yönetimi yok (o iş `app/customer/settings` → `showcase-selector`). |
| 3 | Gövdenin `ssr:false` ile ayrı chunk'a alınması + iskelet | ÇALIŞIYOR | `app/customer/badges/page.tsx:11-23` | Ardından gövdenin kendi iskeleti de geliyor (çift iskelet, `badges-client.tsx:394-407`). |
| 4 | Masaüstü sayfa başlığı | ÇALIŞIYOR | `badges-client.tsx:229-232`, `components/dashboard/page-heading.tsx:21` | `hidden sm:flex`. |
| 5 | Mobil başlık kartı (h1) | KISMİ | `badges-client.tsx:240-245` | `CharacterCard` ve `CharacterLeaderboard`'dan SONRA geliyor; mobilde h1 sayfanın ortasında. |
| 6 | Karakter kartı veri yükleme | KISMİ | `components/customer/character-card.tsx:107-113,157` | Yüklenirken ve hata olunca `return null` — iskelet yok, hata mesajı yok, geç gelince tüm sayfayı aşağı itiyor (CLS). |
| 7 | Gizemli ilerleme barı ("N yorum daha") | ÇALIŞIYOR | `character-card.tsx:237-252`, `app/api/customer/character/route.ts:90-105` | Kategori adı sızdırılmıyor. |
| 8 | Bar dolunca konfeti + ses (tek sefer, reduced-motion'a duyarlı) | ÇALIŞIYOR | `character-card.tsx:121-134` | |
| 9 | Küre / Maskot varyant seçici | ÇALIŞIYOR | `character-card.tsx:204-219` | `aria-pressed` yok; emoji etiketli; yalnız TR. |
| 10 | "Karakterini Aç" → reveal modalı | ÇALIŞIYOR | `character-card.tsx:229-235,276-286`; `components/customer/character-reveal.tsx:316,340-342` | Modal Escape + `role="dialog"` + reduced-motion destekli. |
| 11 | Karakter koleksiyonu kategoriye göre gruplu vitrin | ÇALIŞIYOR | `character-card.tsx:166-186,256-269` | |
| 12 | Karakter kartında nadirlik etiketi / nadir % / tarih | ÇALIŞIYOR | `character-card.tsx:430-511` | Tarih her zaman `tr-TR` (`character-card.tsx:72`). |
| 13 | "Ana karakter yap" (iyimser güncelleme) | KISMİ | `character-card.tsx:137-155`; `api/customer/character/route.ts:124-135` | Sunucu reddederse sessizce geri yükleniyor; kullanıcıya hiçbir geri bildirim (toast) yok. |
| 14 | Kategori başına 2 sabit "???" kilitli kart | ÇALIŞIYOR (kasıtlı dekor) | `character-card.tsx:85,345-347` | Kategori tamamlanmış olsa bile "Daha fazlası seni bekliyor" diyor — tam koleksiyonda yalan söyler. |
| 15 | Karakter boş vitrin durumu | ÇALIŞIYOR | `character-card.tsx:555-577` | |
| 16 | Liderlik — "En Nadir" modu | ÇALIŞIYOR | `components/customer/character-leaderboard.tsx:89-111`; `api/customer/character-leaderboard/route.ts:99-147` | Başkasının karakteri maskeleniyor (iyi). |
| 17 | Liderlik — "Bu Hafta" modu | ÇALIŞIYOR | `character-leaderboard.tsx:174-196`; route `:48-97` | Diğer müşterilerin tam adı + avatarı + `userId`'si istemciye gidiyor (route `:75`). |
| 18 | "Sen" satırı (ilk 20 dışında) | KISMİ | `character-leaderboard.tsx:181-195`; route `:90` | İlk 20 dışındaysa sıra `null` → "—" gösteriliyor; gerçek sıra hesaplanmıyor. |
| 19 | Liderlik yükleniyor / boş durum | ÇALIŞIYOR | `character-leaderboard.tsx:153-166` | |
| 20 | Liderlik hata durumu | EKSİK | `character-leaderboard.tsx:104,115,167-172` | Hata → `rows=null`, `isEmpty=false` → boş `<ol>`; mesaj yok. |
| 21 | "Rozetler nasıl kazanılır?" bilgi kartı | SAHTE | `badges-client.tsx:248-259`; `messages/tr.json` `unlockWithPointsDescription` | "Bazı rozetler 'X puan ile aç' butonuyla açılabilir" diyor; buton API politikası gereği hiçbir zaman çıkmıyor (bkz. #36). |
| 22 | Hero: "kazanılan / toplam" | BOZUK | `badges-client.tsx:191-196,275-277`; `api/gamification/badges/route.ts:275-276` | API yalnız kazanılanları döndürüyor → `total === earned`, her zaman "5 / 5". |
| 23 | Hero: efsanevi / epik sayacı | ÇALIŞIYOR | `badges-client.tsx:198-199,280-289` | |
| 24 | Hero: "Toplam Puan" | BOZUK | `badges-client.tsx:197,298`; `route.ts:239` (`points: targetValue`) | Gerçek ödül `lib/badge-reward-points.ts:25-31`'den geliyor; ekranda `requirement.value` toplanıyor. |
| 25 | Hero: "Tamamlanan %" | BOZUK | `badges-client.tsx:303` | Her zaman %100 (veya hiç rozet yoksa %0). |
| 26 | Hero: "Sıradaki %" | SAHTE | `badges-client.tsx:202,308` | Kazanılmamış rozet hiç gelmediği için `progressToNext` her zaman `undefined` → kalıcı "%0". |
| 27 | "Sıradaki rozet" ilerleme çubuğu | BOZUK (ölü kod) | `badges-client.tsx:315-330` | Hiçbir zaman render edilmiyor. |
| 28 | Arama (ad + açıklama) | ÇALIŞIYOR | `badges-client.tsx:180-189,335-345` | `aria-label` var. |
| 29 | Durum filtresi (Tümü / Kazandıklarım) | SAHTE | `badges-client.tsx:350-362` | Liste zaten yalnız kazanılanlardan oluştuğu için iki seçenek aynı sonucu veriyor. `'locked'` tipi ölü (`:140`). |
| 30 | Kategori filtresi | ÇALIŞIYOR | `badges-client.tsx:365-390` | Yalnız kazanılan kategoriler listelenir (politikayla tutarlı). |
| 31 | Yükleniyor iskeleti (grid) | ÇALIŞIYOR | `badges-client.tsx:394-407` | |
| 32 | Boş durum | KISMİ | `badges-client.tsx:408-422` | Arama sonucu yoksa da, API hatası olunca da "koleksiyonun seni bekliyor" gösteriliyor; metin sabit Türkçe + emoji. |
| 33 | API hata yönetimi | BOZUK | `badges-client.tsx:149-178` | `data.success === false` (500/503) dalı hiç ele alınmıyor; toast yok, boş durum gösteriliyor. |
| 34 | Kategoriye göre gruplu rozet ızgarası | KISMİ | `badges-client.tsx:423-519`; `route.ts:127-129,280-284` | Kategori içi sıra `rarity` STRING azalan → `rare > legendary > epic > common`; yorum "legendary first" diyor. Kazanım tarihine göre sıralama yok. |
| 35 | Admin özel rozet rengi (`Badge.color/bgColor`) | KISMİ | `badges-client.tsx:446,462` vs `:521-541` | Yalnız "Tüm kategoriler" görünümünde uygulanıyor; bir kategori seçilince aynı rozet rarity paletine dönüyor. |
| 36 | Kartta "+N puan" etiketi | BOZUK | `badges-client.tsx:492,636-639`; `route.ts:239` | `targetValue` gösteriliyor, ödül puanı değil. |
| 37 | "X puan ile aç" butonu + yetersiz puan uyarısı | BOZUK (ölü kod) | `badges-client.tsx:206-225,495-499,642-662` | Kilitli kart hiç gelmediği için erişilemez. API ucu ise hâlâ canlı (bkz. Bulgu 2). |
| 38 | Kilitli kart ilerleme çubuğu | BOZUK (ölü kod) | `badges-client.tsx:500-505,663-674` | Erişilemez. |
| 39 | Rozet detay modalı açma | KISMİ | `badges-client.tsx:463,542,688-705` | Yalnız fare/dokunma; klavyeyle açılamaz. |
| 40 | Modal: kazanıldı rozeti + tarih + puan | KISMİ | `badges-client.tsx:813-832` | Tarih doğru, puan yanlış alan (#36). |
| 41 | Modal: kilitli dal (ilerleme, "Nasıl kazanılır", ödül) | BOZUK (ölü kod) | `badges-client.tsx:833-861` | Erişilemez; ayrıca `requirement` = `description` (route `:244`) → açıklamayı ikinci kez basardı; ":" sonrası boşluk eksik (`:851-852`). |
| 42 | Modal kapatma (X butonu / arka plan) | ÇALIŞIYOR | `badges-client.tsx:697,744-751` | X butonunun `aria-label`'ı yok. |
| 43 | Modal Escape / odak tuzağı / `role="dialog"` / kaydırma kilidi | EKSİK | `badges-client.tsx:692-705` | Elle yazılmış overlay; shadcn `Dialog` kullanılmamış. |
| 44 | Kart klavye erişimi | EKSİK | `badges-client.tsx:456-464,536-543` | `div` + `onClick`; `role`, `tabIndex`, `onKeyDown` yok. |
| 45 | Hareket azaltma | KISMİ | `components/providers.tsx:232`; `app/globals.css:801-810,824-830` | Global CSS ve `MotionConfig reducedMotion="user"` dönme/ölçeği keser; modal yıldız alanının sonsuz opaklık animasyonu (`badges-client.tsx:713-726`) ve uygulama-içi "animasyonları azalt" ayarı framer'a uygulanmaz. |
| 46 | Nadirlik efektleri (yıldız alanı, shimmer, efsanevi parıltı) | KISMİ | `badges-client.tsx:465-473,544-573`, `:871-879` | Çalışıyor ama ağır; `<style jsx global>` `shimmer` keyframe'i `app/globals.css:652` ve `tailwind.config.ts:86,158` ile çift tanımlı. |
| 47 | Çok dillilik | KISMİ | `character-card.tsx:202,226-241,326,522,546-563`; `character-leaderboard.tsx:123-165,257,279,340-342`; `badges-client.tsx:416-419` | Gövde `t()` kullanıyor, karakter bileşenleri ve boş durum tamamen sabit Türkçe → EN kullanıcı karışık dil görüyor. |
| 48 | Bildirimden belirli rozete derin bağlantı | EKSİK | `lib/activity-badges.ts:275`, `lib/surprise-badges.ts:264`, `lib/character-achievements.ts:176` → hepsi düz `/customer/badges` | `?badge=` parametresi okunmuyor; yeni rozet vurgulanmıyor. |
| 49 | Rozet paylaşma | EKSİK | — | Karakter reveal'da paylaşım var (`character-reveal.tsx:9,786`), normal rozette yok. |
| 50 | Vitrine sabitleme (pin) | EKSİK | `prisma/schema.prisma:634` (`UserBadge.isPinned`); `components/customer/showcase-selector.tsx` yalnız `app/customer/settings`'te | Koleksiyon sayfasından vitrine eklenemiyor. |
| 51 | Normal rozetlerde "kullanıcıların %X'inde" | EKSİK | `route.ts:253` `earnedCount` döndürülüyor ama istemci kullanmıyor | Veri hazır, gösterilmiyor. |
| 52 | "Yeni" rozeti / görülmedi işareti | EKSİK | — | Kazanım sonrası sayfaya gelen kullanıcı yeni olanı ayırt edemiyor. |

**Sayım:** ÇALIŞIYOR 19 · KISMİ 13 · BOZUK 9 (4'ü erişilemeyen ölü kod) · SAHTE 3 · EKSİK 8 — toplam 52 kalem.

---

## Bulgular

### 1. [YÜKSEK · Güvenlik/IDOR] Rozet API'si kimlik doğrulamasız olarak herhangi bir kullanıcının puanını, seviyesini, yorum sayısını ve rozetlerini döndürüyor
- **Kanıt:** `app/api/gamification/badges/route.ts:79-87` (`userId` doğrudan query'den alınıyor, sahiplik/rol kontrolü yok), `:147-183` (`points`, `level`, `_count.feedbacks`, `_count.quests` okunuyor), `:286-291` (`userProgress` ve `userPoints` yanıtta). `proxy.ts:105-119` `/api/*` için oturum zorlamıyor. Kullanıcı kimlikleri de başka bir uçtan sızıyor: `app/api/customer/character-leaderboard/route.ts:75` (`userId` her satırda).
- **Sorun:** Oturumu olmayan biri bile `GET /api/gamification/badges?userId=<cuid>` ile o kişinin puan bakiyesi, seviyesi, toplam geri bildirim sayısı, tamamlanan görev sayısı ve kazandığı rozetleri kazanım tarihleriyle alabiliyor. Haftalık liderlik `userId` verdiği için hedef listesi de hazır. KVKK açısından kişisel davranış verisinin sızması.
- **Profesyonel öneri:** Uç noktayı ikiye ayırın: (a) müşteri için `GET /api/customer/badges` — `requireAuth(['CUSTOMER'])`, `userId` parametresi KABUL ETMEZ, daima oturumdaki kullanıcı; (b) admin için `GET /api/admin/users/[id]/badges` — `requireAuth(['ADMIN'])`. Geçiş döneminde mevcut uçta `userIdParam !== 'me'` ise `role === 'ADMIN'` şartı koyun. Liderlik yanıtından `userId`'yi çıkarın (React anahtarı için `rank` yeterli). Not: `app/admin/users/users-client.tsx:393-396` bu uçtan `data.userBadges` bekliyor ama API öyle bir alan döndürmüyor — admin tarafındaki özellik de zaten kırık, ayrılma bunu da düzeltir.
- **Efor:** S

### 2. [YÜKSEK · Ürün bütünlüğü/Ekonomi] "Tam sürpriz" politikası yalnızca istemci listesinde uygulanıyor; katalog ve satın alma API üzerinden hâlâ açık
- **Kanıt:** `route.ts:273-277` — `userId` verilmezse `hiddenUntilEarned=false` olan TÜM rozetler (ad, açıklama, `pointCost`, `requirementType`, `earnedCount`) herkese döner. `app/api/gamification/badges/[id]/unlock/route.ts:35-46` yalnız `hiddenUntilEarned` rozeti reddediyor; diğerlerini puanla satıyor. `lib/badge-catalog.ts:21-35` rozetlerin çoğunda `pointCost` dolu ve kimlikler tahmin edilebilir (`badge-yeni-ses` vb.).
- **Sorun:** Politika "kilitli/ilerleme/satın alma yok" diyor ama API'yi doğrudan çağıran biri rozet kataloğunu görebilir ve `pointCost`'u olan her gizli-olmayan rozeti satın alabilir. Satın alınan rozet sonradan davranışla kazanıldığında `createMany skipDuplicates` sayısı 0 olacağı için ödül puanı da yanar (`lib/badge-reward-points.ts:17-19,52`) — kullanıcı aleyhine sessiz kayıp. Hangi rozetlerin DB'de `hiddenUntilEarned=true` olduğu doğrulanmadı (canlı DB'ye dokunulmadı); risk bu bayrağın dağılımına bağlı.
- **Profesyonel öneri:** Politikayı tek yerde, sunucuda tanımlayın: `lib/badge-visibility.ts` içinde `canCustomerSeeBadge` / `canCustomerPurchaseBadge`. Puanla açma ürün kararı olarak kaldırıldıysa unlock ucunu 410 ile kapatın ve `pointCost` alanını müşteri yanıtlarından çıkarın; ileride "rozet mağazası" geri gelecekse bunu açık bir özellik bayrağı (`BADGE_SHOP_ENABLED`) arkasına alın. Oturumsuz katalog yanıtını kaldırın veya yalnız `{ id, name, icon }` ile ve yalnız admin'e verin.
- **Efor:** S–M

### 3. [YÜKSEK · Veri doğruluğu] Ekrandaki "+N puan" ve "Toplam Puan", gerçek ödül değil, rozet koşulunun hedef değeri
- **Kanıt:** `route.ts:239` `points: targetValue` (`requirement.value`); `badges-client.tsx:197,298,492,638,828,857`. Gerçek ödül kaynağı: `lib/badge-reward-points.ts:25-31` → `lib/emoji-badge-texts.ts` (`badge-yeni-ses` = 200, `badge-yorum-makinesi` = 4000 …).
- **Sorun:** Kullanıcı rozet kazandığında hesabına X puan yatıyor, rozet sayfası Y puan diyor. Ödül/puan ekonomisinin güvenilirliği tam olarak bu tür tutarsızlıklarla aşınır; destek talebi üretir.
- **Profesyonel öneri:** API'ye `rewardPoints: badgeRewardPoints(badge.id)` alanı ekleyin, `points` alanını kullanımdan kaldırın. Daha da iyisi, kullanıcıya gerçekten yatırılan miktarı göstermek için `points_credited` analytics olayından (`category:'badge'`, `data.badgeId`) kullanıcı-başına okunan "kazanılan puan"ı döndürün — böylece geçmişte farklı tablo değerleriyle verilmiş ödüller de doğru görünür. Hero'daki "Toplam Puan" bu alanın toplamı olmalı.
- **Efor:** S

### 4. [YÜKSEK · İşlevsellik] Hero istatistiklerinin 3/4'ü yapısal olarak yanlış; "Sıradaki" ve ilerleme çubuğu ölü
- **Kanıt:** `badges-client.tsx:191-202,275-277,303,308,315-330`; `route.ts:275-276`.
- **Sorun:** API yalnız kazanılanları döndürdüğünden `total === earned` → her kullanıcı "5 / 5 Rozet Kazanıldı · %100 Tamamlanan · Sıradaki %0" görüyor. Bu "koleksiyonu bitirdin" mesajı veriyor; sürpriz politikasının amacı olan merakı öldürüyor ve aynı ekrandaki "daha fazlası seni bekliyor" diliyle çelişiyor.
- **Profesyonel öneri:** Sürpriz politikasıyla uyumlu metrik seti tasarlayın: "Toplanan rozet" (sayı, payda YOK), "En nadir rozetin" (nadirlik + "kullanıcıların %X'inde", `earnedCount` zaten geliyor), "Bu ay kazanılan", "Rozetlerden gelen toplam puan" (Bulgu 3). İlerleme ihtiyacını gizemli bar zaten karşılıyor; normal rozetler için de "gizli ilerleme sinyali" isteniyorsa kategori adı sızdırmadan tek bir "bir sonraki sürprize yakınsın" göstergesi sunucuda hesaplanmalı.
- **Efor:** S

### 5. [ORTA · Hata yönetimi] API hatası ve "arama sonucu yok" durumu, "koleksiyonun boş" olarak gösteriliyor
- **Kanıt:** `badges-client.tsx:155-171` (yalnız `success` dalı var), `:408-422` (boş durum filtre/arama ayrımı yapmıyor).
- **Sorun:** DB uyuyorken (Neon) veya 500'de kullanıcı tüm rozetlerini kaybettiğini sanır. Arama eşleşmeyince "Rozet koleksiyonun seni bekliyor" demek yanlış bağlam.
- **Profesyonel öneri:** Üç ayrı durum bileşeni: `ErrorState` (yeniden dene butonu + i18n), `NoResultsState` ("'{q}' için sonuç yok · filtreleri temizle"), `EmptyCollectionState` (gerçekten hiç rozet yok). Veri katmanını SWR/React Query'ye taşıyıp `error`, `isLoading`, `mutate` ile yönetin; aynı zamanda unmount sonrası `setState` (AbortController yok, `:144-147`) sorunu kalkar.
- **Efor:** S

### 6. [ORTA · Mimari] 882 satırlık gövdede kopyalanmış kart, ölü dallar ve ikinci bir koleksiyon dili
- **Kanıt:** Kart işaretlemesi iki kez: `badges-client.tsx:441-513` ve `:523-682`; ikinci kopyada admin rengi yok (`:537` vs `:446,462`). Ölü dallar: `:206-225`, `:315-330`, `:495-505`, `:642-674`, `:833-861`, `filter` tipindeki `'locked'` (`:140`). Karakter bileşenleri ayrı nadirlik teması tanımlıyor (`character-card.tsx:45-50`, `character-leaderboard.tsx:10-15`, kendi `rgba()` kopyalarıyla `:56-64` / `:21-29`), `lib/badge-colors.ts:hexToRgba` zaten var.
- **Sorun:** Her görsel düzeltme iki yerde yapılmak zorunda ve zaten ayrışmış (Bulgu: admin rengi). Nadirlik etiketleri iki kaynakta ("NADİR" sabit vs `t('customerBadges.rarity.rare')`).
- **Profesyonel öneri:** `components/badges/` altında tek bir `BadgeTile` (props: `badge`, `variant: 'grid'|'compact'`, `onOpen`), tek `BadgeDetailSheet`, tek `rarity-theme.ts` (Tailwind sınıfları + hex + i18n anahtarı) ve hem normal hem karakter rozeti için ortak `CollectibleBadge` tipi. Ölü "kilitli/puanla aç" dallarını silin (ürün geri isterse özellik bayrağıyla yeniden eklenir).
- **Efor:** M

### 7. [ORTA · Erişilebilirlik] Kartlar klavyeyle açılamıyor; detay modalı erişilebilir diyalog değil
- **Kanıt:** `badges-client.tsx:456-464,536-543` (`div onClick`), `:692-705` (`role`, `aria-modal`, Escape, odak tuzağı, kaydırma kilidi yok), `:744-751` (ikon butonda `aria-label` yok). Hero'da başlık hiyerarşisi `h1 → h3` (`:275`); kategori başlıkları ve kart başlıkları da `h3` (`:435,486`).
- **Sorun:** Klavye/ekran okuyucu kullanıcıları detay göremez; modal açıkken arka plan kaydırılabilir, odak arkada kalır. WCAG 2.1.1, 2.4.3, 4.1.2 ihlali.
- **Profesyonel öneri:** Kartı `<button>` (veya `role="button" tabIndex=0` + Enter/Space) yapın, `aria-label="{ad}, {nadirlik}, {tarih} tarihinde kazanıldı"`. Detayı shadcn `Dialog` (masaüstü) / `Drawer` (mobil, alttan sayfa) ile yeniden kurun — odak tuzağı, Escape, `aria-labelledby` ücretsiz gelir. Başlık hiyerarşisini h1 → h2 (bölümler) → h3 (kart) düzenleyin. Karakter seçicilerine `aria-pressed` ekleyin (`character-card.tsx:206-217`, `character-leaderboard.tsx:126-141`).
- **Efor:** S–M

### 8. [ORTA · Bilgi mimarisi/UX] Sayfa sırası ters: başkalarının liderliği, kullanıcının kendi rozetlerinden önce; mobil h1 ortada
- **Kanıt:** `badges-client.tsx:235` (CharacterCard) → `:238` (Leaderboard) → `:240-245` (mobil h1) → `:248-259` (nasıl kazanılır) → `:261-332` (hero) → `:334+` (koleksiyon).
- **Sorun:** Kullanıcı sayfaya "benim rozetlerim" için gelir (bildirim CTA'ları da öyle: `lib/notify-email.ts:148`). İlk ekranı karakter kartı + 5-20 satırlık liderlik kaplıyor; kendi koleksiyonu 3-4 ekran aşağıda. Mobilde ekran okuyucu ilk h1'i sayfanın ortasında buluyor.
- **Profesyonel öneri:** Yeniden tasarım vizyonundaki sıralama (aşağıda). Liderliği ayrı bir sekmeye/sayfaya (`/customer/leaderboard` ailesine) taşıyın veya en alta katlanabilir bir "Topluluk" bölümü yapın. Mobil başlık bileşenini en üste alın ya da `DashboardPageHeading`'i mobilde de gösterin.
- **Efor:** M

### 9. [ORTA · Performans] Kazanılan birkaç rozet için 500 rozet + kullanıcı sayımları çekiliyor; karakter ve liderlik uçları önbelleksiz
- **Kanıt:** `route.ts:120-132` (`take:500` + `_count.users` her rozet için), `:149-170` (ayrı `userBadge` ve `user` sorgusu, `_count.badges` kullanılmıyor), sonra `:276` ile filtre. `api/customer/character/route.ts:41-90` sıralı 5+ sorgu, her istekte `prisma.user.count({role:'CUSTOMER'})` (`:53`); `lib/character-badges.ts:361-370` uzunluk şartlı kategoriler için kullanıcının tüm yorum metinlerini çekiyor. Liderlik "rarest" herkes için aynı ama her istekte `groupBy` + `count` (`character-leaderboard/route.ts:100-109`). `character-card.tsx:8` 1324 satırlık reveal modalını statik import ediyor (bar dolmamışken de yükleniyor).
- **Sorun:** Sayfa açılışında 3 paralel uç × çok sayıda DB turu (Neon soğuk başlangıçta belirgin). Önbellek katmanı (Upstash) projede olduğu halde kullanılmamış.
- **Profesyonel öneri:** Müşteri ucunda `prisma.userBadge.findMany({ where:{userId}, include:{ badge:{select:…} } })` tek sorgu; `earnedCount` için rozet-başı sahip sayısını ve `totalCustomers`'ı Redis'te 10-15 dk TTL ile tutun (`lib/cache` deseni). "rarest" liderliğinin global kısmını (holders) önbelleğe alın, yalnız `isMine` maskesini istek başına uygulayın. Uzunluk şartlı sayımı `prisma.$queryRaw` ile `length(text) >= $minLen` COUNT'a çevirin. `CharacterReveal`'ı `next/dynamic` ile yalnız `ready` iken yükleyin. Üç uç tek bir `GET /api/customer/badges/overview` altında birleştirilebilir.
- **Efor:** M

### 10. [ORTA · Görsel/Performans] Kart başına aşırı efekt katmanı
- **Kanıt:** Her kartta 10 `animate-pulse` yıldız (`badges-client.tsx:465-469,545-559`), iki `blur-3xl` küre (`:472-473,572-573`), hover'da `scale-[1.03]` + `-translate-y-1.5` + iç `scale-110` (`:457,476`), epik için sonsuz shimmer, efsanevi için sonsuz pulse + dönen ikon; her kart `layout` animasyonlu `Motion.div` (`:448-455`). Modalda 20 sonsuz framer animasyonu (`:712-727`).
- **Sorun:** 20-30 rozetlik koleksiyonda düşük segment Android'de kaydırma takılması ve pil tüketimi; ayrıca her şey parlayınca efsanevi rozetin "özel" hissi kayboluyor (nadirlik hiyerarşisi görsel gürültüde eriyor).
- **Profesyonel öneri:** Efekt bütçesi: ortak/nadir = statik; epik = tek ince kenar parıltısı; efsanevi = tek, yavaş, yalnız görünür alandayken (IntersectionObserver) çalışan holografik folyo efekti. Yıldız alanını kart başına değil sayfa arka planına tek katman olarak taşıyın. `layout` animasyonunu yalnız filtre değişiminde açın.
- **Efor:** M

### 11. [DÜŞÜK · i18n] Karakter bileşenleri ve boş durum sabit Türkçe
- **Kanıt:** `character-card.tsx:202,210,216,226-241,326,396,522,537,546-563`, `:72` (`tr-TR` tarih); `character-leaderboard.tsx:11-13,123,132,140,147-148,163-165,257,269,279,340-342`; `badges-client.tsx:416-419`.
- **Sorun:** `messages/en.json` tam olduğu halde İngilizce arayüzde sayfanın üst yarısı Türkçe.
- **Profesyonel öneri:** `customerCharacter.*` ad alanı açıp `useAppT` ile bağlayın; tarihleri `useAppLocale` ile biçimleyin; nadirlik etiketlerini ortak `rarity-theme.ts`'ten alın.
- **Efor:** S

### 12. [DÜŞÜK · Doğruluk] Sunucu sıralaması `rarity` metnine göre; yorum yanlış
- **Kanıt:** `route.ts:127-128` (`{ rarity: 'desc' } // legendary first`) — alfabetik azalan: `rare, legendary, epic, common`. İstemci sıralaması (`:280-284`) eşitlikte bunu korur.
- **Profesyonel öneri:** Sıralamayı kodda bir `RARITY_RANK` haritasıyla yapın ve varsayılan sıralamayı "en yeni kazanılan önce" yapın; kullanıcıya "Yeni · Nadirlik · Kategori" sıralama seçeneği verin.
- **Efor:** S

### 13. [DÜŞÜK · Gizlilik] Haftalık liderlikte diğer müşterilerin tam adı ve avatarı, çıkış tercihi olmadan gösteriliyor
- **Kanıt:** `character-leaderboard/route.ts:63-80`, `character-leaderboard.tsx:323-340`. Şemada liderlik görünürlük tercihi alanı yok (`grep showOnLeaderboard` boş). `app/api/user/profile/route.ts:13` `image` alanına host doğrulaması yapmadan URL kabul ediyor; `next.config` `remotePatterns` dışındaki bir avatar prod'da kırık görsel olur (geliştirmede `next/image` render hatası — prod davranışı doğrulanmadı).
- **Profesyonel öneri:** Ad maskeleme ("Furkan U.") ve ayarlarda "liderliklerde görün" anahtarı; avatar URL'sini profil API'sinde izinli hostlara sınırlayın. Bu sistem genelindeki liderlik politikasıyla birlikte ele alınmalı.
- **Efor:** S–M

### 14. [DÜŞÜK · Kod hijyeni] Çift `shimmer` keyframe'i, global stil sızıntısı, çift iskelet
- **Kanıt:** `badges-client.tsx:871-879` vs `app/globals.css:652-659`, `tailwind.config.ts:86-88,158`; çift iskelet `page.tsx:13-22` + `badges-client.tsx:394-407`.
- **Profesyonel öneri:** `<style jsx global>` bloğunu silin; iskeleti tek yerde (gövdenin gerçek yerleşimiyle aynı) tutun.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Rozet detayında anlam ve bağlam (Duolingo/Xbox başarımları):** "Ne zaman, nerede, hangi davranışla kazandın" — kazanımı tetikleyen işletme/yorum bağlantısı ve "kullanıcıların %X'inde" nadirlik oranı (`earnedCount` zaten API'de). Kazanım kutlama metinleri `lib/emoji-badge-texts.ts`'de `quote` alanında hazır ama bu sayfada hiç kullanılmıyor.
2. **Paylaşılabilir rozet kartı (Spotify Wrapped, Strava):** Karakter reveal'daki `shareCharacter` altyapısını (`character-share-card`) normal rozetlere genişletip hikâye formatında (9:16) görsel üretmek.
3. **Vitrine sabitleme koleksiyonun içinden (Steam/Xbox profil vitrini):** Detay sayfasında "Profilimde göster" anahtarı; şu an yalnız ayarlar sayfasında (`showcase-selector`). `UserBadge.isPinned` alanı mevcut.
4. **"Yeni" işareti + bildirimden derin bağlantı (Starbucks Rewards, Revolut):** `?badge=<id>` ile açılınca ilgili rozete kaydırıp detayını açmak; görülmemiş rozetlerde nokta işareti (`UserBadge.seenAt` alanı gerekir).
5. **Zaman çizelgesi / yıllık özet (Spotify Wrapped, Monzo Year in Review):** "Rozet yolculuğun" — kazanım tarihine göre dikey zaman çizelgesi; `my-year` sayfasıyla veri paylaşımı.
6. **Sürprizi bozmadan merak sinyali (Duolingo "gizli başarımlar"):** Kategori başına "keşfedilmemiş rozetler var" ipucu, sunucunun hesapladığı, sayıyı sızdırmayan tek bir "yakınsın" sinyali.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Benim koleksiyonum" hissi veren, ilk ekranda kişinin kendi kazançlarını ve bir sonraki sürprizin heyecanını gösteren, sakin ama değerli görünen bir vitrin. Efsanevi rozet gerçekten özel görünmeli; diğer her şey ona sahne olmalı.

**Yerleşim (mobil öncelikli):**
1. **Üst şerit (tek kart):** Kullanıcının "ana karakteri" + toplanan rozet sayısı (paydasız) + rozetlerden kazanılan toplam puan (gerçek ledger'dan) + en nadir rozeti ("kullanıcıların %0,8'inde"). Paylaş butonu.
2. **Sürpriz bölmesi:** Mevcut gizemli bar + "Karakterini Aç" — değişmeden korunur, ama iskeletli ve hata durumlu.
3. **Sekmeler (segment kontrol):** `Rozetler` · `Karakterler` · `Topluluk`. Rozetler sekmesi: mobilde 3 sütunlu yoğun ızgara (ikon + ad, ~110px kare kartlar), üstte "Yeni · Nadirlik · Kategori" sıralama çipi ve kategori çipleri, arama yalnız 12+ rozette görünür. Karakterler sekmesi: mevcut kategori vitrini. Topluluk sekmesi: En nadir / Bu hafta liderliği (ad maskeli).
4. **Detay:** Mobilde alttan açılan `Drawer`, masaüstünde `Dialog`: büyük ikon, nadirlik, kazanım tarihi, kutlama metni (`quote`), kazanılan puan, nadirlik oranı, "Profilimde göster" anahtarı, "Paylaş".

**Motion / 3D (ölçülü):**
- Izgarada statik kartlar; yalnız efsanevi rozette, görünür alandayken çalışan ve imleç/eğim (deviceorientation izni olmadan pointer) ile hafif tepki veren holografik folyo (CSS `conic-gradient` + `mix-blend-mode`, three.js gerekmez).
- Detay açılışında tek bir paylaşılan-eleman geçişi (`layoutId` ile kart → drawer ikonu).
- Bildirimden derin bağlantıyla gelindiğinde: o rozete kaydırma + tek seferlik parıltı + `fireStars` (zaten mevcut `useConfetti`). Sonsuz animasyon yok.
- 3D (three.js) yalnız reveal ekranında kalmalı — orada yerinde; koleksiyon ızgarasına taşınmamalı.
- Tüm sonsuz/dekoratif hareketler `useReducedMotion()` ve uygulama-içi "animasyonları azalt" sınıfına bağlanmalı.

**Veri / API değişiklikleri:**
- `GET /api/customer/badges/overview` (yalnız CUSTOMER, `userId` parametresi yok): `{ badges: [{ id, name, icon, rarity, category, earnedAt, rewardPoints, rarityPct, quote, isPinned, isNew }], stats: { count, pointsFromBadges, rarest }, character: {...bar, collection}, }` — tek tur, Redis'te global sayımlar.
- `rewardPoints` = `badgeRewardPoints(id)`; `pointsFromBadges` = `points_credited` (category `badge`) toplamı.
- `PATCH /api/customer/badges/[id]` → `{ isPinned, seen }`.
- `UserBadge.seenAt DateTime?` alanı (göç gerekir).
- Admin uçları `app/api/admin/...` altına taşınır; mevcut `/api/gamification/badges` GET'i yalnız admin'e kısıtlanır veya kaldırılır.
- `unlock` ucu politika kararına göre kapatılır veya özellik bayrağına bağlanır.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/progress-hub`** (`app/customer/progress-hub/page.tsx:187-200,255-270`): Kendi rozet önizleme kartı ve rozet dialogu var, `/customer/badges`'e yönlendiriyor. Önizleme olarak kalması makul; ancak aynı veri iki ayrı uçtan ve iki ayrı görsel dille çiziliyor — ortak `BadgeTile` bileşenini kullanmalı.
- **`/customer/settings` → vitrin seçici** (`components/customer/showcase-selector.tsx`): Rozet vitrini yönetimi ayarlarda; layout açıklaması ise bu sayfayı "vitrin sırası" sayfası olarak tanımlıyor. Vitrin yönetimi bu sayfanın detay ekranına taşınmalı (ayarlarda kısayol kalabilir).
- **`/customer/leaderboard`, `/customer/category-leaderboard`**: Karakter liderliği, sistemdeki diğer liderliklerden kopuk üçüncü bir liderlik. Liderlikler tek bir "Topluluk/Lig" yüzeyinde sekmeler olarak birleştirilmeli; bu sayfada en fazla "senin karakterlerinin nadirliği" özeti kalmalı.
- **`/customer/my-year`**: Rozet zaman çizelgesi/özet önerisi bu sayfayla veri paylaşmalı (kopya değil, aynı overview ucu).
- **`/admin/users`** (`app/admin/users/users-client.tsx:391-399`): Aynı uç noktayı `?userId=` ile kullanıyor ve olmayan `data.userBadges` alanını okuyor — admin tarafında kırık; Bulgu 1'deki uç ayrımı bunu da çözer.

**Karar:** Sayfa kalmalı (bildirimlerin, e-postaların ve kenar çubuğunun hedefi), ama gövde yeniden tasarlanmalı: ölü "kilitli/puanla aç" dünyası silinmeli, karakter ve normal rozetler tek bir koleksiyon dili ve tek bir veri ucunda birleştirilmeli, liderlik ayrı yüzeye taşınmalı.

---

## Doğrulama (şüpheci inceleme)

Yöntem: salt okunur kod incelemesi (DB'ye, script'e, sunucuya dokunulmadı). Her iddia çürütülmeye çalışıldı.

### 1. Kimlik doğrulamasız IDOR (`/api/gamification/badges?userId=X`) — **DOĞRULANDI** (Kritik/Yüksek uygun)

- `app/api/gamification/badges/route.ts:79-87`: `getServerSession` çağrılıyor ama sonucu hiçbir yerde **zorunlu tutulmuyor**; `userIdParam` `'me'` değilse olduğu gibi `userId` oluyor. Sahiplik/rol kontrolü yok.
- `route.ts:147-182`: hedef kullanıcının `UserBadge` kayıtları (`earnedAt` dahil) ve `user.points`, `user.level`, `_count.feedbacks`, `_count.quests` okunuyor; `route.ts:276` yalnız kazanılanları filtreliyor (tarihleriyle), `route.ts:286-291` `userProgress` + `userPoints` yanıta konuyor.
- `proxy.ts:105-119`: `/api/*` yolları `withAuth`'a hiç girmiyor, yalnız güvenlik/CORS başlıkları ekleniyor → oturumsuz istek route'a ulaşıyor.
- Hedef keşfi: `app/api/customer/character-leaderboard/route.ts:40` (`requireAuth(['CUSTOMER'])`) ve `:75` herhangi bir müşteriye ilk 20 kullanıcının `userId`'sini veriyor; müşteri kaydı açık olduğu için engel değil.
- **Yeniden üretim:** (1) Herhangi bir müşteri hesabıyla `GET /api/customer/character-leaderboard` → `leaderboard[].userId` al. (2) Çerezsiz `curl 'https://<host>/api/gamification/badges?userId=<cuid>'` → yanıtta `userPoints` (bakiye), `userProgress.feedbackCount/questsCompleted/level` ve kazanılmış rozetlerin `earnedAt` zaman damgaları döner.
- Not: admin kullanımı (`app/admin/users/users-client.tsx:393`) bu açığa bağımlı; düzeltmede ayrı `ADMIN` korumalı uca taşınmalı. Müşteri ucu `userId` parametresini tamamen yok saymalı ve oturum yoksa 401 dönmeli.

### 2. Sürpriz politikasının API'den delinmesi (katalog + puanla satın alma) — **DOĞRULANDI, ancak şiddet abartılı (Düşük/Orta)**

- Doğru olan kısım: `route.ts:273-277` oturumsuz/`userId`'siz çağrıda `hiddenUntilEarned=false` tüm aktif, karakter-dışı rozetleri `pointCost` ile döndürüyor; `app/api/gamification/badges/[id]/unlock/route.ts:35-46` yalnız `pointCost<=0` ve `hiddenUntilEarned` reddediyor. Seed `pointCost`'u `lib/badge-catalog.ts`'ten dolduruyor (`prisma/seed.ts:205`) ve şemada `hiddenUntilEarned @default(false)` (`prisma/schema.prisma:620`). Önceden satın alınan rozet davranışla kazanılınca `createMany(skipDuplicates)` `count=0` döner ve ödül verilmez (`lib/activity-badges.ts:250-256`, `lib/badge-reward-points.ts:52`).
- Neden "Kritik/Yüksek" değil: satın alma yalnız **kendi** oturumuyla (`unlock/route.ts:21` CUSTOMER zorunlu), kendi bakiyesinden atomik `debitPoints` ile yapılıyor; puan basılmıyor, başka kullanıcı veya ekonomi etkilenmiyor. "Ödülün yanması" kullanıcının elle API çağırarak kendine verdiği bir zarar; arayüzde bu yol yok (istemci yalnız kazanılan rozetleri alıyor). Katalog sızıntısı da gizli veri değil, yalnız ürün sürpriz politikasıyla çelişiyor. Canlı DB'deki `hiddenUntilEarned` dağılımı doğrulanmadı.
- **Daha ciddi, ilişkili ve bulguda kaçırılmış bir yol tespit edildi:** `app/api/gamification/progress/route.ts` `POST` (yaklaşık satır 150-230) `requireAuth(['CUSTOMER','ADMIN'])` sonrası istemciden gelen herhangi bir `badgeId`'yi, yalnız `hiddenUntilEarned` ve "zaten var" kontrolüyle, **hiçbir koşul doğrulaması yapmadan** veriyor ve `requirement.value || 100` kadar puan + XP **basıyor** (`creditPointsAndXp`). Yani müşteri, katalogdaki gizli olmayan her rozet için `POST /api/gamification/progress {badgeId}` ile bedava puan basabilir; bu ayrıca davranışsal ödülü (`badgeRewardPoints`) de kalıcı olarak düşürür. Bu, [[points-economy-invariants]] (yalnız sunucu-tarafı hak edişte puan) ihlalidir ve ayrı bir YÜKSEK/KRİTİK bulgu olarak ele alınmalı: uç kaldırılmalı ya da yalnız ADMIN'e kısıtlanmalı; rozet ataması yalnız sunucu içi motorlardan (`activity-badges`, `surprise-badges`, `character-badges`) yapılmalı. Canlı DB'de `hiddenUntilEarned=false` olan rozet sayısı bu riskin boyutunu belirler (doğrulanmadı).

### 3. Gösterilen puan yanlış alandan (`requirement.value`) — **DOĞRULANDI** (gerçek tutarsızlık; şiddet Orta, güvenlik değil)

- `route.ts:189,239` `points: targetValue` (= `requirement.value`). İstemci bunu kartlarda, modal ödülünde ve hero "Toplam Puan"da kullanıyor (`app/customer/badges/badges-client.tsx:197` toplam, `:298`, `:492`, `:638`, `:828`, `:857`).
- Gerçek ödül `lib/badge-reward-points.ts:25-31` → `lib/emoji-badge-texts.ts` (`badge-yeni-ses` = 200, `badge-yorum-makinesi` = 4000). Seed'deki `requirement.value` ise eşik sayısı: `badge-yeni-ses` = 1, `badge-yorum-makinesi` = 25 (`prisma/seed.ts:105,107`).
- **Yeniden üretim:** İlk yorumunu yapıp `badge-yeni-ses` kazanan müşteriye hesabına 200 puan yatar (`activity-badges` → `creditBadgeRewardInTx`), ama `/customer/badges` kartında ve modalda "+1 puan", hero'da "Toplam Puan: 1" görür.
- Ek not: tutarsızlık üç kaynaklı — görüntü `requirement.value`, davranışsal motor `badgeRewardPoints`, `POST /api/gamification/progress` ise yine `requirement.value || 100` kredileyor. Tek doğruluk kaynağı `badgeRewardPoints` olmalı; API `rewardPoints` alanı döndürmeli, hero toplamı `points_credited` (category `badge`) kayıtlarından hesaplanmalı. Admin panelinin `requirement`'ı değiştirmiş olması ihtimali canlı DB'de doğrulanmadı, ama seed değerleriyle tutarsızlık kesin.
