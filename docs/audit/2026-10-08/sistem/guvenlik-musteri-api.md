# Güvenlik Denetimi — Müşteri Tarafı API (customer / feedbacks / gamification / public / surveys)

- **Tarih:** 2026-10-08
- **Boyut:** `guvenlik-musteri-api`
- **Yöntem:** Salt okunur kod incelemesi. 81 route dosyası envanterlendi (`app/api/customer/**` 65, `app/api/gamification/**` 10, `app/api/feedbacks` 1, `app/api/public/**` 3, `app/api/surveys/**` 1) ve puan/ödül/kimlik ile ilgili olanların tamamı satır satır okundu; destekleyici kütüphaneler (`lib/api-auth.ts`, `lib/rate-limit.ts`, `lib/idempotency.ts`, `lib/points-wallet.ts`, `lib/points-caps.ts`, `lib/achievements.ts`, `lib/visit-missions.ts`, `lib/character-badges.ts`, `lib/minigame-config*.ts`, `lib/auth.ts`, `proxy.ts`) çapraz doğrulandı. DB'ye, build'e ve testlere dokunulmadı.

---

## Özet

Puan ekonomisinin **çekirdeği** (cüzdan, harcama, escrow, kupon, karakter reveal) olgun: `debitPoints` guarded decrement, klan savaşı escrow'u net-sıfır, kupon kullanımı UNIQUE kayıtla atomik, karakter reveal'i advisory lock ile serileştirilmiş, feedback puan tavanı Serializable transaction içinde. Bunlar iyi mühendislik.

Ancak **çekirdeğin etrafındaki uçlar** bu disiplini paylaşmıyor. En ağır sorunlar:

1. **`POST /api/gamification/progress`** — hiçbir hak-ediş kontrolü olmadan müşterinin istediği (gizli olmayan) rozeti kendine vermesine **ve** her rozet için puan almasına izin veriyor; puanla satın alınan rozetler (4000 puanlık olanlar dahil) bedavaya geliyor.
2. **`GET /api/feedbacks`** — STAFF rolü için kapsam filtresi yok; herhangi bir personel hesabı **platformdaki tüm işletmelerin tüm geri bildirimlerini müşteri e-postalarıyla birlikte** okuyabiliyor.
3. **Görev ödülü çift ödeme** — otomatik kredilenen görevler (ziyaret görevleri, özel başarımlar) `claim` ucundan **ikinci kez** talep edilebiliyor; ayrıca `advanceAchievementProgress` yarış koşulunda çift kredi veriyor.
4. **Kimliksiz IDOR'lar** — `GET /api/gamification/badges?userId=X` ve `GET /api/gamification/quests?userId=X` oturum gerektirmeden başka kullanıcının puan, seviye, geri bildirim sayısı, rozet ve görev durumunu döndürüyor.
5. **İstemciye güvenilen mini oyun skoru** — 21 oyunda günde ~3.250 puan küresel tavan olmadan basılabiliyor; "çok hızlı" bitirilen oturumlar ödül almasa da turnuva sıralamasına maksimum skorla giriyor (haftalık 500/300/150 puanlık ödüller).

Ek olarak: rate-limit kapsamı 81 uçtan yalnızca 4'ünde var; 53 uç `requireAuth` yerine doğrudan `getServerSession` kullandığı için token-replay korumasını atlıyor; admin gizli kapısı (`admin_gate`) API seviyesinde hiç uygulanmıyor.

### Puan: **4 / 10**

Gerekçe: Atomik cüzdan ve escrow altyapısı sağlam (+), fakat doğrudan istismar edilebilir **iki kritik** (bedava rozet+puan, STAFF ile platform geneli PII sızıntısı) ve **üç yüksek** (çift görev ödülü, kimliksiz IDOR, istemci-skor ekonomisi) bulgu var. Bunlar "puan basma ve veri sızıntısı yok" invariantını bugün ihlal ediyor.

---

## Mevcut durum haritası

### Kimlik doğrulama deseni

| Desen | Uç sayısı | Not |
|---|---|---|
| `requireAuth([...roles])` (token-replay dahil) | 24 | `lib/api-auth.ts:52-80` |
| Doğrudan `getServerSession` + elle rol kontrolü | 53 | Token-replay kontrolü **yok**; rol kontrolü bazılarında hiç yok (`spin`, `quests/claim`, `rewards PATCH`, `tournament POST`, `seasonal-event POST`, `redeem-coupon`, `donations`, `feedbacks POST`) |
| Hiç kimlik yok | 5 | `public/*` (3, beklenen), `customer/innovation/nearby`, `customer/innovation/radar` (beklenmeyen: `/api/customer` ad alanında) |
| Rate-limit uygulanan | 4 | `ai-chat`, `redeem-coupon`, `feedbacks POST`, `surveys/[id]/fill` |

`proxy.ts:103-121`: `/api/*` için yalnızca güvenlik başlıkları ve CORS eklenir; **rol veya admin-gate kontrolü yapılmaz**. Tüm yetkilendirme route içinde.

### Puan basan (mint) uçlar ve koruma durumu

| Uç | Tek-seferlik garanti | Tavan | Sunucu doğrulaması | Durum |
|---|---|---|---|---|
| `feedbacks POST` | — | 500/gün, 2000/hafta (Serializable) | Metin uzunluğu | İyi; ancak rol serbest |
| `consumptions/[id]/review POST` | `consumptionId` UNIQUE | Aynı tavan, **Serializable değil** | Sahiplik kontrolü var | Tavan yarışla aşılabilir |
| `games/[game]/complete` | `updateMany status=active` | **Yok** | Skor istemciden | Ekonomi açığı |
| `games/pacman/complete` | Aynı | **Yok** | `gameType` kontrolü **yok** | Açık |
| `gamification/spin` | `DailySpin` guarded | Günlük limit | Sunucu ağırlıklı çekiliş | İyi; rol serbest |
| `gamification/quests/[id]/claim` | AuditLog + `FOR UPDATE` | — | Otomatik kredileri görmüyor | **Çift ödeme** |
| `gamification/progress POST` | `userId_badgeId` UNIQUE | — | **Hak-ediş kontrolü yok** | **Kritik** |
| `customer/tournament POST` | `TournamentRewardClaim` UNIQUE | — | Sıralama istemci skorundan | Açık |
| `customer/seasonal-event POST` | `SeasonalChallengeClaim` UNIQUE | — | İlerleme sunucuda yeniden sayılıyor | İyi |
| `customer/character POST` (reveal) | Advisory lock + eşik | — | AI kategori + eşik | İyi |
| `squads/battles/*` | Escrow + `rewardRefunded` guard | Havuz kadar | — | İyi (net-sıfır) |
| `lib/achievements.ts` (custom-color/shop/gift/showcase tetikler) | **Yok (yarış)** | — | — | **Çift kredi** |

---

## Bulgular (önem sırasıyla)

### K1 — `POST /api/gamification/progress`: hak-ediş kontrolsüz rozet + puan basımı  — **KRİTİK**

