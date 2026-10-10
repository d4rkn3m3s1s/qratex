# lib/economy — tek ekonomi servisi

> **Kural:** Puan ya da XP basan HER yol `mintPoints`, puan harcayan her yol `debitPoints`,
> admin'in manuel düzeltmesi `adjustPointsByAdmin` kullanır. `user.update({ points: { increment } })`
> ya da `creditPointsAndXp` + elle `points_credited` yazan YENİ kod kabul edilmez.

Kaynak: `docs/audit/2026-10-08/00-YOL-HARITASI.md` §2.2 (P0-13…23), §4.4 ilke 4, F1.3;
`docs/audit/2026-10-08/sistem/oyunlastirma-ekonomi.md` §5.1–5.2. Proje değişmezleri:
escrow net-sıfır, atomik tek seferlik kredi, aynı tx'te `points_credited`, cron fail-closed.

## Dosyalar

| Dosya | İçerik |
|---|---|
| `mint.ts` | `mintPoints`, `lockUserForUpdate` |
| `admin-adjust.ts` | `adjustPointsByAdmin` |
| `caps.ts` | Kategori tavanları (TEK kaynak), `applyCategoryCap`, `MAX_SINGLE_MINT`, `ADMIN_ADJUST_LIMITS` |
| `errors.ts` | `EconomyError` (`code` + önerilen HTTP durumu) |
| `index.ts` | Barrel; `debitPoints` / `InsufficientPointsError` (`lib/points-wallet.ts`) de buradan |

## `mintPoints(db, input)`

```ts
import { mintPoints } from '@/lib/economy';

await prisma.$transaction(async (tx) => {
  // … kaynak kaydı oluştur (feedback, oturum, görev …)
  const r = await mintPoints(tx, {
    userId,
    points: 120,
    xp: 60,
    source: 'game',                    // kaynak adı
    sourceId: sessionId,
    idempotencyKey: `game:${sessionId}`, // tek-kez garantisi (PointsLedger @unique)
    meta: { gameType },
  });
  if (r.duplicate) { /* daha önce ödenmiş: kredi YOK */ }
  // r.credited (bu çağrıda basılan), r.capped, r.points (bakiye), r.level, r.isLevelUp
});
```

Aynı transaction içinde sırası:

1. **Kilit:** `SELECT "id","fraudStatus" FROM "User" … FOR UPDATE`. Aynı kullanıcıya paralel
   mint'ler sıraya girer; tavan ve tek-kez okumaları kilit sonrası yapıldığı için 20 paralel
   istekte bakiye tek kredi kadar artar (`__tests__/lib/economy-concurrency.test.ts`).
2. **Tek-kez:** `idempotencyKey` defterde varsa kredi yapılmaz; ilk çağrının miktarı
   `duplicate: true` ile döner. Anahtar başka kullanıcıya aitse `IDEMPOTENCY_CONFLICT`.
3. **Tavan:** `capCategory` verilmezse `source` için tanımlı tavan uygulanır. `null` =
   bilerek tavansız (escrow iadesi, savaş havuzu). Puan kısalırsa XP aynı oranla kısalır.
   Tavan dolu + anahtar varsa 0 tutarlı defter satırı yazılır (ertesi gün tekrar denenince
   kredi verilmez).
4. **Fraud kapısı:** `fraudStatus === 'shadow_ban'` → defter satırı `status: 'void'`, bakiye
   artmaz, kullanıcıya başarı görünür. Kullanıcının kendi puanını iade eden yollar
   `fraudGate: false` geçer (net-sıfır).
5. **Kredi:** `creditPointsAndXp` (atomik artış + seviye guard'ı).
6. **Defter + görünürlük:** `PointsLedger` satırı (`balanceAfter` ile) ve puan > 0 ise
   `points_credited` olayı (`category = capCategory ?? source`; `data` içinde `points`, `xp`,
   `source`, `sourceId`, `actorId`, `ledgerId`). `meta` çekirdek alanları ezemez.

`db` kök Prisma istemcisiyse fonksiyon kendi transaction'ını açar (eşzamanlı aynı anahtar
P2002 ile düşerse ilk kaydın sonucunu döndürür). Bir `tx` verilirse çağıranın
transaction'ına katılır; P2002 yutulmaz, tx geri alınır (fail-closed).

