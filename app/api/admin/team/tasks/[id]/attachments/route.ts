import { NextRequest, NextResponse } from 'next/server';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import path from 'path';
import { isR2Configured, uploadToR2, deleteFromR2, keyFromPublicUrl } from '@/lib/r2-storage';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ── Dosya türü doğrulama ────────────────────────────────────────────────
// Strateji: mümkün olan her yerde MAGIC-BYTE (dosyanın gerçek imzası) ile
// doğrula — Content-Type'a asla güvenme. İmzası olmayan düz-metin türleri
// (txt/csv/json/md) için uzantı + içeriğin "yazdırılabilir metin" olması
// kontrol edilir. ZIP-tabanlı türler (Office docx/xlsx/pptx ve zip) aynı PK
// imzasını paylaşır; bunları uzantı ile ayırırız (imza yine PK olmalı).

type Kind = { mime: string; ext: string; inline: boolean };

// PK (ZIP) imzası: 50 4B 03 04  (veya boş/spanned varyantları 05 06 / 07 08)
const isZipContainer = (b: Buffer) =>
  b.length > 4 && b[0] === 0x50 && b[1] === 0x4b &&
  ((b[2] === 0x03 && b[3] === 0x04) || (b[2] === 0x05 && b[3] === 0x06) || (b[2] === 0x07 && b[3] === 0x08));

// OLE2 (eski Office doc/xls/ppt) imzası: D0 CF 11 E0 A1 B1 1A E1
const isOle2 = (b: Buffer) =>
  b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 &&
  b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1;

// Binary imzalı türler (uzantıdan bağımsız, doğrudan magic-byte).
const BINARY_SIGNATURES: { mime: string; ext: string; inline: boolean; test: (b: Buffer) => boolean }[] = [
  // Görseller (tarayıcıda gösterilebilir → inline)
  { mime: 'image/png', ext: '.png', inline: true, test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', ext: '.jpg', inline: true, test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: '.webp', inline: true, test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { mime: 'image/gif', ext: '.gif', inline: true, test: (b) => b.length > 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') },
  { mime: 'application/pdf', ext: '.pdf', inline: true, test: (b) => b.length > 4 && b.toString('ascii', 0, 4) === '%PDF' },
  // Videolar (tarayıcıda oynatılabilir → inline). MP4/MOV: offset 4'te 'ftyp'; WebM: EBML başlığı.
  { mime: 'video/mp4', ext: '.mp4', inline: true, test: (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp' },
  { mime: 'video/webm', ext: '.webm', inline: true, test: (b) => b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  // Arşivler (indirilir → asla inline)
  { mime: 'application/x-rar-compressed', ext: '.rar', inline: false, test: (b) => b.length > 7 && b.toString('ascii', 0, 4) === 'Rar!' && b[4] === 0x1a && b[5] === 0x07 },
  { mime: 'application/x-7z-compressed', ext: '.7z', inline: false, test: (b) => b.length > 6 && b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf && b[4] === 0x27 && b[5] === 0x1c },
];

// ZIP-tabanlı türler: imza PK olmalı, uzantı hangi Office türü olduğunu belirler.
const ZIP_EXT: Record<string, { mime: string; ext: string }> = {
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: '.pptx' },
  '.zip': { mime: 'application/zip', ext: '.zip' },
};

// OLE2-tabanlı eski Office: imza OLE olmalı, uzantı türü belirler.
const OLE_EXT: Record<string, { mime: string; ext: string }> = {
  '.doc': { mime: 'application/msword', ext: '.doc' },
  '.xls': { mime: 'application/vnd.ms-excel', ext: '.xls' },
  '.ppt': { mime: 'application/vnd.ms-powerpoint', ext: '.ppt' },
};

// Düz-metin türleri: binary imza yok. Uzantı + içeriğin yazdırılabilir metin
// olması ile doğrulanır. Güvenlik için ASLA inline servis edilmez (indirilir),
// böylece .html/.svg gibi tarayıcıda çalışan içerik riski oluşmaz.
const TEXT_EXT: Record<string, { mime: string; ext: string }> = {
  '.txt': { mime: 'text/plain', ext: '.txt' },
  '.csv': { mime: 'text/csv', ext: '.csv' },
  '.json': { mime: 'application/json', ext: '.json' },
  '.md': { mime: 'text/markdown', ext: '.md' },
};

// İçeriğin makul biçimde "metin" olup olmadığını sezgisel kontrol:
// baştaki örnekte NUL bulunmamalı ve yazdırılamayan bayt oranı düşük olmalı.
function looksLikeText(b: Buffer): boolean {
  const sample = b.subarray(0, Math.min(b.length, 8192));
  if (sample.length === 0) return false;
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    if (c === 0) return false; // NUL → binary
    // izinli: TAB(9) LF(10) CR(13) ve 32..255 (UTF-8 çok baytlılar dahil)
    if (c < 9 || (c > 13 && c < 32)) bad++;
  }
  return bad / sample.length < 0.05;
}

