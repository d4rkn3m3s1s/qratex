import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireTeamAccess } from '@/lib/team-access';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';

export const dynamic = 'force-dynamic';

/**
 * GET: tüm görev eklerini listeler (Dosyalar bölümü).
 * Filtreler: ?q (dosya adı/görev), ?type=image|pdf, ?department=slug, ?uploadedBy=id
 */
export async function GET(req: NextRequest) {
  const auth = await requireTeamAccess();
  if ('error' in auth) return auth.error;
  const sp = req.nextUrl.searchParams;
  const q = sp.get('q')?.trim();
  const type = sp.get('type'); // image | pdf
  const department = sp.get('department');
  const uploadedBy = sp.get('uploadedBy');

  const where: Prisma.TaskAttachmentWhereInput = {};
  if (type === 'image') where.mime = { startsWith: 'image/' };
  else if (type === 'pdf') where.mime = 'application/pdf';
  if (uploadedBy) where.uploadedById = uploadedBy;
  if (department) where.task = { department };
  if (q) {
    where.OR = [
      { filename: { contains: q, mode: 'insensitive' } },
      { task: { title: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const [files, totalSize] = await Promise.all([
    prisma.taskAttachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true, filename: true, path: true, mime: true, size: true, createdAt: true,
        uploadedBy: { select: { id: true, name: true, email: true, image: true } },
        task: { select: { id: true, title: true, department: true } },
      },
    }),
    prisma.taskAttachment.aggregate({ where, _sum: { size: true }, _count: true }),
  ]);

  return NextResponse.json({
    success: true,
    files,
    stats: { count: totalSize._count, totalSize: totalSize._sum.size ?? 0 },
  }, { headers: PRIVATE_NO_STORE_HEADERS });
}
