import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const conditionSchema = z.object({
    field: z.enum(['rating', 'sentiment', 'text']),
    op: z.enum(['lte', 'gte', 'eq', 'contains']),
    value: z.union([z.string(), z.number()]),
});

const createRuleSchema = z.object({
    name: z.string().min(1).max(100),
    condition: conditionSchema,
    action: z.enum(['reply', 'incident']).default('reply'),
    template: z.string().min(1).max(2000),
    tone: z.string().nullable().optional(),
    priority: z.number().int().min(0).max(100).default(0),
    isActive: z.boolean().default(true),
});

// GET — list dealer's auto-reply rules
export async function GET() {
    try {
        const auth = await requireAuth(['DEALER']);
        if ('error' in auth) return auth.error;

        const rules = await prisma.autoReplyRule.findMany({
            where: { dealerId: auth.session.user.id },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
            take: 300,
        });

        return NextResponse.json({ success: true, rules }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error fetching auto-reply rules:', error);
        return NextResponse.json({ error: 'Kurallar yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

// POST — create a new rule
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(['DEALER']);
        if ('error' in auth) return auth.error;

        const body = await request.json();
        const parsed = createRuleSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const count = await prisma.autoReplyRule.count({
            where: { dealerId: auth.session.user.id },
        });
        if (count >= 20) {
            return NextResponse.json({ error: 'En fazla 20 kural oluşturabilirsiniz' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const rule = await prisma.autoReplyRule.create({
            data: {
                dealerId: auth.session.user.id,
                name: parsed.data.name,
                condition: parsed.data.condition as object,
                action: parsed.data.action,
                template: parsed.data.template,
                tone: parsed.data.tone || null,
                priority: parsed.data.priority,
                isActive: parsed.data.isActive,
            },
        });

        return NextResponse.json({ success: true, rule }, { status: 201 , headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error creating auto-reply rule:', error);
        return NextResponse.json({ error: 'Kural oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
