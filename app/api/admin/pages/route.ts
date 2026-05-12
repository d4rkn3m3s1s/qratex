import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { getAuditRequestMeta } from '@/lib/request-metadata';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().min(2).max(180),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  content: z.string().max(100_000).default(''),
  isPublished: z.boolean().default(false),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().min(1),
});

function toResponse(page: {
  id: string;
  slug: string;
  title: string;
  content: Prisma.JsonValue;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  const raw = page.content;
  const content =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && !Array.isArray(raw) && 'body' in raw
        ? String((raw as Record<string, unknown>).body ?? '')
        : '';

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    content,
    isPublished: page.isPublished,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
  };
}

export async function GET() {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;

  const pages = await prisma.page.findMany({
    orderBy: [{ isPublished: 'desc' }, { updatedAt: 'desc' }],
  });
  return NextResponse.json({
    success: true,
    pages: pages.map(toResponse),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.page.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return NextResponse.json({ error: 'Bu slug zaten kullanılıyor' }, { status: 400 });
  }

  const created = await prisma.page.create({
    data: {
      title: parsed.data.title.trim(),
      slug: parsed.data.slug,
      content: { body: parsed.data.content } as Prisma.InputJsonValue,
      isPublished: parsed.data.isPublished,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'CREATE_PAGE',
      entity: 'Page',
      entityId: created.id,
      newData: created as unknown as Prisma.InputJsonValue,
      ...getAuditRequestMeta(request),
    },
  });

  return NextResponse.json({ success: true, page: toResponse(created) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id, ...fields } = parsed.data;
  const existing = await prisma.page.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Sayfa bulunamadı' }, { status: 404 });
  }

  if (fields.slug && fields.slug !== existing.slug) {
    const slugExists = await prisma.page.findUnique({ where: { slug: fields.slug } });
    if (slugExists) {
      return NextResponse.json({ error: 'Bu slug zaten kullanılıyor' }, { status: 400 });
    }
  }

  const nextContent =
    fields.content !== undefined
      ? ({ body: fields.content } as Prisma.InputJsonValue)
      : (existing.content as Prisma.InputJsonValue);

  const updated = await prisma.page.update({
    where: { id },
    data: {
      ...(fields.title !== undefined ? { title: fields.title.trim() } : {}),
      ...(fields.slug !== undefined ? { slug: fields.slug } : {}),
      ...(fields.isPublished !== undefined ? { isPublished: fields.isPublished } : {}),
      content: nextContent,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'UPDATE_PAGE',
      entity: 'Page',
      entityId: id,
      oldData: existing as unknown as Prisma.InputJsonValue,
      newData: updated as unknown as Prisma.InputJsonValue,
      ...getAuditRequestMeta(request),
    },
  });

  return NextResponse.json({ success: true, page: toResponse(updated) });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { session } = auth;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 });

  const existing = await prisma.page.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Sayfa bulunamadı' }, { status: 404 });

  await prisma.page.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'DELETE_PAGE',
      entity: 'Page',
      entityId: id,
      oldData: existing as unknown as Prisma.InputJsonValue,
      ...getAuditRequestMeta(request),
    },
  });
  return NextResponse.json({ success: true });
}
