/**
 * Şema penceresi #1 (platform overhaul) sözleşme testi.
 *
 * DB'ye BAĞLANMAZ: yalnız prisma/schema.prisma ve el yazımı göç SQL'ini metin olarak okur.
 * Amaç: veri kaybı korumalarının (Restrict / SetNull), tek-sefer garantilerinin (unique)
 * ve "yalnız ekleme" göç disiplininin sessizce geri alınmasını yakalamak.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const schema = readFileSync(path.join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const expandSql = readFileSync(
  path.join(ROOT, 'prisma', 'migrations', '20261008000000_platform_overhaul_expand', 'migration.sql'),
  'utf8',
);
const restrictSql = readFileSync(
  path.join(ROOT, 'prisma', 'migrations', '20261008000100_platform_overhaul_feedback_restrict', 'migration.sql'),
  'utf8',
);

/** `model X { ... }` gövdesini döndürür (iç içe süslü parantez yok). */
function modelBody(name: string): string {
  const re = new RegExp(`^model ${name} \\{([\\s\\S]*?)^\\}`, 'm');
  const m = schema.match(re);
  if (!m) throw new Error(`model ${name} şemada yok`);
  return m[1];
}

/** Yorum satırlarını atarak alan satırını bulur. */
function fieldLine(model: string, field: string): string {
  const line = modelBody(model)
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .find((l) => new RegExp(`^${field}\\s`).test(l));
  if (!line) throw new Error(`${model}.${field} yok`);
  return line;
}

/** SQL'den yorumları atar. */
const stripSqlComments = (sql: string) => sql.replace(/--.*$/gm, '');

describe('platform overhaul şema sözleşmesi', () => {
  it('QR silme müşteri yorumlarını cascade ile silemez (P0-24)', () => {
    expect(fieldLine('Feedback', 'qrCode')).toMatch(/onDelete:\s*Restrict/);
    expect(restrictSql).toMatch(/"Feedback_qrCodeId_fkey"[\s\S]*ON DELETE RESTRICT/);
  });

  it('kullanıcı silme denetim izini silmez (P0-25)', () => {
    expect(fieldLine('AuditLog', 'userId')).toMatch(/^userId\s+String\?/);
    expect(fieldLine('AuditLog', 'user')).toMatch(/onDelete:\s*SetNull/);
    expect(fieldLine('AuditLog', 'actorSnapshot')).toMatch(/Json\?/);
    expect(expandSql).toMatch(/"AuditLog_userId_fkey"[\s\S]*ON DELETE SET NULL/);
    expect(expandSql).toMatch(/ALTER COLUMN "userId" DROP NOT NULL/);
  });

  it('oturum iptali ve tek-sefer görev ödülü alanları var (P0-07, P0-15)', () => {
    expect(fieldLine('User', 'sessionVersion')).toMatch(/Int\s+@default\(0\)/);
    expect(fieldLine('UserQuest', 'rewardedAt')).toMatch(/DateTime\?/);
  });

  it('tek-sefer garantileri unique ile korunur', () => {
    expect(fieldLine('PointsLedger', 'idempotencyKey')).toMatch(/@unique/);
    expect(fieldLine('StripeEvent', 'id')).toMatch(/@id/);
    expect(fieldLine('StaffInvitation', 'tokenHash')).toMatch(/@unique/);
    expect(modelBody('CustomerMoment')).toMatch(/@@unique\(\[userId, dedupeKey\]\)/);
    expect(modelBody('DealerCustomerStats')).toMatch(/@@unique\(\[dealerId, customerId\]\)/);
    expect(modelBody('Consumption')).toMatch(/@@unique\(\[dealerId, clientOpId\]\)/);
  });

  it('katalog modellerinde arşiv alanı var (P0-26)', () => {
    for (const m of ['Badge', 'Quest', 'Reward', 'CosmeticItem', 'DonationProject', 'PricingPlan', 'PhysicalCard', 'QRCode']) {
      expect(fieldLine(m, 'archivedAt')).toMatch(/DateTime\?/);
    }
  });

  it('KVKK rıza ve DSR kanıt tabloları var; DSR kanıtı talep silinerek yok edilemez (P0-31, P0-34)', () => {
    expect(modelBody('ConsentRecord')).toMatch(/analytics\s+Boolean/);
    expect(modelBody('ConsentRecord')).toMatch(/replay\s+Boolean/);
    expect(fieldLine('DsrEvent', 'request')).toMatch(/onDelete:\s*Restrict/);
  });

  it('göçteki her yeni tablo şemada bir modele karşılık gelir', () => {
    const tables = [...expandSql.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]);
    expect(tables.sort()).toEqual(
      ['ConsentRecord', 'CustomerMoment', 'DealerCustomerStats', 'DsrEvent', 'PointsLedger', 'StaffInvitation', 'StripeEvent'].sort(),
    );
    for (const t of tables) expect(() => modelBody(t)).not.toThrow();
  });

  it('expand göçü yıkıcı ifade içermez ve idempotenttir', () => {
    const sql = stripSqlComments(expandSql);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/i);
    // Yeni NOT NULL kolonların hepsi varsayılanlı (mevcut satırlar bozulmaz).
    for (const m of sql.matchAll(/ADD COLUMN IF NOT EXISTS "\w+" ([^;]+);/g)) {
      if (/NOT NULL/.test(m[1])) expect(m[1]).toMatch(/DEFAULT/);
    }
    // Her ADD COLUMN / CREATE TABLE / CREATE INDEX tekrar çalıştırılabilir.
    expect(sql).not.toMatch(/ADD COLUMN (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(sql).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
  });

  it('An Motoru lig dedupe anahtarı sezonlu olarak belgelenmiş', () => {
    expect(schema).toMatch(/league:<seasonKey>:<toKey>/);
  });
});
