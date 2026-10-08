# /admin/quests

**Amaç:** Platform operatörünün oyunlaştırma görevlerini (Quest) ve "başarım" görevlerini oluşturması, düzenlemesi, silmesi ve varsayılan setleri tohumlaması. Müşteri tarafında `/customer/quests` ve haftalık görev kartı (`/api/customer/weekly-card`) bu tanımlardan beslenir.

**Genel puan:** 3.2 / 10 · **Karar:** yeniden inşa

Kısaca: Sayfa görünürde düzgün bir CRUD ekranı. Ama form klavyeyle doldurulamıyor (her tuşta odak kayboluyor). Tür ya da bitiş tarihi seçilince oluşturma isteği 500 dönüyor. Pasife alınan görev listeden kalıcı olarak kayboluyor. Silme işlemi onay istemiyor. Sayfanın tanımladığı üç mekanikten ikisi ("Manuel" ve varsayılan `give_feedback`) hiçbir yerde ilerletilmiyor. Otomatik tamamlanan görevler ise `/claim` üzerinden **ikinci kez ödüllendirilebiliyor**. Sorun yalnızca sayfada değil, sayfanın yönettiği görev motorunun kendisinde.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | Oluşturma formu odak kaybı, tür/tarih uyumsuzluğu ve sunucu doğrulamasıyla fiilen kırık. Pasif görevler görünmüyor. Mekaniklerin çoğu hiçbir motora bağlı değil. |
| UX | 3/10 | Onaysız silme, yalnızca hover ile görünen aksiyonlar, hata/boş/filtre durumlarının birbirine karışması. Admin, oluşturduğu görevin gerçekten çalışıp çalışmayacağını öğrenemiyor. |
| Görsel | 5/10 | Ortak hero ve glass kart dili tutarlı. Ancak kartta görevin kendi ikonu yerine sabit `Target` var, ilerleme çubuğu hep 0 ve tip rozeti büyük harfli tiplerde boş kalıyor. |
| Mimari | 3/10 | Form bileşeni render içinde tanımlanmış. Fetch/aksiyon kodu kopyalanmış. PATCH doğrulamasız, POST zod şeması formla uyumsuz, `requirement`/`reward` tipsiz Json. Claim-once bilgisi AuditLog'a gömülü. |
| Performans | 6/10 | Tek GET (`take: 200`), `_count` ile N+1 yok, stagger 10 öğeyle sınırlı. Tek eksik: sayfalama ve SWR/önbellek yok. |
| Erişilebilirlik + Mobil | 3/10 | Aksiyonlar `opacity-0 group-hover`: dokunmatik ve klavye kullanıcısı göremiyor ama görünmez butona dokunabiliyor (onaysız silme). Label–input bağı yok, ikon butonlarında `aria-label` yok, üst aksiyon çubuğu sarmıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa hero'su (başlık, açıklama, ikon) | ÇALIŞIYOR | app/admin/quests/page.tsx:373-377; components/admin/admin-premium-hero.tsx:150-195 | Ortak bileşen; reduced-motion destekli. Açıklamada "Gamification" İngilizce kalmış. |
| 2 | Görev listesini yükleme (GET) | KISMİ | page.tsx:100-114; app/api/gamification/quests/route.ts:28-31 | API yalnızca `isActive: true` döndürüyor. Admin pasif görevleri hiç göremiyor. |
| 3 | Yükleniyor iskeleti (6 kart) | ÇALIŞIYOR | page.tsx:429-442 | `animate-pulse`. |
| 4 | Boş durum | KISMİ | page.tsx:443-449 | "Görev bulunamadı" hem "hiç görev yok", hem "arama sonuç vermedi", hem de "API hata verdi" için gösteriliyor. CTA yok. |
| 5 | Hata durumu | KISMİ | page.tsx:106-111 | Ağ hatasında toast çıkıyor. `success:false` (ör. modül kapalıyken 403) **sessizce** boş liste gibi görünüyor. |
| 6 | Arama (görev adı) | ÇALIŞIYOR | page.tsx:260-262, 381-389 | Yalnızca ad üzerinde, istemci tarafında arıyor. Açıklama/tip/mekanik aranmıyor. `aria-label` yok. |
| 7 | "Varsayılan Görevleri Ekle" | KISMİ | page.tsx:212-226; app/api/admin/bootstrap/route.ts:72-97, 148-181 | Toast metinleri bozuk ("G?revler", "varsay?lan"). Eklenen 3 görev `give_feedback` tipinde ve bunu ilerleten kod yok. 3+ aktif görev varsa "0 … hazırlandı" diyor. Audit kaydı yok. |
| 8 | "✨ Başarımları Ekle" | KISMİ | page.tsx:394-407; lib/achievements.ts:7-70 | `upsert.update` admin'in yaptığı ad/açıklama/ödül değişikliklerini **ezer**. Tip `'SPECIAL'` büyük harf olduğu için kart rozeti boş kalıyor. Audit kaydı yok. Butonda emoji var. |
| 9 | "Yeni Görev" diyaloğunu açma | ÇALIŞIYOR | page.tsx:408-424 | |
| 10 | Form: Görev Adı | BOZUK | page.tsx:264, 268-272, 422, 550 | `QuestForm` render içinde tanımlanmış bileşen. Her tuşta yeniden mount oluyor ve **odak kayboluyor**. Max 50 karakter sınırı (validations.ts:164) formda yok. |
| 11 | Form: Açıklama | BOZUK | page.tsx:274-281 | Aynı odak kaybı. Zorunlu (validations.ts:165) ama işaretlenmemiş. Boş bırakılırsa jenerik 500 dönüyor. |
| 12 | Form: Tür (Radix Select) | BOZUK | page.tsx:285-298, 85; lib/validations.ts:167 | Seçenek değerleri `DAILY/WEEKLY/MONTHLY/SPECIAL`, state varsayılanı `'daily'` (hiçbir seçenekle eşleşmiyor, tetikleyici boş görünüyor), zod enum'u `daily/weekly/special`. Admin türü değiştirdiği an POST 500 dönüyor. "Aylık" hiçbir yerde desteklenmiyor. |
| 13 | Form: Hedef (count) | KISMİ | page.tsx:300-308 | Odak kaybından etkileniyor. `parseInt \|\| 1`, ondalık/negatif değer sessizce 1'e dönüyor. |
| 14 | Form: Mekanik (native `<select>`) | KISMİ | page.tsx:311-321 | "Manuel (elle ilerletilir)" seçeneği için bu sayfada da başka yerde de manuel ilerletme arayüzü/API'si yok (yalnızca lib/achievements.ts ve lib/visit-missions.ts UserQuest yazıyor). Radix Select ile tutarsız bir native select. |
| 15 | Form: Kategori (visit_category) | KISMİ | page.tsx:322-331; lib/visit-missions.ts:66, 72; prisma/schema.prisma:99 | Serbest metin. `User.businessCategory` ile birebir eşleşme gerekiyor, bir yazım hatası görevi **sessizce hiç tamamlanamaz** hâle getiriyor. Seçenek listesi yok. |
| 16 | Form: Ödül (Puan) | KISMİ | page.tsx:333-341, 130, 170 | XP her zaman `floor(points/2)` olarak zorlanıyor, XP alanı yok. Üst sınır, points-matrix bağlamı ve ekonomi uyarısı yok. |
| 17 | Form: Bitiş Tarihi | BOZUK | page.tsx:342-349, 131; lib/validations.ts:178 | `z.date()` string kabul etmiyor. Tarih girilen her oluşturma 500 dönüyor. Düzenlemede `new Date('YYYY-MM-DD')` UTC gece yarısına çevriliyor, görev TR saatiyle o günün 03:00'ünde bitiyor (route.ts [id]:66; page.tsx:253). |
| 18 | Form: Aktif switch (oluşturmada) | SAHTE | page.tsx:351-357; route.ts:131 | POST `isActive: true` sabit yazıyor, şemada alan yok. Switch'in oluşturmada hiçbir etkisi yok. |
| 19 | Form: İkon | EKSİK | page.tsx:84, 121 | `icon` state'te `'🎯'` olarak sabit. Seçim alanı yok, kartta da gösterilmiyor (page.tsx:464-466 sabit `Target`). |
| 20 | Form: İptal | ÇALIŞIYOR | page.tsx:359-365 | |
| 21 | Form: Oluştur | KISMİ | page.tsx:116-152, 366; route.ts:119-120, 151-157 | Gönderim sırasında buton kilitlenmiyor (çift tık ile kopya görev oluşur). İstemci tarafında doğrulama yok. `ZodError` 500 ve "Görev oluşturulamadı" ile maskeleniyor. |
| 22 | Kart: başlık + tip rozeti | KISMİ | page.tsx:467-471, 59-71 | `typeLabels` yalnızca küçük harf anahtar içeriyor. `SPECIAL`/`WEEKLY` tipli görevlerde rozet boş ve renksiz çıkıyor. |
| 23 | Kart: aktif/pasif ikonu | SAHTE (ölü dal) | page.tsx:474-478; route.ts:29 | API pasif görev döndürmediği için `XCircle` dalı hiç render edilmiyor. İkonun metin/aria karşılığı da yok. |
| 24 | Kart: açıklama | ÇALIŞIYOR | page.tsx:482-484 | `line-clamp-2`. |
| 25 | Kart: ilerleme çubuğu | SAHTE | page.tsx:492 | `value={0}` sabit. Admin bağlamında anlamsız; tamamlanma oranı gibi gerçek bir metrik gösterilmeli. |
| 26 | Kart: hedef sayısı | ÇALIŞIYOR | page.tsx:488-491 | Mekanik (manuel/ziyaret/kategori) kartta görünmüyor. |
| 27 | Kart: ödül puanı | ÇALIŞIYOR | page.tsx:497-500 | XP gösterilmiyor. |
| 28 | Kart: katılımcı sayısı | KISMİ | page.tsx:501-503; route.ts:31-33 | `_count.users` yalnızca UserQuest satırı (başlayan) sayısı. Tamamlayan/ödül alan/terk eden sayıları yok. |
| 29 | Kart: bitiş tarihi | KISMİ | page.tsx:507-512 | Süresi dolmuş görev ayrıca işaretlenmiyor. Müşteri tarafı da süresi dolmuş görevleri listeliyor (route.ts:28-31'de `expiresAt` filtresi yok). |
| 30 | Kart: Düzenle | KISMİ | page.tsx:243-258, 154-193 | Aksiyonlar yalnızca hover'da görünür. Kaydetme XP'yi `points/2`'ye **ezer** (seed başarımlarda XP = 2×puan, page.tsx:170 / achievements.ts:16). `give_feedback` gibi bilinmeyen mekanikleri `'custom'`a çevirir (page.tsx:254, 164). Sunucu hata mesajı gösterilmez (page.tsx:188). |
| 31 | Edit: Aktif switch | BOZUK | page.tsx:172; route.ts:29 | Pasife alınan görev listeden kaybolur. **UI'dan yeniden aktifleştirilemez.** |
| 32 | Kart: Sil | BOZUK (riskli) | page.tsx:195-210, 525-532; [id]/route.ts:111; schema.prisma:673 | Onay yok, geri alma yok. Kalıcı silme UserQuest'leri cascade ile siler (kullanıcı ilerlemesi ve alınmamış ödüller yok olur). Mobilde görünmez ama dokunulabilir buton. |
| 33 | Kart giriş animasyonu (stagger) | ÇALIŞIYOR | page.tsx:453-458; components/providers.tsx:232 | `MotionConfig reducedMotion="user"` ile azaltılmış hareket destekleniyor, gecikme 10 öğeyle sınırlı. |
| 34 | Sayfa yetkisi | ÇALIŞIYOR | proxy.ts:50-89 | Rol kontrolü ve admin gizli kapı cookie'si var. |
| 35 | API yetkisi (POST/PATCH/DELETE) | KISMİ | route.ts:114; [id]/route.ts:44, 99; proxy.ts:106-120 | Yalnızca rol kontrolü var. Gizli kapı API'lerde uygulanmıyor (sistem geneli bir tasarım, yalnızca bu sayfaya özgü değil). |
| 36 | Modül kapısı etkileşimi | BOZUK | route.ts:16-17, 109-110; lib/module-gate.ts:93-124 | `quests` modülü kapalıyken admin GET/POST 403 alır: liste sessizce boş görünür, oluşturma "modül kapalı" hatası verir. PATCH/DELETE ise kapıdan geçmiyor (tutarsız). |
| 37 | Toast metinleri | KISMİ | lib/admin-toast.ts:17-19; page.tsx:220-224 | "Basarili:" / "Dikkat:" önekleri Türkçe karaktersiz. Bootstrap mesajlarında mojibake var. |
| 38 | Aksiyon çubuğu mobil yerleşim | KISMİ (doğrulanmadı) | page.tsx:380, 390 | `flex gap-2` sarmıyor. Üç buton ~400px'te sığmayabilir; layout `overflow-x-hidden` olduğu için kırpılır. Görsel olarak doğrulanmadı. |
| 39 | Filtre (tip/durum/mekanik) | EKSİK | — | |
| 40 | Sıralama / sayfalama | EKSİK | route.ts:45-46 | Sabit `createdAt desc`, `take: 200`. |
| 41 | Görev performans analitiği (başlama → tamamlama → claim hunisi) | EKSİK | — | |
| 42 | Görev değişiklik geçmişi (audit görünümü) | EKSİK | route.ts:136-145 | Audit yazılıyor ama sayfada gösterilmiyor. |
| 43 | Manuel ilerletme / kullanıcıya görev atama | EKSİK | page.tsx:318 | "Manuel" mekaniğinin karşılığı yok. |

**Özet:** 43 özellik · ÇALIŞIYOR 10 · KISMİ 17 · BOZUK 7 · SAHTE 3 · EKSİK 6 (bölünmüş durumlar ağır olanına göre sayıldı; 32 BOZUK, 23 SAHTE).

---

## Bulgular

### 1. KRİTİK · Ekonomi/Veri bütünlüğü: Otomatik tamamlanan görevler `/claim` ile ikinci kez ödüllendiriliyor

- **Kanıt:**
  - lib/visit-missions.ts:110-128: `visit_category` tamamlanınca puan ve XP otomatik kredileniyor; `CLAIM_QUEST_REWARD` audit kaydı yazılmıyor.
  - lib/achievements.ts:114-173: başarım tamamlanınca otomatik kredi; audit action `'COMPLETED_ACHIEVEMENT'`.
  - app/api/gamification/quests/[id]/claim/route.ts:73-101: claim-once kontrolü **yalnızca** `action: 'CLAIM_QUEST_REWARD'` audit kaydına bakıyor. `completedAt` dolu olan görevi "tamamlanmış ama alınmamış" sayıp yeniden krediliyor.
  - app/api/gamification/quests/route.ts:61-89: GET `claimed=false` döndürüyor.
  - app/customer/quests/page.tsx:674-690: müşteriye "Ödülü Al" butonu gösteriliyor.
- **Sorun:** Bu sayfadan oluşturulan "Ziyaret (otomatik)" görevleri ile "Başarımları Ekle" ile tohumlanan görevler tamamlandığında ödül iki kez veriliyor: biri otomatik, biri müşteri butona basınca. Bu, MEMORY'deki "atomik tek seferlik kredi" ekonomi değişmezini ihlal ediyor. Sıradan bir müşteri, UI'ın kendisi yönlendirdiği için tetikleyebilir.
- **Öneri:** Kredilendirmenin tek kaynağı tek bir "görev ödül defteri" olmalı. `UserQuest`'e `rewardedAt DateTime?` (veya `claimedAt`) kolonu eklenmeli, tüm yollar `updateMany({ where: { id, rewardedAt: null } })` guard'ı ile atomik olarak tek kez kredi vermeli. Otomatik kredi veren mekanikler `rewardedAt`'i doldurmalı. Claim route `rewardedAt` doluysa reddetmeli, GET `claimed = !!rewardedAt` dönmeli. Geçmiş veri için `points_credited` olaylarından (category: quest/achievement) backfill yapılmalı. Kısa vadeli yama: claim route'ta `COMPLETED_ACHIEVEMENT` kaydını ve visit görevlerini (requirement.type) "zaten ödüllendirildi" saymak.
- **Efor:** M

### 2. KRİTİK · Bozuk işlev/UX: Form, her tuşta odağı kaybediyor

- **Kanıt:** page.tsx:264 `const QuestForm = ({…}) => (…)` bileşen gövdesi içinde tanımlanmış. page.tsx:422, 550'de `<QuestForm …/>` olarak kullanılıyor. Her `setFormData` (page.tsx:270, 277, 305, 326, 339, 347) üst bileşeni yeniden render ediyor ve yeni bir bileşen kimliği üretiyor; React alt ağacı unmount/mount ediyor.
- **Sorun:** Görev Adı, Açıklama, Hedef, Kategori ve Ödül alanlarında her karakterden sonra odak kayboluyor. Form ancak her harften sonra yeniden tıklayarak doldurulabiliyor. Ekranın asıl işi olan "görev oluşturmak" fiilen kullanılamaz durumda.
- **Öneri:** Form ayrı bir modül-seviyesi bileşene (`components/admin/quests/quest-form.tsx`) taşınmalı, `react-hook-form` + paylaşılan zod şeması (`questDefinitionSchema`) ile kontrollü hâle getirilmeli. Create ve edit aynı bileşeni `defaultValues` ile kullanmalı.
- **Efor:** S

### 3. KRİTİK · Bozuk işlev: Tür ve bitiş tarihi seçildiğinde oluşturma 500 dönüyor

- **Kanıt:**
  - page.tsx:293-296: seçenek değerleri `DAILY/WEEKLY/MONTHLY/SPECIAL`.
  - page.tsx:85: varsayılan `'daily'`.
  - lib/validations.ts:167: `z.enum(['daily','weekly','special'])`.
  - lib/validations.ts:178: `z.date()`, oysa form `'YYYY-MM-DD'` string gönderiyor (page.tsx:131).
  - route.ts:120, 151-157: `ZodError` yakalanmıyor; 500 ve jenerik "Görev oluşturulamadı".
- **Sorun:** Admin türü seçtiği an (herhangi biri) ya da bir bitiş tarihi girdiği an görev oluşturulamıyor ve nedeni söylenmiyor. Tür seçicisi açılışta boş görünüyor (`'daily'` hiçbir SelectItem ile eşleşmiyor). Formdaki "Aylık" seçeneğinin sistemde hiçbir karşılığı yok.
- **Öneri:** Tek bir `QUEST_CADENCES` sabiti (`daily | weekly | special`; "aylık" gerçekten desteklenecekse motoruyla birlikte eklenmeli) hem UI'da hem zod'da kullanılmalı. `expiresAt: z.coerce.date()` olmalı ve gün sonuna (Europe/Istanbul 23:59:59) normalize edilmeli. API `ZodError`'u 400 + alan bazlı `issues` ile dönmeli, form bunları alan altında göstermeli. Mevcut kayıtlar için tipler küçük harfe normalize edilmeli (`SPECIAL` → `special`, achievements.ts:14, 23, 32, 41).
- **Efor:** S

### 4. YÜKSEK · Ürün/mantık: İki mekanik hiçbir motora bağlı değil, görevler tamamlanamıyor

- **Kanıt:**
  - page.tsx:318: "Manuel (elle ilerletilir)".
  - bootstrap/route.ts:78, 86, 94 ve lib/growth-playbooks.ts:108: `requirement.type: 'give_feedback'`.
  - `UserQuest` ilerlemesini yazan yalnızca iki yer var: lib/achievements.ts:92-122 (sabit 4 ID) ve lib/visit-missions.ts:90-113. Repoda `give_feedback` veya `custom` için ilerletme kodu yok (grep ile doğrulandı).
- **Sorun:** "Varsayılan Görevleri Ekle" ve Playbook'tan oluşturulan görevler, ayrıca "Manuel" seçilen her görev müşteriye gösteriliyor (customer/quests GET) ama asla ilerlemiyor. Müşteri ölü görev görüyor, admin ise sorunu anlayacak hiçbir sinyal görmüyor. Ayrıca `daily`/`weekly` yalnızca etiket: `@@unique([userId, questId])` (schema.prisma:675) ve sıfırlama cron'u olmadığı için "günlük" görev ömür boyu bir kez tamamlanabiliyor.
- **Öneri:** Görev mekanikleri için kod tarafında bir **mekanik kayıt defteri** (`lib/quests/mechanics.ts`) tanımlanmalı: her mekanik için `key`, etiket, parametre şeması (zod), ilerletme kancası (feedback-create, consumption-create, shop-purchase…) ve "canlı/deneysel" bayrağı. Admin formu yalnızca motoru olan mekanikleri seçtirmeli. Tekrarlayan görevler için `UserQuest`'e `periodKey` (ör. `2026-W41`) eklenmeli ve unique `(userId, questId, periodKey)` yapılmalı; `daily`/`weekly` gerçek anlam kazanmalı. Motoru olmayan aktif görevler için sayfada uyarı rozeti ("Bu mekaniği ilerleten bir olay yok") gösterilmeli.
- **Efor:** L

### 5. YÜKSEK · Bozuk işlev: Pasife alınan görev listeden kaybolur ve geri getirilemez

- **Kanıt:** route.ts:29 `where: { isActive: true }` (admin ve müşteri aynı uç). page.tsx:172 edit'te `isActive` gönderiliyor. page.tsx:474-478'deki pasif dalı ölü.
- **Sorun:** Admin bir görevi duraklattığında onu bir daha göremiyor. Tek çıkış DB'ye elle müdahale. Bu yüzden admin pasifleştirme yerine silmeye yöneliyor, o da kullanıcı verisini yok ediyor (bkz. bulgu 6).
- **Öneri:** Ayrı bir admin uç noktası açılmalı: `GET /api/admin/quests?status=active|paused|expired|all&type=&mechanic=&q=&cursor=`, `requireAuth(['ADMIN'])` ile korunmalı ve modül kapısından bağımsız olmalı. Kartlara durum segmentleri (Aktif / Duraklatıldı / Süresi doldu / Taslak) ve satır içi hızlı aktif/pasif toggle'ı eklenmeli. Müşteri GET'i ayrıca `expiresAt > now` filtresi almalı.
- **Efor:** M

### 6. YÜKSEK · Veri bütünlüğü/UX: Onaysız kalıcı silme, cascade ile kullanıcı ilerlemesini yok ediyor

- **Kanıt:** page.tsx:525-532 (onay yok). page.tsx:515 aksiyonlar `opacity-0 group-hover:opacity-100`. [id]/route.ts:111 `prisma.quest.delete`. schema.prisma:673 `onDelete: Cascade`.
- **Sorun:** Tek tık ile görev ve tüm `UserQuest` kayıtları siliniyor; tamamlanmış ama ödülü alınmamış kullanıcı hakları da gidiyor. Mobilde buton görünmez ama dokunulabilir; kart üzerinde kaydırırken yanlışlıkla silme mümkün.
- **Öneri:** Silme yerine **arşivleme** varsayılan olmalı (`archivedAt` kolonu ya da `status` enum'u). Kalıcı silme yalnızca katılımcısı 0 olan görevlerde, adı yazılarak onaylanan bir AlertDialog ile yapılmalı ve etkiyi göstermeli ("37 kullanıcının ilerlemesi silinecek"). Aksiyonlar her zaman görünür bir `DropdownMenu` (⋯) içine alınmalı.
- **Efor:** M

### 7. YÜKSEK · Güvenlik (IDOR/bilgi sızıntısı): `GET /api/gamification/quests?userId=<id>` kimlik doğrulamasız başka kullanıcının görev ilerlemesini döndürüyor

- **Kanıt:** route.ts:19-21: `userIdParam` `'me'` değilse **doğrudan** kullanılıyor; oturum ve sahiplik kontrolü yok. route.ts:34-43, 61-91: ilerleme, `completedAt`, claim durumu ve `userQuestId` dönüyor.
- **Sorun:** Bir kullanıcı ID'si bilinen herkes (girişsiz dahil) o kişinin hangi görevlerde ne kadar ilerlediğini, ziyaret görevleri üzerinden de dolaylı olarak işletme ziyaret davranışını görebiliyor. Bu, KVKK açısından davranışsal veri sızıntısı. Admin sayfası bu parametreyi kullanmıyor ama aynı ucu paylaşıyor.
- **Öneri:** Yalnızca `userId=me` kabul edilmeli; başka bir ID verilirse `ADMIN` rolü zorunlu olmalı (ve admin'e özel uca taşınmalı). Admin ile müşteri uçları ayrılmalı: müşteri `/api/customer/quests`, admin `/api/admin/quests`.
- **Efor:** S

### 8. YÜKSEK · Veri bütünlüğü: Düzenleme, görevin gizli alanlarını sessizce ezer

- **Kanıt:**
  - page.tsx:170: `xp: Math.floor(points/2)`, oysa seed başarımlarda XP = 2×puan (achievements.ts:16, 25).
  - page.tsx:254, 164: `requirement.type` `visit_category` değilse `'custom'` yazılıyor; `give_feedback` kayboluyor.
  - [id]/route.ts:57-68: PATCH doğrulamasız ve tam üzerine yazıyor; `isActive ?? true` ve `expiresAt` verilmezse `null`.
  - lib/achievements.ts:50-57: "Başarımları Ekle" tekrar basılınca admin'in yaptığı düzenlemeleri geri alıyor.
- **Sorun:** Admin yalnızca açıklamadaki bir yazım hatasını düzeltse bile görevin XP ödülü ve mekaniği değişiyor. PATCH'e kısmi gövde gelirse bitiş tarihi siliniyor ve görev aktifleşiyor. İki admin aynı anda düzenlerse son yazan kazanıyor.
- **Öneri:** PATCH `createQuestSchema.partial()` ile doğrulanmalı ve yalnızca gönderilen alanları güncellemeli. Formda XP ayrı bir alan olmalı (points-matrix varsayılanından türeyen bir öneri olarak). Bilinmeyen mekanikler salt okunur gösterilmeli. İyimser eşzamanlılık için `updatedAt` gönderilmeli; uyuşmazlıkta 409 dönmeli. Seed işlemi `update: {}` (yalnızca eksik olanı oluştur) olmalı.
- **Efor:** M

### 9. ORTA · Hata yönetimi: Modül kapalıyken admin ekranı sessizce boş

- **Kanıt:** route.ts:16-17, 109-110. page.tsx:106-108: `success:false` dalı hiçbir şey yapmıyor. PATCH/DELETE'te kapı yok ([id]/route.ts:37-48).
- **Sorun:** `quests` modülü kapatıldığında admin "Görev bulunamadı" görüyor, verinin kaybolduğunu sanabilir. Öte yandan PATCH/DELETE çalışmaya devam ediyor; bu tutarsız.
- **Öneri:** Admin uç noktası modül kapısından muaf olmalı. Sayfada "Görevler modülü şu an müşterilere kapalı — Modüller'den aç" bilgilendirme bandı gösterilmeli. Bu durum `/api/admin/modules/overview` verisinden okunabilir.
- **Efor:** S

### 10. ORTA · UX/Doğruluk: Sahte ilerleme çubuğu ve yanlış etiketli metrikler

- **Kanıt:** page.tsx:492 `Progress value={0}`. page.tsx:501-503 "katılımcı" aslında yalnızca UserQuest satır sayısı.
- **Sorun:** Admin bağlamında her kartta boş bir ilerleme çubuğu görmek bilgi değeri taşımıyor ve "kimse ilerlemiyor" algısı yaratıyor. Görevin gerçekten işe yarayıp yaramadığı (tamamlama oranı, ödül maliyeti) görünmüyor.
- **Öneri:** Admin GET, görev başına `started`, `completed`, `rewarded`, `pointsMinted` toplamlarını tek bir `groupBy` sorgusuyla (UserQuest + points_credited olayları) döndürmeli. Kartta "başladı → tamamladı" mini hunisi ve "toplam basılan puan" gösterilmeli. Progress çubuğu tamamlama oranını göstermeli.
- **Efor:** M

### 11. ORTA · Mantık/i18n: Bitiş tarihi UTC gece yarısı olarak kaydediliyor

- **Kanıt:** [id]/route.ts:66 `new Date(body.expiresAt)` ('YYYY-MM-DD' → 00:00 UTC). page.tsx:253 `toISOString().split('T')[0]`.
- **Sorun:** "Bitiş: 10.10.2026" görünen görev TR saatiyle 10 Ekim 03:00'te bitiyor, oysa admin günün sonunu kastediyor. Müşteri o gün claim edemiyor (claim/route.ts:57).
- **Öneri:** Tarih + saat seçicisi kullanılmalı (varsayılan 23:59 Europe/Istanbul) ve sunucuda açık saat dilimiyle normalize edilmeli. Görev kartı "x gün kaldı / süresi doldu" durumunu göstermeli.
- **Efor:** S

### 12. ORTA · Erişilebilirlik/Mobil: Hover'a bağlı aksiyonlar, etiketsiz kontroller

- **Kanıt:**
  - page.tsx:515: `opacity-0 group-hover:opacity-100`; `group-focus-within` yok.
  - page.tsx:525-532: yalnızca ikon içeren sil butonu, `aria-label` yok.
  - page.tsx:267-357: `<Label>`'ların `htmlFor`'u, input'ların `id`'si yok.
  - page.tsx:383-388: arama input'u yalnızca placeholder ile etiketlenmiş.
  - page.tsx:474-478: durum yalnızca renk/ikonla anlatılıyor.
  - page.tsx:390: aksiyon çubuğu `flex-wrap` içermiyor.
- **Sorun:** Klavye kullanıcısı Tab ile görünmez butonlara geliyor. Ekran okuyucu form alanlarının adını duyurmuyor. Dokunmatik kullanıcı Düzenle/Sil butonlarını göremiyor. Dar ekranda üç aksiyon butonu taşıyor (görsel olarak doğrulanmadı).
- **Öneri:** Aksiyonlar her zaman görünür ⋯ menüsüne alınmalı. Form `react-hook-form` + shadcn `Form`/`FormField` ile kurulmalı (otomatik id/aria-describedby). Durum metin rozetiyle verilmeli ("Aktif"/"Duraklatıldı"). İkincil aksiyonlar ("Varsayılanları ekle", "Başarımları ekle") tek bir "Şablondan ekle" menüsünde toplanmalı.
- **Efor:** S

### 13. ORTA · Güvenilirlik: Çift gönderim ve yarış koşulları

- **Kanıt:** page.tsx:116-152, 366: buton `disabled` değil, submitting state'i yok. page.tsx:391, 394: bootstrap butonları da kilitlenmiyor. bootstrap/route.ts:160-162: `findFirst` → `create` yarışa açık. lib/achievements.ts:92-122: `upsert` → oku → `update` atomik değil; aynı anda iki çağrı iki kez kredileyebilir (bu sayfanın dışında ama sayfanın tohumladığı görevleri etkiliyor; kod okunarak çıkarıldı, test edilmedi).
- **Öneri:** Mutasyonlar `useMutation` benzeri bir kalıpla `isPending` ve buton kilidiyle yapılmalı. Sunucu `Idempotency-Key` başlığını kabul etmeli (`lib/idempotency.ts` zaten var). `advanceAchievementProgress` tamamlama adımı visit-missions'taki `updateMany where completedAt: null` guard'ına çevrilmeli.
- **Efor:** S

### 14. DÜŞÜK · Dil/kalite: Mojibake, ASCII önekler, TR/EN karışımı, emoji

- **Kanıt:** page.tsx:220-224 ("G?revler", "varsay?lan", "haz?rland?"). lib/admin-toast.ts:17-19 ("Basarili", "Dikkat"). page.tsx:375 "Gamification". page.tsx:406 "✨". [id]/route.ts:45, 100 `'Unauthorized'` (diğer uçlar Türkçe "Yetkisiz erişim").
- **Öneri:** Metinler `i18n` anahtarlarına taşınmalı (admin henüz i18n'siz; en azından tek bir `admin-copy.ts`). `admin-toast` önekleri düzeltilmeli ya da kaldırılmalı (sonner zaten ikonla durum belirtiyor). API hata mesajları tek dilde olmalı.
- **Efor:** S

### 15. DÜŞÜK · Denetlenebilirlik: Bootstrap ve seed işlemleri audit izi bırakmıyor

- **Kanıt:** bootstrap/route.ts:128-181: `quests_defaults` ve `seed_achievements` için `auditLog.create` yok. Buna karşılık CRUD işlemleri audit yazıyor (route.ts:136-145).
- **Öneri:** Toplu oluşturmalar da `BULK_CREATE_QUEST` audit kaydı yazmalı. Sayfada görev başına "Geçmiş" çekmecesi (audit diff görünümü) olmalı.
- **Efor:** S

### 16. DÜŞÜK · Güvenlik (sistem geneli): Admin gizli kapısı API katmanında uygulanmıyor

- **Kanıt:** proxy.ts:79-89 kapı yalnızca `/admin` sayfa yollarında. proxy.ts:106-120: `/api/*` için yalnızca güvenlik başlıkları ekleniyor. route.ts:114 ve [id]/route.ts:44, 99 yalnızca rol kontrolü yapıyor.
- **Sorun:** ADMIN rolünü ele geçiren ama gizli cevabı bilmeyen biri görev oluşturup silebiliyor ve ödülleri şişirebiliyor. Bu sayfaya özgü değil; tüm admin mutasyonları için geçerli.
- **Öneri:** `requireAuth(['ADMIN'])` içine (ya da proxy'de mutasyon metotlu `/api/admin/*` ve admin-only uçlara) `gateCookieBelongsTo` kontrolü eklenmeli. Görev mutasyonları bu fırsatla `/api/admin/quests` altına taşınmalı.
- **Efor:** M

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Durum ve yaşam döngüsü yönetimi:** Taslak → Planlı (`startsAt`) → Aktif → Duraklatıldı → Süresi doldu → Arşiv. Linear'daki gibi durum sekmeleri ve sayaçları.
2. **Görev performans analitiği (PostHog tarzı huni):** Görüntülenme → başlama → tamamlama → ödül alma; görev başına basılan puan, ortalama tamamlama süresi, terk oranı. Points-matrix/economy-sim ile bağlantılı "bu görev haftada ~X puan basar" tahmini.
3. **Hedefleme ve deney:** Segment (`/admin/segments`), rol, şehir, işletme kategorisi hedefleme. A/B varyantı (`lib/gamification-ab` zaten var) ile ödül miktarı testi.
4. **Tablo görünümü + filtre/sıralama/toplu işlem:** Retool tarzı yoğun tablo (ad, mekanik, cadence, ödül, başlayan/tamamlayan, bitiş, durum). Çoklu seçimle duraklat/arşivle/kopyala. URL'de kalıcı filtre durumu.
5. **Önizleme ve doğrulama:** Müşterinin göreceği kartın canlı önizlemesi. "Bu mekaniği ilerleten olay yok" ve "kategori hiçbir işletmeyle eşleşmiyor (0 işletme)" gibi yayın öncesi kontroller.
6. **Değişiklik geçmişi ve geri alma:** Stripe'taki gibi her kaydın olay zaman çizelgesi (audit diff), "önceki sürüme dön", silme yerine arşiv ve geri yükleme.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya 5 saniyede yanıt alabilmeli: hangi görevler canlı, hangileri gerçekten tamamlanıyor, bu hafta görevler kaç puan bastı. Yeni görevi, sistemin gerçekten ilerletebileceği bir mekanikten şablonla 1 dakikada, önizlemesini görerek ve ekonomi etkisini bilerek yayınlayabilmeli.

**Yerleşim:**
- **Üst şerit (KPI'lar):** Aktif görev · 7 günde tamamlanan · 7 günde basılan puan (points_credited, category=quest|achievement) · "ölü görev" sayısı (motoru olmayan ya da 14 gündür tamamlanmayan). KPI kartları mevcut admin hero'nun `aside`/`chips` alanına yerleştirilebilir.
- **Araç çubuğu:** Durum segmentleri (Aktif / Planlı / Duraklatıldı / Süresi doldu / Arşiv), mekanik ve cadence filtreleri, arama, sıralama, sağda "Yeni görev" (birincil) ve "Şablondan ekle ▾" (Varsayılanlar, Başarımlar, Playbook).
- **Liste:** Masaüstünde yoğun tablo, mobilde kart. Her satırda durum rozeti, mekanik çipi ("Ziyaret · cafe · 3 işletme"), ödül (puan + XP), huni mini çubuğu (başladı/tamamladı/aldı), bitiş geri sayımı, ⋯ menüsü (Düzenle, Kopyala, Duraklat, Arşivle, Geçmiş).
- **Düzenleyici:** Diyalog yerine sağdan açılan geniş bir Sheet. Solda form adımları (1. Mekanik, 2. Hedef ve parametre, 3. Ödül, ekonomi uyarısıyla, 4. Zamanlama ve hedefleme), sağda müşteri kartının canlı önizlemesi.
- **Detay çekmecesi:** Görev başına huni grafiği, son tamamlayanlar listesi, audit zaman çizelgesi.

**Motion/3D:** Bu bir operasyon aracı, 3D gereksiz. Ölçülü motion yeterli: KPI sayılarında kısa count-up (reduced-motion'da kapalı), satır eklenince ve silinince `layout` geçişi, Sheet'in yay eğrili girişi, önizleme kartında müşteri tarafındaki tamamlama animasyonunun küçük bir tekrarı. Mevcut kart stagger'ı tablo görünümünde kaldırılmalı (yoğun veri ekranında gecikme algısı yaratır).

**Veri/API değişiklikleri:**
1. `prisma/schema.prisma`: `Quest`'e `status` (draft|scheduled|active|paused|archived), `startsAt`, `mechanic` (string kolon; Json'dan çıkarılıp indekslenmeli), `params Json`, `cadence` eklenmeli. `UserQuest`'e `rewardedAt`, `periodKey` eklenmeli; unique `(userId, questId, periodKey)` olmalı.
2. `lib/quests/mechanics.ts`: mekanik kayıt defteri (parametre zod şeması + ilerletme kancası + etiket). `visit-missions` ve `achievements` buraya adaptör olarak bağlanmalı. `give_feedback` için feedback oluşturma yoluna kanca eklenmeli.
3. `lib/quests/reward.ts`: tek atomik ödül fonksiyonu, `updateMany where rewardedAt null` + `creditPointsAndXp` + `points_credited`. Claim route, visit ve achievement yolları yalnızca bunu çağırmalı (bulgu 1'i kökten çözer).
4. Admin uçları `/api/admin/quests` (GET liste + metrikler, POST, PATCH partial + `updatedAt` concurrency, POST `:id/archive`, `:id/duplicate`), `requireAuth(['ADMIN'])` + gate cookie ile korunmalı, modül kapısından muaf olmalı. Müşteri ucu `/api/customer/quests` yalnızca `me`, `status=active`, süresi dolmamış görevleri döndürmeli.
5. Metrikler tek bir `groupBy` ile hesaplanmalı (UserQuest: started/completed/rewarded; AnalyticsEvent: SUM points). Upstash Redis'te 60 sn önbelleklenmeli, mutasyonda invalidate edilmeli.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/playbooks`** (app/admin/playbooks/page.tsx:110, 209-239; app/api/admin/playbooks/apply/route.ts:64-76): Görev oluşturan ikinci bir yol. Doğrulamasız, audit'siz ve ilerlemeyen `give_feedback` görevleri **aktif** olarak yaratıyor (lib/growth-playbooks.ts:103-111). Görev oluşturma tek bir servis (`lib/quests/service.ts`) üzerinden yapılmalı. Playbook ancak **taslak** görev üretmeli ve `/admin/quests?status=draft&highlight=<id>` sayfasına yönlendirmeli.
- **`/admin/points-matrix`** (app/admin/points-matrix/page.tsx:703-714): `quest.default` ödülü orada, görev bazlı ödül burada. Görev formu matris varsayılanını önermeli ve sapmayı göstermeli. Matris sayfası "görev ödülleri toplamı" için bu sayfaya bağlantı vermeli.
- **`/admin/economy-sim`** (app/admin/economy-sim/page.tsx:15-25, 129-130): Görev tamamlama sayısı elle giriliyor. Gerçek görev metrikleri (bu sayfanın yeni API'si) simülasyona girdi olarak beslenmeli.
- **`/admin/badges`** ve "Başarımlar": Başarımlar teknik olarak `Quest` (type `SPECIAL`, sabit ID'ler, lib/achievements.ts) ama kavramsal olarak rozet veya davranışsal ödül. Uzun vadede "Oyunlaştırma" başlığı altında **Görevler** (tekrarlı/zamanlı) ve **Başarımlar** (tek seferlik, olay tetiklemeli) aynı sayfada iki sekme olarak birleştirilmeli; rozet kataloğuyla çapraz bağlantı kurulmalı.
- **Kaldırma önerilmez:** Müşteri tarafındaki `/customer/quests` ve haftalık kart bu verilere bağımlı. Sayfa korunmalı ama yukarıdaki servis ve API katmanıyla birlikte yeniden inşa edilmeli.

---

## Doğrulama (şüpheci inceleme)

Dört KRİTİK/YÜKSEK iddiayı çürütmeye çalıştım. Bunun için çağıran ve çağrılan tarafları, `proxy.ts`'yi, Prisma şemasını ve doğrulama şemasını baştan okudum. Hiçbir şey çalıştırılmadı, kod ve veritabanı değiştirilmedi. Dördü de çürütülemedi.

### 1. Görev ödülü çift kredilendiriliyor: **DOĞRULANDI**
- Otomatik kredi yolları gerçekten çağrılıyor: `app/api/dealer/consumptions/route.ts:366` → `advanceVisitMissions`; `app/api/customer/custom-color/route.ts:31`, `shop/gift/route.ts:146`, `shop/route.ts:134`, `showcase/route.ts:120` → `advanceAchievementProgress`.
- `lib/visit-missions.ts:110-117`, `completedAt` alanını set ediyor ve `creditPointsAndXp` çağırıyor. `CLAIM_QUEST_REWARD` audit kaydı yazmıyor. `lib/achievements.ts:116-135` aynı işi yapıyor ve yalnızca `COMPLETED_ACHIEVEMENT` yazıyor (:163).
- Claim route `app/api/gamification/quests/[id]/claim/route.ts:73` bu durumda `completedAt` dolu olduğu için `isCompleted=true` sayıyor. Ardından :82-94'te yalnızca `CLAIM_QUEST_REWARD` audit kaydını arıyor, bulamıyor ve :97'de ikinci kez `creditPointsAndXp` çağırıyor. Liste ucu da `app/api/gamification/quests/route.ts:61-89` aynı logu aradığı için `claimed=false` dönüyor. `app/customer/quests/page.tsx:291-292, 674-690` tamamlanan kartta "Ödülü Al" butonunu gösteriyor.
- **Yeniden üretim:** Müşteri 3 kozmetik satın alır. `quest-cosmetic-collector` otomatik olarak +75 puan / +150 XP verir. Görevler sayfasında kart "Tamamlandı" altında "Ödülü Al" ile görünür. Tıklanınca +75 puan daha gelir (claim, `getQuestReward` üzerinden ödülü yeniden hesaplar). Tekrar tıklama `QUEST_ALREADY_CLAIMED` döner, yani ödül tam 2 kez verilir. Ziyaret görevlerinde de durum aynı. Ölçek sınırlı (görev başına 1 ekstra), ama kullanıcı tarafından tetiklenebilen ve sistematik bir puan basma. Ekonomi değişmezini (tek seferlik atomik kredi) ihlal ediyor.

### 2. Admin görev formu fiilen kullanılamıyor: **DOĞRULANDI**
- `app/admin/quests/page.tsx:264` `QuestForm`'u render içinde ok fonksiyonu olarak tanımlıyor ve :422 ile :550'de `<QuestForm/>` olarak JSX tipi şeklinde kullanıyor. Her `setFormData` çağrısında yeni bir bileşen tipi oluşuyor. React alt ağacı unmount/remount ediyor ve her tuşta input odağı kayboluyor.
- Tür alanı: `SelectItem` değerleri `DAILY/WEEKLY/MONTHLY/SPECIAL` (:293-296). Buna karşılık `lib/validations.ts:167` `z.enum(['daily','weekly','special'])` bekliyor. Tarih alanı: `type="date"` input'u string gönderiyor (:131, :345-347), ama şema `z.date()` (:178) ve zod 3 string'i coerce etmiyor. Her iki durumda da `createQuestSchema.parse` hata fırlatıyor (`quests/route.ts:120`). Catch bloğu ZodError'u ayırt etmiyor ve 500 + "Görev oluşturulamadı" dönüyor (:151-157).
- **Yeniden üretim:** "Yeni Görev" → Tür'de "Haftalık" seçilir → Oluştur → 500. Ya da tür varsayılan bırakılıp yalnızca bitiş tarihi girilir → 500. Başarılı oluşturma yalnızca varsayılan `daily` ve boş tarih ile mümkün. Ek not: PATCH (`[id]/route.ts:57-68`) hiç doğrulama yapmıyor. Düzenlemede tür değiştirilirse büyük harfli `DAILY` kaydediliyor ve liste rozeti (`typeLabels`/`typeColors`, :59-71) boş görünüyor.

### 3. Kimlik doğrulamasız IDOR (görev ilerlemesi): **DOĞRULANDI** (etki iddiadan biraz dar)
- `proxy.ts:105-117` `/api/*` isteklerini auth middleware'den geçirmiyor. `quests/route.ts:18-21` `userId=me` dışındaki her değeri oturum veya rol kontrolü olmadan kullanıyor ve :34-43, :61-91'de `progress`, `completedAt`, `completed`, `claimed`, `userQuestId` döndürüyor.
- Kullanıcı ID'leri cuid formatında, tahmin edilemiyor. Ama `app/api/leaderboard/route.ts` girişsiz çağrılabiliyor ve sıralamadaki her kullanıcının `id`, `name` ve `image` alanlarını döndürüyor. ID bulmak bu yüzden kolay.
- **Yeniden üretim:** Girişsiz `GET /api/leaderboard` → bir `id` alınır → `GET /api/gamification/quests?userId=<id>` → o kişinin tüm görev ilerlemesi, tamamlanma zamanları ve ödül alma durumu gelir.
- **Etki düzeltmesi:** Hangi işletmelerin ziyaret edildiği sızmıyor. Sızan şey, görev başına benzersiz işletme sayısı (kategori bazlı) ve tamamlanma zaman damgaları. Bu hâlâ kişiye bağlanabilen davranışsal veri (KVKK açısından ihlal). Ama "işletme ziyaret geçmişi sızıyor" ifadesi abartılı.

### 4. Pasif görevin kaybolması ve onaysız cascade silme: **DOĞRULANDI**
- Admin listesi `fetch('/api/gamification/quests')` çağırıyor (`page.tsx:103`). Uç `where: { isActive: true }` ile filtreliyor (`quests/route.ts:29`). Düzenleme dialog'unda Switch kapatılınca (:353-355 → PATCH `isActive:false`) görev listeden kayboluyor. UI'da onu geri getirecek bir yol yok. Claim de :53'te `!quest.isActive` görevleri reddediyor, dolayısıyla tamamlanmış ama ödülü alınmamış haklar donuyor.
- Silme: `page.tsx:525-532` onay istemeden doğrudan DELETE çağırıyor. Buton :515'te `opacity-0 group-hover:opacity-100` içinde. Görünmüyor ama tıklanabilir/dokunulabilir durumda. Dokunmatik cihazda kart üzerindeki o bölgeye dokunmak silmeyi tetikliyor. `[id]/route.ts:111` hard delete yapıyor. `prisma/schema.prisma:673` `onDelete: Cascade` nedeniyle tüm `UserQuest` satırları siliniyor. Sadece `DELETE_QUEST` audit kaydında görevin `oldData`'sı kalıyor, kullanıcı ilerlemeleri geri getirilemiyor.
- **Yeniden üretim:** Mobilde kartın sağ alt köşesine dokunulur → "Görev silindi" mesajı çıkar. O göreve ait ilerleme ve alınmamış ödül hakları kalıcı olarak silinir.
