#!/usr/bin/env node
/**
 * YEDEK ÇÖZME / İNDİRME — `db-backup.mjs` ve `db-backup-json.mjs`'in ürettiği şifreli (QRXBK1,
 * AES-256-GCM) yedekleri çözer. Ayrıntı: scripts/db-backup.README.md
 *
 * Bu betik VERİTABANINA DOKUNMAZ. Yalnız dosyayı çözer (ve istenirse açar); geri yükleme komutunu
 * ekrana yazar. Geri yükleme her zaman önce YENİ bir Neon branch'ine (ya da yerel Postgres'e)
 * yapılır, doğrulanır; canlı veritabanının üstüne doğrudan yazılmaz.
 *
 * KULLANIM
 *   node scripts/db-restore.mjs --file <yedek.enc> [--out <yol>] [--gunzip] [--force]
 *   node scripts/db-restore.mjs --verify --file <yedek.enc>        # yalnız doğrula, çıktı yazma
 *   node scripts/db-restore.mjs --list [--kind pg|json]             # kovadaki yedekler
 *   node scripts/db-restore.mjs --latest [--kind pg|json] [--gunzip] # en yenisini indir + çöz
 *   node scripts/db-restore.mjs --key <nesne-anahtarı> [--gunzip]    # belirli yedeği indir + çöz
 *
 * ORTAM
 *   BACKUP_ENCRYPTION_KEY          zorunlu (yedeği şifreleyen anahtar)
 *   BACKUP_R2_ACCOUNT_ID, BACKUP_R2_BUCKET, BACKUP_R2_PREFIX   (--list/--latest/--key için)
 *   BACKUP_R2_READ_ACCESS_KEY_ID / BACKUP_R2_READ_SECRET_ACCESS_KEY  okuma token'ı (önerilen:
 *     yedek alan token yalnız yazabilir). Yoksa BACKUP_R2_ACCESS_KEY_ID / _SECRET_ACCESS_KEY.
 */
import { createGunzip } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, renameSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ENCRYPTED_EXT,
  backupS3Client,
  decryptFile,
  loadDotEnv,
  parseEncryptionKey,
  readHeader,
  requireBackupR2Config,
  safeUnlink,
} from './db-backup-lib.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

loadDotEnv();

const log = (...a) => console.log('[geri-yukle]', ...a);
const fail = (m) => {
  console.error('[geri-yukle] HATA:', m);
  process.exit(1);
};

function readConfig() {
  const env = { ...process.env };
  // Okuma için ayrı token varsa onu kullan (yedek alan token'ın okuma yetkisi olmamalı).
  if (env.BACKUP_R2_READ_ACCESS_KEY_ID && env.BACKUP_R2_READ_SECRET_ACCESS_KEY) {
    env.BACKUP_R2_ACCESS_KEY_ID = env.BACKUP_R2_READ_ACCESS_KEY_ID;
    env.BACKUP_R2_SECRET_ACCESS_KEY = env.BACKUP_R2_READ_SECRET_ACCESS_KEY;
  }
  return requireBackupR2Config(env);
}

async function listBackups(client, cfg, kind) {
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const prefix = `${cfg.prefix}${kind ? `${kind}/` : ''}`;
  const out = [];
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: prefix, ContinuationToken: token }));
    out.push(...(page.Contents || []).filter((o) => o.Key?.endsWith(ENCRYPTED_EXT)));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => new Date(b.LastModified).getTime() - new Date(a.LastModified).getTime());
}

async function download(client, cfg, key, dest) {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const res = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
  if (!res.Body) throw new Error('Boş yanıt.');
  await pipeline(res.Body, createWriteStream(dest, { mode: 0o600 }));
}

function defaultOut(encName, gunzip) {
  let base = path.basename(encName);
  if (base.endsWith(ENCRYPTED_EXT)) base = base.slice(0, -ENCRYPTED_EXT.length);
  if (gunzip && base.endsWith('.gz')) base = base.slice(0, -3);
  return path.join(process.cwd(), base);
}