**Kanıt:**
- `app/api/gamification/progress/route.ts:151-216` — `badgeId` doğrudan gövdeden alınıyor (`:157`), yalnızca varlık (`:161`), `hiddenUntilEarned` (`:174`) ve "zaten var mı" (`:182`) kontrol ediliyor. **Rozetin şartının (`requirement`) sağlanıp sağlanmadığına, `isActive`'e, `pointCost`'a hiç bakılmıyor.**
- `:211-216` — her rozet için `requirement.value || 100` puan ve yarısı kadar XP kredileniyor. Seed'deki rozetlerin şartı `{type, count}` biçiminde (`prisma/seed.ts:227-305`), yani `value` tanımsız → **rozet başına 100 puan**.
- Karşılaştırma: aynı rozetler `badges/[id]/unlock` ucunda `pointCost` (200…4000 puan, `lib/badge-catalog.ts:21-23`) ödenerek alınıyor (`app/api/gamification/badges/[id]/unlock/route.ts:35-66`). `progress POST` bu ödemeyi tamamen atlıyor.
- Karakter rozetleri `ensureCharacterBadgeRecord` ile `hiddenUntilEarned` alanı verilmeden yaratılıyor (`lib/character-badges.ts:115-123`; şema varsayılanı `false`, `prisma/schema.prisma:620`). Dolayısıyla DB'de kaydı oluşmuş her karakter rozeti (ör. `badge-…` slug'ı tahmin edilerek) bu uçtan **reveal akışı ve AI kategori eşiği atlanarak** alınabilir; bu, kategori eşik sayımını da (`takenNow`, `lib/character-badges.ts:445`) bozar.
- İstemci tarafında bu ucu çağıran kod bulunamadı (grep: `gamification/progress` yalnızca `app/api` içinde) — **ölü ama canlı bir uç**.

**Senaryo:** Müşteri `GET /api/gamification/badges` (kimliksiz, gizli olmayan tüm rozetleri listeler, `route.ts:277`) ile ID'leri toplar, her biri için `POST /api/gamification/progress {badgeId}` atar → katalogdaki her gizli olmayan rozet + rozet başına 100 puan + "Usta Yorumcu" gibi 1500–4000 puanlık rozetler bedava.

**Öneri:** Bu uç ürün olarak gereksiz: rozet kazanımı zaten sunucu tarafında (`surprise-badges`, `activity-badges`, `character-badges`, `unlock`) olay güdümlü. POST handler'ı **tamamen kaldırın** (GET kalsın). Rozet verme yetkisini tek bir sunucu servisinde toplayın (`lib/badge-award.ts`: `awardBadge(userId, badgeId, reason)`), bu servis yalnızca iç çağrılarla tetiklensin, `createMany({skipDuplicates})` + `creditBadgeRewardInTx` deseniyle ([[points-economy-invariants]]) aynı tx'te kredilesin. Karakter rozeti kayıtlarını `hiddenUntilEarned: true` ile yaratın ve mevcut DB kayıtları için tek seferlik migrasyon planlayın. Kalıcılık için: daha önce bu uçla verilmiş rozetleri `AnalyticsEvent(category='badge', points_credited)` üzerinden tespit eden bir denetim sorgusu çalıştırın.
**Efor:** S (silme) + M (merkezi award servisi + veri denetimi).

---

### K2 — `GET /api/feedbacks`: STAFF rolü platform genelindeki tüm geri bildirimleri ve müşteri e-postalarını görüyor — **KRİTİK**

