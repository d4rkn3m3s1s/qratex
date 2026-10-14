import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import path from 'path';
import { requireAuth } from '@/lib/api-auth';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { isR2Configured, uploadToR2 } from '@/lib/r2-storage';
import { publicFileUrl } from '@/lib/storage/served-url';
import {
  validateMimeMagic,
  svgContainsScript,
  assetContentDisposition,
  stripExifPng,
} from '@/lib/media-validation';
import { enforceRouteRateLimit } from '@/lib/http/route-rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Admin rozet/ödül görseli yükleme.
 *
 * P0-39 / P0-26: Eskiden dosya `process.cwd()/public/images/uploads/...` altına
 * `fs.writeFile` ile yazılıyordu. Vercel Functions'ta dosya sistemi salt-okunur
 * (`/var/task`) ve çalışma zamanında yazılan dosya statik `public` servisine
 * girmez → üretimde her yükleme 500 ya da kırık görsel. Artık nesne depolama
 * (Cloudflare R2) kullanılır; görsel `/api/files/public/assets/...` iç ucundan sunulur.
 *
 * Yerel geliştirmede R2 yapılandırılmamışsa (ve Vercel/üretim değilse) eski
 * yerel-dosya yolu yalnız geliştirici kolaylığı için korunur; üretimde R2
 * eksikse sessizce kırık dosya yazmak yerine 503 + açık mesaj döner.
 */

const ALLOWED_MIME = new Set(['image/svg+xml', 'image/png']);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_FOLDERS = new Set(['badges', 'rewards', 'cosmetics']);

function sanitizeFilename(name: string): string {
  return name
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function getExtByMime(mime: string): string {
  if (mime === 'image/svg+xml') return '.svg';
  return '.png';
}

/** Üretim benzeri ortam: salt-okunur FS, yerel yazma ASLA denenmez. */
function isReadOnlyRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_NO_STORE_HEADERS });
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const limited = await enforceRouteRateLimit('admin.assets.upload.post', auth.session.user.id, 'mutation');
    if (limited) return limited;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return json({ success: false, error: 'Geçersiz form verisi' }, 400);
    }
    const folder = String(formData.get('folder') || '').trim().toLowerCase();
    const file = formData.get('file');

    if (!ALLOWED_FOLDERS.has(folder)) {
      return json({ success: false, error: 'Geçersiz hedef klasör' }, 400);
    }

    if (!(file instanceof File)) {
      return json({ success: false, error: 'Dosya bulunamadı' }, 400);
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return json({ success: false, error: 'Sadece SVG veya PNG yüklenebilir' }, 400);
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return json({ success: false, error: 'Dosya boyutu 2 MB altında olmalıdır' }, 400);
    }

    let bytes = Buffer.from(await file.arrayBuffer());

    // Magic bytes ile MIME doğrula (Content-Type'a güvenme)
    if (!validateMimeMagic(bytes, file.type)) {
      return json({ success: false, error: 'Dosya tipi içerikle eşleşmiyor' }, 400);
    }

    // SVG: script / XSS kontrolü
    if (file.type === 'image/svg+xml' && svgContainsScript(bytes)) {
      return json({ success: false, error: 'SVG güvenlik nedeniyle reddedildi: betik, olay özniteliği, dış bağlantı ya da gömülü içerik barındırıyor. Sade bir SVG ya da PNG yükleyin.' }, 400);
    }

    // PNG: EXIF temizle
    if (file.type === 'image/png') {
      try {
        const stripped = await stripExifPng(bytes);
        bytes = Buffer.from(stripped);
      } catch {
        return json({ success: false, error: 'Geçersiz PNG dosyası' }, 400);
      }
    }

    const ext = getExtByMime(file.type);
    const base = sanitizeFilename(path.parse(file.name).name) || `${folder}-gorsel`;
    // Tahmin edilemez + çakışmasız ad (aynı milisaniyede iki yükleme üzerine yazmasın).
    const filename = `${base}-${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;

    if (isR2Configured()) {
      const key = `assets/${folder}/${filename}`;
      // SVG doğrudan açılırsa belge olarak çalışmasın: attachment (img içinde normal görünür).
      await uploadToR2(key, bytes, file.type, assetContentDisposition(file.type, filename));
      // Bucket public değil: görsel uygulamanın public dosya ucundan sunulur (DB'ye iç URL yazılır).
      const url = publicFileUrl(key);
      // `path` geriye uyumluluk için korunur (rozet/ödül formları bu alanı okur).
      return json({ success: true, path: url, url, storage: 'r2' });
    }

    if (isReadOnlyRuntime()) {
      console.error('[assets/upload] R2 yapılandırılmamış (R2_* gerekli); üretimde yerel yazma yapılmaz.');
      return json(
        {
          success: false,
          code: 'STORAGE_NOT_CONFIGURED',
          error: 'Görsel depolama yapılandırılmamış. Yönetici R2 ayarlarını tamamlamalı.',
        },
        503
      );
    }

    // Yalnız yerel geliştirme: public/ altına yaz (next dev bunu servis eder).
    const { mkdir, writeFile } = await import('fs/promises');
    const absoluteDir = path.join(process.cwd(), 'public', 'images', 'uploads', folder);
    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, filename), bytes);
    const publicPath = `/images/uploads/${folder}/${filename}`;
    return json({ success: true, path: publicPath, url: publicPath, storage: 'local-dev' });
  } catch (error) {
    console.error('Asset upload error:', error);
    return json({ success: false, error: 'Dosya yüklenemedi' }, 500);
  }
}
