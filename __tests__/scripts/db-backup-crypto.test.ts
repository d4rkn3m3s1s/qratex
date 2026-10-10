/**
 * Yedek güvenliği (P0-30 · denetim K1).
 *
 * Yeniden üretilen hata: yedek betikleri `R2_BUCKET`'a (uygulama yüklemelerinin herkese açık
 * sunulduğu kova), saniye damgalı TAHMİN EDİLEBİLİR adla ve ŞİFRESİZ yazıyordu.
 *
 * `scripts/db-backup-lib.mjs` saf ESM olduğu için alt süreçte (node) çalıştırılır. Hiçbir test
 * ağa ya da veritabanına çıkmaz; yalnız geçici dizinde dosya şifreler/çözer.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const root = path.resolve(__dirname, '..', '..');
const LIB = pathToFileURL(path.join(root, 'scripts', 'db-backup-lib.mjs')).href;

/** Kodu ESM olarak alt süreçte çalıştırır; son satırdaki JSON'u döndürür. */
function runEsm(code: string, env: Record<string, string> = {}): unknown {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `import * as L from ${JSON.stringify(LIB)};\n${code}`], {
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
  const lines = out.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

const KEY_B64 = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY_B64 = Buffer.alloc(32, 9).toString('base64');

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'qratex-yedek-test-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('ayrı kova zorunlu (R2_* geri düşüşü yok)', () => {
  const tryConfig = (env: Record<string, string>) =>
    runEsm(
      `try { const c = L.requireBackupR2Config(process.env); console.log(JSON.stringify({ ok: true, c })); }
       catch (e) { console.log(JSON.stringify({ ok: false, name: e.name, msg: e.message })); }`,
      env
    ) as { ok: boolean; name?: string; msg?: string; c?: { bucket: string; prefix: string } };

  const appR2 = { R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'appkey', R2_SECRET_ACCESS_KEY: 'appsecret', R2_BUCKET: 'qratex-public' };

  it('yalnız uygulama R2_* tanımlıyken FAIL eder (eski davranış: uygulama kovasına yazıyordu)', () => {
    const r = tryConfig(appR2);
    expect(r.ok).toBe(false);
    expect(r.name).toBe('BackupConfigError');
    expect(r.msg).toContain('BACKUP_R2_BUCKET');
  });

  it('BACKUP_R2_BUCKET uygulama kovasıyla aynıysa FAIL eder', () => {
    const r = tryConfig({
      ...appR2,
      BACKUP_R2_ACCOUNT_ID: 'acc',
      BACKUP_R2_ACCESS_KEY_ID: 'yedekkey',
      BACKUP_R2_SECRET_ACCESS_KEY: 'yedeksecret',
      BACKUP_R2_BUCKET: 'qratex-public',
    });
    expect(r.ok).toBe(false);
    expect(r.msg).toContain('herkese');
  });

  it('uygulamanın erişim anahtarı yeniden kullanılırsa FAIL eder', () => {
    const r = tryConfig({
      ...appR2,
      BACKUP_R2_ACCOUNT_ID: 'acc',
      BACKUP_R2_ACCESS_KEY_ID: 'appkey',
      BACKUP_R2_SECRET_ACCESS_KEY: 'x',
      BACKUP_R2_BUCKET: 'qratex-backups',
    });
    expect(r.ok).toBe(false);
  });

  it('ayrı kova + ayrı token ile geçer', () => {
    const r = tryConfig({
      ...appR2,
      BACKUP_R2_ACCOUNT_ID: 'acc',
      BACKUP_R2_ACCESS_KEY_ID: 'yedekkey',
      BACKUP_R2_SECRET_ACCESS_KEY: 'yedeksecret',
      BACKUP_R2_BUCKET: 'qratex-backups',
    });
    expect(r.ok).toBe(true);
    expect(r.c).toMatchObject({ bucket: 'qratex-backups', prefix: 'db/' });
  });
});

describe('şifreleme anahtarı', () => {
  const tryKey = (raw: string | undefined) =>
    runEsm(
      `try { const k = L.parseEncryptionKey(${JSON.stringify(raw ?? null)}); console.log(JSON.stringify({ ok: true, len: k.length })); }
       catch (e) { console.log(JSON.stringify({ ok: false, msg: e.message })); }`
    ) as { ok: boolean; len?: number; msg?: string };

  it('anahtar yoksa yedek alınmaz', () => {
    expect(tryKey(undefined)).toMatchObject({ ok: false });
  });
  it('kısa parola reddedilir (sessizce türetilmez)', () => {
    expect(tryKey('qratex123').ok).toBe(false);
  });
  it('32 bayt base64 ve 64 hex kabul edilir', () => {
    expect(tryKey(KEY_B64)).toEqual({ ok: true, len: 32 });
    expect(tryKey('ab'.repeat(32))).toEqual({ ok: true, len: 32 });
  });
});

