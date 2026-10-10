/**
 * Yedek betiklerinin ORTAK güvenlik katmanı (P0-30 · denetim K1/O9).
 *
 * Eski durum: yedekler uygulamanın `R2_BUCKET`'ına (yüklemelerin `R2_PUBLIC_URL` ile herkese açık
 * sunulduğu kova), `backups/db/qratex-<saniye damgası>.sql.gz` gibi TAHMİN EDİLEBİLİR adlarla ve
 * ŞİFRESİZ yazılıyordu. Kova public ise tam DB dökümü (parola hash'leri, TOTP sırları, jetonlar,
 * e-postalar) birkaç yüz denemeyle indirilebilirdi.
 *
 * Bu modülün kuralları:
 *  1. AYRI KOVA ZORUNLU: yalnız `BACKUP_R2_*` okunur; `R2_*`'ye GERİ DÜŞÜŞ YOK. Eksikse betik
 *     fail eder. `BACKUP_R2_BUCKET` uygulamanın `R2_BUCKET`'ı ile aynıysa da fail eder.
 *  2. İSTEMCİ TARAFI ŞİFRELEME: AES-256-GCM, anahtar `BACKUP_ENCRYPTION_KEY` (32 bayt; base64 ya
 *     da hex). Anahtar R2'de DEĞİL, parola yöneticisinde durur. Kova sızsa bile döküm okunamaz.
 *     Düz metin diske yalnız geçici olarak yazılır ve şifrelemeden hemen sonra silinir.
 *  3. TAHMİN EDİLEMEZ AD: nesne adına 128 bit rastgele sonek eklenir.
 *  4. DOĞRULAMA: yüklemeden ÖNCE şifreli dosya çözülüp özeti kaynakla karşılaştırılır (bozuk ya da
 *     yanlış anahtarla şifrelenmiş yedek yüklenmez).
 *
 * Şifreli dosya biçimi (`QRXBK1`):
 *   [0..5]   "QRXBK1"  sihirli bayt
 *   [6]      sürüm (1)
 *   [7]      ayrılmış (0)
 *   [8..15]  anahtar parmak izi = SHA-256(anahtar)[0..8]  (yanlış anahtarı açık hatayla bildirmek için)
 *   [16..27] IV (12 bayt, her dosyada rastgele)
 *   [28..N-16] şifreli metin
 *   [N-16..N] GCM doğrulama etiketi
 * İlk 28 bayt AAD olarak doğrulanır (başlık değiştirilemez).
 *
 * Bu dosya yan etkisizdir (içe aktarınca .env okunmaz, ağa çıkılmaz); jest testleri
 * (`__tests__/scripts/db-backup-crypto.test.ts`) alt süreçte doğrudan bu modülü çalıştırır.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform, Writable } from 'node:stream';
import path from 'node:path';

export const MAGIC = Buffer.from('QRXBK1', 'ascii');
export const FORMAT_VERSION = 1;
export const KEY_ID_LEN = 8;
export const IV_LEN = 12;
export const TAG_LEN = 16;
export const HEADER_LEN = MAGIC.length + 2 + KEY_ID_LEN + IV_LEN; // 28
export const ENCRYPTED_EXT = '.enc';
export const DEFAULT_PREFIX = 'db/';

export class BackupConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BackupConfigError';
  }
}

/* ── .env okuma (yalnız betikler çağırır) ──────────────────────────── */
export function loadDotEnv(cwd = process.cwd()) {
  const file = path.join(cwd, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    if (process.env[m[1]]) continue; // gerçek ortam değişkeni her zaman kazanır
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}

/* ── Anahtar ───────────────────────────────────────────────────────── */

/**
 * `BACKUP_ENCRYPTION_KEY` → 32 baytlık Buffer. Kabul: 64 hex karakter ya da 32 bayta çözülen
 * base64/base64url. Başka her şey (parola gibi kısa metin dahil) reddedilir: zayıf anahtar
 * sessizce türetilmez.
 * Üretmek için: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 */
export function parseEncryptionKey(raw) {
  const s = String(raw ?? '').trim();
  if (!s) {
    throw new BackupConfigError(
      'BACKUP_ENCRYPTION_KEY tanımlı değil. Yedekler şifresiz yazılmaz.\n' +
        "  Üret: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"\n" +
        '  ve parola yöneticisinde sakla (R2\'ye ya da depoya KOYMA).'
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(s)) {
    const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (b.length === 32) return b;
  }
  throw new BackupConfigError('BACKUP_ENCRYPTION_KEY 32 bayt olmalı (64 hex karakter ya da 44 karakterlik base64).');
}

/** Anahtarın kısa parmak izi (gizli değildir; yanlış anahtarı tanımak için). */
export function keyFingerprint(key) {
  return createHash('sha256').update(key).digest().subarray(0, KEY_ID_LEN);
}

/* ── Kova yapılandırması ───────────────────────────────────────────── */

const REQUIRED_R2 = ['BACKUP_R2_ACCOUNT_ID', 'BACKUP_R2_ACCESS_KEY_ID', 'BACKUP_R2_SECRET_ACCESS_KEY', 'BACKUP_R2_BUCKET'];

/**
 * Yedek kovası yapılandırması. `R2_*` (uygulama kovası) ASLA kullanılmaz.
 * @returns {{accountId:string, accessKeyId:string, secretAccessKey:string, bucket:string, prefix:string}}
 */
export function requireBackupR2Config(env = process.env) {
  const missing = REQUIRED_R2.filter((k) => !String(env[k] ?? '').trim());
  if (missing.length) {
    throw new BackupConfigError(
      `Yedek kovası ayarlı değil: ${missing.join(', ')} eksik.\n` +
        '  Yedekler YALNIZ ayrı, özel (public erişimi kapalı) bir kovaya yazılır; uygulamanın R2_* kovasına\n' +
        '  geri düşülmez. Ayrıntı: scripts/db-backup.README.md'
    );
  }
  const bucket = String(env.BACKUP_R2_BUCKET).trim();
  const appBucket = String(env.R2_BUCKET ?? '').trim();
  if (appBucket && appBucket === bucket) {
    throw new BackupConfigError(
      `BACKUP_R2_BUCKET uygulamanın R2_BUCKET'ı ile aynı ("${bucket}"). Uygulama kovası R2_PUBLIC_URL ile herkese\n` +
        '  açık sunuluyor; yedek oraya yazılmaz. Ayrı, özel bir kova aç.'
    );
  }
  const appKey = String(env.R2_ACCESS_KEY_ID ?? '').trim();
  if (appKey && appKey === String(env.BACKUP_R2_ACCESS_KEY_ID).trim()) {
    throw new BackupConfigError(
      'BACKUP_R2_ACCESS_KEY_ID uygulamanın R2_ACCESS_KEY_ID\'si ile aynı. Yedek kovası için yalnız o kovaya\n' +
        '  yetkili AYRI bir API token\'ı kullan (uygulama token\'ı yedekleri okuyamamalı/silememeli).'
    );
  }
  let prefix = String(env.BACKUP_R2_PREFIX ?? DEFAULT_PREFIX).trim().replace(/^\/+/, '');
  if (prefix && !prefix.endsWith('/')) prefix += '/';
  return {
    accountId: String(env.BACKUP_R2_ACCOUNT_ID).trim(),
    accessKeyId: String(env.BACKUP_R2_ACCESS_KEY_ID).trim(),
    secretAccessKey: String(env.BACKUP_R2_SECRET_ACCESS_KEY).trim(),
    bucket,
    prefix,
  };
}

/** S3 uyumlu istemci (yalnız yedek kovasının kimliğiyle). */
export async function backupS3Client(cfg) {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
}

/* ── Ad ────────────────────────────────────────────────────────────── */

/**
 * Tahmin edilemez nesne adı: `<prefix><tür>/<YYYY-MM-DD>/qratex-<damga>-<32 hex>.<uzantı>.enc`.
 * Tarih sıralama/budama için okunur kalır; 128 bitlik sonek adı listeleme yetkisi olmadan
 * bulunamaz kılar.
 */
export function backupObjectKey({ prefix = DEFAULT_PREFIX, kind, ext, now = new Date(), random = randomBytes(16) }) {
  if (!/^[a-z0-9-]+$/.test(kind)) throw new Error('geçersiz yedek türü');
  if (!/^[a-z0-9.]+$/.test(ext)) throw new Error('geçersiz uzantı');
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const day = stamp.slice(0, 10);
  return `${prefix}${kind}/${day}/qratex-${stamp}-${Buffer.from(random).toString('hex')}.${ext}${ENCRYPTED_EXT}`;
}

/* ── Şifreleme ─────────────────────────────────────────────────────── */

function buildHeader(key, iv) {
  const h = Buffer.alloc(HEADER_LEN);
  MAGIC.copy(h, 0);
  h[MAGIC.length] = FORMAT_VERSION;
  h[MAGIC.length + 1] = 0;
  keyFingerprint(key).copy(h, MAGIC.length + 2);
  Buffer.from(iv).copy(h, MAGIC.length + 2 + KEY_ID_LEN);
  return h;
}

function sha256Tap(hash) {
  return new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb(null, chunk);
    },
  });
}

