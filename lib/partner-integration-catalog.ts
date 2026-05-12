/** Partner satış / entegrasyon — sabit katalog (API ile servis edilir). */

export const PARTNER_EVENTS = [
  {
    name: 'partner.digest.24h',
    channel: 'webhook',
    description: 'Son 24 saat bayi bazında NPS ortalaması, geri bildirim sayısı ve ortalama puan.',
    payloadShape: '{ generatedAt, windowHours, dealers: [{ dealerId, label, feedbackCount24h, npsAvg24h, ... }] }',
  },
  {
    name: 'digest.poll',
    channel: 'GET',
    description: 'REST ile aynı gövde — Bearer API anahtarı (scope: read:partner_digest).',
    payloadShape: 'JSON GET /api/partner/v1/digest',
  },
] as const;

export const WEBHOOK_HEADERS = [
  'Content-Type: application/json',
  'X-Qratex-Event: partner.digest.24h',
  'X-Qratex-Signature: sha256=<hmac-sha256-hex of raw body>',
];
