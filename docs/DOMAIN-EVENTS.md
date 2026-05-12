# Domain Event Naming Standard

## Format

`entity.action` – entity ve action nokta ile ayrılır. Inngest event isimleri uyumluluk için `/` kullanabilir.

## Event Listesi

| Event              | Inngest Name       | Açıklama           | Payload                                |
|--------------------|--------------------|--------------------|----------------------------------------|
| feedback.submitted | feedback/created   | Geri bildirim eklendi | `{ feedbackId: string, dealerId?: string }` |
| feedback.analyzed  | -                  | AI analiz tamamlandı | Inngest step output                     |

## Payload Şeması

### feedback.submitted

```json
{
  "feedbackId": "cuid",
  "dealerId": "string (optional)"
}
```