**Hatalar:** `EconomyError` — `INVALID_INPUT` (kaynak adı, boş kullanıcı, `dealer_passive`
için eksik `actorId`), `INVALID_AMOUNT` (NaN/∞, tek seferde > 100.000), `USER_NOT_FOUND`,
`IDEMPOTENCY_CONFLICT`. Route'ta: `if (isEconomyError(e)) return json({ error: e.message, code: e.code }, { status: e.httpStatus })`.

## `debitPoints(db, payload)` (`lib/points-wallet.ts`)

```ts
await debitPoints(tx, { userId, points: item.price, source: 'shop', sourceId: item.id, idempotencyKey: `shop:${orderId}` });
```

- Negatif bakiye imkânsız: `points >= tutar` guard'lı tek `updateMany`; yetersizse
  `InsufficientPointsError(currentPoints, requiredPoints)` (geriye uyumlu).
- Aynı tx'te `PointsLedger` (`delta < 0`, `balanceAfter`) + `points_spent` olayı.
- `source` verilmezse `'spend'` (eski çağıranlar değişmeden çalışır; yeni kod kaynak versin).
- `idempotencyKey` varsa ikinci çağrı borçlandırmaz (`duplicate: true`).

## `adjustPointsByAdmin(db, input)`

```ts
await adjustPointsByAdmin(prisma, {
  adminId: session.user.id, userId, delta: -400, reason: 'Hatalı kredi geri alındı',
  approvalToken,               // |delta| > 10.000 ise zorunlu: ikinci adminin KENDİ oturumuyla
                               // POST /api/admin/economy/adjust-approvals'tan aldığı imzalı,
                               // 15 dk'lık, kullanıcı+miktara bağlı, tek kullanımlık belirteç
  idempotencyKey: requestId,   // tekrar gönderimde çift düzeltme yok
  auditMeta: { ipAddress, userAgent },
});
```

- Aktör veritabanında `ADMIN` olmalı (JWT'ye güvenilmez); kendi bakiyesini düzeltemez.
- Gerekçe 5–500 karakter; `|delta| ≤ 100.000`; kullanıcı başına günlük pozitif toplam ≤ 200.000.
- Pozitif → `mintPoints(source: 'admin_adjust')`; negatif → `debitPoints` (eksi bakiye yok).
- `AuditLog` `ADMIN_POINTS_ADJUST`: aktör snapshot'ı, önceki/sonraki bakiye, gerekçe, defter id.

## Tavan tablosu (`caps.ts`)

| Kategori | Günlük | Haftalık | Aktör başına günlük | Not |
|---|---|---|---|---|
| `feedback` | 500 | 2.000 | — | `lib/points-caps.ts` tarihsel değerleri; tüketim yorumu da bu kova (`capCategory: 'feedback'`) |
| `game` | 600 | 3.000 | — | P0-17 |
| `dealer_passive` / `consumption` | 600 | — | 300 (müşteri × bayi) | `actorId` zorunlu; P0-13/P0-21 |
| `admin_adjust` | `ADMIN_ADJUST_LIMITS` | | | işlem başı 100.000, kullanıcı/gün 200.000, > 10.000 ikinci onay |
| diğer (rozet, görev, referral …) | — | — | — | Tek-kez doğası gereği; `MAX_SINGLE_MINT = 100.000` yine geçerli |

Kullanım, `points_credited` olaylarından sayılır: geçiş döneminde hem eski yollar hem
`mintPoints` bu olayı yazdığından iki dünya tek kovada toplanır. Ledger'a tam göç
bittiğinde yalnız `sumEarnedInWindow` defterden okuyacak şekilde değişir.

## Dağıtım notu

`mintPoints`, `debitPoints` ve `adjustPointsByAdmin` `PointsLedger` tablosuna yazar. Bu kod,
`prisma/migrations/20261008000000_platform_overhaul_expand` canlıda uygulandıktan SONRA
deploy edilmelidir (bkz. `docs/audit/2026-10-08/DEPLOY-RUNBOOK.md`).

## Göç sırası (F1.3)

`creditPointsAndXp`'nin imzası sabit kalır (19+ çağıran). Yollar tek tek `mintPoints`'e taşınır;
öncelik: bayi pasif puanı → rozet → görev → oyun → referral → kalanlar. Her göçte eski elle
yazılan `points_credited` kaldırılır (mintPoints zaten yazar) ve route `EconomyError`'ı
HTTP durumuna çevirir. Sonraki adımlar: `reverse` (moderasyon clawback'i), açılış bakiyesi
satırları, gece mutabakatı (`SUM(ledger) = User.points`), ESLint ile ekonomi modülü dışında
`points`/`xp` yazım yasağı, `CHECK points >= 0`.
