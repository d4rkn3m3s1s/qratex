#!/usr/bin/env node
/**
 * VERİTABANI YEDEĞİ — pg_dump ile tam yedek al, gzip'le, ŞİFRELE, AYRI ve ÖZEL R2 kovasına yükle.
 *
 * NEDEN BU BETİK VAR
 * 2026-08'de Neon projesi aylık ücretsiz compute limitini doldurup duraklatıldı ve
 * site tamamen durdu. O sırada elimizde hiçbir yedek yoktu; veriye ulaşmanın tek
 * yolu Neon'un tekrar açılmasını beklemekti. Sağlayıcıya bu kadar bağımlı kalmamak
 * için yedek kendi kontrolümüzdeki bir yerde (R2) duruyor.
 *
 * GÜVENLİK (P0-30) — ayrıntı ve kurulum: scripts/db-backup.README.md
 *  - Yalnız `BACKUP_R2_*` ile tanımlı AYRI kovaya yazılır. Uygulamanın `R2_*` kovasına (herkese
 *    açık sunulan yüklemeler kovası) geri düşüş YOKTUR; eksikse betik fail eder.
 *  - İstemci tarafında AES-256-GCM ile şifrelenir (`BACKUP_ENCRYPTION_KEY`, 32 bayt). Düz metin
 *    döküm diske yalnız geçici yazılır ve hemen silinir. `--local-only` çıktısı da şifrelidir.
 *  - Nesne adı 128 bit rastgele sonek taşır (tahmin edilemez).
 *  - Yüklemeden önce şifreli dosya çözülüp doğrulanır.
 *  - Geri yükleme / çözme: `node scripts/db-restore.mjs`.
 *
 * NEDEN VERCEL CRON'U DEĞİL
 * Vercel'in çalışma ortamında `pg_dump` ikilisi YOKTUR ve kurulamaz. Bu yüzden yedek
 * bir sunucusuz fonksiyondan alınamaz; bu betik pg_dump'ın bulunduğu bir makineden
 * çalışır (geliştirici makinesi, bir VM, ya da CI runner).
 *
 * KULLANIM
 *   node scripts/db-backup.mjs                 # yedek al + şifrele + yedek kovasına yükle
 *   node scripts/db-backup.mjs --local-only    # yalnız diske (şifreli) yaz, yükleme yapma
 *   node scripts/db-backup.mjs --keep 14       # kovada son 14 yedeği tut (List+Delete yetkisi ister;
 *                                              # Object Lock / yalnız-yazma token'ında R2 yaşam döngüsü kuralı kullan)
 *
 * ZAMANLAMA (Windows Görev Zamanlayıcı örneği, günlük 03:30)
 *   schtasks /create /tn "QRateX DB Yedek" /tr "node C:\qratex\scripts\db-backup.mjs" ^
 *            /sc daily /st 03:30
 *   `BACKUP_HEARTBEAT_URL` tanımlarsan yedek alınmayan gün alarm alırsın.
 *
 * ⚠️ ÇÖZÜLMÜŞ DOSYA BÜTÜN VERİTABANIDIR — kullanıcı e-postaları, jetonlar, her şey.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { copyFileSync, createReadStream, createWriteStream, existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BackupConfigError,
  backupObjectKey,
  backupS3Client,
  encryptFile,
  keyFingerprint,
  loadDotEnv,
  parseEncryptionKey,
  pingBackupHeartbeat,
  requireBackupR2Config,
  safeUnlink,
  selectPrunable,
  verifyEncryptedFile,
} from './db-backup-lib.mjs';

const args = process.argv.slice(2);
const LOCAL_ONLY = args.includes('--local-only');
const keepIdx = args.indexOf('--keep');
/** Budama yalnız açıkça istenirse (varsayılan: kova yaşam döngüsü kuralı yönetir). */
const KEEP = keepIdx >= 0 ? Number(args[keepIdx + 1]) : 0;
const KIND = 'pg';

/* Betik `next` dışında çalıştığı için .env kendiliğinden yüklenmez. */
loadDotEnv();

const log = (...a) => console.log('[yedek]', ...a);
const tempFiles = new Set();
async function fail(msg, code = 1) {
  console.error('[yedek] HATA:', msg);
  for (const f of tempFiles) safeUnlink(f);
  await pingBackupHeartbeat(false, `pg yedek HATA: ${msg}`);
  process.exit(code);
}

