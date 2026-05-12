# Queue ve Asenkron İşler (P2-20, P2-21)

## Uygulanan

- **Inngest** ile queue altyapısı
- **feedback/created** event: Feedback POST sonrası AI analiz kuyruğa eklenir (USE_INNGEST_QUEUE=true ise)
- **feedback-analyze** function: AI analiz, DB güncelleme, bildirimler; retries: 3 (P2-21 DLQ/retry)
- `/api/inngest` – Inngest serve handler (GET/POST/PUT)

## Etkinleştirme

1. [Inngest Cloud](https://app.inngest.com) veya `npx inngest-cli@latest dev` (local)
2. `.env`:
   ```
   USE_INNGEST_QUEUE=true
   INNGEST_EVENT_KEY=...
   INNGEST_SIGNING_KEY=...
   ```
3. Feedback POST: `USE_INNGEST_QUEUE=true` iken `feedback/created` event gönderilir; Inngest function analizi yapar.

## Fallback

`USE_INNGEST_QUEUE` yoksa veya false ise AI analiz inline (önceki davranış) çalışır.

## Hedef mimari (kalan)

- Toplu segment/export: Admin tetikler, job kuyruğa girer; tamamlanınca bildirim.