function extname(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/**
 * Dosyayı doğrular: önce binary imzalar, sonra ZIP/OLE (uzantı+imza),
 * en son düz-metin (uzantı+içerik). Geçersizse null.
 */
function detect(bytes: Buffer, filename: string): Kind | null {
  // 1) Doğrudan imzalı binary türler (görsel/pdf/arşiv)
  const bin = BINARY_SIGNATURES.find((s) => s.test(bytes));
  if (bin) return { mime: bin.mime, ext: bin.ext, inline: bin.inline };

  const ext = extname(filename);

  // 2) ZIP-tabanlı (Office OOXML + zip): imza PK olmalı, uzantı türü belirler
  if (ZIP_EXT[ext] && isZipContainer(bytes)) {
    return { ...ZIP_EXT[ext], inline: false };
  }
  // 3) OLE2-tabanlı eski Office: imza OLE olmalı
  if (OLE_EXT[ext] && isOle2(bytes)) {
    return { ...OLE_EXT[ext], inline: false };
  }
  // 4) Düz-metin: imzasız, uzantı + "metin gibi görünme" ile
  if (TEXT_EXT[ext] && looksLikeText(bytes)) {
    return { ...TEXT_EXT[ext], inline: false };
  }
  return null;
}

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** POST: göreve dosya eki yükler (resim/PDF). Magic-byte doğrulamalı. R2 (prod) veya yerel disk (dev). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const { id: taskId } = await params;
  const userId = auth.session.user.id;

  // ERİŞİM: yönetici her göreve; üye YALNIZ kendine atanmış göreve dosya ekler
  // (başkasının görevine kanıt enjekte etmesini engeller).
  const task = await prisma.companyTask.findUnique({ where: { id: taskId }, select: { id: true, assignedToId: true } });
  if (!task) return NextResponse.json({ success: false, error: 'Görev bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  if (!auth.isManager && task.assignedToId !== userId) {
    return NextResponse.json({ success: false, error: 'Yalnızca size atanmış görevlere dosya ekleyebilirsiniz.' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Dosya bulunamadı' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, error: 'Dosya boyutu 8MB altında olmalı' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = detect(bytes, file.name);
  if (!kind) {
    return NextResponse.json({ success: false, error: 'İzinli türler: resim (PNG/JPG/WEBP/GIF), PDF, Office (Word/Excel/PowerPoint), metin (TXT/CSV/JSON/MD), arşiv (ZIP/RAR/7z)' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const base = sanitize(path.parse(file.name).name || 'ek') || 'ek';
  const filename = `${base}-${Date.now()}${kind.ext}`;
  // iOS/Mac SAFARI 'attachment' disposition'ında boş sayfa/hata verir → tüm türlerde
  // 'inline' kullan (Safari'de dosyalar görünsün). GÜVENLİ: .html/.svg/.js gibi aktif
  // içerik türleri zaten üstte BLOKLU; kalan türler (text/ofis/arşiv) inline'da script
  // çalıştıramaz — text görüntülenir, ofis/arşiv tarayıcıca indirilir.
  const disposition = `inline; filename="${encodeURIComponent(file.name.slice(0, 100))}"`;

  let storedPath: string;
  if (isR2Configured()) {
    // Cloudflare R2 (S3) — Vercel'de kalıcı ve read-only fs sorununu çözer.
    try {
      storedPath = await uploadToR2(`tasks/${filename}`, bytes, kind.mime, disposition);
    } catch {
      return NextResponse.json({ success: false, error: 'Dosya depolamaya yüklenemedi (R2)' }, { status: 502, headers: PRIVATE_NO_STORE_HEADERS });
    }
  } else {
    // Yerel geliştirme fallback: public/ altına yaz (yalnızca localhost'ta çalışır).
    const { mkdir, writeFile } = await import('fs/promises');
    const absoluteDir = path.join(process.cwd(), 'public', 'images', 'uploads', 'tasks');
    await mkdir(absoluteDir, { recursive: true });
    await writeFile(path.join(absoluteDir, filename), bytes);
    storedPath = `/images/uploads/tasks/${filename}`;
  }

  const attachment = await prisma.taskAttachment.create({
    data: { taskId, uploadedById: userId, filename: file.name.slice(0, 200), path: storedPath, mime: kind.mime, size: file.size },
  });
  await prisma.taskActivity.create({
    data: { taskId, actorId: userId, action: 'attachment', detail: `Dosya ekledi: ${file.name.slice(0, 40)}` },
  });

  return NextResponse.json({ success: true, attachment }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** DELETE ?attachmentId=: eki siler (DB + R2/disk). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const { id: taskId } = await params;
  const attachmentId = req.nextUrl.searchParams.get('attachmentId');
  if (!attachmentId) return NextResponse.json({ success: false, error: 'attachmentId gerekli' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });

  const att = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });
  if (!att || att.taskId !== taskId) {
    return NextResponse.json({ success: false, error: 'Ek bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });
  }
  // Yalnızca yükleyen kişi veya yönetici silebilir (başkasının kanıtını silmeyi engeller).
  if (att.uploadedById !== auth.session.user.id && !auth.isManager) {
    return NextResponse.json({ success: false, error: 'Bu eki silemezsiniz' }, { status: 403, headers: PRIVATE_NO_STORE_HEADERS });
  }

  await prisma.taskAttachment.delete({ where: { id: attachmentId } }).catch(() => null);

  // R2'deyse (http URL) R2'den sil; yerel diskteyse dosyayı sil.
  if (/^https?:\/\//.test(att.path)) {
    const key = keyFromPublicUrl(att.path);
    if (key) await deleteFromR2(key);
  } else {
    const { unlink } = await import('fs/promises');
    const safe = path.basename(att.path);
    await unlink(path.join(process.cwd(), 'public', 'images', 'uploads', 'tasks', safe)).catch(() => {});
  }

  await prisma.taskActivity.create({
    data: { taskId, actorId: auth.session.user.id, action: 'attachment', detail: `Dosya kaldırdı: ${att.filename.slice(0, 40)}` },
  });

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
