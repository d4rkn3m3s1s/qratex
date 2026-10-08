# Sistem Denetimi — Oyunlaştırma Ekonomisi

Tarih: 2026-10-08 · Dal: `feat/moment-engine` · Kapsam: puan, XP, seviye, lig, VIP, rozet (genel/aktivite/sürpriz/karakter), görev/başarım, günlük çark, sürpriz kutu, seriler (streak), mini oyun + turnuva, mağaza/hediye, ödül (Reward) ve kupon, bağış, klan (squad) + klan savaşı, referral, sezonsal etkinlik, bayi kaynaklı pasif puan, admin ekonomi ayarları.
Yöntem: salt okuma (Grep/Glob envanteri + dosya okuma). DB'ye, scriptlere, build'e dokunulmadı. Üretim verisine bağlı iddialar "doğrulanmadı" olarak işaretlendi.
İlgili onaylı iş: **An Motoru** (`docs/superpowers/specs/2026-10-08-moment-engine-design.md`) — ödül anlarının *gösterimi*. Bu rapor onu tekrar önermez; yalnızca ekonomi kararlarının An Motoru'na etkisini not eder.

---

## 1. Özet

**Puan: 4 / 10**

Qratex'te oyunlaştırma *çok geniş* (≈25 puan kaynağı, 6 harcama yolu, 5 rozet motoru, 4–5 ayrı seri sistemi) ve tek tek akışlarda **atomiklik hijyeni gerçekten iyi**: guard'lı `updateMany` claim'leri, `@@unique` tek-kullanım tabloları (`DailySpin`, `GameStreakClaim`, `TournamentRewardClaim`, `CouponRedemption`, `SeasonalChallengeClaim`), klan savaşında escrow, `debitPoints` ile eksi bakiye koruması, karakter rozetinde advisory lock. Bunlar 2026-08 denetimlerinin kalıcı kazanımları.

Ama ekonomi **bir sistem olarak** tasarlanmamış; özellik özellik büyümüş. Sonuç:

