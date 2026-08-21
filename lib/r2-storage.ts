import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 (S3-uyumlu) depolama yardımcısı.
 * Genel amaçlı: görev ekleri (tasks/), ileride rozet (badges/) ve avatar (avatars/) için de kullanılır.
 * Vercel serverless read-only filesystem sorununu çözer (fs.writeFile yerine object storage).
 *
 * Gerekli env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL.
 * (R2_ENDPOINT verilirse onu kullanır; yoksa account id'den türetir.)
 */

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
}

/** R2 yapılandırılmış mı (tüm zorunlu env'ler var mı). */
export function isR2Configured(): boolean {
  return Boolean(env('R2_ACCESS_KEY_ID') && env('R2_SECRET_ACCESS_KEY') && env('R2_BUCKET') && (env('R2_ENDPOINT') || env('R2_ACCOUNT_ID')));
}

let cachedClient: S3Client | null = null;
function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const accountId = env('R2_ACCOUNT_ID');
  const endpoint = env('R2_ENDPOINT') || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  if (!endpoint) throw new Error('R2 endpoint yapılandırılmamış');
  cachedClient = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: env('R2_ACCESS_KEY_ID')!,
      secretAccessKey: env('R2_SECRET_ACCESS_KEY')!,
    },
    // Timeout + sinirli retry: R2 yavaslarsa istek asili kalip serverless
    // fonksiyonun CPU suresini bosuna yakmasin (Vercel CPU kotasi sinirli).
    requestHandler: { requestTimeout: 20_000, connectionTimeout: 5_000 },
    maxAttempts: 2,
  });
  return cachedClient;
}

/**
 * Dosyayı R2'ye yükler. `key` = bucket içi tam yol (ör. "tasks/abc-123.pdf").
 * `contentDisposition` verilirse (ör. 'attachment; filename="x"') nesneye yazılır;
 * indirilmesi gereken (tarayıcıda çalıştırılmaması gereken) türler için kullanılır.
 * Döner: public URL (R2_PUBLIC_URL/key). R2_PUBLIC_URL yoksa key döner (uyarı).
 */
export async function uploadToR2(key: string, body: Buffer, contentType: string, contentDisposition?: string): Promise<string> {
  const bucket = env('R2_BUCKET')!;
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentDisposition: contentDisposition,
  }));
  const publicBase = env('R2_PUBLIC_URL');
  if (!publicBase) {
    // Public URL ayarlanmamış — dosya yüklendi ama tarayıcıdan erişilemez.
    return `/${key}`;
  }
  return `${publicBase.replace(/\/$/, '')}/${key}`;
}

/**
 * Mevcut bir R2 nesnesinin Content-Disposition/Content-Type metadata'sını GÜNCELLER.
 * S3 in-place metadata değiştiremez → nesneyi kendine kopyalar (MetadataDirective: REPLACE).
 * Safari eski ekleri açamıyordu (attachment disposition) → inline'a çevirmek için backfill.
 */
export async function setR2Disposition(key: string, contentType: string, contentDisposition: string): Promise<void> {
  const bucket = env('R2_BUCKET')!;
  await getClient().send(new CopyObjectCommand({
    Bucket: bucket,
    Key: key,
    CopySource: `${bucket}/${key}`,
    ContentType: contentType,
    ContentDisposition: contentDisposition,
    MetadataDirective: 'REPLACE',
  }));
}

/** R2'den dosya siler. `key` = bucket içi tam yol. */
export async function deleteFromR2(key: string): Promise<void> {
  const bucket = env('R2_BUCKET')!;
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
}

/** Public URL'den bucket key'ini çıkarır (silme için). */
export function keyFromPublicUrl(url: string): string | null {
  const publicBase = env('R2_PUBLIC_URL');
  if (publicBase && url.startsWith(publicBase)) {
    return url.slice(publicBase.replace(/\/$/, '').length + 1);
  }
  // /key formatı (public URL yokken)
  if (url.startsWith('/')) return url.slice(1);
  return null;
}