/**
 * `inPath` → `outPath` (AES-256-GCM, akış hâlinde). Kaynak dosyanın SHA-256'sını döndürür.
 * Hata olursa yarım çıktı silinir.
 */
export async function encryptFile(inPath, outPath, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('anahtar 32 bayt olmalı');
  const iv = randomBytes(IV_LEN);
  const header = buildHeader(key, iv);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
  cipher.setAAD(header);
  const hash = createHash('sha256');
  const out = createWriteStream(outPath, { mode: 0o600 });
  try {
    out.write(header);
    await pipeline(createReadStream(inPath), sha256Tap(hash), cipher, out, { end: false });
    await new Promise((resolve, reject) => {
      out.end(cipher.getAuthTag(), (err) => (err ? reject(err) : resolve()));
    });
  } catch (e) {
    out.destroy();
    safeUnlink(outPath);
    throw e;
  }
  return hash.digest('hex');
}

/** Şifreli dosyanın başlığını okur ve doğrular. */
export function readHeader(encPath, key) {
  const size = statSync(encPath).size;
  if (size < HEADER_LEN + TAG_LEN) throw new Error('Dosya şifreli yedek olamayacak kadar küçük.');
  const fd = openSync(encPath, 'r');
  try {
    const header = Buffer.alloc(HEADER_LEN);
    readSync(fd, header, 0, HEADER_LEN, 0);
    const tag = Buffer.alloc(TAG_LEN);
    readSync(fd, tag, 0, TAG_LEN, size - TAG_LEN);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('QRXBK1 şifreli yedek değil (sihirli bayt yok).');
    }
    const version = header[MAGIC.length];
    if (version !== FORMAT_VERSION) throw new Error(`Desteklenmeyen yedek biçimi sürümü: ${version}`);
    const keyId = header.subarray(MAGIC.length + 2, MAGIC.length + 2 + KEY_ID_LEN);
    if (key && !timingSafeEqual(keyId, keyFingerprint(key))) {
      throw new Error('Yanlış anahtar: bu yedek başka bir BACKUP_ENCRYPTION_KEY ile şifrelenmiş.');
    }
    const iv = header.subarray(MAGIC.length + 2 + KEY_ID_LEN);
    return { header, iv, tag, size, keyId: keyId.toString('hex') };
  } finally {
    closeSync(fd);
  }
}

