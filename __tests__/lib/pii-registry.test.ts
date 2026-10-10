/**
 * P0-34 — Kişisel veri envanteri (PII_REGISTRY) ŞEMA TARAMA testi.
 *
 * Hata senaryosu (denetim): QRA sohbet kayıtları (`QraChatLog`), anlık bildirim abonelikleri
 * ve AuditLog yükleri KVKK silme/dışa aktarma kapsamı dışındaydı; çünkü kapsam elle yazılmış
 * bir listeydi ve yeni modeller unutuluyordu. Şimdi kapsam yalnız PII_REGISTRY'den türer ve bu
 * test `prisma/schema.prisma`'yı tarar: User'a bağlanan HER ilişki (ve ilişkisiz kullanıcı
 * referansı) envanterde sınıflandırılmadıkça kırmızıya düşer.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  PII_REGISTRY,
  eraseEntries,
  exportEntries,
  registryKey,
  retentionEntries,
  delegateName,
} from '@/lib/pii-registry';

interface Field {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
}

function parseSchema(): Map<string, { fields: Map<string, Field>; userFks: string[] }> {
  const src = readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8').replace(/\r/g, '');
  const models = new Map<string, { fields: Map<string, Field>; userFks: string[] }>();
  const re = /^model (\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const [, name, body] = m;
    const fields = new Map<string, Field>();
    const userFks: string[] = [];
    for (const raw of body.split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@')) continue;
      const fm = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(line);
      if (!fm) continue;
      fields.set(fm[1], { name: fm[1], type: fm[2], list: Boolean(fm[3]), optional: Boolean(fm[4]) });
      if (fm[2] === 'User' && !fm[3]) {
        const fk = /fields:\s*\[([^\]]+)\]/.exec(line);
        if (fk) userFks.push(...fk[1].split(',').map((s) => s.trim()));
      }
    }
    models.set(name, { fields, userFks });
  }
  return models;
}

/** Prisma ilişkisi olmadan kullanıcı kimliği taşıyan alanlar (FK'siz referanslar da envantere girmeli). */
const SCALAR_USER_REF = /^(userId|customerId|actorId|createdById|ownerId|authorId|assignedToId|assignedTo|creatorId|referrerId|referredId|resolvedBy|acceptedUserId|invitedById|sentByUserId|giftedByUserId|triggeredById|approvedById|updatedById|uploadedById)$/;

const SCHEMA = parseSchema();

/** Şemada User'a bağlanan ama verilen envanterde sınıflandırılmamış `Model.alan` anahtarları. */
function unclassified(registry: readonly { model: string; relation: string }[]): string[] {
  const registered = new Set(registry.map(registryKey));
  const missing: string[] = [];
  for (const [model, { fields, userFks }] of SCHEMA) {
    if (model === 'User') continue; // User satırı: anonymizeUser (user_row)
    const refs = new Set(userFks);
    for (const f of fields.values()) {
      if (f.type === 'String' && !f.list && SCALAR_USER_REF.test(f.name)) refs.add(f.name);
    }
    for (const fk of refs) {
      const key = `${model}.${fk}`;
      if (!registered.has(key)) missing.push(key);
    }
  }
  return missing;
}

/** Hiçbir zaman dışa aktarılmaması gereken gizli değerler. */
const SECRET_FIELDS = new Set([
  'password',
  'sessionToken',
  'tokenHash',
  'codeHash',
  'p256dh',
  'auth',
  'endpoint',
  'pinCode',
  'twoFactorSecret',
  'access_token',
  'refresh_token',
  'id_token',
  'token',
  'couponCode',
  'ipFingerprint',
  'ipHash',
]);

