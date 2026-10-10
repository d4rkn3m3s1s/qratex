import { randomUUID } from 'crypto';
import path from 'path';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { defineRoute, ApiError } from '@/lib/http/define-route';
import { isR2Configured, uploadToR2 } from '@/lib/r2-storage';
import { TEAM_ROUTE_ROLES, findVisibleTask, requireTeamViewer } from '@/lib/team/access';
import { canAttach, canDeleteAttachment } from '@/lib/team/permissions';
import { TEAM_ATTACHMENT_MAX_BYTES, TEAM_ATTACHMENT_MAX_LABEL } from '@/lib/team/constants';
import { removeStoredTaskFile } from '@/lib/team/files';

export const dynamic = 'force-dynamic';

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

const params = z.object({ id: z.string().min(1).max(60) });

/**
 * POST — göreve dosya eki (magic-byte doğrulamalı). Sınır tek sabitten: TEAM_ATTACHMENT_MAX_BYTES
 * (denetim O10/Bulgu 17: arayüz "50 MB", hata metni "8 MB" diyordu; Vercel gövde sınırı ~4,5 MB).
 * Depolama anahtarı tahmin edilemez (`tasks/<uuid>/<ad>`): eski `ad-zaman damgası` biçimi
 * herkese açık depoda tahmin edilebiliyordu.
 */
export const POST = defineRoute(
  { name: 'team.task.attachment.upload', roles: TEAM_ROUTE_ROLES, params, rateLimit: 'mutation', maxBodyBytes: TEAM_ATTACHMENT_MAX_BYTES + 64_000 },
  async ({ user, params: p, request }) => {
    const viewer = await requireTeamViewer(user.id);
    const task = await findVisibleTask(viewer, p.id, { id: true, assignedToId: true, createdById: true });
    if (!canAttach(viewer, task)) {
      throw new ApiError('FORBIDDEN', 'Bu göreve yalnız atanan kişi, oluşturan ve yönetici dosya ekleyebilir.');
    }
    const declared = Number(request.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > TEAM_ATTACHMENT_MAX_BYTES + 64_000) {
      throw new ApiError('PAYLOAD_TOO_LARGE', `Dosya en fazla ${TEAM_ATTACHMENT_MAX_LABEL} olabilir.`);
    }
    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');
    if (!(file instanceof File)) throw new ApiError('VALIDATION', 'Dosya bulunamadı.');
    if (file.size <= 0) throw new ApiError('VALIDATION', 'Dosya boş.');
    if (file.size > TEAM_ATTACHMENT_MAX_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', `Dosya en fazla ${TEAM_ATTACHMENT_MAX_LABEL} olabilir.`);

    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = detect(bytes, file.name);
    if (!kind) {
      throw new ApiError(
        'VALIDATION',
        'İzinli türler: görsel (PNG, JPG, WEBP, GIF), PDF, video (MP4, WEBM), Office (Word, Excel, PowerPoint), metin (TXT, CSV, JSON, MD), arşiv (ZIP, RAR, 7z).'
      );
    }

    const base = sanitize(path.parse(file.name).name || 'ek') || 'ek';
    const objectName = `${base}${kind.ext}`;
    // Safari "attachment" disposition'da boş sayfa gösteriyordu; aktif içerik türleri zaten reddediliyor.
    const disposition = `inline; filename="${encodeURIComponent(file.name.slice(0, 100))}"`;

    let storedPath: string;
    if (isR2Configured()) {
      try {
        storedPath = await uploadToR2(`tasks/${randomUUID()}/${objectName}`, bytes, kind.mime, disposition);
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE', 'Dosya depolamaya yüklenemedi. Biraz sonra tekrar deneyin.', { retryable: true });
      }
    } else {
      // Yerel geliştirme: public/ altına yaz (yalnız localhost).
      const { mkdir, writeFile } = await import('fs/promises');
      const dir = path.join(process.cwd(), 'public', 'images', 'uploads', 'tasks');
      await mkdir(dir, { recursive: true });
      const local = `${randomUUID()}-${objectName}`;
      await writeFile(path.join(dir, local), bytes);
      storedPath = `/images/uploads/tasks/${local}`;
    }

    const attachment = await prisma.taskAttachment.create({
      data: { taskId: task.id, uploadedById: viewer.userId, filename: file.name.slice(0, 200), path: storedPath, mime: kind.mime, size: file.size },
      select: { id: true, filename: true, path: true, mime: true, size: true, createdAt: true },
    });
    await prisma.taskActivity
      .create({ data: { taskId: task.id, actorId: viewer.userId, action: 'attachment', detail: `Dosya ekledi: ${file.name.slice(0, 60)}` } })
      .catch(() => undefined);

    return { attachment: { ...attachment, createdAt: attachment.createdAt.toISOString() } };
  }
);

const deleteQuery = z.object({ attachmentId: z.string().min(1).max(60) });

/** DELETE ?attachmentId= — eki siler (DB + depo). Yükleyen ya da yönetici. */
export const DELETE = defineRoute(
  { name: 'team.task.attachment.delete', roles: TEAM_ROUTE_ROLES, params, query: deleteQuery, rateLimit: 'mutation' },
  async ({ user, params: p, query }) => {
    const viewer = await requireTeamViewer(user.id);
    const task = await findVisibleTask(viewer, p.id, { id: true });
    const att = await prisma.taskAttachment.findFirst({ where: { id: query.attachmentId, taskId: task.id } });
    if (!att) throw new ApiError('NOT_FOUND', 'Ek bulunamadı.');
    if (!canDeleteAttachment(viewer, att)) throw new ApiError('FORBIDDEN', 'Bu eki yalnız yükleyen kişi ya da yönetici silebilir.');
    await prisma.taskAttachment.delete({ where: { id: att.id } });
    await removeStoredTaskFile(att.path);
    await prisma.taskActivity
      .create({ data: { taskId: task.id, actorId: viewer.userId, action: 'attachment', detail: `Dosya kaldırdı: ${att.filename.slice(0, 60)}` } })
      .catch(() => undefined);
    return { deleted: true };
  }
);