/* ── pg_dump'ı bul ───────────────────────────────────────────────────
   PATH'te olmayabilir (Windows'ta genelde değildir); bilinen kurulum
   yollarını da tarıyoruz ki kullanıcı elle uğraşmasın. */
function findPgDump() {
  if (process.env.PG_DUMP_PATH) return process.env.PG_DUMP_PATH;
  /*
   * ÖNCE DİSKTEKİ GERÇEK YOLLAR, sonra çıplak "pg_dump".
   * Çıplak isim yalnızca SON çare olmalı.
   */
  const candidates = [];
  for (const v of ['17', '16', '15', '14']) {
    candidates.push(`C:/Program Files/PostgreSQL/${v}/bin/pg_dump.exe`);
    candidates.push(`/usr/lib/postgresql/${v}/bin/pg_dump`);
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return 'pg_dump'; // PATH'te olabilir; değilse spawn ENOENT verir ve açıklarız
}

/* ── DIRECT_URL kullan, pooler'ı DEĞİL ───────────────────────────────
   pg_dump uzun süreli tek bir oturum açar ve pgbouncer'ın işlem havuzu
   modunda bu oturum kopar. Neon'da doğru adres pooler'sız olandır.
   `BACKUP_DATABASE_URL` verilirse o kullanılır (salt okunur rol önerilir). */
function dumpUrl() {
  const explicit = process.env.BACKUP_DATABASE_URL;
  const direct = process.env.DIRECT_URL;
  const pooled = process.env.DATABASE_URL;
  const raw = explicit || direct || pooled;
  if (!raw) throw new BackupConfigError('BACKUP_DATABASE_URL, DIRECT_URL veya DATABASE_URL tanımlı değil.');
  if (!explicit && !direct) log('UYARI: DIRECT_URL yok, DATABASE_URL kullanılıyor (pooler kopabilir).');
  const u = new URL(raw);
  // pg_dump bu Prisma'ya özgü parametreleri anlamaz
  for (const p of ['pgbouncer', 'connection_limit', 'pool_timeout', 'channel_binding']) {
    u.searchParams.delete(p);
  }
  if (!u.searchParams.get('sslmode')) u.searchParams.set('sslmode', 'require');
  return u.toString();
}

function runPgDump(url, outPath) {
  return new Promise((resolve, reject) => {
    const bin = findPgDump();
    // --no-owner / --no-acl: yedek BAŞKA bir Postgres'e de geri yüklenebilsin.
    // Bağlantı adresi `--dbname=` ile verilmeli, konumsal argüman olarak DEĞİL.
    const proc = spawn(bin, [`--dbname=${url}`, '--no-owner', '--no-acl', '--format=plain', `--file=${outPath}`], {
      stdio: ['ignore', 'inherit', 'pipe'],
    });
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', (e) => reject(new Error(
      e.code === 'ENOENT'
        ? `pg_dump bulunamadı (denenen: ${bin}). PG_DUMP_PATH ile yolunu ver.`
        : e.message
    )));
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      // Bağlantı adresi (parola dahil) hata metnine sızmasın.
      const clean = err.trim().split(url).join('<DATABASE_URL>');
      /*
       * SÜRÜM UYUŞMAZLIĞI: pg_dump, KENDİNDEN YENİ bir sunucudan yedek almayı bilerek reddeder.
       * Zorlanmamalı; çözüm istemciyi yükseltmek.
       */
      if (/s[uü]r[uü]m|version mismatch|server version/i.test(clean)) {
        const srv = /(?:sunucu s.r.m.|server version):\s*([\d.]+)/i.exec(clean)?.[1];
        const cli = /pg_dump s.r.m.|pg_dump version[:\s]*([\d.]+)/i.exec(clean)?.[1];
        return reject(new Error(
          `pg_dump sürümü sunucudan eski.\n` +
          `  sunucu: ${srv || '?'}   yereldeki pg_dump: ${cli || '?'}\n` +
          `  Çözüm: sunucuyla aynı ya da daha yeni bir PostgreSQL istemcisi kur,\n` +
          `  sonra PG_DUMP_PATH ile onun yolunu ver. Örnek:\n` +
          `    PG_DUMP_PATH="C:/Program Files/PostgreSQL/17/bin/pg_dump.exe" node scripts/db-backup.mjs`
        ));
      }
      reject(new Error(`pg_dump ${code} koduyla çıktı:\n${clean.slice(0, 600)}`));
    });
  });
}

