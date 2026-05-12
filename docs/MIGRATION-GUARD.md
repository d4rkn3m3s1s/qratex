# Schema Migration Guard

Prod migration öncesi otomatik dry-run ve rollback planı zorunlu.

## Kullanım

```bash
node scripts/migrate-guard.js diff
```

CI'da `db:migrate` öncesi çalıştır. Bekleyen migration varsa diff gösterilir ve exit 1 döner.

## Rollback

Migration hata verirse:

```bash
npx prisma migrate resolve --rolled-back <migration_name>
```

`<migration_name>` = `prisma/migrations/` altındaki klasör adı (örn. `20240101_init`).
