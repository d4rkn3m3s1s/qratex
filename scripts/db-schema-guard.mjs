#!/usr/bin/env node
/**
 * Şema yönetimi bekçisi (veri modeli B4).
 *
 * Kök neden: lokal `.env` içindeki DATABASE_URL CANLI Neon'u gösteriyor. `npm run db:push`
 * şemayı göç dosyası üretmeden doğrudan canlıya uyguluyordu (veri kaybı uyarısıyla tek komutta
 * tablo/kolon düşürebilir; değişiklik gözden geçirilebilir SQL olarak kalmaz). `prisma migrate dev`
 * ise drift gördüğünde veritabanını SIFIRLAMAYI önerir — canlıda felaket.
 *
 * Kurallar:
 *  - `db push`  : her zaman kapalı. Şema değişikliği = `prisma/migrations/<ts>_<ad>/migration.sql`.
 *  - `migrate dev`: yalnız açıkça geliştirme veritabanı beyan edilirse (`QRATEX_DB_TARGET=dev`,
 *                   ör. Neon dev branch'i). Aksi halde reddedilir.
 *  - Canlıya uygulama: docs/audit/2026-10-08/DEPLOY-RUNBOOK.md (`migrate deploy` / `migrate resolve`).
 */
const cmd = process.argv[2];
const RUNBOOK = 'docs/audit/2026-10-08/DEPLOY-RUNBOOK.md';

if (cmd === 'push') {
  console.error(
    [
      '[db-schema-guard] `prisma db push` KAPALI.',
      '  Lokal DATABASE_URL canlı veritabanını gösterebilir; push göç dosyası üretmeden canlı şemayı değiştirir.',
      '  Şema değişikliği için: göç dosyası yazın (prisma/migrations/) ve ' + RUNBOOK + ' adımlarını izleyin.',
    ].join('\n')
  );
  process.exit(1);
}

if (cmd === 'migrate-dev') {
  if (process.env.QRATEX_DB_TARGET !== 'dev') {
    console.error(
      [
        '[db-schema-guard] `prisma migrate dev` reddedildi: QRATEX_DB_TARGET=dev beyan edilmedi.',
        '  migrate dev drift gördüğünde veritabanını sıfırlamayı önerir; yalnız geliştirme (Neon dev branch) DB\'sinde çalıştırın:',
        '    QRATEX_DB_TARGET=dev DATABASE_URL=<dev-branch-url> npm run db:migrate',
        '  Canlıya uygulama: ' + RUNBOOK,
      ].join('\n')
    );
    process.exit(1);
  }
  process.exit(0);
}

console.error('[db-schema-guard] kullanım: node scripts/db-schema-guard.mjs <push|migrate-dev>');
process.exit(1);
