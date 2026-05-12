import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().optional(),
    condition: z.object({
        field: z.enum(['rating', 'sentiment', 'text']),
        op: z.enum(['lte', 'gte', 'eq', 'contains']),
        value: z.any()
    }).optional(),
    action: z.enum(['reply', 'incident']).optional(),
    template: z.string().min(1).optional()
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const { id } = await params;
        const body = await req.json();
        const result = updateSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 });
        }

        // Yetki kontrolü
        const existing = await prisma.autoReplyRule.findUnique({ where: { id } });
        if (!existing || existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 });
        }

        const updated = await prisma.autoReplyRule.update({
            where: { id },
            data: result.data as any,
        });

        return NextResponse.json({ success: true, rule: updated });
    } catch (error) {
        console.error('Auto reply PATCH error:', error);
        return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const { id } = await params;
        const existing = await prisma.autoReplyRule.findUnique({ where: { id } });
        if (!existing || existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kural bulunamadı veya yetkiniz yok' }, { status: 404 });
        }

        await prisma.autoReplyRule.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Auto reply DELETE error:', error);
        return NextResponse.json({ error: 'Silinemedi' }, { status: 500 });
    }
}
