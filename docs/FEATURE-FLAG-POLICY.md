# Feature Flag Cleanup Politikası

Eski flag'ler teknik borç olmasın; `expiresAt` ve `ownerId` zorunlu.

## Kurallar

1. **Create/Update**: `expiresAt` ve `ownerId` önerilir. OwnerId yoksa session.user.id kullanılır.
2. **Expire**: Süresi dolan flag'ler cron/job ile disable veya archiving edilir.
3. **Cron**: `prisma.featureFlag.updateMany({ where: { expiresAt: { lt: new Date() } }, data: { isEnabled: false } })` periyodik.