/** Eski yedekleri sil (yalnız `--keep N` ile; List + Delete yetkisi gerekir). */
async function prune(client, cfg) {
  const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const prefix = `${cfg.prefix}${KIND}/`;
  const objects = [];
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token }));
    objects.push(...(page.Contents || []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  const old = selectPrunable(objects, KEEP);
  if (!old.length) return 0;
  await client.send(new DeleteObjectsCommand({
    Bucket: cfg.bucket,
    Delete: { Objects: old.map((o) => ({ Key: o.Key })) },
  }));
  return old.length;
}

async function main() {
  // Önce yapılandırma: yüklenemeyecek ya da şifrelenemeyecek döküm hiç alınmaz.
  const key = parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const cfg = LOCAL_ONLY ? null : requireBackupR2Config(process.env);
  if (keepIdx >= 0 && (!Number.isInteger(KEEP) || KEEP < 1)) {
    throw new BackupConfigError('--keep pozitif bir tam sayı olmalı.');
  }

  const tmpBase = path.join(tmpdir(), `qratex-${randomBytes(12).toString('hex')}`);
  const sqlPath = `${tmpBase}.sql`;
  const gzPath = `${sqlPath}.gz`;
  const encPath = `${gzPath}.enc`;
  for (const f of [sqlPath, gzPath, encPath]) tempFiles.add(f);

  log('pg_dump çalışıyor…');
  const t0 = Date.now();
  await runPgDump(dumpUrl(), sqlPath);
  const rawSize = statSync(sqlPath).size;
  if (rawSize < 1024) throw new Error(`Dump şüpheli derecede küçük (${rawSize} bayt) — yedek geçersiz.`);
  log(`dump alındı: ${(rawSize / 1e6).toFixed(2)} MB (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);

  log('sıkıştırılıyor…');
  await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), createWriteStream(gzPath, { mode: 0o600 }));
  unlinkSync(sqlPath); // ham SQL'i diskte bırakma
  const gzSize = statSync(gzPath).size;
  log(`sıkıştırıldı: ${(gzSize / 1e6).toFixed(2)} MB (%${Math.round((1 - gzSize / rawSize) * 100)} kazanç)`);

  log('şifreleniyor (AES-256-GCM)…');
  const sha = await encryptFile(gzPath, encPath, key);
  await verifyEncryptedFile(encPath, key, sha);
  unlinkSync(gzPath); // şifresiz sıkıştırılmış dökümü de bırakma
  log(`şifrelendi ve doğrulandı (sha256 ${sha.slice(0, 16)}…, anahtar ${keyFingerprint(key).toString('hex')}).`);

  const objectKey = backupObjectKey({ prefix: cfg?.prefix, kind: KIND, ext: 'sql.gz' });

  if (LOCAL_ONLY) {
    const keep = path.join(process.cwd(), path.basename(objectKey));
    copyFileSync(encPath, keep);
    unlinkSync(encPath);
    log(`--local-only (şifreli): ${keep}`);
    log('Çözmek için: node scripts/db-restore.mjs --file "<yol>"');
    await pingBackupHeartbeat(true, `pg yedek (yerel) ${path.basename(keep)}`);
    return;
  }

  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await backupS3Client(cfg);
  log(`yedek kovasına yükleniyor: ${cfg.bucket}/${objectKey}`);
  await client.send(new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: objectKey,
    Body: readFileSync(encPath),
    ContentType: 'application/octet-stream',
    Metadata: { format: 'qrxbk1', kind: KIND, keyid: keyFingerprint(key).toString('hex'), sha256: sha },
  }));
  unlinkSync(encPath);
  log('yüklendi.');

  if (KEEP > 0) {
    try {
      const removed = await prune(client, cfg);
      log(`son ${KEEP} yedek tutuluyor${removed ? `, ${removed} eski yedek silindi` : ''}.`);
    } catch (e) {
      // Yedek alındı; budama başarısızlığı ayrı çıkış koduyla bildirilir (yalnız-yazma token'ı / Object Lock).
      log(`UYARI: budama başarısız (${e.message}). Yedek yüklendi; eski yedekler için R2 yaşam döngüsü kuralı kullan.`);
      await pingBackupHeartbeat(true, `pg yedek ${objectKey} (budama başarısız)`);
      process.exit(3);
    }
  }
  await pingBackupHeartbeat(true, `pg yedek ${objectKey}`);
  log('TAMAM');
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
