import { NextRequest, NextResponse } from 'next/server';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { mkdir, writeFile, unlink } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

// İzinli tipler + magic-byte imzaları (Content-Type'a güvenme).
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', ext: '.png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: '.webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { mime: 'image/gif', ext: '.gif', test: (b) => b.length > 6 && (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') },
  { mime: 'application/pdf', ext: '.pdf', test: (b) => b.length > 4 && b.toString('ascii', 0, 4) === '%PDF' },
];

function detect(bytes: Buffer): { mime: string; ext: string } | null {
  return SIGNATURES.find((s) => s.test(bytes)) ?? null;
}

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** POST: göreve dosya eki yükler (resim/PDF). Magic-byte doğrulamalı. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const { id: taskId } = await params;
  const userId = auth.session.user.id;

  const task = await prisma.companyTask.findUnique({ where: { id: taskId }, select: { id: true } });
  if (!task) return NextResponse.json({ success: false, error: 'Görev bulunamadı' }, { status: 404, headers: PRIVATE_NO_STORE_HEADERS });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Dosya bulunamadı' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, error: 'Dosya boyutu 8MB altında olmalı' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = detect(bytes);
  if (!kind) {
    return NextResponse.json({ success: false, error: 'Sadece resim (PNG/JPG/WEBP/GIF) veya PDF yüklenebilir' }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }

  const base = sanitize(path.parse(file.name).name || 'ek') || 'ek';
  const filename = `${base}-${Date.now()}${kind.ext}`;
  const absoluteDir = path.join(process.cwd(), 'public', 'images', 'uploads', 'tasks');
  await mkdir(absoluteDir, { recursive: true });
  await writeFile(path.join(absoluteDir, filename), bytes);
  const publicPath = `/images/uploads/tasks/${filename}`;

  const attachment = await prisma.taskAttachment.create({
    data: { taskId, uploadedById: userId, filename: file.name.slice(0, 200), path: publicPath, mime: kind.mime, size: file.size },
  });
  await prisma.taskActivity.create({
    data: { taskId, actorId: userId, action: 'attachment', detail: `Dosya ekledi: ${file.name.slice(0, 40)}` },
  });

  return NextResponse.json({ success: true, attachment }, { headers: PRIVATE_NO_STORE_HEADERS });
}

/** DELETE ?attachmentId=: eki siler (DB + disk). */
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

  await prisma.taskAttachment.delete({ where: { id: attachmentId } }).catch(() => null);
  // Diskten sil (yol her zaman /images/uploads/tasks altında — path traversal yok).
  const safe = path.basename(att.path);
  await unlink(path.join(process.cwd(), 'public', 'images', 'uploads', 'tasks', safe)).catch(() => {});
  await prisma.taskActivity.create({
    data: { taskId, actorId: auth.session.user.id, action: 'attachment', detail: `Dosya kaldırdı: ${att.filename.slice(0, 40)}` },
  });

  return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
}
