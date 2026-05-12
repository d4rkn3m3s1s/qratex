import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
    priority: z.number().int().min(0).max(100).optional(),
    condition: z.object({
        field: z.enum(['rating', 'sentiment', 'text']),
        op: z.enum(['lte', 'gte', 'eq', 'contains']),
        value: z.union([z.string(), z.number()]),
    }).optional(),
    action: z.enum(['reply', 'incident']).optional(),
    template: z.string().min(1).max(2000).optional(),
});

// PATCH — update a rule
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuth(['DEALER']);
        if ('error' in auth) return auth.error;
        const { id } = await params;

        const existing = await prisma.autoReplyRule.findUnique({ where: { id } });
        if (!existing || existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 });
        }

        const body = await request.json();
        const parsed = updateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
        }

        const rule = await prisma.autoReplyRule.update({
            where: { id },
            data: {
                ...(parsed.data.name !== undefined && { name: parsed.data.name }),
                ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
                ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
                ...(parsed.data.condition !== undefined && { condition: parsed.data.condition as object }),
                ...(parsed.data.action !== undefined && { action: parsed.data.action }),
                ...(parsed.data.template !== undefined && { template: parsed.data.template }),
            },
        });

        return NextResponse.json({ success: true, rule });
    } catch (error) {
        console.error('Error updating auto-reply rule:', error);
        return NextResponse.json({ error: 'Kural güncellenemedi' }, { status: 500 });
    }
}

// DELETE — remove a rule
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await requireAuth(['DEALER']);
        if ('error' in auth) return auth.error;
        const { id } = await params;

        const existing = await prisma.autoReplyRule.findUnique({ where: { id } });
        if (!existing || existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 });
        }

        await prisma.autoReplyRule.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting auto-reply rule:', error);
        return NextResponse.json({ error: 'Kural silinemedi' }, { status: 500 });
    }
}