function printRestoreHelp(outPath) {
  const isSql = /\.sql(\.gz)?$/.test(outPath);
  log('');
  log('SONRAKİ ADIM (elle, bilerek):');
  if (isSql) {
    log('  1) Neon panelinden YENİ bir branch aç (canlıya doğrudan yükleme yapma).');
    log('  2) O branch\'in pooler\'sız adresiyle:');
    log(outPath.endsWith('.gz')
      ? `     gunzip -c "${outPath}" | psql "<YENİ_BRANCH_DIRECT_URL>" -v ON_ERROR_STOP=1`
      : `     psql "<YENİ_BRANCH_DIRECT_URL>" -v ON_ERROR_STOP=1 -f "${outPath}"`);
    log('  3) Satır sayılarını ve kritik tabloları doğrula, sonra uygulamayı o branch\'e çevir.');
  } else {
    log('  JSON yedeği "veri kurtarma" yedeğidir: şema `prisma migrate deploy` ile kurulur, sonra');
    log('  gerekli tablolar elle/betikle basılır. Ayrıntı: scripts/db-backup.README.md');
  }
  log('  Çözülmüş dosya BÜTÜN VERİTABANIDIR: işin bitince sil.');
}

async function main() {
  const kind = opt('--kind');
  if (kind && !['pg', 'json'].includes(kind)) throw new Error('--kind pg ya da json olmalı.');

  if (flag('--list')) {
    const cfg = readConfig();
    const client = await backupS3Client(cfg);
    const items = await listBackups(client, cfg, kind);
    if (!items.length) return log('Kovada yedek yok.');
    for (const o of items) {
      log(`${new Date(o.LastModified).toISOString()}  ${(Number(o.Size) / 1e6).toFixed(2)} MB  ${o.Key}`);
    }
    return;
  }

  const key = parseEncryptionKey(process.env.BACKUP_ENCRYPTION_KEY);
  const gunzip = flag('--gunzip');
  const force = flag('--force');
  let encPath = opt('--file');
  let downloaded = null;

  if (!encPath) {
    let objectKey = opt('--key');
    if (!objectKey && !flag('--latest')) {
      throw new Error('Kaynak ver: --file <yol>, --key <nesne-anahtarı> ya da --latest. (--list ile listele)');
    }
    const cfg = readConfig();
    const client = await backupS3Client(cfg);
    if (!objectKey) {
      const items = await listBackups(client, cfg, kind ?? 'pg');
      if (!items.length) throw new Error('Kovada yedek yok.');
      objectKey = items[0].Key;
    }
    downloaded = path.join(tmpdir(), `qratex-restore-${randomBytes(8).toString('hex')}${ENCRYPTED_EXT}`);
    log(`indiriliyor: ${cfg.bucket}/${objectKey}`);
    await download(client, cfg, objectKey, downloaded);
    encPath = downloaded;
    if (!opt('--out')) args.push('--out', defaultOut(objectKey, gunzip));
  }

  if (!existsSync(encPath)) throw new Error(`Dosya yok: ${encPath}`);

  try {
    const h = readHeader(encPath, key);
    log(`biçim QRXBK1, anahtar ${h.keyId}, ${(h.size / 1e6).toFixed(2)} MB`);

    if (flag('--verify')) {
      const sha = await decryptFile(encPath, null, key);
      log(`DOĞRULANDI (içerik sha256 ${sha}). Çıktı yazılmadı.`);
      return;
    }

    const outPath = opt('--out') ?? defaultOut(encPath, gunzip);
    if (existsSync(outPath) && !force) throw new Error(`Çıktı zaten var: ${outPath} (üzerine yazmak için --force)`);

    if (gunzip) {
      const gzTmp = path.join(tmpdir(), `qratex-restore-${randomBytes(8).toString('hex')}.gz`);
      try {
        await decryptFile(encPath, gzTmp, key);
        const partial = `${outPath}.partial`;
        try {
          await pipeline(createReadStream(gzTmp), createGunzip(), createWriteStream(partial, { mode: 0o600 }));
        } catch (e) {
          safeUnlink(partial);
          throw e;
        }
        if (existsSync(outPath)) unlinkSync(outPath);
        renameSync(partial, outPath);
      } finally {
        safeUnlink(gzTmp);
      }
    } else {
      if (existsSync(outPath)) unlinkSync(outPath);
      await decryptFile(encPath, outPath, key);
    }
    log(`çözüldü: ${outPath}`);
    printRestoreHelp(outPath);
  } finally {
    if (downloaded) safeUnlink(downloaded);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