/**
 * Şifreyi çözer. `outPath` verilirse düz metin önce `outPath.partial`'a yazılır ve YALNIZ GCM
 * doğrulaması geçerse yerine taşınır (değiştirilmiş yedekten yarım/sahte döküm kalmaz).
 * `outPath` yoksa yalnız doğrular. Düz metnin SHA-256'sını döndürür.
 */
export async function decryptFile(encPath, outPath, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('anahtar 32 bayt olmalı');
  const { header, iv, tag, size } = readHeader(encPath, key);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const hash = createHash('sha256');
  const partial = outPath ? `${outPath}.partial` : null;
  const sink = partial
    ? createWriteStream(partial, { mode: 0o600 })
    : new Writable({ write: (_c, _e, cb) => cb() });
  try {
    const end = size - TAG_LEN - 1;
    const src = end >= HEADER_LEN ? createReadStream(encPath, { start: HEADER_LEN, end }) : Readable.from([]);
    await pipeline(src, decipher, sha256Tap(hash), sink);
  } catch (e) {
    if (partial) safeUnlink(partial);
    const msg = e && /unable to authenticate|Unsupported state/i.test(String(e.message))
      ? 'Doğrulama başarısız: yedek değiştirilmiş ya da bozuk (GCM etiketi uyuşmuyor).'
      : e.message;
    throw new Error(msg);
  }
  if (partial) renameSync(partial, outPath);
  return hash.digest('hex');
}


/** Şifreli dosyayı çözüp özetin kaynakla aynı olduğunu doğrular (yüklemeden önce). */
export async function verifyEncryptedFile(encPath, key, expectedSha256) {
  const got = await decryptFile(encPath, null, key);
  if (got !== expectedSha256) throw new Error('Şifreli yedek doğrulanamadı: çözülen içerik kaynakla aynı değil.');
  return got;
}

export function safeUnlink(p) {
  try {
    if (p && existsSync(p)) unlinkSync(p);
  } catch {
    /* yoksay */
  }
}

/* ── Budama ────────────────────────────────────────────────────────── */

/**
 * `keep` sayısından eski yedekleri seçer (en yeni önce). Saf fonksiyon; silme çağıran tarafta.
 * @param {{Key:string, LastModified?:Date|string}[]} objects
 */
export function selectPrunable(objects, keep) {
  if (!Number.isInteger(keep) || keep < 1) return [];
  return [...objects]
    .filter((o) => o && typeof o.Key === 'string' && o.Key.endsWith(ENCRYPTED_EXT))
    .sort((a, b) => new Date(b.LastModified ?? 0).getTime() - new Date(a.LastModified ?? 0).getTime())
    .slice(keep);
}

/* ── Heartbeat ─────────────────────────────────────────────────────── */

/**
 * Dead-man switch: `BACKUP_HEARTBEAT_URL` (healthchecks.io uyumlu) — başarıda URL'ye, hatada
 * `<URL>/fail`'e ping. Yedek hiç alınmazsa (makine kapalı vb.) izleme servisi alarm üretir.
 */
export async function pingBackupHeartbeat(ok, message, base = process.env.BACKUP_HEARTBEAT_URL) {
  if (!base || !String(base).trim()) return 'skipped';
  let u;
  try {
    u = new URL(String(base).trim());
  } catch {
    return 'error';
  }
  if (!ok) u.pathname = `${u.pathname.replace(/\/$/, '')}/fail`;
  try {
    const res = await fetch(u, {
      method: 'POST',
      body: String(message ?? '').slice(0, 2000),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok ? 'sent' : 'error';
  } catch {
    return 'error';
  }
}
