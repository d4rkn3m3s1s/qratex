#!/usr/bin/env node
/**
 * VERİTABANI YEDEĞİ (JSON) — pg_dump GEREKTİRMEZ.
 *
 * NEDEN İKİNCİ BİR YEDEK BETİĞİ VAR
 * `scripts/db-backup.mjs` tam ve tercih edilen yedektir (şema + veri + indeksler),
 * ama `pg_dump`'ın SUNUCUYLA AYNI YA DA DAHA YENİ sürümde olmasını şart koşar.
 * Bu betik o boşluğu doldurur: Prisma istemcisini kullandığı için ekstra hiçbir şey kurulmaz.
 *
 * NE YEDEKLER / NE YEDEKLEMEZ
 *   ✓ Bütün tabloların satırları (JSON)
 *   ✗ Şema, indeksler, kısıtlar, diziler, tetikleyiciler; tablolar arası tutarlı anlık görüntü
 * Yani bu bir "veri kurtarma" yedeğidir, "tek tuşla geri yükleme" değil. Gerçek felaket
 * kurtarma için pg_dump yedeği şarttır.
 *
 * GÜVENLİK (P0-30) — ayrıntı: scripts/db-backup.README.md
 *  - Yalnız `BACKUP_R2_*` ile tanımlı AYRI, özel kovaya yazılır; `R2_*`'ye geri düşüş yok.
 *  - AES-256-GCM ile şifrelenir (`BACKUP_ENCRYPTION_KEY`); `--local-only` çıktısı da şifreli.
 *  - Nesne adı 128 bit rastgele sonek taşır. Çözme: `node scripts/db-restore.mjs`.
 *  - Okunamayan model varsa yedek BAŞARISIZ sayılır (eskiden "atlandı" deyip başarıyla
 *    bitiyordu, eksik yedek fark edilmiyordu). Bilerek devam etmek için `--allow-skip`.
 *
 * KULLANIM
 *   node scripts/db-backup-json.mjs                # yedek al + şifrele + yedek kovasına yükle
 *   node scripts/db-backup-json.mjs --local-only   # yalnız diske (şifreli) yaz
 *   node scripts/db-backup-json.mjs --keep 14      # kovada son 14'ü tut (List+Delete yetkisi ister)
 *
 * ⚠️ ÇÖZÜLMÜŞ ÇIKTI BÜTÜN VERİDİR — kullanıcı e-postaları, jetonlar dahil. Paylaşma.
 */

import { createGzip } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { copyFileSync, createReadStream, createWriteStream, readFileSync, statSync, unlinkSync } from 'node:fs';
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
const ALLOW_SKIP = args.includes('--allow-skip');
const keepIdx = args.indexOf('--keep');
const KEEP = keepIdx >= 0 ? Number(args[keepIdx + 1]) : 0;
const KIND = 'json';

loadDotEnv();

const log = (...a) => console.log('[yedek-json]', ...a);
const tempFiles = new Set();
let prisma = null;
async function fail(m, code = 1) {
  console.error('[yedek-json] HATA:', m);
  for (const f of tempFiles) safeUnlink(f);
  try { await prisma?.$disconnect(); } catch { /* yoksay */ }
  await pingBackupHeartbeat(false, `json yedek HATA: ${m}`);
  process.exit(code);
}

/* Prisma istemcisindeki model adlarını ŞEMADAN DEĞİL istemciden okuyoruz:
   elle liste tutmak ilk şema değişikliğinde eskir. */
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
    Bucket: cfg.bucket, Delete: { Objects: old.map((o) => ({ Key: o.Key })) },
  }));
  return old.length;
}

async function main() {
  // Önce yapılandırma: şifrelenemeyecek/yüklenemeyecek döküm hiç alınmaz.
  const key = parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const cfg = LOCAL_ONLY ? null : requireBackupR2Config(process.env);
  if (keepIdx >= 0 && (!Number.isInteger(KEEP) || KEEP < 1)) {
    throw new BackupConfigError('--keep pozitif bir tam sayı olmalı.');
  }

  const { PrismaClient } = await import('../generated-prisma-client/index.js');
  prisma = new PrismaClient();

  const tmpBase = path.join(tmpdir(), `qratex-json-${randomBytes(12).toString('hex')}`);
  const outPath = `${tmpBase}.json`;
  const gzPath = `${outPath}.gz`;
  const encPath = `${gzPath}.enc`;
  for (const f of [outPath, gzPath, encPath]) tempFiles.add(f);

  const models = modelNames();
  log(`${models.length} model bulundu, okunuyor…`);

  const out = createWriteStream(outPath, { mode: 0o600 });
  out.write(`{"meta":{"alindi":"${new Date().toISOString()}","modelSayisi":${models.length}},"veri":{`);

  let total = 0;
  let first = true;
  const counts = {};
  const skipped = [];
  for (const m of models) {
    let rows;
    try {
      rows = await prisma[m].findMany();
    } catch (e) {
      skipped.push(m);
      log(`  OKUNAMADI: ${m} (${String(e.message).split('\n')[0].slice(0, 80)})`);
      continue;
    }
    counts[m] = rows.length;
    total += rows.length;
    out.write(`${first ? '' : ','}${JSON.stringify(m)}:${JSON.stringify(rows, replacer)}`);
    first = false;
  }
  out.write(`},"atlanan":${JSON.stringify(skipped)}}`);
  await new Promise((r) => out.end(r));
  await prisma.$disconnect();

  if (skipped.length && !ALLOW_SKIP) {
    throw new Error(`${skipped.length} model okunamadı (${skipped.join(', ')}); eksik yedek kabul edilmedi. Bilerek devam: --allow-skip`);
  }

  const size = statSync(outPath).size;
  if (size < 64) throw new Error('Çıktı boş — yedek geçersiz.');
  log(`${total} satır, ${(size / 1e6).toFixed(2)} MB`);
  const top = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  log('en dolu tablolar: ' + top.map(([k, n]) => `${k}=${n}`).join(', '));

  await pipeline(createReadStream(outPath), createGzip({ level: 9 }), createWriteStream(gzPath, { mode: 0o600 }));
  unlinkSync(outPath);
  log(`sıkıştırıldı: ${(statSync(gzPath).size / 1e6).toFixed(2)} MB`);

  const sha = await encryptFile(gzPath, encPath, key);
  await verifyEncryptedFile(encPath, key, sha);
  unlinkSync(gzPath);
  log(`şifrelendi ve doğrulandı (anahtar ${keyFingerprint(key).toString('hex')}).`);

  const objectKey = backupObjectKey({ prefix: cfg?.prefix, kind: KIND, ext: 'json.gz' });

  if (LOCAL_ONLY) {
    const keep = path.join(process.cwd(), path.basename(objectKey));
    copyFileSync(encPath, keep);
    unlinkSync(encPath);
    log(`--local-only (şifreli): ${keep}`);
    await pingBackupHeartbeat(true, `json yedek (yerel) ${path.basename(keep)}`);
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
      log(`son ${KEEP} tutuluyor${removed ? `, ${removed} eski silindi` : ''}.`);
    } catch (e) {
      log(`UYARI: budama başarısız (${e.message}). Yedek yüklendi; R2 yaşam döngüsü kuralı kullan.`);
      await pingBackupHeartbeat(true, `json yedek ${objectKey} (budama başarısız)`);
      process.exit(3);
    }
  }
  await pingBackupHeartbeat(true, `json yedek ${objectKey}`);
  log('TAMAM');
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
