import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
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
            return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const existing = await prisma.autoReplyRule.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (auth.session.user.role !== 'ADMIN' && existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const d = result.data;
        const data = {
            ...(d.name !== undefined && { name: d.name }),
            ...(d.isActive !== undefined && { isActive: d.isActive }),
            ...(d.priority !== undefined && { priority: d.priority }),
            ...(d.condition !== undefined && { condition: d.condition as object }),
            ...(d.action !== undefined && { action: d.action }),
            ...(d.template !== undefined && { template: d.template }),
        };

        if (Object.keys(data).length === 0) {
            const rule = await prisma.autoReplyRule.findUnique({ where: { id } });
            return NextResponse.json({ success: true, rule }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        if (auth.session.user.role === 'ADMIN') {
            const n = await prisma.autoReplyRule.updateMany({
                where: { id },
                data,
            });
            if (n.count === 0) {
                return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            }
        } else {
            const n = await prisma.autoReplyRule.updateMany({
                where: { id, dealerId: auth.session.user.id },
                data,
            });
            if (n.count === 0) {
                return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            }
        }

        const updated = await prisma.autoReplyRule.findUnique({ where: { id } });
        return NextResponse.json({ success: true, rule: updated }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Auto reply PATCH error:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const { id } = await params;
        const existing = await prisma.autoReplyRule.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Kural bulunamadı veya yetkiniz yok' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }
        if (auth.session.user.role !== 'ADMIN' && existing.dealerId !== auth.session.user.id) {
            return NextResponse.json({ error: 'Kural bulunamadı veya yetkiniz yok' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        if (auth.session.user.role === 'ADMIN') {
            const n = await prisma.autoReplyRule.deleteMany({ where: { id } });
            if (n.count === 0) {
                return NextResponse.json({ error: 'Kural bulunamadı veya yetkiniz yok' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            }
        } else {
            const n = await prisma.autoReplyRule.deleteMany({
                where: { id, dealerId: auth.session.user.id },
            });
            if (n.count === 0) {
                return NextResponse.json({ error: 'Kural bulunamadı veya yetkiniz yok' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            }
        }
        return NextResponse.json({ success: true }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Auto reply DELETE error:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