**Kanıt:**
- `app/api/feedbacks/route.ts:28` — `requireAuth()` **rol listesi olmadan** çağrılıyor; her oturum açmış rol geçer.
- `:43-51` — kapsam filtresi yalnızca `CUSTOMER` (kendi `userId`) ve `DEALER` (kendi QR'ları) için uygulanıyor; yorumda "ADMIN sees all" yazıyor ama `else` dalı **STAFF'ı da kapsıyor**. `Role` enum'unda `STAFF` mevcut (`prisma/schema.prisma:22-27`).
- `:77-79` — yanıt her kaydın yazarının `name`, `email`, `image` alanlarını içeriyor.

**Senaryo:** Herhangi bir işletmenin personel hesabı (veya ele geçirilmiş bir personel hesabı) `GET /api/feedbacks?pageSize=…&page=…` ile sayfalayarak tüm rakip işletmelerin geri bildirim metinlerini, puanlarını ve müşteri e-postalarını çeker. Bu bir KVKK veri ihlali niteliğindedir.

**Öneri:** Varsayılanı "reddet" olan bir kapsam fonksiyonu yazın: `feedbackScopeWhere(session)` → `CUSTOMER: {userId}`, `DEALER: {qrCode:{dealerId}}`, `STAFF: {qrCode:{dealerId: staffDealerId}}` (personel işletmesine bağlıysa, `getStaffDealerId` ile), `ADMIN: {}`, **diğer her durum: 403**. `requireAuth(['CUSTOMER','DEALER','STAFF','ADMIN'])` ile rolleri açıkça listeleyin. Aynı "else = hepsi" kalıbını kod tabanında tarayın (`userScopeWhere` / `dealerScopeWhere` de bilinmeyen rolde `{}` döndürüyor: `lib/api-auth.ts:130-152` — bu yardımcıların **bilinmeyen rolde imkânsız bir filtre** (`{ id: '__deny__' }`) döndürmesi gerekir). Ayrıca DEALER yanıtından `user.email`'i çıkarın: işletme panelinde kullanılmıyor (`app/dealer/feedbacks/page.tsx` tipte var, render edilmiyor) → veri minimizasyonu.
**Efor:** S.

---

### Y1 — Görev ödülü çift ödeme: otomatik kredilenen görevler `claim` ile tekrar talep edilebiliyor — **YÜKSEK**

**Kanıt:**
- `app/api/gamification/quests/[id]/claim/route.ts:73` — tamamlanmış sayılma koşulu `completedAt || progress >= target`; mükerrer kontrolü **yalnızca** `AuditLog.action = 'CLAIM_QUEST_REWARD'` kaydına bakıyor (`:82-94`).
- `lib/achievements.ts:114-172` — `advanceAchievementProgress` görevi tamamlayınca puanı **otomatik** krediliyor ve `completedAt` set ediyor ama audit aksiyonu `COMPLETED_ACHIEVEMENT` (`:162`) — `CLAIM_QUEST_REWARD` değil.
- `lib/visit-missions.ts:101-129` — ziyaret görevleri de tamamlanınca otomatik krediliyor, hiç audit kaydı yazmıyor.
- `app/api/gamification/quests/route.ts:81-89` — liste ucu bu görevleri `completed: true, claimed: false` olarak döndürüyor; yani arayüz bile "ödülü al" durumu gösterebilir.

**Senaryo:** Müşteri "Renk Sihirbazı" başarımını tamamlar (otomatik +50 puan), sonra `POST /api/gamification/quests/quest-color-wizard/claim` → `getQuestReward` ile **ikinci kez** +50 puan. Aynısı her ziyaret görevi ve her özel başarım için geçerli.

**Öneri:** Görev ödeme modelini **tek kaynakta** birleştirin: `UserQuest` tablosuna `rewardedAt DateTime?` (ve isteğe bağlı `rewardSource`) ekleyin; **her** ödeme yolu (otomatik ve manuel) ödemeyi `updateMany({ where: { id, rewardedAt: null }, data: { rewardedAt: now } })` guard'ı ile yapsın, `count === 0` ise ödeme yapmasın. Ürün kararı olarak iki modelden birini seçin: (a) her şey otomatik (claim ucu yalnızca "kutlama/ack" olur, puan vermez) ya da (b) her şey manuel (otomatik akışlar yalnızca `completedAt` set eder). Oyunlaştırma deneyimi açısından (b) daha tatmin edici ("ödülü topla" anı), ama tek kaynak şartıyla. Geçmiş için: `COMPLETED_ACHIEVEMENT` + `CLAIM_QUEST_REWARD` aynı `entityId`'de olan kayıtları sorgulayıp etkiyi ölçün.
**Efor:** M (şema alanı + 3 yol + backfill).

---

### Y2 — `advanceAchievementProgress` yarış koşulu: eşzamanlı çağrılarda çift/çoklu kredi — **YÜKSEK**

**Kanıt:**
- `lib/achievements.ts:92-112` — ilerleme transaction **dışında** `upsert` ile okunuyor, `newProgress` bellek içinde hesaplanıyor.
- `:114-135` — transaction içinde koşulsuz `update` + `creditPointsAndXp`; `completedAt IS NULL` guard'ı **yok**.
- Tetikleyiciler sınırsız tekrar edilebilir ve rate-limit'siz: `app/api/customer/custom-color/route.ts:29-32` (her çağrıda `increment`), `shop/route.ts:134`, `shop/gift/route.ts:146`, `showcase/route.ts:122`.

**Senaryo:** `POST /api/customer/custom-color {customFrameColor:"1"}` isteği 10 paralel gönderilir → hepsi `progress=0, completedAt=null` okur → her biri ayrı tx'te `+50 puan` kredisi yapar.

**Öneri:** Tamamlanma geçişini atomik yapın: `progress`'i SQL tarafında artırın (`update … progress: { increment }`) ve ödemeyi `updateMany({ where: { id, completedAt: null, progress: { gte: target } }, data: { completedAt: now } })` sonucuna (`count === 1`) bağlayın — `lib/visit-missions.ts:110-115`'teki doğru desen zaten mevcut, onu ortak bir `completeQuestOnce(tx, userQuestId)` yardımcısına çıkarın ve Y1'deki `rewardedAt` ile birleştirin. `custom-color` gibi "her çağrıda increment" tetikleyicilerini olay-bazlı ve idempotent yapın (ör. renk ilk kez ayarlandığında `set 1`).
**Efor:** S–M.

---

### Y3 — Kimliksiz IDOR: başka kullanıcının oyunlaştırma profili okunabiliyor — **YÜKSEK**

**Kanıt:**
- `app/api/gamification/badges/route.ts:79-87` — oturum opsiyonel; `userId` sorgu parametresi `'me'` değilse **doğrudan** kullanılıyor. `:147-183` o kullanıcının `points`, `level`, `xp`, geri bildirim/görev/rozet sayıları ve kazanılmış rozetleri (`earnedAt` tarihleriyle) okunup `:287-291` ile döndürülüyor.
- `app/api/gamification/quests/route.ts:18-21` — aynı desen: `?userId=<id>` ile oturumsuz olarak o kullanıcının tüm görev ilerlemesi, `completedAt` tarihleri, `userQuestId`'leri ve claim durumu (`:56-92`) dönüyor.
- Kullanıcı ID'leri başka uçlarda zaten açık: `customer/character-leaderboard/route.ts:72-79` her satırda `userId` döndürüyor.

**Senaryo:** Liderlik tablosundan ID toplanır → `GET /api/gamification/badges?userId=…` ile kişinin puanı/seviyesi/aktivite yoğunluğu ve zaman damgalı rozet geçmişi (davranış profili) oturumsuz çekilir.

**Öneri:** Her iki uçta `userId` parametresini kaldırın; yalnızca `me` (oturumdan) ve ADMIN için açık `userId` kabul edin (`requireUserResource` kullanın, `lib/api-auth.ts:107-124`). Kamuya açık profil vitrini ürün olarak isteniyorsa ayrı bir `GET /api/public/profile/[handle]` ucu tasarlayın: kullanıcının `showProfile` tercihini (bkz. O5) uygular, yalnızca vitrine iğnelenmiş rozetleri döndürür, puan/XP döndürmez. Liderlik yanıtlarından ham `userId`'yi çıkarın (gerekirse istek-kapsamlı opak anahtar).
**Efor:** S.

---

### Y4 — Mini oyun ekonomisi istemci skoruna güveniyor; küresel tavan yok; turnuvaya hile skoru giriyor — **YÜKSEK**

**Kanıt:**
- `app/api/customer/games/[game]/complete/route.ts:117-124,161-189` — `score` ve `won` istemciden geliyor; sunucu yalnızca `maxScore`'a sıkıştırıyor ve `minDurationSec` (8–10 sn) bekliyor. Yani her oyun "8 saniye bekle + `{won:true, score:maxScore}`" ile tam ödül verir.
- `lib/minigame-config.ts` — 20 registry oyunu + pacman; `rewardPoints` toplamı ≈ **3.250 puan/gün/hesap**. `lib/points-caps.ts:13-14,55-63` tavanı yalnızca `category: 'feedback'` için; oyun (`category: 'game'`) kredileri **hiçbir tavana tabi değil**. Karşılaştırma: emek gerektiren geri bildirim tavanı 500/gün.
- `:200-206` — `tooFast` olsa bile `status: won ? 'completed' : 'failed'` ve `starsCollected: clampedScore` yazılıyor; ödül 0 ama oturum **maksimum skorla "completed"** kaydediliyor.
- `app/api/customer/tournament/route.ts:28-39` — haftalık sıralama `status: 'completed'` oturumların `_max(starsCollected)` değerinden; eşitlikte sıralama belirleyici değil. Ödüller 500/300/150 puan (`lib/tournament-core.ts:13`), **oyun başına** (20 oyun).
- `app/api/customer/games/pacman/complete/route.ts:45-54` — oturumun `gameType`'ı kontrol edilmiyor; generic oyun oturumu pacman ucuyla (5 sn eşik, kendi ödülü) kapatılabiliyor. Pacman `MINI_GAMES` registry'sinde olmadığı için admin tarafından **kapatılamıyor** ve ödülü override edilemiyor (`lib/minigame-config.ts:7-18`; `pacman/start/route.ts` `enabled` kontrolü yapmıyor).
- Küçük: `failed` oturum için `start` ucu "yarım kalan aktif oturum" diye aynı oturumu `canPlay: true` döndürüyor (`[game]/start/route.ts:56-73`) ama `complete` yalnız `active` kabul ettiği için 409 veriyor — kullanıcı açısından tutarsız.

**Öneri (ürün + mimari):**
1. **Oyun kategorisine günlük küresel tavan:** `lib/points-caps.ts`'i kategori-parametrik hale getirin (`capPoints(userId, category, points, tx)`), oyunlar için ör. 300–500/gün; kredi yolunu Serializable yapın (feedback ile aynı).
2. **Sunucu otoritesini artırın:** `start` ucu bir `seed` + HMAC imzalı oturum tokenı dönsün; deterministik oyunlarda (memory-match, speed-order, quiz tipleri) istemci **hamle günlüğünü** göndersin, sunucu seed ile yeniden oynatıp skoru doğrulasın. Refleks oyunlarında skor/süre oranına makullük sınırı koyun.
3. **Turnuvayı ödül-uygunluğuna bağlayın:** sıralamaya yalnız `rewardPoints > 0` (yani `eligible`) oturumlar girsin veya `tooFast` oturumları `status: 'rejected'` yazın; eşitlikte en erken `completedAt` ile belirleyici sıralama yapın; tavanı vuran tek skor çok sayıda kullanıcıda eşitse ödülü bölün.
4. Pacman'i registry'ye taşıyın (admin kontrolü), `pacman/complete`'e `gameSession.gameType === 'pacman'` kontrolü ekleyin; tek generic uçta birleştirin.
**Efor:** M (tavan + turnuva) / L (imzalı replay doğrulaması).

---

### Y5 — Tüketim yorumu puan tavanı yarış koşulunda aşılabiliyor — **ORTA-YÜKSEK**

**Kanıt:** `app/api/customer/consumptions/[id]/review/route.ts:174-232` — `capFeedbackPoints` (`:187`) varsayılan (Read Committed) izolasyonla çalışan transaction içinde. Feedback yolu aynı sorunu bilerek Serializable + `withDbRetry` ile çözmüş (`app/api/feedbacks/route.ts:306-359`). Farklı tüketimlere paralel yorum gönderen kullanıcı, her tx'in diğerlerinin henüz commit edilmemiş `points_credited` olaylarını görmemesi nedeniyle günlük 500 tavanını aşabilir.
**Ek:** `PUT` (`:297-374`) ödül alındıktan sonra metni serbestçe değiştirmeye izin veriyor → uzun metinle yüksek ödül alıp metni silmek mümkün (ödül metin uzunluğundan: `getConsumptionReviewReward`). Ayrıca analiz `after()` yerine await'siz fire-and-forget (`:247-255`, `:357-365`) — serverless'ta kesilebilir (güvenilirlik).
**Öneri:** Kredi transaction'ını `isolationLevel: Serializable` + `withDbRetry` ile sarın (tek satırlık desen kopyası). Düzenlemede metin kısalırsa farkı geri alın veya ödülü düzenleme penceresi kapandıktan sonra (ör. 24 saat) hesaplayın. Analizi `after()` içine taşıyın.
**Efor:** S.

---

### Y6 — Telafi teklifi: müşteri istediği tür ve miktarı yazabiliyor — **ORTA-YÜKSEK**

**Kanıt:** `app/api/customer/remedy/[offerId]/route.ts:14-17` — `patchSchema` yalnızca `selectedType: string, selectedValue: string`. `:160-168` değerleri **teklifin `options` alanına karşı doğrulamadan** yazıyor. Doğrulama sadece istemcide (`app/customer/remedy/[offerId]/page.tsx:99`). Model `options` alanında izinli seçenekleri tutuyor (`prisma/schema.prisma:1336-1338`).
**Senaryo:** Müşteri `{selectedType:"discount", selectedValue:"100"}` gönderir; ekranda ve zaman çizelgesinde "teklif kullanıma hazır — discount / 100" görünür; kasadaki personel bunu %100 indirim olarak uygulayabilir. Bugün işletme paneli bu alanları otomatik işlemiyor (grep: `selectedType` dealer tarafında yok), ancak ileride otomatik puan/indirim fulfilment'ı eklendiğinde doğrudan para kaybına dönüşür.
**Öneri:** Sunucuda `offer.options` (Json) okunup seçimin `options[].type` ve `options[].values` içinde olduğu doğrulansın; değilse 400. Seçim kaydı `options`'ın o anki snapshot'ı ile birlikte tutulsun. İşletme tarafında kullanım (redeem) anında aynı doğrulama tekrarlansın.
**Efor:** S.

---

### O1 — Rol bağımsız puan kazanımı ve öz-değerlendirme (rating manipülasyonu) — **ORTA**

**Kanıt:**
- `app/api/feedbacks/route.ts:186,283-359` — oturum açmış **her rol** (DEALER, STAFF dahil) geri bildirim gönderip puan kazanabiliyor. `lib/trust-score.ts:54-58` aynı kullanıcının aynı işletmeye sıklığına bakıyor ama `userId === dealerId` (işletmenin kendi QR'ına yorum) veya personelin kendi işvereni için kontrolü **yok**.
- `app/api/gamification/spin/route.ts:36-41`, `rewards/route.ts:215-220` (PATCH claim), `quests/[id]/claim/route.ts:29-33`, `customer/tournament/route.ts:135-138`, `customer/seasonal-event/route.ts:114-117`, `customer/redeem-coupon/route.ts:28-31`, `customer/donations/route.ts:175-181` — rol kontrolü yok.
- `dealerStaffId` istemciden geliyor ve QR'ın işletmesine ait olup olmadığı doğrulanmıyor (`lib/validations.ts:115`, `feedbacks/route.ts:256`) → başka işletmenin personeline puan atfedilebilir; geçersiz ID FK hatasıyla 500 üretir.
- Anonim geri bildirim kategori liderlik tablosunu besliyor ve `trustFlagged` hariç tutulmuyor (`app/api/customer/category-leaderboard/route.ts:44-57`); anonim gönderim yalnız IP başına 20/dk ile sınırlı (`feedbacks/route.ts:171`).

**Öneri:** Ekonomi uçlarını `requireAuth(['CUSTOMER'])` ile kilitleyin (ADMIN test için ayrı bir sandbox bayrağıyla). Feedback'te: `session.user.id === qrCode.dealerId` veya STAFF'ın `dealerId === qrCode.dealerId` ise puanı sıfırlayın ve `trustFlagged=true` + `trustReason='self_review'` işaretleyin. `dealerStaffId`'yi `dealerStaff.findFirst({ id, dealerId: qrCode.dealerId })` ile doğrulayın. Kamuya açık sıralamalarda `trustFlagged` ve (isteğe bağlı) anonim kayıtları ağırlıklandırarak hariç tutun.
**Efor:** S–M.

---

### O2 — Rate-limit kapsamı çok dar; spam/amplifikasyon uçları açık — **ORTA**

**Kanıt:** 81 uçtan yalnızca 4'ünde limit var (envanter, yukarıdaki tablo). Somut kötüye kullanım vektörleri:
- `customer/privacy-request` (`route.ts:17-55`): gövdedeki **herhangi bir** e-posta adresine KVKK makbuz e-postası gönderiyor, limitsiz → platformun mail itibarını yakan e-posta bombalama; ayrıca DSR kaydına saldırganın seçtiği e-posta yazılıyor (`:41`), admin export'u manuel iletirken yanlış adrese gönderme riski doğuyor.
- `customer/improvement-request` (`route.ts:25-70`): her çağrı işletmeye bildirim yaratıyor, limitsiz.
- `customer/experience-share` (`route.ts:17-52`): herhangi bir işletme adına, tüketim kanıtı olmadan 200 karakterlik serbest metinli **kamuya açık** kart üretiyor; `public/experience-share/[token]` görüntülenme sayacı kimliksiz şişirilebiliyor (`:25-29`).
- `customer/innovation/ab/event` (`route.ts:17-35`) ve `ab/variant` GET: kimliksiz, limitsiz, `experimentId` sınırsız string → A/B karar verisinin zehirlenmesi + tablo büyümesi.
- `customer/squads/join`: 6 karakterlik `Math.random` davet kodu (`squads/route.ts:74`) limitsiz denenebiliyor.
- `customer/shop/gift`: alıcı e-posta/isimle aranıyor (`shop/gift/route.ts:67-83`), farklı hata mesajları (404 / "zaten sahip" / başarı + e-postanın yanıtta gösterilmesi `:149`) kullanıcı varlığı kâhini oluşturuyor; isimle eşleşme rastgele kişiye hediye gönderebiliyor.

**Öneri:** `createApiRoute`'a (`lib/api-route.ts:53`) deklaratif `rateLimit: { key: 'user'|'ip', max, windowMs }` seçeneği ekleyin ve `checkRateLimitDb` (zaten Redis-öncelikli, `lib/rate-limit.ts:23-37`) ile tüm yazma uçlarına varsayılan bir kova (ör. kullanıcı başına 30/dk) uygulayın; e-posta gönderen ve bildirim üreten uçlara sıkı kovalar (ör. privacy-request 3/gün). Privacy-request'te e-posta override'ını kaldırın — makbuz yalnızca hesabın doğrulanmış e-postasına gitsin. Hediye alıcısını **benzersiz kullanıcı handle'ı veya arkadaş listesi** ile seçtirin; hata mesajlarını tekleştirin. Davet kodunu `crypto.randomBytes` ile 10+ karakter yapın.
**Efor:** M.

---

### O3 — 53 uç `getServerSession` kullanıyor: token-replay koruması tutarsız uygulanıyor — **ORTA**

**Kanıt:** `lib/api-auth.ts:64-78` — token-replay kontrolü yalnız `requireAuth` içinde. Kapsamdaki 81 uçtan 53'ü doğrudan `getServerSession` çağırıyor (envanter). Bunlar arasında en değerli işlemler var: `spin`, `quests/claim`, `rewards PATCH`, `games/*/complete`, `shop`, `gift`, `consumptions/review`, `redeem-coupon`, `donations`. Yani çalınmış bir JWT, replay alarmı tetiklenmeden tam olarak ekonomi uçlarında kullanılabilir. Ayrıca JWT'de banlı/askıya alınmış kullanıcı kontrolü yok (`lib/auth.ts:212-282` — `jwt` callback'i yalnızca login anında DB okur).
**Öneri:** Tüm müşteri uçlarını `createApiRoute(['CUSTOMER'], …)` (veya en azından `requireAuth`) desenine taşıyın; bir ESLint kuralı (`no-restricted-imports`: `app/api/**` içinde `next-auth` `getServerSession`) ile geri dönüşü engelleyin. Hesap askıya alma ihtiyacı için `User.sessionVersion` alanı + JWT'ye gömülü sürüm + `requireAuth`'ta Redis-önbellekli karşılaştırma ekleyin.
**Efor:** M (mekanik ama geniş).

---

### O4 — Admin gizli kapısı API seviyesinde uygulanmıyor — **ORTA**

**Kanıt:** `proxy.ts:78-88` gate cookie'yi yalnızca `/admin` **sayfaları** için kontrol ediyor; `/api/*` dalı (`proxy.ts:104-118`) kontrol yapmıyor. `gateCookieBelongsTo` hiçbir API route'unda kullanılmıyor (grep: yalnız `lib/admin-gate*.ts`). Kapsamdaki admin mutasyonları — `gamification/badges POST/PATCH/DELETE`, `quests POST/PATCH/DELETE`, `rewards POST/PATCH/DELETE` — yalnızca `session.user.role === 'ADMIN'` kontrolü yapıyor (ör. `badges/[id]/route.ts:49-50`, `rewards/route.ts:157`). Kapının tehdit modeli ("rolü kazara ADMIN yapılan stajyer bile giremez") API'den doğrudan çağrıyla tamamen aşılıyor; ödül maliyeti/stok değiştirmek ekonomiyi doğrudan etkiler.
**Öneri:** `requireAuth(['ADMIN'])` içinde (veya `requireAdmin()` yardımcısında) `admin_gate` HMAC cookie'sini Node tarafında doğrulayın (`lib/admin-gate.ts` zaten var). Tüm admin mutasyonlarını bu yardımcıya taşıyın.
**Efor:** S–M.

---

### O5 — Gizlilik tercihleri yalnızca kaydediliyor, hiçbir yerde uygulanmıyor — **ORTA**

**Kanıt:** `showProfile` ve `showLeaderboard` tercihleri yalnızca `app/api/customer/settings/route.ts` ve ayarlar sayfasında geçiyor (grep). `customer/character-leaderboard/route.ts:62-79` tam `name`, `image` ve `userId` döndürüyor (kısaltma yok; oyun liderliği ise `shortName` kullanıyor: `games/[game]/leaderboard/route.ts:72`). Kullanıcı "liderlik tablosunda görünme" dese bile görünüyor — KVKK açısından açık rıza/tercih ihlali.
**Öneri:** Tek bir `publicDisplayIdentity(user, prefs)` yardımcısı yazın: tercih kapalıysa "Gizli oyuncu" + jenerik avatar, açıksa kısaltılmış ad. Tüm liderlik/vitrin uçları bunu kullansın; tercihler `User` tablosunda indekslenebilir bir alan olarak tutulsun ki sorguda filtrelenebilsin.
**Efor:** S–M.

---

### O6 — `/api/customer` ad alanında kimliksiz rekabet istihbaratı uçları — **ORTA**

**Kanıt:**
- `app/api/customer/innovation/nearby/route.ts:12-96` — kimliksiz; `dealerId` + 0,1 km hassasiyetinde `distanceKm` döndürüyor; farklı koordinatlardan çağrılarak üçgenleme mümkün (yorumdaki "tam adres yok" iddiası pratikte geçersiz; işletme konumları zaten kamuya açık olsa da).
- `app/api/customer/innovation/radar/route.ts:12-156` — kimliksiz; `radiusKm` alt sınırı yok, bu yüzden tek bir işletmenin koordinatına çok küçük yarıçapla sorgu atılarak **o işletmenin** son 7 gün en çok tüketilen ürünleri (adetle) ve haftalık özet temaları (`dealerWeeklyBrief.topThemes` — özel geri bildirimden türetilmiş) okunabiliyor. Ayrıca `take: 400` sırasız → 400'den fazla işletmede sonuçlar keyfi (işlevsel hata).
**Öneri:** `requireAuth(['CUSTOMER'])` + kullanıcı başına rate-limit; `radiusKm` için alt sınır (ör. 2 km) ve **k-anonimlik** eşiği (bölgede en az N≥5 işletme yoksa tema/ürün döndürme). `nearby`'de mesafeyi kovaya yuvarlayın (ör. 0,5 km). Sorguyu coğrafi sınırlayıcı kutu (bounding box) ile DB'de filtreleyin.
**Efor:** S.

---

### D1 — Girdi doğrulama boşlukları (zod'suz `req.json()` destructuring) — **DÜŞÜK-ORTA**

**Kanıt:**
- `customer/custom-color/route.ts:21-27` — `customFrameColor` tip/uzunluk kontrolsüz `User`'a yazılıyor; JWT'ye ve oturuma da taşınıyor (`lib/auth.ts:251,278`). Nesne gönderilirse 500.
- `customer/squads/route.ts:27-34` — `name` için tip ve üst sınır yok (yalnız `length < 3`).
- `customer/shop/route.ts:78-123` — satın almada `isActive` kontrolü yok (GET pasifleri gizliyor ama POST pasif/sezonu biten ürünü satıyor).
- `surveys/[id]/fill/route.ts:53-114` — `answers[].value` string'leri sınırsız uzunlukta (100 cevap × sınırsız), `questionId`'lerin ankete ait olduğu doğrulanmıyor, oturumlu kullanıcı için tekil yanıt kısıtı yok (yalnız IP başına 10/dk) → anket sonuçları şişirilebilir.
- `lib/validations.ts:100-105` — `media` URL'leri `z.string().url()` ile kabul ediliyor; `javascript:` ve harici izleme URL'leri geçerli sayılır. Bugün hiçbir yerde render edilmiyor (grep), ancak ileride `<a href>`/`<img>` ile gösterildiğinde XSS/izleme vektörü olur.
- `gamification/rewards/route.ts:274-285` — `perUserLimit` sayımı Read Committed'da count-then-create; eşzamanlı talepte kullanıcı limiti aşılabilir (puan ve stok guard'ı sınırlıyor).
- `squads/join/route.ts:64-87` ve `SquadMember` şeması (`prisma/schema.prisma:425-437`) — "tek klan" kuralı yalnızca uygulama kontrolü; `userId` üzerinde UNIQUE yok → eşzamanlı katılımla iki klana üye olunabilir. `squads/challenge/route.ts:100-113` içindeki "TOCTOU kapanır" yorumu Read Committed'da doğru değil (escrow sayesinde etkisi sınırlı).

**Öneri:** Kapsamdaki tüm gövdeli uçlar için zod şemasını zorunlu kılın (`createApiRoute`'a `body: schema` seçeneği). Medya URL'lerini yalnızca kendi R2 alan adınız + `https:` ile sınırlayın. Anket yanıtında `@@unique([surveyId, userId])` (oturumlu) + metin üst sınırı + soru ID doğrulaması. `SquadMember`'a `@@unique([userId])` (ürün kuralı "tek klan" ise). `perUserLimit` için `UserReward` sayımını Serializable tx'e alın veya `(userId, rewardId, slot)` UNIQUE deseni kullanın.
**Efor:** M (toplam).

---

### D2 — İdempotency anahtarları kullanıcıya bağlı değil ve auth'tan önce kontrol ediliyor — **DÜŞÜK**

**Kanıt:** `lib/idempotency.ts:28-51` — anahtar global (`where: { key }`), kullanıcı kimliği yok. `gamification/spin/route.ts:31-33`, `consumptions/[id]/review/route.ts:91-93`, `quests/[id]/claim/route.ts:23-25`, `rewards/route.ts:209-211` önbellekli yanıtı **oturum kontrolünden önce** döndürüyor. Anahtar istemcinin UUID'si olduğu için tahmin pratik değil, ama sızan bir anahtar (log, proxy) başka birinin yanıtını (ör. `rewards` claim'inde `couponCode`, review'da yorum metni) oturumsuz okumaya izin verir. Ayrıca bu uçlar `checkIdempotency` (rezervasyonsuz) kullanıyor; `withIdempotency`'deki TOCTOU düzeltmesi (`:83-143`) burada yok (ekonomik çift işlem diğer guard'larla engelleniyor).
**Öneri:** Anahtarı `${userId}:${route}:${key}` olarak saklayın ve kontrolü auth'tan sonra yapın; tüm uçları `withIdempotency`'e taşıyın.
**Efor:** S.

---

### D3 — Diğer hijyen notları — **DÜŞÜK**

- `GET /api/gamification/badges/[id]` (`route.ts:13-34`) kimliksiz ve `isActive`/`hiddenUntilEarned` filtresiz → karakter liderliğinin özenle gizlediği (`character-leaderboard/route.ts:126-130`) karakter kimlikleri ID tahminiyle doğrulanabiliyor; sürpriz politikasını deliyor. `quests/[id]` ve `rewards/[id]` GET de pasif kayıtları döndürüyor.
- `proxy.ts:6-10` — `NEXT_PUBLIC_ALLOWED_ORIGINS` tanımlı değilse CORS allowlist'i `localhost:3000/3001` ve `qratex.netlify.app`'e kimlik bilgisiyle izin veriyor. SameSite=Lax oturum çerezi çapraz site `fetch`'te gönderilmediği için pratik etkisi düşük; üretim değerinin ne olduğu **doğrulanmadı**.
- `lib/auth.ts:269-279` — istemci `useSession().update()` ile kendi JWT'sindeki `points`, `level`, `image`, `equippedFrame` alanlarını keyfi değiştirebilir. Rol değiştirilemiyor (iyi); bu alanlar sunucuda yetki için kullanılmıyor (grep: yalnız `surprise-box/[id]/open/route.ts:53` görüntüleme için). Yine de `points`/`level`'ı update yolundan kaldırıp DB'den tazeleyin.
- `public/stats/route.ts:29-31,50` — geri bildirim yoksa veya hata olursa ortalama puan **4.9** olarak uydurulup gösteriliyor; güvenlik değil ama güven/dürüstlük riski (pazarlama iddiası).
- `customer/streak` GET (`route.ts:22-33`) ve `ab/variant` GET yan etkili (yazma yapan GET) — SameSite=Lax altında üst-düzey navigasyonla tetiklenebilir; etki kullanıcının lehine, düşük.

---

## Hedef mimari

**İlke:** "Puan basan her yol tek bir dar kapıdan geçer; her uç varsayılan olarak kapalıdır."

1. **Tek route fabrikası:** Tüm `app/api/customer|gamification|feedbacks|surveys` uçları `createApiRoute` ile tanımlanır. Fabrika şunları deklaratif alır: `roles` (zorunlu, `null` yalnız public), `body` (zod şeması, zorunlu), `rateLimit` (varsayılan kova + uç-özel), `idempotent` (kullanıcı-kapsamlı `withIdempotency`), `adminGate` (ADMIN rolünde otomatik). Token-replay ve oturum sürümü kontrolü fabrikada. ESLint ile `app/api/**` içinde `getServerSession` yasaklanır.

2. **Kapsam yardımcıları "deny-by-default":** `userScopeWhere`, `dealerScopeWhere`, yeni `feedbackScopeWhere` bilinmeyen rolde imkânsız filtre döndürür. Kaynak-ID alan her uç `requireUserResource`/`requireDealerResource` kullanır; `?userId=` parametresi yalnız ADMIN'de anlamlıdır.

3. **Puan Defteri (Points Ledger) servisi:** `lib/points-ledger.ts` → `grantPoints(tx, { userId, amount, category, sourceType, sourceId })`:
   - `(sourceType, sourceId, userId)` UNIQUE bir `PointsGrant` tablosuna `createMany({skipDuplicates})` → `count === 0` ise kredi yok (tek-seferlik garanti DB'de; AuditLog aramasına dayanmaz).
   - Kategori bazlı günlük/haftalık tavan (feedback, game, quest, badge, spin…) aynı Serializable tx'te.
   - `points_credited` olayı otomatik.
   - `creditPointsAndXp`'nin doğrudan çağrılması route'larda yasaklanır; yalnız ledger servisi çağırır.
   Bu, K1/Y1/Y2/Y5 ve Y4'teki tavan eksikliğini tek mimari değişiklikle kapatır ve [[points-economy-invariants]]'i kod seviyesinde zorunlu kılar.

4. **Oyun otoritesi:** İmzalı oturum tokenı (`start` → HMAC(sessionId, seed, startedAt)), deterministik oyunlarda hamle günlüğü ile sunucu tarafı yeniden oynatma, turnuvaya yalnız doğrulanmış oturumlar.

5. **Gizlilik katmanı:** `publicDisplayIdentity` + tercihlerin `User` alanları olarak tutulması; liderlik/vitrin yanıtlarında ham `userId` yok; işletmelere müşteri e-postası yalnız açık rıza/iletişim izni varsa.

---

## Adım adım geçiş planı

**Faz 0 — Acil kapama (1 gün, hepsi S):**
1. `app/api/gamification/progress/route.ts` POST handler'ını kaldır (K1).
2. `app/api/feedbacks/route.ts` GET: STAFF'ı işletmesine kapsa, bilinmeyen rolde 403; DEALER yanıtından `email`'i çıkar (K2).
3. `quests/[id]/claim`: geçici olarak `userQuest.completedAt` set edilmiş ve `COMPLETED_ACHIEVEMENT` audit'i veya visit-mission kaynaklı görevleri reddet (Y1 geçici yama).
4. `badges` ve `quests` GET'te `userId` parametresini yalnız `me`/ADMIN'e kısıtla (Y3).
5. `remedy/[offerId]` PATCH'te seçimi `offer.options`'a karşı doğrula (Y6).
6. `privacy-request`'te e-posta override'ını kaldır + 3/gün limit (O2).

**Faz 1 — Ekonomi sertleştirme (1 hafta, M):**
7. `lib/points-caps.ts`'i kategori-parametrik yap; oyun kategorisine günlük tavan; tüketim yorumu kredisini Serializable yap (Y4, Y5).
8. `advanceAchievementProgress` ve görev ödemelerini `UserQuest.rewardedAt` guard'lı ortak `completeQuestOnce`'a taşı; geçici yamayı kaldır (Y1, Y2).
9. Oyun `complete`: `tooFast` oturumları `rejected` yaz; turnuva sıralamasını uygun oturumlarla sınırla, belirleyici eşitlik; pacman'i registry'ye al ve `gameType` kontrolü ekle (Y4).
10. Ekonomi uçlarına `CUSTOMER` rol kilidi; feedback'te öz-değerlendirme tespiti ve `dealerStaffId` doğrulaması (O1).
11. Geçmiş etki denetimi: `points_credited` olaylarından (category `badge` / `achievement` / `quest` / `game`) anomali raporu — kimin K1/Y1/Y2 ile puan aldığını çıkar, ürün kararıyla düzelt.

**Faz 2 — Altyapı (2 hafta, M–L):**
12. `createApiRoute`'a `body`, `rateLimit`, `idempotent`, `adminGate` seçenekleri; 53 `getServerSession` ucunu dalgalar halinde taşı (önce puan basan/harcayan uçlar); ESLint kuralı (O3, O2, D1, D2).
13. Admin gate'in API'de doğrulanması (O4).
14. `PointsGrant` tablosu + `grantPoints` servisi; tüm mint yollarının buna geçişi (hedef mimari 3).
15. Gizlilik: `publicDisplayIdentity`, tercihlerin uygulanması, liderliklerden ham `userId`'nin kaldırılması (O5); innovation uçlarına auth + k-anonimlik (O6).

**Faz 3 — Oyun otoritesi (opsiyonel, L):**
16. İmzalı oturum tokenı ve deterministik oyunlarda hamle-günlüğü doğrulaması; refleks oyunlarında makullük modeli.

**Doğrulama:** Her faz için yarış testleri (aynı isteği 20 paralel gönderip bakiyenin tek kredi kadar arttığını doğrulayan entegrasyon testleri), rol matrisi testi (her uç × 4 rol × sahip/sahip değil), ve `points_credited` toplamı ile `User.points` değişiminin mutabakatını yapan günlük cron (fail-closed).

---

## Uygulama sonrası durum

- **Tarih:** 2026-10-11 (dalga 3 sonrası yeniden denetim, `feat/platform-overhaul`)
- **Yöntem:** Her bulgu şimdiki koda karşı yeniden okundu. Kapsam: `app/api/{customer,gamification,feedbacks,public,surveys}` (137 route) ve müşterinin doğrudan çağırdığı paylaşılan uçlar (`leaderboard`, `vip`, `birthday`, `referral`, `wallet`, `cards`, `wall`, `consent`, `campaigns`). Yapı denetimi kalıcı test olarak duruyor: `__tests__/security/customer-api-surface.test.ts`. Test şunları yakalar: çıplak `getServerSession`, rol listesiz `requireAuth()`, oran sınırı olmayan işleyici, şemasız gövde, `?userId=` IDOR, `progress` POST'un geri gelmesi ve izinsiz `public` uç. Son tur commit'i: `0defc5c`.

| Bulgu | Durum | Kanıt |
|---|---|---|
| **K1** progress POST bedava rozet+puan | KAPANDI | `app/api/gamification/progress/route.ts` yalnız `GET` sunuyor (`requireAuth(['CUSTOMER','ADMIN'])`). Yapı testi POST'un geri gelmesini engelliyor. Rozet verme tek serviste: `lib/badges/award.ts` (`mintPoints`, anahtar `badge:<user>:<badge>`). |
| **K2** STAFF platform geneli geri bildirim + e-posta | KAPANDI | `app/api/feedbacks/route.ts` GET açık rol listesi kullanıyor. CUSTOMER yalnız kendi kayıtlarını görür; diğer roller `resolveAiScope` ile kapsanır (STAFF yalnız DB'deki aktif bayisini görür, varsayılan reddet). `email` yalnız ADMIN'e gider (`email: isAdmin`). Süzgeçler beyaz listeyle sınırlı. |
| **Y1** otomatik görevin `claim` ile ikinci ödemesi | KAPANDI | `lib/quests/claim.ts` + `lib/quests/reward.ts`: `rewardedAt` guard'lı `updateMany` + `mintPoints` defter anahtarı `quest:<userQuestId>`. Otomatik ödenen görev `QUEST_AUTO_REWARDED` (409) döner. Test: `__tests__/lib/quest-reward.test.ts` (onarıldı, 16/16). |
| **Y2** `advanceAchievementProgress` yarış çift kredi | KAPANDI | `lib/achievements.ts`: tx içinde taze okuma + `completedAt/rewardedAt: null` guard + `mintPoints` (kullanıcı satırı `FOR UPDATE`). |
| **Y3** kimliksiz `?userId=` IDOR | KAPANDI | `badges` ve `quests` GET, `resolveSubjectUserId` (yalnız `me`/ADMIN) ve `getOptionalSession` kullanıyor. Yapı testi `?userId=` okuyan her dosyada bu yardımcıyı zorunlu kılıyor. Genel liderlik ham id yerine HMAC opak id döndürüyor. |
| **Y4** istemci skoru, tavansız oyun ekonomisi, hileli turnuva | KAPANDI (kısmi kalıntı aşağıda) | `games/[game]/complete` → `lib/game-session.ts`: HMAC deneme belirteci, sunucu saati ve saniye başına skor makullüğü denetleniyor. `implausible` deneme `failed` yazılır ve turnuvaya girmez. Ödül `mintPoints` ve `game` tavanıyla verilir (günde 600 / haftada 3.000, `lib/economy/caps.ts`). Turnuva eşitliği belirleyici biçimde çözülür (`rankWeekly`). Ayrı pacman uçları kaldırıldı. |
| **Y5** yorum tavanı yarışı + metin kısaltma | KAPANDI | `consumptions/[id]/review`: `mintPoints` kullanıcıyı kilitlediği için tavan yarışı yok; ek işler `after()` ile çalışıyor. PUT'ta ayrıntılı yorum eşiğin altına kısaltılırsa ödül farkı tek seferlik `reversal` ile geri alınır (`consumption_review_shrink:<id>`). |
| **Y6** telafi seçimi doğrulanmıyor | KAPANDI | `lib/remedy-offer-service.ts` seçimi `findRemedySelection(offer.options, …)` ile doğruluyor; geçersiz seçim `INVALID_SELECTION` döner. İşletme içindeki kişi puan telafisi alamaz (`isDealerInsider`). Test: `__tests__/lib/remedy-accept-abuse.test.ts` (personel reddi testi eklendi). |
| **O1** rol serbest ekonomi, öz-değerlendirme, `dealerStaffId` | KAPANDI | Ekonomi uçları yalnız `['CUSTOMER']`: spin, görev, ödül, turnuva, sezon, kupon, bağış, hediye. Geri bildirim çekirdeği `lib/feedback-funnel/submit.ts` personelin kiracısını doğruluyor; çıkar çatışmasında (sahip/personel) puan verilmiyor. |
| **O2** dar oran sınırı, spam uçları | KAPANDI | Kapsamdaki her işleyicide oran sınırı var (yapı testi denetliyor). Privacy-request istemciden e-posta almıyor; sınırı günde 3. Improvement 5/dk, experience-share 10/dk. A/B olayı yalnız aktif deneyde ve `public-write` sınırıyla yazılıyor. Klan davet kodu `crypto.getRandomValues` ile üretiliyor. Genel liderlik okuma tavanı bu turda eklendi. |
| **O3** çıplak `getServerSession` / askı kontrolü | KAPANDI | `app/api/**` altında hiç kalmadı (ESLint `no-restricted-imports` + iki yapı testi). `requireAuth` her istekte DB oturum durumunu (`sessionVersion`, askı, güncel rol) ve token replay'i denetliyor. |
| **O4** admin kapısı API'de yok | KAPANDI | `requireAuth`, ADMIN için `checkAdminElevation`'ı varsayılan olarak çalıştırıyor (`lib/api-auth.ts`). Gamification admin mutasyonları `requireAuth(['ADMIN'])` kullanıyor. |
| **O5** gizlilik tercihleri uygulanmıyor | KAPANDI | Tek kaynak `lib/privacy/leaderboard-optout.ts`; oyun liderliği, turnuva, karakter liderliği, lig ve genel liderlik bunu kullanıyor. **Bu tur:** klan savaşı detayı (`squads/battles/[id]`) rakip katkıcıyı tam adla döndürüyordu (regresyon); artık ad maskeli. `battles/current` ve detay ucunda tercihi kapalı rakip "Gizli oyuncu" olarak ve avatarsız görünür. Test: `__tests__/api/squad-battle-detail-privacy.test.ts`. |
| **O6** kimliksiz radar/nearby | KAPANDI | İki uç da `requireAuth(['CUSTOMER'])`, Keşfet kapısı ve 30/dk sınırı kullanıyor. Radar: `MIN_RADIUS_KM=2` ve k-anonimlik (en az 5 işletme, öğe başına en az 2). Nearby: mesafe 0,5 km kovasına yuvarlanıyor. |
| **D1** zod'suz gövdeler, pasif ürün, anket, medya, limit yarışları | KAPANDI | Yapı testi şemasız `req.json()` bırakmıyor (bu tur: karakter, push, ödül oluşturma). Medya yalnız kendi R2 alanından kabul ediliyor (`lib/feedback-funnel/media.ts`). Anket soru, uzunluk ve yanıt sınırları `lib/survey-schema.ts`'te. Ödül `perUserLimit` sayımı kullanıcı kilidi altında (`lib/wallet-rewards/mutations.ts`). Tek klan kuralı kullanıcı ve klan satırı `FOR UPDATE` ile korunuyor (`lib/squads/membership.ts`). |
| **D2** idempotency kullanıcıya bağlı değil | KAPANDI | `defineRoute` idempotency anahtarını `<ad>:<kullanıcı>` rotasına bağlıyor. Elle kullanan iki uç (feedbacks, quest claim) anahtarı göndericiye bağlıyor ve auth'tan sonra denetliyor. Ekonomik tekillik defter anahtarlarında. |
| **D3** hijyen | KAPANDI | `badges/[id]` GET yalnız ADMIN'e açık. Pasif/arşivli görev ve ödül GET'i ADMIN dışına 404 döner. CORS üretim varsayılanı boş (`proxy.ts`). JWT `update` puan ve seviyeyi DB'den tazeliyor (`lib/auth.ts`). Public stats uydurma 4.9 yerine 503 döner. Streak GET yan etkisiz; yazma POST'ta. |

**Bu turda ayrıca:** Şu testler kırıktı: `__tests__/api/{customer-shop-gift,redeem-coupon,customer-badges}` ve `__tests__/lib/{quest-reward,customer-voices,remedy-offer-service,remedy-accept-abuse}`. Nedenleri: `requireAuth` artık DB oturum durumunu okuyor, `isDealerInsider` için `dealerStaff` taklidi ve tercih sorgusu için `settings` taklidi eksikti. Hepsi onarıldı; müşteri kapsamı yeşil.

**Kalanlar (bilinçli ya da başka boyutun işi):**
1. **Hediye alıcı önizlemesi e-postanın kayıtlı olup olmadığını ele veriyor** (bulundu / bulunamadı). Bu, e-postayla alıcı seçen özelliğin doğal sonucu. Hafifletmeler: kişi başına 10 dakikada 30 arama, yalnız uygun müşteriler, maskeli ad ve e-posta. Kalıcı çözüm alıcıyı arkadaş listesinden veya handle ile seçmek (ürün kararı).
2. **Oyun kanıtı çoğu oyunda isteğe bağlı** (13 doğrulayıcının 2'sinde `requireProof`). Kanıtsız denemede skor, makullük sınırı ve günlük 600 puan tavanıyla bağlı; ekonomik etki meşru oyuncunun üst sınırını aşamaz. Sahibi `oyun-ekosistemi` boyutu.
3. Bu boyutun dosyası olmayan kırık testler: `admin-gate-outside-admin-api`, `data-safety-archive`, `remedy-integrity` (bayi ucu), `landing-public` ve önceden kırık olan `auth.test.ts`.

### Yeni puan: **9.5 / 10**

Gerekçe: Raporun 2 kritik, 6 yüksek, 6 orta ve 3 düşük bulgusunun hepsi kök nedeninden kapandı. Kapanışı taşıyan yapılar:

- Tek ekonomi kapısı: `mintPoints`/`debitPoints`, defter anahtarı ve kategori tavanı.
- Varsayılan olarak reddeden route fabrikası ve kapsam yardımcıları.
- DB destekli oturum durumu ve admin kapısı.
- Tek gizlilik kaynağı.

Bu yapıların geri dönmesini yapı testleri, ESLint kuralı ve yarış/rol testleri engelliyor. Tam puanı iki bilinçli kalıntı engelliyor: kanıtı isteğe bağlı oyunlar (tavanla sınırlı, başka boyutun işi) ve e-postayla hediye aramasının ele verdiği kayıt bilgisi (oran sınırıyla hafifletilmiş).
