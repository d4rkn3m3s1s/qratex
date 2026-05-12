# Timezone Standardı

Backend UTC, frontend locale dönüşümü ile çalışır; rapor kaymaları engellenir.

## Kurallar

1. **Backend**
   - Tüm `new Date()` UTC (JS Date zaten UTC içinde saklanır).
   - Prisma `DateTime` UTC.
   - API response'larda ISO 8601 veya UTC timestamp.

2. **Frontend**
   - `lib/timezone.ts`: `formatDateTimeLocal`, `formatDateLocal` ile kullanıcı timezone'una göre format.
   - Varsayılan locale: `tr-TR`, timezone: `Europe/Istanbul`.

3. **Raporlar / Export**
   - Sunucu tarafı raporlarda `formatDateUTC` veya ISO.
   - CSV/PDF export footer'da "UTC" veya "TR" belirt.

## Kullanım

```ts
import { formatDateUTC, formatDateTimeLocal } from '@/lib/timezone';

// Backend: UTC tarih
const utcStr = formatDateUTC(new Date(), 'yyyy-MM-dd');

// Frontend: kullanıcı timezone'unda
const localStr = formatDateTimeLocal(new Date(), 'tr-TR');
```
