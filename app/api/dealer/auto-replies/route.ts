import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-auth';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const createSchema = z.object({
    name: z.string().min(1, 'Kural adı zorunludur').max(100),
    isActive: z.boolean().default(true),
    priority: z.number().int().default(0),
    condition: z.object({
        field: z.enum(['rating', 'sentiment', 'text']),
        op: z.enum(['lte', 'gte', 'eq', 'contains']),
        value: z.any()
    }),
    action: z.enum(['reply', 'incident']).default('reply'),
    template: z.string().min(1, 'Yanıt şablonu/mesajı boş olamaz')
});

export async function GET() {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const rules = await prisma.autoReplyRule.findMany({
            where: { dealerId: auth.session.user.id },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
        });

        return NextResponse.json({ success: true, rules });
    } catch (error) {
        console.error('Auto replies GET error:', error);
        return NextResponse.json({ error: 'Kurallar alınamadı' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const body = await req.json();
        const result = createSchema.safeParse(body);
        if (!result.success) {
            return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
        }

        const rule = await prisma.autoReplyRule.create({
            data: {
                dealerId: auth.session.user.id,
                name: result.data.name,
                isActive: result.data.isActive,
                priority: result.data.priority,
                condition: result.data.condition as any, // Prisma JsonValue
                action: result.data.action,
                template: result.data.template
            }
        });

        return NextResponse.json({ success: true, rule });
    } catch (error) {
        console.error('Auto replies POST error:', error);
        return NextResponse.json({ error: 'Kural oluşturulamadı' }, { status: 500 });
    }
}