describe('PII_REGISTRY ↔ prisma şeması', () => {
  it('şema okunabildi (sağlamlık)', () => {
    expect(SCHEMA.size).toBeGreaterThan(100);
    expect(SCHEMA.get('QraChatLog')).toBeDefined();
  });

  it("User'a bağlanan HER ilişki envanterde sınıflandırılmış (unutma koruması)", () => {
    expect(unclassified(PII_REGISTRY)).toEqual([]);
  });

  it('negatif kontrol: QRA sohbet kaydı envanterden düşerse tarama yakalar', () => {
    const without = PII_REGISTRY.filter((e) => registryKey(e) !== 'QraChatLog.userId');
    expect(unclassified(without)).toEqual(['QraChatLog.userId']);
  });

  it('envanterde bayat kayıt yok: her model ve ilişki alanı şemada var', () => {
    const stale = PII_REGISTRY.filter((e) => !SCHEMA.get(e.model)?.fields.has(e.relation)).map(registryKey);
    expect(stale).toEqual([]);
  });

  it('aynı model+ilişki iki kez sınıflandırılmamış', () => {
    const keys = PII_REGISTRY.map(registryKey);
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });

  it('dışa aktarma alanları şemada var ve gizli değer İÇERMİYOR', () => {
    const problems: string[] = [];
    for (const e of exportEntries()) {
      const model = SCHEMA.get(e.model)!;
      for (const f of e.export!.select) {
        if (!model.fields.has(f)) problems.push(`${registryKey(e)}: yok → ${f}`);
        if (SECRET_FIELDS.has(f)) problems.push(`${registryKey(e)}: gizli değer → ${f}`);
      }
      if (e.export!.orderBy && !model.fields.has(e.export!.orderBy)) problems.push(`${registryKey(e)}: orderBy → ${e.export!.orderBy}`);
      if (!(e.export!.max > 0)) problems.push(`${registryKey(e)}: max`);
    }
    expect(problems).toEqual([]);
  });

  it('redaksiyon biçimi alan tipine uyuyor (null → opsiyonel, json_null → Json, false → Boolean)', () => {
    const problems: string[] = [];
    for (const e of PII_REGISTRY) {
      if (e.erase === 'redact' && (!e.redact || Object.keys(e.redact).length === 0)) problems.push(`${registryKey(e)}: boş redact`);
      for (const [field, how] of Object.entries(e.redact ?? {})) {
        const f = SCHEMA.get(e.model)?.fields.get(field);
        if (!f) {
          problems.push(`${registryKey(e)}: alan yok → ${field}`);
          continue;
        }
        if (how === 'null' && !f.optional) problems.push(`${registryKey(e)}.${field}: zorunlu alan null yapılamaz`);
        if (how === 'json_null' && !(f.type === 'Json' && f.optional)) problems.push(`${registryKey(e)}.${field}: Json? değil`);
        if (how === 'false' && f.type !== 'Boolean') problems.push(`${registryKey(e)}.${field}: Boolean değil`);
        if (how === 'placeholder' && f.type !== 'String') problems.push(`${registryKey(e)}.${field}: String değil`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('saklama süresi otomatik uygulanan kayıtların tarih alanı DateTime', () => {
    const problems = retentionEntries()
      .filter((e) => SCHEMA.get(e.model)?.fields.get(e.retentionField!)?.type !== 'DateTime')
      .map(registryKey);
    expect(problems).toEqual([]);
    expect(retentionEntries().map(registryKey)).toEqual(
      expect.arrayContaining(['QraChatLog.userId', 'PushNotificationLog.userId', 'Notification.userId'])
    );
  });

  it('silme yürütücüsü yalnız kişinin KENDİ kayıtlarına dokunur (işletme/aktör kaydı silinmez)', () => {
    for (const e of eraseEntries()) expect(e.subject).toBe('self');
    expect(eraseEntries().some((e) => e.subject === 'business' || e.subject === 'actor')).toBe(false);
  });

  it('Prisma temsilci adı şemadaki modelle eşleşir', () => {
    expect(delegateName('QraChatLog')).toBe('qraChatLog');
    expect(delegateName('QRCode')).toBe('qRCode');
  });
});

describe('P0-34 kapsamı: denetimde dışarıda kalan kayıtlar artık kapsamda', () => {
  const byKey = new Map(PII_REGISTRY.map((e) => [registryKey(e), e]));

  it('QRA sohbet kayıtları: dışa aktarılır, silmede TAMAMEN silinir, 180 gün saklanır', () => {
    const e = byKey.get('QraChatLog.userId')!;
    expect(e.export?.select).toEqual(expect.arrayContaining(['userMessage', 'assistantMessage']));
    expect(e.erase).toBe('delete');
    expect(e.retentionDays).toBe(180);
    expect(eraseEntries().map(registryKey)).toContain('QraChatLog.userId');
  });

  it('anlık bildirim abonelikleri silinir (silme sonrası cihaz bildirim almaz), anahtarları dışa aktarılmaz', () => {
    const e = byKey.get('PushSubscription.userId')!;
    expect(e.erase).toBe('delete');
    expect(e.export?.select).not.toEqual(expect.arrayContaining(['endpoint']));
  });

  it('AuditLog yükleri (newData/oldData) ve IP/UA silmede temizlenir, satır kalır', () => {
    const e = byKey.get('AuditLog.userId')!;
    expect(e.erase).toBe('redact');
    expect(e.redact).toMatchObject({ newData: 'json_null', oldData: 'json_null', ipAddress: 'null', userAgent: 'null' });
  });

  it('rıza ve başvuru kayıtları ispat için saklanır (silinmez)', () => {
    expect(byKey.get('ConsentRecord.userId')!.erase).toBe('retain');
    expect(byKey.get('DataSubjectRequest.userId')!.erase).toBe('retain');
  });
});
