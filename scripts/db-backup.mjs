#!/usr/bin/env node
/**
 * VERİTABANI YEDEĞİ — pg_dump ile tam yedek al, gzip'le, Cloudflare R2'ye yükle.
 *
 * NEDEN BU BETİK VAR
 * 2026-08'de Neon projesi aylık ücretsiz compute limitini doldurup duraklatıldı ve
 * site tamamen durdu. O sırada elimizde hiçbir yedek yoktu; veriye ulaşmanın tek
 * yolu Neon'un tekrar açılmasını beklemekti. Sağlayıcıya bu kadar bağımlı kalmamak
 * için yedek kendi kontrolümüzdeki bir yerde (R2) duruyor.
 *
 * NEDEN VERCEL CRON'U DEĞİL
 * Vercel'in çalışma ortamında `pg_dump` ikilisi YOKTUR ve kurulamaz. Bu yüzden yedek
 * bir sunucusuz fonksiyondan alınamaz; bu betik pg_dump'ın bulunduğu bir makineden
 * çalışır (geliştirici makinesi, bir VM, ya da CI runner).
 *
 * KULLANIM
 *   node scripts/db-backup.mjs                 # yedek al + R2'ye yükle
 *   node scripts/db-backup.mjs --local-only    # yalnız diske yaz, yükleme yapma
 *   node scripts/db-backup.mjs --keep 14       # R2'de son 14 yedeği tut (varsayılan 14)
 *
 * ZAMANLAMA (Windows Görev Zamanlayıcı örneği, günlük 03:30)
 *   schtasks /create /tn "QRateX DB Yedek" /tr "node C:\qratex\scripts\db-backup.mjs" ^
 *            /sc daily /st 03:30
 *
 * ⚠️ ÜRETTİĞİ DOSYA BÜTÜN VERİTABANIDIR — kullanıcı e-postaları, jetonlar, her şey.
 *    Yerel kopyayı paylaşma; R2 kovası herkese açık OLMAMALI.
 */

import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const args = process.argv.slice(2);
const LOCAL_ONLY = args.includes('--local-only');
const KEEP = Number(args[args.indexOf('--keep') + 1]) || 14;
const PREFIX = 'backups/db/';

/* ── .env okuma ──────────────────────────────────────────────────────
   Betik `next` dışında çalıştığı için .env kendiliğinden yüklenmez. */
function loadEnv() {
  const file = path.join(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = m[1];
    if (process.env[key]) continue; // gerçek ortam değişkeni her zaman kazanır
    process.env[key] = m[2].replace(/^"(.*)"$/, '$1');
  }
}
loadEnv();

const log = (...a) => console.log('[yedek]', ...a);
const fail = (msg) => { console.error('[yedek] HATA:', msg); process.exit(1); };

/* ── pg_dump'ı bul ───────────────────────────────────────────────────
   PATH'te olmayabilir (Windows'ta genelde değildir); bilinen kurulum
   yollarını da tarıyoruz ki kullanıcı elle uğraşmasın. */
function findPgDump() {
  if (process.env.PG_DUMP_PATH) return process.env.PG_DUMP_PATH;
  /*
   * ÖNCE DİSKTEKİ GERÇEK YOLLAR, sonra çıplak "pg_dump".
   * İlk yazımda liste "pg_dump" ile başlıyordu ve döngü onu existsSync'ten muaf
   * tutuyordu — yani PATH'te olmasa bile hep o seçiliyor, kurulu olan sürüm hiç
   * denenmiyordu. Çıplak isim yalnızca SON çare olmalı.
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
   modunda bu oturum kopar. Neon'da doğru adres pooler'sız olandır. */
function dumpUrl() {
  const direct = process.env.DIRECT_URL;
  const pooled = process.env.DATABASE_URL;
  const raw = direct || pooled;
  if (!raw) fail('DIRECT_URL veya DATABASE_URL tanımlı değil.');
  if (!direct) log('UYARI: DIRECT_URL yok, DATABASE_URL kullanılıyor (pooler kopabilir).');
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
    // --no-owner / --no-acl: yedek BAŞKA bir Postgres'e de geri yüklenebilsin
    // (Neon'un rol adları Supabase'de yok; olmadan restore rol hatası verir).
    /*
     * Bağlantı adresi `--dbname=` ile verilmeli, konumsal argüman olarak DEĞİL.
     * Konumsal geçilince pg_dump onu "veritabanı adı" sanıyor ve sonraki bayrakları
     * fazladan argüman sayıp "çok fazla komut satırı argümanı" hatası veriyor.
     */
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
      const clean = err.trim();
      /*
       * SÜRÜM UYUŞMAZLIĞI en sık karşılaşılan hata ve mesajı kafa karıştırıcı.
       * pg_dump, KENDİNDEN YENİ bir sunucudan yedek almayı bilerek reddeder —
       * yeni sunucunun üretebileceği söz dizimini tanımayacağı için sessizce
       * bozuk yedek üretmektense durur. Zorlanmamalı; çözüm istemciyi yükseltmek.
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

function r2Client() {
  const acc = process.env.R2_ACCOUNT_ID;
  const key = process.env.R2_ACCESS_KEY_ID;
  const sec = process.env.R2_SECRET_ACCESS_KEY;
  if (!acc || !key || !sec) return null;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${acc}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: sec },
  });
}

/** Eski yedekleri sil — R2 ücretsiz katmanı 10 GB, sınırsız birikirse dolar. */
async function prune(client, bucket) {
  const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }));
  const objs = (list.Contents || []).sort((a, b) => b.LastModified - a.LastModified);
  const old = objs.slice(KEEP);
  if (!old.length) return 0;
  await client.send(new DeleteObjectsCommand({
    Bucket: bucket,
    Delete: { Objects: old.map((o) => ({ Key: o.Key })) },
  }));
  return old.length;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sqlPath = path.join(tmpdir(), `qratex-${stamp}.sql`);
  const gzPath = `${sqlPath}.gz`;

  log('pg_dump çalışıyor…');
  const t0 = Date.now();
  await runPgDump(dumpUrl(), sqlPath);
  const rawSize = statSync(sqlPath).size;
  if (rawSize < 1024) fail(`Dump şüpheli derecede küçük (${rawSize} bayt) — yedek geçersiz.`);
  log(`dump alındı: ${(rawSize / 1e6).toFixed(2)} MB (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);

  log('sıkıştırılıyor…');
  await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), createWriteStream(gzPath));
  const gzSize = statSync(gzPath).size;
  unlinkSync(sqlPath); // ham SQL'i diskte bırakma
  log(`sıkıştırıldı: ${(gzSize / 1e6).toFixed(2)} MB (%${Math.round((1 - gzSize / rawSize) * 100)} kazanç)`);

  if (LOCAL_ONLY) {
    const keep = path.join(process.cwd(), path.basename(gzPath));
    createReadStream(gzPath).pipe(createWriteStream(keep));
    log(`--local-only: ${keep}`);
    return;
  }

  const client = r2Client();
  const bucket = process.env.R2_BUCKET;
  if (!client || !bucket) fail('R2 ayarlı değil (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET).');

  const key = `${PREFIX}qratex-${stamp}.sql.gz`;
  log(`R2'ye yükleniyor: ${key}`);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: readFileSync(gzPath),
    ContentType: 'application/gzip',
  }));
  unlinkSync(gzPath);

  const removed = await prune(client, bucket);
  log(`yüklendi. son ${KEEP} yedek tutuluyor${removed ? `, ${removed} eski yedek silindi` : ''}.`);
  log('TAMAM');
}

main().catch((e) => fail(e.message));
