/**
 * Stajyer görev maili gönderim/açılma istatistiği toplama. Saf fonksiyon (DB'den bağımsız,
 * test edilebilir): ham InternEmailSend kayıtlarını şablon başına özetler.
 */

/** Ham gönderim kaydı (yalnız gerekli alanlar). createdAt DESC sıralı gelmesi beklenir. */
export type SendRow = {
  templateId: string;
  email: string;
  status: string; // 'sent' | 'error'
  lastError: string | null;
  firstOpenedAt: Date | null;
  openCount: number;
  createdAt: Date;
};

export type Recipient = {
  email: string;
  status: string;
  error: string | null;
  openedAt: string | null;
  openCount: number;
  sentAt: string;
};

export type TemplateStat = {
  sent: number;
  opened: number;
  errored: number;
  lastSentAt: string | null;
  recipients: Recipient[];
};

/**
 * Gönderim kayıtlarını şablon başına gruplar. Aynı (şablon+alıcı) için GÖNDERİM durumu EN YENİ
 * kayıttan (rows createdAt DESC geldiği için ilk görülen) alınır; ancak AÇILMA verisi o alıcının
 * TÜM kayıtlarından toplanır. Böylece tekrar gönderim, önceki açılma kanıtını SİLMEZ — bir alıcı
 * bir kez açtıysa "açıldı" kalır, yeniden gönderim onu "bekliyor"a düşürmez.
 *
 * sent = başarılı gönderilen alıcı sayısı, errored = hata alan alıcı sayısı,
 * opened = en az bir kez maili açan (başarılı) alıcı sayısı.
 */
export function groupSends(rows: SendRow[]): Record<string, TemplateStat> {
  // 1) Alıcı başına: en yeni kayıt (durum) + herhangi bir kayıtta açılma var mı (agregasyon).
  type Agg = { latest: SendRow; everOpened: Date | null; maxOpenCount: number };
  const perRecipient = new Map<string, Agg>(); // key = templateId + ' ' + email
  for (const s of rows) {
    const key = `${s.templateId} ${s.email}`;
    const cur = perRecipient.get(key);
    if (!cur) {
      perRecipient.set(key, { latest: s, everOpened: s.firstOpenedAt, maxOpenCount: s.openCount });
    } else {
      // latest zaten en yeni (createdAt DESC → ilk görülen); sadece açılma verisini biriktir.
      if (s.firstOpenedAt && (!cur.everOpened || s.firstOpenedAt < cur.everOpened)) cur.everOpened = s.firstOpenedAt;
      if (s.openCount > cur.maxOpenCount) cur.maxOpenCount = s.openCount;
    }
  }

  // 2) Şablon başına özetle.
  const byTemplate: Record<string, TemplateStat> = {};
  for (const { latest, everOpened, maxOpenCount } of perRecipient.values()) {
    const st = byTemplate[latest.templateId] ?? { sent: 0, opened: 0, errored: 0, lastSentAt: null, recipients: [] };
    const isError = latest.status === 'error';
    if (isError) st.errored += 1;
    else st.sent += 1;
    // Açılma: en yeni kayıt hata değilse VE herhangi bir gönderimde açılma olduysa.
    if (!isError && everOpened) st.opened += 1;
    // lastSentAt = bu şablondaki en yeni gönderim (Map sırasına güvenme, karşılaştır).
    const sentIso = latest.createdAt.toISOString();
    if (!st.lastSentAt || sentIso > st.lastSentAt) st.lastSentAt = sentIso;
    st.recipients.push({
      email: latest.email,
      status: latest.status,
      error: latest.lastError ?? null,
      openedAt: !isError && everOpened ? everOpened.toISOString() : null,
      openCount: maxOpenCount,
      sentAt: latest.createdAt.toISOString(),
    });
    byTemplate[latest.templateId] = st;
  }
  return byTemplate;
}
