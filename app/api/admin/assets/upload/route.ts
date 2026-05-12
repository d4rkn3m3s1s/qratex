import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import {
  validateMimeMagic,
  svgContainsScript,
  stripExifPng,
} from '@/lib/media-validation';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME = new Set(['image/svg+xml', 'image/png']);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getExtByMime(mime: string): string {
  if (mime === 'image/svg+xml') return '.svg';
  return '.png';
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;

    const formData = await req.formData();
    const folder = String(formData.get('folder') || '').trim().toLowerCase();
    const file = formData.get('file');

    if (folder !== 'badges' && folder !== 'rewards') {
      return NextResponse.json({ success: false, error: 'Geçersiz hedef klasör' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Dosya bulunamadı' }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ success: false, error: 'Sadece SVG veya PNG yüklenebilir' }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'Dosya boyutu 2MB altında olmalıdır' }, { status: 400 });
    }

    let bytes = Buffer.from(await file.arrayBuffer());

    // Magic bytes ile MIME doğrula (Content-Type'a güvenme)
    if (!validateMimeMagic(bytes, file.type)) {
      return NextResponse.json({ success: false, error: 'Dosya tipi içerikle eşleşmiyor' }, { status: 400 });
    }

    // SVG: script / XSS kontrolü
    if (file.type === 'image/svg+xml' && svgContainsScript(bytes)) {
      return NextResponse.json({ success: false, error: 'SVG güvenlik nedeniyle reddedildi (script)' }, { status: 400 });
    }

    // PNG: EXIF temizle
    if (file.type === 'image/png') {
      try {
        const stripped = await stripExifPng(bytes);
        bytes = Buffer.from(stripped);
      } catch {
        return NextResponse.json({ success: false, error: 'Geçersiz PNG dosyası' }, { status: 400 });
      }
    }

    const ext = getExtByMime(file.type);
    const base = sanitizeFilename(path.parse(file.name).name || `${folder}-asset`);
    const filename = `${base}-${Date.now()}${ext}`;

    const absoluteDir = path.join(process.cwd(), 'public', 'images', 'uploads', folder);
    await mkdir(absoluteDir, { recursive: true });

    const absolutePath = path.join(absoluteDir, filename);
    await writeFile(absolutePath, bytes);

    const publicPath = `/images/uploads/${folder}/${filename}`;
    return NextResponse.json({ success: true, path: publicPath });
  } catch (error) {
    console.error('Asset upload error:', error);
    return NextResponse.json({ success: false, error: 'Dosya yüklenemedi' }, { status: 500 });
  }
}