describe('AES-256-GCM dosya şifreleme', () => {
  it('gidiş-dönüş aynı içeriği verir; şifreli dosyada düz metin görünmez', () => {
    const plain = path.join(dir, 'dump.sql.gz');
    const enc = path.join(dir, 'dump.sql.gz.enc');
    const out = path.join(dir, 'cozuldu.sql.gz');
    const r = runEsm(
      `import fs from 'node:fs';
       const secret = 'INSERT INTO "User" VALUES (\\'gizli@ornek.test\\', \\'$2b$10$parolahash\\');\\n'.repeat(500);
       fs.writeFileSync(${JSON.stringify(plain)}, secret);
       const key = L.parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
       const sha = await L.encryptFile(${JSON.stringify(plain)}, ${JSON.stringify(enc)}, key);
       await L.verifyEncryptedFile(${JSON.stringify(enc)}, key, sha);
       const sha2 = await L.decryptFile(${JSON.stringify(enc)}, ${JSON.stringify(out)}, key);
       console.log(JSON.stringify({ same: sha === sha2 }));`,
      { BACKUP_ENCRYPTION_KEY: KEY_B64 }
    ) as { same: boolean };
    expect(r.same).toBe(true);
    expect(readFileSync(out)).toEqual(readFileSync(plain));
    const encBytes = readFileSync(enc);
    expect(encBytes.subarray(0, 6).toString('ascii')).toBe('QRXBK1');
    expect(encBytes.includes(Buffer.from('gizli@ornek.test'))).toBe(false);
    expect(encBytes.includes(Buffer.from('parolahash'))).toBe(false);
  });

  it('değiştirilmiş yedek çözülmez ve yarım çıktı bırakılmaz', () => {
    const r = runEsm(
      `import fs from 'node:fs';
       const key = L.parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
       const src = ${JSON.stringify(path.join(dir, 't.bin'))};
       fs.writeFileSync(src, Buffer.alloc(100000, 1));
       await L.encryptFile(src, src + '.enc', key);
       const b = fs.readFileSync(src + '.enc'); b[5000] ^= 1; fs.writeFileSync(src + '.bad', b);
       let msg = null;
       try { await L.decryptFile(src + '.bad', src + '.out', key); } catch (e) { msg = e.message; }
       console.log(JSON.stringify({ msg, out: fs.existsSync(src + '.out'), partial: fs.existsSync(src + '.out.partial') }));`,
      { BACKUP_ENCRYPTION_KEY: KEY_B64 }
    ) as { msg: string | null; out: boolean; partial: boolean };
    expect(r.msg).toContain('Doğrulama başarısız');
    expect(r.out).toBe(false);
    expect(r.partial).toBe(false);
  });

  it('yanlış anahtar açık hatayla reddedilir', () => {
    const r = runEsm(
      `import fs from 'node:fs';
       const src = ${JSON.stringify(path.join(dir, 'w.bin'))};
       fs.writeFileSync(src, 'veri');
       await L.encryptFile(src, src + '.enc', L.parseEncryptionKey(process.env.K1));
       let msg = null;
       try { await L.decryptFile(src + '.enc', null, L.parseEncryptionKey(process.env.K2)); } catch (e) { msg = e.message; }
       console.log(JSON.stringify({ msg }));`,
      { K1: KEY_B64, K2: OTHER_KEY_B64 }
    ) as { msg: string };
    expect(r.msg).toContain('Yanlış anahtar');
  });
});

describe('nesne adı', () => {
  it('tahmin edilemez: 128 bit rastgele sonek, eski backups/ öneki yok', () => {
    const r = runEsm(
      `const a = L.backupObjectKey({ kind: 'pg', ext: 'sql.gz', now: new Date('2026-10-10T03:30:04Z') });
       const b = L.backupObjectKey({ kind: 'pg', ext: 'sql.gz', now: new Date('2026-10-10T03:30:04Z') });
       console.log(JSON.stringify({ a, b }));`
    ) as { a: string; b: string };
    expect(r.a).not.toBe(r.b);
    expect(r.a).toMatch(/^db\/pg\/2026-10-10\/qratex-2026-10-10T03-30-04-[0-9a-f]{32}\.sql\.gz\.enc$/);
    expect(r.a.startsWith('backups/')).toBe(false);
  });
});

describe('budama seçimi', () => {
  it('en yeni N korunur, yalnız .enc nesneleri aday', () => {
    const r = runEsm(
      `const objs = [
         { Key: 'db/pg/a.enc', LastModified: '2026-10-01T00:00:00Z' },
         { Key: 'db/pg/b.enc', LastModified: '2026-10-03T00:00:00Z' },
         { Key: 'db/pg/c.enc', LastModified: '2026-10-02T00:00:00Z' },
         { Key: 'db/pg/not.txt', LastModified: '2026-09-01T00:00:00Z' },
       ];
       console.log(JSON.stringify({ p: L.selectPrunable(objs, 2).map((o) => o.Key), none: L.selectPrunable(objs, 0).length }));`
    ) as { p: string[]; none: number };
    expect(r.p).toEqual(['db/pg/a.enc']);
    expect(r.none).toBe(0);
  });
});

describe('betikler uygulama kovasına geri düşmez', () => {
  it.each(['scripts/db-backup.mjs', 'scripts/db-backup-json.mjs', 'scripts/db-restore.mjs'])('%s R2_* kimliği okumaz', (p) => {
    const src = readFileSync(path.join(root, p), 'utf8');
    expect(src).not.toMatch(/process\.env\.R2_(BUCKET|ACCESS_KEY_ID|SECRET_ACCESS_KEY|ACCOUNT_ID)/);
    expect(src).not.toMatch(/'backups\/db/);
  });

  it('yedek betikleri yüklemeden önce şifreler ve doğrular', () => {
    for (const p of ['scripts/db-backup.mjs', 'scripts/db-backup-json.mjs']) {
      const src = readFileSync(path.join(root, p), 'utf8');
      expect(src).toContain('parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY)');
      expect(src).toContain('requireBackupR2Config(process.env)');
      const enc = src.indexOf('encryptFile(');
      const verify = src.indexOf('verifyEncryptedFile(');
      const put = src.indexOf('new PutObjectCommand(');
      expect(enc).toBeGreaterThan(0);
      expect(verify).toBeGreaterThan(enc);
      expect(put).toBeGreaterThan(verify);
    }
  });
});
