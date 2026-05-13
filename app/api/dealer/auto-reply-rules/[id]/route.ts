import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
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

        const body = await request.json();
        const parsed = updateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const data = {
            ...(parsed.data.name !== undefined && { name: parsed.data.name }),
            ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
            ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
            ...(parsed.data.condition !== undefined && { condition: parsed.data.condition as object }),
            ...(parsed.data.action !== undefined && { action: parsed.data.action }),
            ...(parsed.data.template !== undefined && { template: parsed.data.template }),
        };

        const n = await prisma.autoReplyRule.updateMany({
            where: { id, dealerId: auth.session.user.id },
            data,
        });
        if (n.count === 0) {
            return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const rule = await prisma.autoReplyRule.findUnique({ where: { id } });
        return NextResponse.json({ success: true, rule }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error updating auto-reply rule:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Kural güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
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

        const n = await prisma.autoReplyRule.deleteMany({
            where: { id, dealerId: auth.session.user.id },
        });
        if (n.count === 0) {
            return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error deleting auto-reply rule:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Kural silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