1. **İki kritik "sınırsız puan basma" yolu açık**: (a) bayi, sınırsız `happyHour.multiplier` + kendi kayıt ettiği tüketimlerle herhangi bir aktif kart sahibine sınırsız, fraud dedektörüne görünmez puan basabiliyor; (b) müşteri `POST /api/gamification/progress` ile istediği rozeti koşulsuz kendine verip `requirement.value` kadar (ör. 10.000) puan alabiliyor.
2. **Görev ödülleri iki kez ödeniyor** (otomatik tamamlanan başarım/ziyaret görevleri UI'daki "Ödülü al" ile ikinci kez ödeniyor) — bunu kötü niyetsiz normal kullanıcı da tetikliyor.
3. **Kaynak/harcama dengesi yok**: tek bir aktif oyuncu ayda ~100.000+ puan kazanabilirken ödüller 300–1.000 puan, kozmetikler sonlu ve tek seferlik. Enflasyon yapısal; puanın değeri yok.
4. **Lig ve VIP harcanabilir bakiyeye bağlı**: harcamak ligi düşürüyor (harcamayı cezalandırıyor), 100.000 puanı aşan kullanıcı "Başlangıç" ligine düşüyor (kod hatası).
5. **Puanın kaydı yok**: ledger tablosu yok; tek "defter" 90 günde silinen `AnalyticsEvent.points_credited`. Cap'ler, velocity dedektörü ve "Benim Yılım" bu geçici veriye dayanıyor; harcama olayı (`points_spent`) hiç yazılmıyor.
6. **Kurallar kullanıcıya anlatılmıyor ve kendi içinde çelişiyor**: 3 farklı seviye-ilerleme formülü, sentetik haftalık liderlik puanı, admin'in düzenlediği "seri" ayarının UI'da olmayan bir seriyi etkilemesi, satın alınabilir dediği rozetlerin hiç görünmemesi.

En yüksek kaldıraç: **Faz 0 hotfix'leri (1–2 gün)** + **tek bir ekonomi servisi ve kalıcı ledger** (Bölüm 6). Bu ikisi olmadan yeni oyunlaştırma özelliği eklemek mevcut sorunları çoğaltır.

---

## 2. Mevcut Durum Haritası

### 2.1 Para birimleri ve türetilmiş statüler

| Kavram | Saklandığı yer | Nasıl türüyor | Not |
|---|---|---|---|
| **Puan** (harcanabilir) | `User.points` (Int) | Her kaynak doğrudan artırır | Tek bakiye; ledger yok |
| **XP** | `User.xp` | Kaynakların çoğu puanla birlikte verir | Harcanamaz |
| **Seviye** | `User.level` | `calculateLevel(xp)` geometrik 1000×1.5ⁿ (`lib/utils.ts:94`) | `creditPointsAndXp` yazar (`lib/points-wallet.ts:45-63`) |
| **Lig** | saklanmaz | **Güncel puan bakiyesinden** (`lib/league-rules-core.ts:74-78`) | Harcayınca düşer |
| **VIP kademesi** | `UserVIPStatus` | **Güncel bakiyeden**, yalnız `GET /api/vip` çağrılınca (`app/api/vip/route.ts:38-58`) | Bu endpoint'i hiçbir UI çağırmıyor → fiilen ölü |
| **Klan puanı** | `Squad.totalPoints`, `Squad.treasuryPoints` | Bayi pasif puanı + savaş ödemesi; feedback'in %10'u hazineye | Hazinenin harcama yolu yok |

### 2.2 Puan kaynakları (faucet) envanteri

| # | Kaynak | Dosya | Miktar | Sıklık / sınır | `points_credited` | UI'da var mı |
|---|---|---|---|---|---|---|
| 1 | Feedback | `app/api/feedbacks/route.ts:283-358` | 50/100 × VIP × sezon × global çarpan | Günlük 500 / haftalık 2.000 cap (Serializable tx) | Var | Var |
| 2 | Tüketim yorumu | `app/api/customer/consumptions/[id]/review/route.ts:163-210` | 50/100 | Feedback cap'ini paylaşır, **çarpan yok, Serializable değil** | Var (`feedback`) | Var |
| 3 | **Bayi pasif puanı** | `app/api/dealer/consumptions/route.ts:298-350` | `floor(min(amount×10,1000)×0.05×happyHour)` × sezon | 5 tüketim/dk/kart/bayi | **YOK (ham increment)** | Görünmez |
| 4 | Mini oyunlar (20 + Pacman) | `app/api/customer/games/[game]/complete/route.ts:94-180` | 120–170 puan + 60–85 XP / oyun | Oyun başına günde 1 | Var | Var |
| 5 | Oyun günlük seri bonusu | aynı dosya `:116-151` | +10 XP (+30 her 3. gün) | Günde 1 | XP (event yok) | Var |
| 6 | Haftalık turnuva | `app/api/customer/tournament/route.ts:140-185` | 500/300/150 | Oyun × hafta × ilk 3 | Var | Var |
| 7 | Günlük sürpriz kutu | `app/api/surprise-box/route.ts:21-34` | **50–250 rastgele, koşulsuz** | Günde 1 | Var (açılışta) | Var |
| 8 | Günlük çark | `app/api/gamification/spin/route.ts:60-90` | Beklenen ≈25 puan + XP | Günde 1 (matris) | Puan: var / XP: yok | Var |
| 9 | Giriş serisi (login) | `lib/login-streak.ts:25-30,151-183` | 3g=50, 7g=150, 14g=300, 30g=1.000 | **Ömürde bir kez** her kilometre taşı | Var | Var |
| 10 | Loyalty serisi (`UserStreak`) | `app/api/streak/route.ts:157-208` | 7g=100 … 365g=10.000 (matris) | Seri her yeniden kurulduğunda tekrar | Var | **UI çağırmıyor (yetim endpoint)** |
| 11 | Görev claim | `app/api/gamification/quests/[id]/claim/route.ts:38-140` | `quest.reward` | AuditLog ile tek-kez | Var | Var |
| 12 | Başarım (SPECIAL quest) | `lib/achievements.ts:75-179` | 25–100 puan + XP | Otomatik | Var | Kısmen |
| 13 | Ziyaret görevi | `lib/visit-missions.ts:100-128` | `quest.reward` | Otomatik | Var | Kısmen |
| 14 | Rozet ödülü (aktivite/sürpriz/karakter) | `lib/badge-reward-points.ts:48-69` | Emoji rozet 200–5.000 (23 rozet, toplam 33.700); **karakter 2.500–10.000 (30 rozet, toplam 185.000)** | Rozet başına bir kez | Var | Var |
| 15 | **Rozet self-award** | `app/api/gamification/progress/route.ts:151-245` | `requirement.value` (ör. 10.000) + yarısı XP | Rozet başına bir kez, **koşul kontrolü yok** | Var | UI yok, API açık |
| 16 | Referral (kayıt + kod) | `app/api/auth/register/route.ts:99-142`, `app/api/referral/route.ts:209-262` | Davet edilen 500, davet eden 1.000 | Kayıt anında | Var | Var |
| 17 | Referral kademe | `app/api/referral/route.ts:300-345`, `lib/referral-milestones.ts:20-25` | 200/400/1.000/3.000 | Bir kez | Var | Var |
| 18 | Doğum günü | `app/api/birthday/route.ts:155-230` | 500 | Yılda 1 | Var | Var |
| 19 | Sezonsal challenge | `app/api/customer/seasonal-event/route.ts:111-185` | Kampanya başına | Bir kez | Var | Var |
| 20 | Klan savaşı ödemesi | `lib/gamification-engine.ts:47-115` | Escrow havuzu (net sıfır) + **mint XP** | Savaş başına | Var | Var |
| 21 | Klan hazinesi | `lib/gamification-engine.ts:143-162` | Feedback puanının %10'u (ek mint) | Feedback başına | — | "XP" diye gösteriliyor |
| 22 | Admin manuel puan | `app/api/admin/users/route.ts:399-431` | Sınırsız, negatif olabilir | — | **YOK** | Admin |
| 23 | Otomasyon | `lib/users-automation/engine.ts:44-86` | Kurala göre | — | Pozitifte var | Admin |

### 2.3 Harcama yolları (sink)

| Sink | Dosya | Özellik | Sorun |
|---|---|---|---|
| Kozmetik mağaza | `app/api/customer/shop/route.ts:67-140` | 35–10.000 puan, **tek seferlik** sahiplik | Sonlu; tüm katalog alınınca sink biter; POST `isActive` kontrol etmiyor |
| Kozmetik hediye | `app/api/customer/shop/gift/route.ts` | Aynı fiyat | — |
| Ödül (Reward) | `app/api/gamification/rewards/route.ts:204-370` | 300–1.000 (seed), stok −1 = sınırsız | **Kod üretiliyor ama hiçbir yerde kullanılmıyor** (`claimedAt` asla set edilmez) |
| Rozeti puanla açma | `app/api/gamification/badges/[id]/unlock/route.ts` | `pointCost` | "Tam sürpriz politikası" gereği müşteri kilitli rozeti göremiyor → fiilen erişilemez |
| Bağış | `app/api/customer/donations/route.ts:171-245` | Serbest miktar | Dış değeri/karşılığı belirsiz |
| Klan savaşı havuzu | `app/api/customer/squads/challenge/route.ts:96-135` | Escrow | Transfer; yok etmiyor |

### 2.4 İlerleme ve statü motorları

- **Seviye**: kanonik formül geometrik; ama UI'a giden üç endpoint üç farklı lineer formül kullanıyor (Bulgu O1).
- **Lig**: 7 kademe, 0–100.000 aralığı, bakiye bazlı (Bulgu Y3).
- **Rozet motorları (5)**: `lib/activity-badges.ts` (davranışsal), `lib/surprise-badges.ts` (requirement sayaçları + "yaklaşık" eşleme), `lib/character-badges.ts` (AI kategori + eşik), seasonal-event özel rozet, `progress` POST (self-award) + `unlock` (satın alma) + admin atama.
- **Seriler (4–5)**: login (`User.loginStreak*`), loyalty (`UserStreak`, yetim), mini oyun (`GameStreakClaim` + hesaplama), `gamification/progress` içinde feedback'ten hesaplanan seri (`route.ts:83-99`), `customer/games/streak`.
- **Başarım kavramları (3)**: Quest tablosundaki SPECIAL kayıtlar (`lib/achievements.ts`), hesaplanan oyun başarımları (`lib/game-achievements.ts`, puan yok), karakter koleksiyon başarımları (`lib/character-achievements.ts`, puan yok).

### 2.5 Ayar düğmeleri (admin) — dağınık

`/admin/points-matrix` (feedback, review, referral, doğum günü, **loyalty seri**, quest varsayılanı, çark) · `/admin/league-settings` · `/admin/gamification-settings` (çarpanlar + 4 yazılıp okunmayan alan) · `/admin/games` (oyun başı ödül) · `/admin/seasonal-campaigns` · `/admin/character-thresholds` · `/admin/economy-sim` (oyuncak hesap). **Kodda gömülü (admin'den değiştirilemez)**: sürpriz kutu 50–250, login seri taşları, turnuva ödülleri, referral kademeleri, rozet ödül puanları (metin tablolarında), bayi pasif %5 ve 1.000 tavan, klan hazinesi %10, savaş XP oranı 0.5.

### 2.6 Fraud / gözlem katmanı

- `lib/points-caps.ts` — yalnız `feedback` kategorisine cap.
- `lib/points-velocity.ts` — 24 saatte ≥500 puan → liderlikte `needsReview` etiketi; **hiçbir aksiyon yok**.
- `lib/fraud/engine.ts` — `checkFraudulentActivity` / `shouldApplyReward` **hiçbir yerden çağrılmıyor** (ölü kod).
- `lib/trust-score.ts` — feedback'i işaretler; puanı etkilemez.
- Veri kaynağı: `AnalyticsEvent` — `lib/analytics-event-retention.ts:9` ile 90 günde silinir (inngest `analytics-event-cleanup`, `lib/inngest/functions.ts:135-139`).

---

## 3. Bulgular (önem sırasıyla)

Önem: **Kritik** = sınırsız/bedava değer basma veya ekonomiyi tek başına çökertebilecek açık · **Yüksek** = yapısal hata, kullanıcıyı doğrudan etkiler · **Orta** = tutarsızlık/yarım özellik · **Düşük** = hijyen.
Efor: S ≤ 1 gün · M 2–4 gün · L 1–2 hafta · XL > 2 hafta.

---

### K1 — Bayi, sınırsız happy-hour çarpanıyla görünmez ve sınırsız puan basabiliyor · **Kritik** · Efor: S (hotfix) + M (kalıcı)

**Kanıt**
- `app/api/happy-hour/route.ts:121` — `multiplier` gövdeden şema doğrulaması olmadan alınıyor; `:132` `multiplier: multiplier || 2.0` → üst sınır yok. Rol kontrolü yalnız DEALER/ADMIN (`:116`).
- `app/api/dealer/consumptions/route.ts:304-325` — `basePassivePoints = floor(baseXP × 0.05 × happyHourMultiplier)`; `BASE_XP_CAP=1000` çarpandan **önce** uygulanıyor, çarpanın kendisi sınırsız.
- `:338-349` — kredi **ham `points: { increment }`** ile; `creditPointsAndXp` yok, `points_credited` yok → `points-velocity` ve cap'ler bu puanı hiç görmüyor (bellekteki ekonomi değişmezi #3'ün ihlali).
- `:23` — sınır yalnız "5 tüketim/dk aynı kart+bayi" (günde ≈7.200).
- `:141-170` — kart yalnız `token` ile bulunuyor; kartın o bayiye ait olduğu kontrol edilmiyor (herhangi bir aktif kart).
- `lib/validations.ts:39` — kayıt şeması `role: 'DEALER'` kabul ediyor (bayi self-signup açık; ek onay kapısı olup olmadığı **doğrulanmadı**).

**Senaryo**: Bayi hesabı happy-hour'u `multiplier: 100000` ile açar → tek tüketim = 50 × 100.000 = 5.000.000 puan; dakikada 5 kez. Alıcı kendi müşteri hesabı veya anlaştığı müşteri. Velocity dedektörü sessiz kalır, liderlik bozulur, ödül stoğu boşaltılabilir. Aynı yol `Squad.totalPoints`'i de şişirir (klan sıralaması `app/customer/squads/page.tsx:41` bu alana göre).

**Öneri**
1. *Hotfix*: happy-hour POST/PATCH için zod şeması: `multiplier ∈ [1, 3]`, bayi başına aynı anda en fazla 1 aktif pencere. Mevcut kayıtlar için tek seferlik normalizasyon (DB'ye dokunmadan önce sahibiyle karar).
2. Pasif puanı `creditPointsAndXp` + `points_credited{category:'dealer_passive', dealerId}` ile aynı tx'e al; klan katkısını `addToSquadTreasury/addToActiveBattleScore` ile diğer kaynaklarla aynı kurala bağla.
3. **Bayi kaynaklı puan bütçesi**: müşteri×bayi×gün başına tavan (ör. 200) ve bayi başına günlük toplam mint bütçesi; aşımda puan "beklemede" (pending) ledger kaydına düşsün, admin onayı istesin.
4. Tüketim kaydında kartın o bayiye bağlı olup olmadığını (veya en azından müşterinin o bayide QR/konum kanıtı) kontrol et; çapraz-bayi tüketimi ayrı izinle.
5. Bayi başına anomali sinyali: "tek müşteriye günlük pasif puan > p99" → `fraudStatus='flagged'`.

---

### K2 — Müşteri her rozeti koşulsuz kendine verip `requirement.value` kadar puan alabiliyor · **Kritik** · Efor: S

**Kanıt**
- `app/api/gamification/progress/route.ts:151-153` — `POST` `requireAuth(['CUSTOMER','ADMIN'])`; gövdeden gelen `badgeId` ile çalışıyor.
- `:158-182` — yalnız "rozet var mı" ve `hiddenUntilEarned` kontrolü; **requirement değerlendirmesi yok, `isActive` kontrolü yok, karakter rozeti hariç tutulmuyor**.
- `:199-216` — `userBadge.create` + `points = requirement.value || 100`, `xp = points/2`.
- `prisma/seed.ts:120,164` — örnek: `badge-efsane` (value 5.000), `badge-pablo-escobar` (value 10.000); ID'ler tahmin edilebilir (`badge-<slug>`).
- `app/api/gamification/badges/route.ts:85-87,270-274` — oturumsuz/`userId`siz çağrıda tüm aktif, gizli-olmayan rozetler ID'leriyle listeleniyor (ID toplama).
- Bu endpoint'i hiçbir UI çağırmıyor (grep: `gamification/progress` yalnız yorum satırında).

**Senaryo**: Müşteri, rozet listesini çekip her ID için tek POST atar → onlarca rozet + toplam on binlerce puan + XP (seviye/lig sıçraması). Gizli olmayan rozetlerin sayısı üretimde **doğrulanmadı**; seed'deki 60 rozetin tamamı açık olsa toplam ≫ 50.000 puan.

**Öneri**
- *Hotfix*: POST'u kaldır ya da `requireAuth(['ADMIN'])` yap. Admin atamasında ödül kuralı `badgeRewardPoints()` (tek kaynak) olsun; `requirement.value` asla puan olarak kullanılmasın.
- Kalıcı: rozet verme tek bir `awardBadge(tx, userId, badgeId, reason)` fonksiyonundan geçsin (bkz. Hedef Mimari §5.4); müşteri tarafından tetiklenebilen hiçbir rozet API'si olmasın.

---

### Y1 — Otomatik tamamlanan görevler "Ödülü al" ile ikinci kez ödeniyor · **Yüksek** · Efor: S

**Kanıt**
- `lib/achievements.ts:114-147` — başarım tamamlanınca **otomatik** `creditPointsAndXp` + `completedAt`; audit eylemi `COMPLETED_ACHIEVEMENT` (`:160-165`).
- `lib/visit-missions.ts:108-125` — ziyaret görevi tamamlanınca **otomatik** kredi + `completedAt`; audit yok.
- `app/api/gamification/quests/[id]/claim/route.ts:73-96` — claim, `completedAt` doluysa "tamamlanmış" sayar ve tekrar ödemeyi yalnız `auditLog.action='CLAIM_QUEST_REWARD'` varlığıyla engeller → otomatik ödenmiş görev **ikinci kez** ödenir.
- `app/api/gamification/quests/route.ts:62-89` — liste `claimed`'i aynı audit'ten hesaplar → UI (`app/customer/quests/page.tsx:247-278`) bu görevlerde aktif "Ödülü al" düğmesi gösterir. Yani **kötü niyet gerekmez**.

**Ek sorunlar**: başarım ilerlemesi tx dışında okunup koşulsuz yazılıyor (`lib/achievements.ts:92-122`) → iki eşzamanlı ilerleme çift ödeme yapabilir; claim'in tek-kez garantisi bir log tablosuna (`AuditLog`) emanet.

**Öneri**
- `UserQuest`'e `rewardedAt DateTime?` ekle; *tüm* ödeme yolları (claim, achievement, visit) `updateMany({ where:{id, rewardedAt:null}, data:{rewardedAt:now} })` guard'ı ile ödesin; `count===0` → ödeme yok. Liste `claimed = !!rewardedAt` olsun.
- Görev tipine göre akış ayrımı: `autoReward` görevlerde UI "Tamamlandı ✓" göstersin, claim düğmesi olmasın.
- Geçmişte çift ödenmiş kayıtların tespiti (salt-okuma rapor sorgusu) ve geri alma kararı ürün sahibine.

---

### Y2 — Kaynak/harcama dengesi yok: yapısal hiperenflasyon · **Yüksek** · Efor: L

**Kanıt (kod değerlerinden hesap)**
- Mini oyunlar: 20 registry oyunu + Pacman ödülleri toplamı ≈ **3.250 puan/gün** (`lib/minigame-config.ts:13,82-351`); skor client'tan geliyor, sunucu yalnız eşik + min. süre (8–12 sn) kontrol ediyor (`app/api/customer/games/[game]/complete/route.ts:80-88`, `lib/minigame-config-effective.ts:107-116`). Scriptle oynamak önemsiz.
- Sürpriz kutu ort. 150/gün koşulsuz (`app/api/surprise-box/route.ts:22`); çark ort. ≈25/gün (`lib/points-rules.ts:87-95`); feedback 500/gün cap.
- Rozet ödülleri: karakter rozetleri toplam **185.000**, tekil 2.500–10.000 (`lib/character-reveal-texts.ts`), emoji rozetleri 33.700 (`lib/emoji-badge-texts.ts`). Karakter eşiği varsayılan 6 yorum (`lib/character-thresholds.ts:5-6`) → 6 tüketim yorumu ≈ 10.000 puan; rozet ödülleri cap dışı.
- Turnuva: 21 oyun × 950 = haftada 19.950 puan dağıtım kapasitesi (`lib/tournament-core.ts:13`).
- Buna karşılık ödüller 300–1.000 puan (`prisma/seed.ts:327-372`), kozmetikler 35–10.000 ve **tek seferlik** (`UserCosmetic @@unique([userId, cosmeticId])`, `prisma/schema.prisma:585-602`).
- Kaba tahmin: optimize eden tek oyuncu ≈ **100.000+ puan/ay**; tüm kozmetik kataloğu birkaç haftada biter, sonrasında anlamlı tekrarlayan sink yok.
- `app/api/admin/economy-sim/route.ts:22-56` — simülasyon yalnız feedback+quest+çark'ı hesaplıyor, sink hiç yok, gerçek veri kullanmıyor.
- `app/api/admin/*` içinde para arzı (toplam bakiye, günlük mint/burn) gösteren hiçbir uç yok (grep `_sum: { points` → yalnız bağış/referral).

**Etki**: Puan anlamsızlaşır; liderlik oyuncu hilesi ölçer; gerçek değerli ödül (kupon/fiziksel) eklendiği gün ekonomi istismar edilir. Lig sistemi bir ayda tavana dayanır (Y3).

**Öneri**
- **Ekonomi bütçesi**: hedef "medyan aktif kullanıcı ayda X puan kazanır, Y puan harcar" tanımı (ör. kazanç ≈ 6.000/ay, ödül fiyatları buna göre 1.500–15.000).
- Kaynak başına günlük tavan + **global günlük kazanç tavanı** (tüm kategoriler), ledger'dan hesaplanır (bkz. §5).
- Mini oyun ödüllerini "günde ilk 3 oyun tam ödül, sonrası azalan" eğrisine çek; ödül/XP'yi oyun başı 15–40 bandına indir; oyunu XP/eğlence motoruna dönüştür, puanı değil.
- Rozet ödüllerini nadirlik bazlı sabit banda indir (common 50 · rare 150 · epic 400 · legendary 1.000) ve tek tabloya taşı.
- **Tekrarlayan sink'ler** (bkz. §5.6): seri dondurma bileti, turnuva giriş ücreti, sezonluk kozmetik rotasyonu, bayi-fonlu gerçek ödüller, bağışta platform eşleşmesi.
- `economy-sim`'i ledger'dan beslenen "Ekonomi Paneli"ne dönüştür: günlük mint/burn, kaynak dağılımı, para arzı, medyan bakiye, Gini, ilk %1'in payı.

---

### Y3 — Lig ve VIP harcanabilir bakiyeye bağlı; 100.000 üstü "Başlangıç"a düşüyor · **Yüksek** · Efor: S (hata) + M (yeniden tasarım)

**Kanıt**
- `lib/league-rules-core.ts:36` — son kademe `maxPoints: 100000`; `:74-78` `find(p >= min && p <= max) ?? list[0]` → **100.001 puanda lig = BASLANGIC**. Y2'deki kazanım hızıyla bu birkaç haftada olası.
- `:91` — ilerleme `maxPoints >= 100000` ise 100 sabitleniyor; liderlik `app/api/leaderboard/route.ts:108-125,195-210` aynı fonksiyonu kullanıyor.
- Lig bakiyeden: mağazada 5.000 harcayan kullanıcı ligden düşer → harcama cezalandırılıyor, sink'ler daha da işlevsizleşiyor. An Motoru'ndaki `league:<toKey>` ömür boyu bir kez dedupe'u bu yüzden "düşüp yeniden çıkma"yı gizliyor; ama sorun ekonomide.
- İstemci lig hesapları admin kurallarını değil `DEFAULT_LEAGUE_RULES`'u kullanıyor: `lib/utils.ts:142-159`, `components/customer/dashboard/customer-dashboard.tsx:420-422,1326`, `app/customer/leaderboard/page.tsx:99`, `app/customer/rewards/page.tsx:241` (üstelik oturumdaki bayat `session.user.points` ile). Admin ligleri değiştirirse dashboard ile liderlik farklı lig gösterir.
- VIP: `app/api/vip/route.ts:38-58` güncel bakiyeden kademe atıyor; `lifetimePoints` alanına güncel bakiye yazılıyor; düşüşte de "VIP Seviye Yükseltme!" bildirimi; bu endpoint'in UI tüketicisi yok → `lib/vip-multiplier.ts` ve VIP lounge (`app/api/customer/lounge/route.ts:81`) fiilen ölü.

**Öneri**
- *Hotfix*: son kademe açık uçlu (`maxPoints = Infinity`/`null`), `getLeagueMetaFromRules` fallback'i "en yakın alt kademe".
- **Lig = sezonluk XP** (veya `lifetimeEarned`), harcamadan bağımsız; sezon (ör. 8 hafta) sonunda yumuşak sıfırlama (bir alt kademeye düşür) + sezon sonu ödülü. Bu, retention için asıl haftalık/aylık hedefi verir.
- **VIP = son 90 gün kazanılan puan** (ledger'dan), günlük job ile atanır; düşüş/yükseliş ayrı bildirim.
- Lig/VIP hesaplaması tek sunucu fonksiyonu; istemciye API'den `league` nesnesi gelsin, istemci kendi hesaplamasın. An Motoru'nun `league_up` an'ı bu yeni tanıma bağlanmalı (spec'teki "bakiye" varsayımı güncellenmeli).

---

### Y4 — Sahtekârlık kontrolleri uygulanmıyor; "defter" 90 günde siliniyor · **Yüksek** · Efor: M

**Kanıt**
- `lib/points-velocity.ts:41-69` → yalnız `app/api/leaderboard/route.ts:131,192,253,324`'te `needsReview` etiketi; kazanım engellenmiyor, liderlikten çıkarılmıyor.
- `lib/fraud/engine.ts:18-97` — `checkFraudulentActivity`, `shouldApplyReward` hiçbir yerden çağrılmıyor; `fraudStatus` yalnız admin ekranlarında okunuyor (`app/admin/fraud-prevention/page.tsx:24-29`). Admin "gölge ban" sayısını görüyor ama gölge banlı kullanıcı kazanmaya devam ediyor.
- `lib/trust-score.ts:117-124` — şüpheli yorumu işaretliyor, puan akışına girmiyor; `app/api/feedbacks/route.ts:266-279` puanı trust sonucundan bağımsız veriyor.
- Admin spam yorumu silince (`app/api/admin/feedbacks/route.ts:368` soft delete) puan geri alınmıyor.
- `lib/analytics-event-retention.ts:9,17-27` + inngest cleanup → `points_credited` 90 günde silinir. Cap (haftalık), velocity ve `app/api/customer/my-year/route.ts:66-70` ("Benim Yılım" kazanılan puan) bu geçici tabloya dayanıyor; yıllık rapor en fazla son 90 günü sayar.
- `app/api/customer/my-year/route.ts:72-76` — `points_spent` okunuyor ama **hiçbir yerde yazılmıyor** (grep tek sonuç) → "harcanan" daima 0.
- `XP` hiçbir kaynakta cap'li değil: feedback'te `xpToCredit` cap'ten bağımsız (`app/api/feedbacks/route.ts:318`); `GamificationSettings.dailyXpCap` okunuyor ama uygulanmıyor (`lib/gamification-settings.ts:26-33`, kullanım yok).

**Öneri**
- Kalıcı **PointsLedger** (retention dışı) — §5.1.
- `economy.grant()` içinde zorunlu fraud kapısı: `fraudStatus==='shadow_ban'` → ledger'a `status:'void'` yaz, kullanıcıya başarı göster (gölge ban'ın tanımı bu); `flagged` → `pending` (24–72 saat bekleme, admin onayı); velocity eşiği aşılırsa otomatik `pending`.
- Moderasyonla silinen içerik → ledger'da ters kayıt (clawback), bakiye eksiye düşmeyecek şekilde (`max(0)`), kullanıcıya şeffaf bildirim.
- XP için de günlük tavan (`dailyXpCap`'i gerçekten uygula).

---

### Y5 — Referral sybil açığı: ödül e-posta doğrulamasından önce, limitler kayıt yolunda yok · **Yüksek** · Efor: S–M

**Kanıt**
- `app/api/auth/register/route.ts:90-97` kullanıcı doğrulanmamış; `:99-142` aynı istekte referral `COMPLETED` + davet edene 1.000 / davet edilene 500 puan.
- Kayıt yolu yalnız `maxUsage`'a bakıyor (`:105-106`); `POST /api/referral` ise platform ömür boyu ve aylık limitleri uyguluyor (`app/api/referral/route.ts:166-188`). İki yol tutarsız.
- Tek sınır IP başına 5 kayıt/dk (`register/route.ts:14`). Kademeler 25 davette toplam +4.600 (`lib/referral-milestones.ts:20-25`); kademe sayımı doğrulanmamış hesapları da sayıyor (`app/api/referral/route.ts:300-303`).

**Öneri**
- Referral'ı iki aşamalı yap: kayıtta `PENDING`; davet edilen e-postasını doğrulayıp **anlamlı ilk aksiyonu** (ör. ilk feedback/tüketim) yapınca `COMPLETED` + ödül (aynı tx, `updateMany` guard).
- Limit kontrolünü tek fonksiyona çıkar (`assertReferralAllowed`) ve iki yoldan da çağır.
- Cihaz/IP kümelemesi: aynı IP/cihazdan gelen davetler için kademe sayımına dahil etmeme.

---

### Y6 — Puan → ödül döngüsünün sonu yok: ödül kodları ve kuponlar hiçbir yerde kullanılmıyor · **Yüksek** · Efor: L

**Kanıt**
- `app/api/gamification/rewards/route.ts:257,309-315` — ödül talebinde `UserReward.code` üretiliyor; `claimedAt` hiçbir yerde set edilmiyor (grep), `isUsed` daima false (`:106-107`). Bayi tarafında kod doğrulama ucu yok.
- `app/api/customer/redeem-coupon/route.ts` — kupon "tanımlandı" deniyor ama `CouponRedemption`'ı tüketen hiçbir akış yok (grep); `fixed` tipte "puanlık/tutarlık indirim" mesajı belirsiz ve puan da vermiyor.
- `perUserLimit` kontrolü tx içinde ama sayım-sonra-ekle (Read Committed) → eşzamanlı iki talep limiti aşabilir (`rewards/route.ts:276-288`).

**Etki**: Kullanıcının puan biriktirme motivasyonunun nihai karşılığı ("bu puanla ne alırım?") boşlukta. Retention döngüsünün "ödül" halkası kopuk.

**Öneri**
- **Bayi-fonlu ödül kataloğu**: `Reward.dealerId` (opsiyonel), bayi kendi ödülünü (ör. "ücretsiz kahve = 2.000 puan") ve aylık stok/bütçesini tanımlar. Müşteri talep eder → kısa ömürlü (ör. 15 dk) QR/kod → bayi panelinde/staff uygulamasında okut → `claimedAt` + `claimedByStaffId` (atomik `updateMany where claimedAt null`). Kullanılmayan kod süre sonunda iade (ledger ters kayıt) veya geçersiz.
- Kuponu ya ödül akışına birleştir ya kaldır; "tanımlandı ama hiçbir şey olmuyor" durumu kalmasın.
- `perUserLimit` için `@@unique([userId, rewardId, periodKey])` veya kullanıcı-ödül advisory lock.

---

### O1 — Kurallar arası tutarsızlık: seviye formülleri, liderlik puanı, çarpanlar · **Orta** · Efor: M

**Kanıt**
- Seviye ilerlemesi 4 farklı formül: kanonik geometrik `lib/utils.ts:94-135`; `app/api/customer/stats/route.ts:86-90` lineer `level×1000` (progress-hub ve rewards sayfası bunu kullanıyor: `app/customer/progress-hub/page.tsx:53`, `app/customer/rewards/page.tsx:141`); `app/api/gamification/progress/route.ts:71-73` kümülatif `level×1000`; `app/api/customer/trends/route.ts:265-269` `xp % 1000` ve `avgDailyXP = toplamXP/30` (yanlış).
- Haftalık/aylık liderlik **sentetik puan**: `app/api/leaderboard/route.ts:299-306` `CASE WHEN length(text) > 50 THEN 100 ELSE 50` — matrisi, cap'i, oyunları, yorumları yok sayıyor; eşik `>50` vs matris `>=50` (`lib/points-rules.ts:269`); silinmiş feedback filtrelenmiyor. Cap puanı durduruyor ama **sıralamayı durdurmuyor** → spam yorum liderliği kazanıyor.
- Çarpanlar yalnız feedback (`app/api/feedbacks/route.ts:313-317`) ve bayi pasif puanında; "platform geneli" `pointMultiplier` diğer 20+ kaynağa uygulanmıyor. Happy-hour müşteriye "2x" gösteriliyor ama tüketim yorumuna uygulanmıyor.
- Tüketim yorumu cap'i Serializable olmadan (`app/api/customer/consumptions/[id]/review/route.ts:172-187`) — feedback yolunun kapattığı cap yarışı burada açık; ayrıca klan savaşı skoruna/hazineye katkı yok.
- `GamificationSettings.levelUpRewardBase`, `isSeasonActive`, `seasonName`, `seasonEndsAt`, `dailyXpCap` admin'den yazılıyor, hiçbir kazanç yolunda okunmuyor (`app/api/admin/gamification/settings/route.ts:58-62`).
- Feedback yanıtındaki `xp` çarpansız taban değer (`app/api/feedbacks/route.ts:365`), krediye giden ise çarpanlı.

**Öneri**: Tek `progression.ts` modülü (`levelFromXp`, `levelProgress`, `leagueFromSeasonXp`) ve bunu kullanan tek `GET /api/customer/progression` DTO'su; diğer uçlar bu DTO'yu döndürsün. Haftalık liderlik ledger'dan "bu hafta kazanılan puan/XP" ile hesaplansın. Çarpanlar `economy.grant()` içinde politika olarak uygulanır (kaynak başına "çarpan uygulanır mı" bayrağı). Write-only ayarlar ya bağlansın ya admin UI'dan kaldırılsın.

---

### O2 — Seri (streak) parçalanması; yetim loyalty serisi hâlâ puan basıyor · **Orta** · Efor: M

**Kanıt**
- Ayrı seri sistemleri: `lib/login-streak.ts` (UI: `components/customer/login-streak-card.tsx:43`), `app/api/streak/route.ts` (UserStreak; **UI tüketicisi yok**), mini oyun serisi (`complete/route.ts:116-151` + `app/api/customer/games/streak`), `gamification/progress` içindeki feedback serisi (`route.ts:83-99`, `longestStreak: currentStreak // Simplified`).
- `/admin/points-matrix` "seri" bölümü (`app/admin/points-matrix/page.tsx:37,61,175,241`) yetim loyalty serisini yönetiyor; kullanıcının gördüğü login serisi kodda sabit (`lib/login-streak.ts:25-30`). Admin değiştirdiği ayarın etkisini göremez.
- Yetim endpoint API ile çağrılırsa 365 günde 18.850 puan veriyor ve kilometre taşları seri her yeniden kurulduğunda tekrar ödeniyor (`app/api/streak/route.ts:157`).
- Loyalty hesap hatası: `daysDiff = floor(saat/24)` (`:149-153`) → 1. gün 23:59 ile 3. gün 00:01 arası 24 sa 2 dk → "ardışık" sayılır.
- Dondurma bileti (`streakFreezes`) hiçbir yerde verilmiyor/satılmıyor (yalnız `:111-119`), azaltım guard'sız.
- Login serisinin kilometre taşları **ömürde bir kez** (`claimedMilestones`) — 30 günden sonra serinin ekonomik bir anlamı kalmıyor; kullanıcıya bu anlatılmıyor.
- `active_days` ve `streak` tipli rozetler `UserStreak`'e bağlı (`lib/surprise-badges.ts:34`) → UI kullanıcısı için hiç ilerlemez.

**Öneri**: Tek "Günlük Aktivite Serisi" (gün = UTC veya kullanıcı TZ'i, tanım: o gün en az bir "anlamlı aksiyon" — feedback/yorum/oyun/kutu). Kilometre taşları **döngüsel** (her 7 günde küçük ödül, 30/100/365'te büyük, ömürde bir kez olanlar ayrı "rekor" rozeti). Dondurma bileti mağazada puanla satılır (tekrarlayan sink) ve haftada 1 ile sınırlı. `/api/streak` ve oyun serisi bu çekirdeğe göç eder, eski uç kapatılır.

---

### O3 — Rozet motorları çelişiyor; kullanıcıya yanlış kural anlatılıyor; başka kullanıcının verisi açık · **Orta** · Efor: M

**Kanıt**
- Aynı rozet iki motorda farklı anlamda: `badge-firtina` seed'de "7 gün üst üste" (`prisma/seed.ts` 124. satır civarı, `req.type:'streak'`), `lib/activity-badges.ts:196-203`'te "1 saatte yoğun yorum patlaması"; `badge-konuk-oyuncu` seed "ilk kez yeni işletme", aktivite motorunda "uzun üyelik + seyrek katkı" (`:209-212`); `badge-filiz` seed "7 günlük hesap", motor "yeni üye + hızlı katkı" (`:205-207`). `surprise-badges` "yaklaşık" eşlemesi (`lib/surprise-badges.ts:73-80`) detaylı/faydalı gibi rozetleri ham yorum sayısına bağlıyor.
- Ödül puanı iki kaynaktan: `badgeRewardPoints()` metin tabloları (`lib/badge-reward-points.ts:25-31`) vs `requirement.value` (`app/api/gamification/progress/route.ts:211`) ve UI'da `points: targetValue` (`app/api/gamification/badges/route.ts:241`; `app/customer/badges/badges-client.tsx:197` "Toplam Puan" bunu toplar → yanlış sayı).
- "Tam sürpriz politikası" müşteriye yalnız kazanılmış rozetleri gösteriyor (`badges/route.ts:263-274`) ama sayfa metni hâlâ "Bazı rozetler 'X puan ile aç' butonuyla açılabilir" diyor (`messages/tr.json:3524-3525`, `badges-client.tsx:247-259`) → vaat edilen özellik erişilemez.
- `GET /api/gamification/badges?userId=<herhangi>` oturum gerektirmeden o kullanıcının kazanılmış rozetlerini, puanını, seviyesini döndürüyor (`badges/route.ts:79-87,155-181,281-287`); `GET /api/gamification/quests?userId=<herhangi>` benzer (`quests/route.ts:19-21`).

**Öneri**: Kod-tanımlı **BadgeRule kayıt defteri** (`badgeId → { evaluator, description, rewardTier }`); `Badge.requirement` ve açıklama bu defterden üretilir, motorlar tek değerlendiriciye iner (olay-güdümlü, §5.5). Sürpriz politikası korunacaksa "puanla aç" metni ve `unlock` ucu kaldırılır ya da "Rozet Dükkânı" ayrı, görünür bir ürün olarak tasarlanır. `userId` parametresi yalnız `me` (veya ADMIN) kabul etsin; herkese açık profil gerekiyorsa açık rızalı, alan-kısıtlı ayrı DTO.

---

### O4 — Görev sistemi yarım: "custom" görevler hiç ilerlemiyor, günlük/haftalık sıfırlama yok · **Orta** · Efor: M–L

**Kanıt**
- Admin formu `requirementType: 'custom'` ("elle ilerletilir") ve `type: 'daily'` öneriyor (`app/admin/quests/page.tsx:81-93,118-130`), ama `UserQuest.progress`'i yazan yalnız başarımlar ve ziyaret görevleri (grep: `lib/achievements.ts`, `lib/visit-missions.ts`). "give_feedback" gibi bir görevi ilerleten kod yok.
- `UserQuest @@unique([userId, questId])` (`prisma/schema.prisma:664-678`) ve sıfırlama job'u yok → "günlük" görev ömürde bir kez tamamlanabilir; `type` yalnız etiket.

**Öneri**: Olay-güdümlü görev motoru (§5.5): `requirement = { event: 'feedback_created' | 'review_created' | 'game_won' | 'visit' ..., count, filter }`; `UserQuest`'e `periodKey` (gün/hafta) eklenip unique `(userId, questId, periodKey)`; günlük/haftalık görev havuzundan kullanıcıya her gün 3 görev atanması (rotasyon). Admin formu yalnız motorun desteklediği olayları sunsun.

---

### O5 — Klan ekonomisi: skor yalnız feedback'ten, hazine harcanamıyor, haftalık hedef ödülsüz · **Orta** · Efor: M

**Kanıt**
- Savaş skoru yalnız feedback yolunda (`app/api/feedbacks/route.ts:327-329`); oyun, yorum, görev katkı vermiyor — kural kullanıcıya anlatılmıyor.
- Hazine (`treasuryPoints`) her feedback'te %10 **ek** mint (`lib/gamification-engine.ts:154-157`); harcama yolu yok; UI'da "XP" olarak gösteriliyor (`app/customer/squads/page.tsx:166`).
- `Squad.totalPoints` (sıralama ölçütü) bayi pasif puanı ve savaş ödemesinden besleniyor (`app/api/dealer/consumptions/route.ts:336-343`, `lib/gamification-engine.ts:91-95`) — üye katkısını değil.
- Haftalık hedef yalnız gösterim (`app/api/customer/squads/weekly-goal/route.ts:44-67`); tamamlanınca ödül yok.
- Meydan okuyan havuzu tek başına fonluyor, karşı taraf risksiz (`squads/challenge/route.ts:117-118`); savaş XP'si escrow dışı mint (`lib/gamification-engine.ts:55`).

**Öneri**: Klan katkısı = ledger'daki tüm "aktivite" kaynaklarının (bayi pasifi hariç) toplamı, haftalık sezon; hazine = ortak sink (klan kozmetiği, klan ödülü, savaş havuzu fonlama). Savaşta iki taraf da eşit pay yatırsın (gerçek bahis). Haftalık hedef tamamlanınca tüm üyelere küçük ödül + an. Kurallar klan sayfasında açıkça.

---

### O6 — Turnuva skoru client'tan ve tavanlı: zirvede beraberlik, rastgele kazanan · **Orta** · Efor: M

**Kanıt**: Turnuva sıralaması `MiniGameSession.starsCollected` = client skoru `maxScore`'a sıkıştırılmış (`complete/route.ts:58-59,99-104`; `tournament/route.ts:28-39`). Script ile herkes `maxScore` yapar → `groupBy … orderBy _max desc take 100` beraberlikte belirsiz sıra; GET ve POST farklı sıralama görebilir. Günde oyun başına 1 oturum olduğundan ilk 3'ü "en çok gün oynayan" bile değil, şans belirliyor.

**Öneri**: Turnuva skoru ayrı ve sunucu-türevli olsun (süre, hamle sayısı, deterministik tohumlu seviye + doğrulanabilir olay günlüğü) veya beraberlik kuralı açık (önce ulaşan kazanır: `completedAt` asc). Hile tespiti: imkânsız süre/skor oranları. Ödül, sezonluk lig puanına/rozete dönüşsün; puan ödülü küçültülsün.

---

### O7 — Kullanıcıya anlatılmayan kurallar · **Orta** · Efor: M

**Kanıt**
- Günlük/haftalık cap hiçbir yerde anlatılmıyor; cap dolunca bildirim de yok (`app/api/feedbacks/route.ts:372-381` yalnız `>0` iken bildirim). `messages/tr.json`'da cap metni yalnız admin tarafında (`:4041`).
- Puan kazanma rehberi yok (grep "nasıl puan" → yalnız rozet kartı). Savaş skoru kuralı, login seri taşlarının ömürde bir kez olması, ligin bakiyeye bağlı olup harcayınca düşmesi, turnuvanın beraberlik kuralı anlatılmıyor.
- Bakiye üç kaynaktan gösteriliyor: DB (stats), JWT oturumu (`lib/auth.ts:241,275,289` — `update()` ile istemci tarafından değiştirilebilir; yalnız gösterim etkileniyor), API yanıtları.

**Öneri**: Ekonomi politikasından **otomatik üretilen** "Puan Rehberi" sayfası (kaynak, miktar, günlük tavan, kalan hak); her kazanım için "neden bu puan" makbuzu (ledger satırı); "Cüzdan geçmişi" sekmesi; cap'e yaklaşınca nazik uyarı ("Bugün feedback'ten 400/500 puan kazandın"). Oturumdaki `points` alanı kaldırılsın veya yalnız sunucudan yenilensin (istemci `update` ile set edemesin).

---

### D1 — Admin/otomasyon manuel puanı denetimsiz · **Düşük** · Efor: S

`app/api/admin/users/route.ts:43-48` `amount: z.number()` (sınırsız, ondalık → Int sütununda 500), `:401-404` ham increment, negatifte bakiye eksiye düşebilir, `points_credited` yok, tx yok. Otomasyonun negatif yolu da ham (`lib/users-automation/engine.ts:62-66`).
**Öneri**: `economy.adjust(adminId, userId, delta, reason)` → ledger `source:'admin_adjust'`, `int`, `[-100k, 100k]`, bakiye tabanı 0, 4-göz onayı (eşik üstünde).

### D2 — Küçük yarışlar ve kontroller · **Düşük** · Efor: S

- `lib/achievements.ts:92-122` tx dışı okuma (Y1'de çözülür).
- Mağaza POST `isActive` kontrol etmiyor (`app/api/customer/shop/route.ts:89-111`; hediye ediyor: `shop/gift/route.ts:39`).
- `streakFreezes` guard'sız azaltım (`app/api/streak/route.ts:111-122`).
- Hediye alıcısı e-posta **veya** ad ile aranıyor → e-posta varlık kahini (`shop/gift/route.ts` 67-73. satırlar civarı).
- Çark/kutu rol kısıtı tutarsız (çarkta rol kontrolü yok, `spin/route.ts:36-39`).

### D3 — Retention döngüsünde hatırlatma yok · **Düşük** · Efor: M

`lib/customer-reminders.ts` yalnız "pasif kullanıcı" ve "eksik yorum" dürtmeleri yapıyor; seri kırılmak üzere, açılmamış kutu, turnuva bitiyor, görev süresi doluyor, klan savaşı son saat gibi tetikleyiciler yok. (Gösterim tarafı An Motoru'nda; bu, *zamanlama/dürtme* tarafı.)

---

## 4. Retention Döngüsü Değerlendirmesi

Sağlıklı bir döngü: **Tetik → Aksiyon → Değişken ödül → Yatırım (biriktirme/statü) → tekrar**.

| Halka | Mevcut | Kopukluk |
|---|---|---|
| Tetik | Push merkezi, dashboard kartları | Seri/kutu/turnuva/görev bitiş dürtmeleri yok (D3) |
| Aksiyon | Feedback, yorum, 21 oyun, çark, kutu | Oyunlar ana kaynak → ürünün asıl değeri (işletmeye geri bildirim) ekonomide ikincil |
| Değişken ödül | Kutu, çark, karakter reveal (güçlü) | Miktarlar ölçeksiz → "sürpriz" enflasyonla değersizleşiyor |
| Yatırım | Lig, seviye, koleksiyon, klan | Lig bakiyeye bağlı ve 1 ayda tavan; seviye eğrisi Lv7 sonrası duvar (20.781 XP) ama oyunlarla kolayca aşılıyor; VIP ölü |
| Karşılık | Ödül/kupon | Kodlar hiçbir yerde kullanılamıyor (Y6) |

Hedef: **ürünün kalbindeki davranışı** (gerçek ziyaret + kaliteli geri bildirim) ekonominin ana kaynağı yap; oyunları XP/eğlence/sezon motoru olarak konumla; gerçek, bayi-fonlu ödüllerle döngüyü kapat.

---

## 5. Hedef Mimari

### 5.1 Kalıcı defter: `PointsLedger`

```prisma
model PointsLedger {
  id           String   @id @default(cuid())
  userId       String
  currency     String   // 'POINTS' | 'XP' | 'SEASON_XP'
  delta        Int      // + kazanç, - harcama
  source       String   // 'feedback' | 'review' | 'game' | 'dealer_passive' | 'shop' | 'reward' | 'admin_adjust' | ...
  sourceRef    String   // idempotency anahtarı: feedbackId, sessionId, `quest:<id>:<periodKey>` ...
  status       String   @default("posted") // 'posted' | 'pending' | 'void' | 'reversed'
  balanceAfter Int?
  actorId      String?  // bayi/admin (kim tetikledi)
  meta         Json?
  createdAt    DateTime @default(now())

  @@unique([source, sourceRef, currency])
  @@index([userId, createdAt])
  @@index([source, createdAt])
  @@index([status])
}
```

- `@@unique([source, sourceRef, currency])` **tüm** tek-kez garantilerinin ortak mekanizması olur (AuditLog/AnalyticsEvent'e emanet edilen claim'ler biter).
- Retention dışı; `points_credited` geriye dönük uyum için bir süre paralel yazılır, sonra cap/velocity/my-year ledger'a taşınır.
- `User.points/xp` cache alanı olarak kalır; gece job'u `SUM(ledger)` ile mutabakat yapar, sapmayı raporlar.

### 5.2 Tek giriş noktası: `lib/economy/`

```
economy.grant(tx, { userId, source, sourceRef, points?, xp?, actorId?, meta? })
economy.spend(tx, { userId, sink, sourceRef, points })
economy.reverse(tx, { ledgerId, reason })
economy.adjust(tx, { adminId, userId, delta, reason })
```

`grant()` sırası: politika oku → kaynak/global günlük tavan (ledger'dan) → çarpanlar (kaynak izin veriyorsa) → fraud kapısı (`shadow_ban→void`, `flagged/velocity→pending`) → ledger insert (unique) → `User` atomik artış + level (bugünkü `creditPointsAndXp` mantığı içeride) → An Motoru `recordMoments` (seviye/lig) → `points_credited` (geçiş dönemi). Tüm 23 kaynak buna göç eder; **doğrudan `user.update({points})` lint kuralıyla yasaklanır** (ESLint `no-restricted-syntax` / özel kural).

### 5.3 Para birimleri ayrımı

- **Puan**: yalnız harcama için.
- **XP**: seviye (kalıcı).
- **Sezon XP**: lig (8 haftalık sezon, yumuşak sıfırlama).
- **VIP**: son 90 gün kazanılan puan (ledger'dan, günlük job).

### 5.4 Ekonomi politikası (tek yapılandırma)

`Settings['economy_policy']` (zod şemalı, sürümlü) — her kaynak için `{ points, xp, dailyCap, weeklyCap, multipliersApply, enabled }`, global günlük tavan, rozet nadirlik bandı, bayi bütçeleri, turnuva ödülleri, kutu aralığı. Tek admin sayfası: "Ekonomi Politikası" + ledger'dan beslenen "Ekonomi Paneli" (mint/burn, para arzı, kaynak payı, medyan bakiye, Gini, şüpheli kuyruk). Mevcut `points-matrix`, `gamification-settings`, oyun ödül override'ları bu modele göç eder.

### 5.5 Olay-güdümlü ilerleme

Uygulama olayları (`feedback_created`, `review_created`, `game_won`, `visit_recorded`, `box_opened`, `referral_completed`) tek `emitGameEvent()` ile yayınlanır (Outbox/inngest mevcut altyapısı: `lib/outbox.ts`). Abone motorlar: **Görev**, **Seri**, **Rozet (BadgeRule defteri)**, **Klan katkısı**. Her motor ödülü `economy.grant()` ile verir. Böylece "custom görev ilerlemiyor", "rozet iki motorda farklı" ve "savaş skoru yalnız feedback" sorunları kökten kapanır.

### 5.6 Anlamlı, tekrarlayan sink'ler

1. Bayi-fonlu gerçek ödüller + doğrulanabilir kullanım (Y6).
2. Seri dondurma bileti (haftada 1).
3. Turnuva/klan savaşı giriş ücreti (iki taraf).
4. Sezonluk kozmetik rotasyonu (sınırlı süre vitrin).
5. Bağışta platform eşleşmesi (her 1.000 puana gerçek bağış) — bağışa anlam kazandırır.
6. Profil/rozet vitrini özelleştirme yuvaları.

### 5.7 Şeffaflık katmanı

`/customer/wallet`: bakiye, ledger geçmişi (makbuz), bugün kalan haklar, "Puan Rehberi" (politikadan üretilir), lig/sezon kuralları. An Motoru bu sayfadaki satırlara bağlanabilir (her `badge`/`level_up` an'ının bir ledger referansı).

---

## 6. Adım Adım Geçiş Planı

### Faz 0 — Acil kapatma (1–2 gün, S)
1. Happy-hour çarpanı `[1,3]` zod sınırı (POST/PATCH) + bayi pasif puanını `creditPointsAndXp` + `points_credited{dealer_passive}` ile aynı tx'e alma + müşteri×bayi×gün tavanı (K1).
2. `POST /api/gamification/progress` → ADMIN-only veya kaldır; admin atamasında ödül = `badgeRewardPoints()` (K2).
3. `UserQuest.rewardedAt` + tüm ödeme yollarında guard; otomatik görevlerde claim düğmesini gizle (Y1). (Şema ekleme — canlı Neon'a migration sahibinin onayıyla.)
4. Lig son kademesini açık uçlu yap (Y3 hata kısmı).
5. Kayıt yolunda referral limitlerini uygula, ödülü e-posta doğrulamasına ertele (Y5).
6. `badges`/`quests` GET'te `userId` yalnız `me`/ADMIN (O3 gizlilik).
7. Salt-okuma tespit sorguları (ayrı, onaylı oturumda): olağandışı happy-hour çarpanları, `requirement.value` kadar badge kredisi, çift ödenmiş görevler.

### Faz 1 — Defter ve servis (1–2 hafta, L)
1. `PointsLedger` modeli (yalnız ekleme) + açılış bakiyesi kaydı (her kullanıcı için `source:'opening_balance'`).
2. `lib/economy` servisi; 23 kaynak + 6 sink'in göçü (en riskliden başla: bayi, rozet, görev, oyun).
3. ESLint kuralı: `user.update/updateMany` içinde `points|xp` yasak (economy modülü hariç).
4. Gece mutabakat job'u + sapma alarmı.
5. Cap/velocity/my-year'i ledger'a taşı; `points_spent` sorunu ledger ile kendiliğinden çözülür.

### Faz 2 — Statü yeniden tasarımı (1 hafta, M)
1. Sezon XP + sezonluk lig (yumuşak sıfırlama, sezon sonu ödülü).
2. VIP = 90 gün kazanç; günlük job; lounge'u bağla.
3. Tek `progression` modülü ve DTO; stats/trends/progress uçlarını buna çevir (O1).
4. An Motoru spec'indeki lig tanımını güncelle (bakiye → sezon XP).

### Faz 3 — Politika ve gözlem (1 hafta, M)
1. `economy_policy` ayarı + admin "Ekonomi Politikası" sayfası; eski matris/ayarların göçü, write-only alanların kaldırılması.
2. "Ekonomi Paneli" (ledger'dan): mint/burn, kaynak payı, para arzı, Gini, şüpheli kuyruk (pending onay).
3. Fraud kapısının `grant()`'e bağlanması; `lib/fraud/engine.ts`'in ya bağlanması ya silinmesi; moderasyon clawback'i.

### Faz 4 — Olay motoru: görev, seri, rozet, klan (2 hafta, L)
1. `emitGameEvent` + abone motorlar.
2. Tek Günlük Aktivite Serisi; `/api/streak` ve oyun serisi göçü; dondurma bileti.
3. BadgeRule defteri; aktivite/sürpriz motorlarının birleşmesi; rozet ödüllerinin nadirlik bandına çekilmesi.
4. Periyodik görevler (`periodKey`) + günlük görev rotasyonu.
5. Klan katkısı = ledger aktivite toplamı; hazine sink'leri; haftalık hedef ödülü.

### Faz 5 — Değer döngüsü ve şeffaflık (2 hafta, L)
1. Bayi-fonlu ödül kataloğu + QR ile kullanım + süre sonu iade (Y6); kuponun bu akışa birleşmesi.
2. Oyun ve turnuva ödüllerinin yeniden ölçeklenmesi (azalan getiri, sunucu-türevli turnuva skoru).
3. `/customer/wallet` + Puan Rehberi + cap göstergesi.
4. Retention dürtmeleri (seri riski, açılmamış kutu, turnuva bitişi) — push merkezi üzerinden, frekans tavanlı.

### Başarı ölçütleri
- Ledger ile `User.points` arasında sapma = 0 (gece mutabakatı).
- Kaynak payı: "gerçek ziyaret + geri bildirim" kaynakları ≥ %50 (bugün tahminen < %15).
- Aylık mint/burn oranı 1.0–1.5 bandında.
- Ödül kodu kullanım oranı (talep → bayide okutma) ≥ %60.
- D7/D30 retention'da seri ve sezon kohortlarının kontrol grubuna göre artışı (mevcut `gamification-ab` altyapısıyla).

---

## 7. Doğrulanmayanlar / Açık Sorular

- Üretimde hangi rozetlerin `hiddenUntilEarned=true` olduğu (K2'nin etki büyüklüğü) — DB okunmadı.
- Üretimde mevcut happy-hour çarpanlarının değerleri ve bayi self-signup sonrası ek onay kapısı olup olmadığı (K1).
- Fiziksel kartın bayiye nasıl dağıtıldığı / bir bayinin kendi kartını edinip edinemeyeceği (K1 senaryosunun pratik maliyeti).
- Reward kayıtlarının üretimde gerçek (fiziksel/kupon) değer taşıyıp taşımadığı (Y6'nın finansal riski).
- Mini oyun ödüllerinin admin override'ı ile üretimde değiştirilip değiştirilmediği (Y2 hesapları registry varsayılanlarıyla yapıldı).
