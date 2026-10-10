# An Motoru (Moment Engine) — Tasarım

Tarih: 2026-10-08 · Dal: `feat/moment-engine` · Durum: onaylandı (sohbet içi, 3 bölüm)

## Amaç

Müşterinin ödül kazandığı her an — **puan, seviye, lig, rozet** — aynı kaliteli, sinematik
motion diliyle (framer-motion + three.js) gösterilsin. Başarı ölçütü:

- Kazanılan an **hissedilir**; hiçbir büyük an **kaybolmaz** (cron/çevrim dışı dahil);
  hiçbiri **iki kez** oynamaz.
- Azaltılmış hareket (OS `prefers-reduced-motion` VE uygulama `html.reduce-animations`) her
  efekte uygulanır.
- Dağınık 4 konfeti yolu tek efekt cephesinde toplanır.

Kapsam dışı: karakter rozeti açılışı (`components/customer/character-reveal.tsx`) ve 3D sürpriz
kutusu kendi akışlarında kalır; yeniden yazılmaz.

## Mevcut durum (ölçüldü)

- `creditPointsAndXp` (`lib/points-wallet.ts`) yarış-güvenli `isLevelUp` döndürür; 19 yerden
  çağrılır (cron'lar dahil). Seviye bilgisi istemciye yalnız `POST /api/feedbacks` ile ulaşır.
- `customer-dashboard.tsx` ~L362: oturum `user.level` ile `stats.level` karşılaştırması — bayat
  oturum yüzünden her yüklemede tekrar tetiklenebilen BUG.
- Genel rozet kazanımında UI yok (yalnız `BADGE_EARNED` bildirimi). Rozet 7 yerde veriliyor:
  `lib/activity-badges.ts`, `lib/character-badges.ts`, `lib/surprise-badges.ts`,
  `app/api/admin/users/route.ts`, `app/api/customer/seasonal-event/route.ts`,
  `app/api/gamification/badges/[id]/unlock/route.ts`, `app/api/gamification/progress/route.ts`.
- Lig = puan **bakiyesine** göre (`getLeagueRules()` DB+cache, `getLeagueMetaFromRules`);
  bakiye harcanabilir → lig düşüp tekrar yükselebilir. Lig kuralında renk yok, yalnız Tailwind
  `gradient` sınıfı var.
- Konfeti: `lib/effects/confetti.ts`, `components/providers/confetti-provider.tsx`
  (`useConfetti`), `app/customer/quests/page.tsx` ve `components/customer/games/game-shell.tsx`
  içinde doğrudan `canvas-confetti`. Hiçbiri azaltılmış hareketi kontrol etmiyor.
- Ses/titreşim: `lib/game-sounds.ts` (`sfx*`, `haptic`, `html.reduce-animations` kontrolü),
  `lib/play-chime.ts`.

## 1. Sunucu — An Kutusu

### Şema (yalnız ekleme)

```prisma
model CustomerMoment {
  id        String    @id @default(cuid())
  userId    String
  kind      String    // 'level_up' | 'league_up' | 'badge'
  payload   Json
  dedupeKey String
  createdAt DateTime  @default(now())
  seenAt    DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, dedupeKey])
  @@index([userId, seenAt])
  @@index([createdAt])
}
```

`User` modeline `moments CustomerMoment[]` ilişkisi eklenir.

### Payload biçimleri

- `level_up`: `{ from: number, to: number, xp: number }`
- `league_up`: `{ fromKey, fromName, toKey, toName, points }`
- `badge`: `{ badgeId, name, icon, rarity, color: string|null, hidden: boolean }`

### Dedupe anahtarları ("her an tam bir kez")

- `level:<to>` · `league:<toKey>` (bir lige İLK girişte, ömür boyu bir kez) · `badge:<badgeId>`

> **Not (2026-10-08, şema bekçisi — yol haritası §5.3):** Lig anahtarı **sezonlu** yazılmalı:
> `league:<seasonKey>:<toKey>`. F4.4'te lig sezon XP'ye geçip her sezon sıfırlandığında ömür
> boyu `league:<toKey>` anahtarı ikinci sezondan itibaren bütün lig kutlamalarını susturur.
> Sezon kavramı gelene kadar `seasonKey = "all"` kullanılır (`league:all:<toKey>`), böylece
> bugünkü "ömür boyu bir kez" davranışı korunur ve F4.4'te yalnız `seasonKey` üreticisi değişir.
> Tablo şema penceresi #1'de oluşturuldu: `prisma/migrations/20261008000000_platform_overhaul_expand`
> (spec'teki ayrı `<ts>_customer_moments` göçü **yazılmayacak**).

### Yakalama

`lib/moments/server.ts`:

- `recordMoments(db, userId, items[])` → `db.customerMoment.createMany({ data, skipDuplicates: true })`.
  `skipDuplicates` (`ON CONFLICT DO NOTHING`) sayesinde unique çakışması transaction'ı bozmaz.
  Diğer hatalar try/catch ile yutulur + loglanır. ⚠️ Transaction içinde yakalanan bir Postgres
  hatası yine de transaction'ı iptal eder — bu yüzden tablo canlıda VAR OLMADAN kod deploy
  EDİLMEZ (bkz. Riskler).
- `recordBadgeMoment(db, userId, badge)` — 7 rozet verme noktasında `userBadge` oluşturma
  başarılı olduktan hemen sonra çağrılır (yalnız gerçekten yeni oluşturulduysa).

`creditPointsAndXp` içinde:

- `isLevelUp` true → `level_up` anı (`from` = önceki `updatedUser.level`, `to` = yeni seviye).
- `points > 0` ise önceki bakiye = `updatedUser.points - points`; `getLeagueRules(db)` ile önce/sonra
  lig karşılaştırılır; sonraki ligin `minPoints` sırası daha yüksekse `league_up` anı.
  Kurallar cache'li; ek sorgu yalnız cache soğukken.
- Dönüş tipine dokunulmaz (19 çağıran etkilenmez).

### API (yalnız CUSTOMER rolü, yalnız kendi kayıtları)

- `GET /api/customer/moments` → `{ moments: CustomerMoment[] }` — `seenAt: null`, en eski önce, en fazla 10.
- `POST /api/customer/moments/seen` body `{ ids: string[] }` (en fazla 20) → `updateMany` `where: { id: { in }, userId }`.
- Mevcut `requireAuth`/rol kalıbı ve rate-limit konvansiyonu kullanılır.

### Temizlik

Mevcut `db-cleanup` cron rotasına: görülmüş anlar 30 gün, görülmemişler 90 gün sonra silinir.
YENİ cron tetikleyicisi EKLENMEZ (Neon kotası).

### Panel bug'ı

`customer-dashboard.tsx` içindeki oturum-seviye karşılaştırma bloğu silinir.

## 2. İstemci motoru

`lib/moments/` (framework'ten bağımsız, test edilebilir):

- `types.ts` — `Moment` (sunucu kaydı) ve `PointsMoment` tipleri.
- `queue.ts` — `useSyncExternalStore` uyumlu küçük store. Tek an oynar. Öncelik
  **league_up > level_up > badge**, eşitlikte `createdAt` eski önce. Aynı `id` iki kez giremez.
  API: `enqueue(moments)`, `current()`, `next()` (aktif anı bitirir), `subscribe`.
- `effects.ts` — TEK efekt cephesi: `confetti(preset)`, `sound(name)`, `buzz(pattern)`,
  `prefersReducedMotion()` (= OS medya sorgusu VEYA `html.reduce-animations`). Azaltılmışta hepsi
  no-op. `lib/effects/confetti.ts` fonksiyonları bu cepheye delege eder;
  `useConfetti` provider'ı da. `quests` ve `game-shell` doğrudan `canvas-confetti` importunu bırakır.
- `client.ts` — genel API:
  - `moments.points({ points, xp })` — küçük an (kaydedilmez), olay ile Host'a iletilir.
  - `moments.refresh()` — `window` olayı `qratex:moments-refresh`; Host bekleyenleri hemen çeker.

`components/moments/moment-host.tsx` (client):

- Yerleşim: `app/customer/layout.tsx` ve `app/(public)/feedback/[code]/page.tsx` (oturum açık müşteri için).
- Çekme: ilk mount (~1.2 sn gecikmeli), `refresh` olayı, `visibilitychange` → görünür. Arka planda
  POLLING YOK. 401/403/ağ hatası sessizce yutulur.
- Bir an **gösterilmeye başladığında** `seen` POST edilir (sekme ortada kapansa da tekrar oynamaz).
- Ekranda açık bir dialog varsa (`[role="dialog"][data-state="open"]`, ör. karşılama videosu,
  onboarding) büyük anı başlatmaz; 1 sn aralıkla tekrar dener.
- Sahneler `next/dynamic` ile lazy; 3D sahne yalnız gerektiğinde yüklenir.

Entegrasyon (konfetiyi bırakıp `moments.points()` + `moments.refresh()`):
QR feedback (`app/(public)/feedback/[code]/page.tsx`), tüketim yorumu
(`app/customer/consumptions/[id]/page.tsx`), oyun sonu (`game-shell.tsx`), görev ödülü
(`app/customer/quests/page.tsx`), giriş serisi (`login-streak-card.tsx`), şans çarkı
(`customer-dashboard.tsx`). Mevcut toast metinleri korunur ya da puan kapsülüyle değiştirilir —
çift bildirim olmaz.

## 3. Sahneler

| An | Biçim | Hareket |
|---|---|---|
| Puan | Akışı kesmeyen kapsül, ~1.6 sn, `pointer-events: none` | Üst ortada "+120" spring sayarak; 2D kıvılcım; `[data-moment-anchor="points"]` varsa kapsül oraya uçar ve hedef nabız atar, yoksa yukarı söner |
| Seviye | Tam ekran, ~4 sn, dokun/Esc ile geç | 3D parçacıklardan toplanan parlak halka; eski→yeni seviye odometre; ışın patlaması; sonraki seviyeye ilerleme çubuğu |
| Lig | Tam ekran, ~4.5 sn | Eski amblem parçacıklara dağılır, yeni lig fasetli taşı kamera yaklaşırken iner; zemin lig rengine bürünür |
| Rozet | Orta kart, ~3 sn | 3D madalyon döner, takla atıp rozet ikonunu açar; kenar rozet `color` ya da nadirlik rengi; "Koleksiyonuna eklendi →" `/customer/badges` |

Lig renkleri: `LeagueRule` yalnız Tailwind gradient tuttuğundan, istemcide `LEAGUE_SCENE_COLORS:
Record<LeagueKey, [hex, hex]>` sabit tablosu (bilinmeyen anahtar → marka rengi).
Nadirlik renkleri: common / rare / epic / legendary için sabit tablo; `badge.color` doluysa onu kullanır.

3D kuralları (`components/moments/moment-stage-3d.tsx`, tek lazy chunk, `preset: 'ring'|'gem'|'medallion'`):
sürpriz kutusundaki teknikler (fasetli taş, eşikli bloom, ışın parçacıkları) yeniden kullanılır;
DPR ≤ 1.5; sekme gizliyken render durur; unmount'ta geometri/materyal/renderer `dispose`; WebGL
yoksa 2D yedek; canvas boyutu `clientWidth/clientHeight` ile (ölçekli ebeveyn tuzağı).

Erişilebilirlik: azaltılmışta 3D/konfeti/ses kapalı, yalnız sade kart fade; her sahne Esc + dokunuş
ile geçilir; `role="dialog"` + `aria-live="polite"` duyuru; odak tuzağı tam ekran sahnelerde.

## Test ve doğrulama

- Jest: dedupe/`recordMoments` (mock db), lig yükselme algılama (sınır değerleri, düşüp tekrar
  yükselme), kuyruk önceliği + tekil `id`.
- Sahneler headless Chrome tezgâhında kare kare (bkz. görsel 3B doğrulama tezgâhı).
- `tsc --noEmit` ile ilerlenir; `next build` EN SONDA.
- Migration: `prisma/migrations/<ts>_customer_moments/migration.sql` el ile yazılır (yalnız
  `CREATE TABLE` + index + FK). Canlı Neon'a yalnız kullanıcı onayıyla uygulanır.

## Riskler

- **Deploy sırası ZORUNLU:** önce tablo canlıda oluşturulur, SONRA kod push edilir. Tersi olursa
  `creditPointsAndXp` transaction içinde çağrıldığı yerlerde seviye/lig değişen her kredi
  transaction'ı iptal olur.
- `creditPointsAndXp` sıcak yol: an yazımı yalnız seviye/lig değiştiğinde (nadir) olur; lig
  kontrolü cache'li kurallarla bellek içi.
- Çift kutlama: entegrasyon noktalarında eski konfeti/“SEVİYE ATLADIN” blokları kaldırılmalı.
