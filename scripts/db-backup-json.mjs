#!/usr/bin/env node
/**
 * VERİTABANI YEDEĞİ (JSON) — pg_dump GEREKTİRMEZ.
 *
 * NEDEN İKİNCİ BİR YEDEK BETİĞİ VAR
 * `scripts/db-backup.mjs` tam ve tercih edilen yedektir (şema + veri + indeksler),
 * ama `pg_dump`'ın SUNUCUYLA AYNI YA DA DAHA YENİ sürümde olmasını şart koşar.
 * Neon şu an PostgreSQL 17 çalıştırıyor; makinede 16 varsa o betik çalışmaz ve
 * kurulum yapmadan yedek alınamaz. Bu betik o boşluğu doldurur: Prisma istemcisini
 * kullandığı için ekstra hiçbir şey kurulmaz.
 *
 * NE YEDEKLER / NE YEDEKLEMEZ
 *   ✓ Bütün tabloların satırları (JSON)
 *   ✗ Şema, indeksler, kısıtlar, diziler, tetikleyiciler
 * Yani bu bir "veri kurtarma" yedeğidir, "tek tuşla geri yükleme" değil. Geri
 * yüklerken şema `prisma migrate deploy` ile kurulur, sonra veri basılır.
 * Gerçek felaket kurtarma için pg_dump yedeği şarttır — bu, o alınamadığı sürece
 * elinde hiçbir şey olmamasını engeller.
 *
 * KULLANIM
 *   node scripts/db-backup-json.mjs                # yedek al + R2'ye yükle
 *   node scripts/db-backup-json.mjs --local-only   # yalnız diske yaz
 *
 * ⚠️ ÇIKTI BÜTÜN VERİDİR — kullanıcı e-postaları, jetonlar dahil. Paylaşma.
 */

import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream, existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const LOCAL_ONLY = process.argv.includes('--local-only');
const KEEP = 14;
const PREFIX = 'backups/db-json/';

function loadEnv() {
  const file = path.join(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}
loadEnv();

const log = (...a) => console.log('[yedek-json]', ...a);
const fail = (m) => { console.error('[yedek-json] HATA:', m); process.exit(1); };

const { PrismaClient } = await import('../generated-prisma-client/index.js');
const prisma = new PrismaClient();

/* Prisma istemcisindeki model adlarını ŞEMADAN DEĞİL istemciden okuyoruz:
   140 model var, elle liste tutmak ilk şema değişikliğinde eskir. */
function modelNames() {
  return Object.keys(prisma).filter(
    (k) => !k.startsWith('$') && !k.startsWith('_') && typeof prisma[k]?.findMany === 'function'
  );
}

/** BigInt ve Date, JSON.stringify'ı patlatır / bozar — açıkça çeviriyoruz. */
function replacer(_k, v) {
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return { __buffer: v.toString('base64') };
  return v;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(tmpdir(), `qratex-json-${stamp}.json`);
  const gzPath = `${outPath}.gz`;

  const models = modelNames();
  log(`${models.length} model bulundu, okunuyor…`);

  const out = createWriteStream(outPath);
  out.write(`{"meta":{"alindi":"${new Date().toISOString()}","modelSayisi":${models.length}},"veri":{`);

  let total = 0;
  let first = true;
  const counts = {};
  for (const m of models) {
    let rows;
    try {
      rows = await prisma[m].findMany();
    } catch (e) {
      // Görünüm/eşleşmeyen model olabilir — yedeği tamamen düşürmeyelim.
      log(`  atlandı: ${m} (${e.message.split('\n')[0].slice(0, 60)})`);
      continue;
    }
    counts[m] = rows.length;
    total += rows.length;
    out.write(`${first ? '' : ','}${JSON.stringify(m)}:${JSON.stringify(rows, replacer)}`);
    first = false;
  }
  out.write('}}');
  await new Promise((r) => out.end(r));

  const size = statSync(outPath).size;
  if (size < 64) fail('Çıktı boş — yedek geçersiz.');
  log(`${total} satır, ${(size / 1e6).toFixed(2)} MB`);
  const top = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  log('en dolu tablolar: ' + top.map(([k, n]) => `${k}=${n}`).join(', '));

  await pipeline(createReadStream(outPath), createGzip({ level: 9 }), createWriteStream(gzPath));
  const gzSize = statSync(gzPath).size;
  unlinkSync(outPath);
  log(`sıkıştırıldı: ${(gzSize / 1e6).toFixed(2)} MB`);

  await prisma.$disconnect();

  if (LOCAL_ONLY) {
    const keep = path.join(process.cwd(), path.basename(gzPath));
    createReadStream(gzPath).pipe(createWriteStream(keep));
    log(`--local-only: ${keep}`);
    return;
  }

  const acc = process.env.R2_ACCOUNT_ID, key = process.env.R2_ACCESS_KEY_ID;
  const sec = process.env.R2_SECRET_ACCESS_KEY, bucket = process.env.R2_BUCKET;
  if (!acc || !key || !sec || !bucket) fail('R2 ayarlı değil.');

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${acc}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: sec },
  });
  const objKey = `${PREFIX}qratex-${stamp}.json.gz`;
  log(`R2'ye yükleniyor: ${objKey}`);
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: objKey, Body: readFileSync(gzPath), ContentType: 'application/gzip',
  }));
  unlinkSync(gzPath);

  const list = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX }));
  const old = (list.Contents || []).sort((a, b) => b.LastModified - a.LastModified).slice(KEEP);
  if (old.length) {
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket, Delete: { Objects: old.map((o) => ({ Key: o.Key })) },
    }));
  }
  log(`yüklendi. son ${KEEP} tutuluyor${old.length ? `, ${old.length} eski silindi` : ''}.`);
  log('TAMAM');
}

main().catch(async (e) => { try { await prisma.$disconnect(); } catch {} fail(e.message); });
