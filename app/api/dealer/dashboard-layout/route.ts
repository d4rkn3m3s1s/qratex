import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { z } from 'zod';


export const dynamic = 'force-dynamic';

const updateSchema = z.object({
    widgets: z
        .array(
            z.object({
                id: z.string().min(1).max(64),
                visible: z.boolean(),
                order: z.number().int().min(0).max(999),
            })
        )
        .max(40),
});

export const DEFAULT_WIDGETS = [
    { id: "kpi-cards", visible: true, order: 1, label: "Özet İstatistik Kartları" },
    { id: "weekly-comparison", visible: true, order: 2, label: "Haftalık Karşılaştırma" },
    { id: "charts-row-1", visible: true, order: 3, label: "Haftalık Bilgi ve Duygu Dağılımı Grafikleri" },
    { id: "charts-row-2", visible: true, order: 4, label: "Puan Trendi ve Dağılım Grafikleri" },
    { id: "recent-activity", visible: true, order: 5, label: "Geri Bildirim ve QR Aktiviteleri" },
    { id: "analytics-summary", visible: true, order: 6, label: "Genel Analitik Özeti" },
    { id: "extra-data", visible: true, order: 7, label: "Ek Analitik Verileri" }
];

export async function GET() {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const layout = await prisma.dashboardLayout.findUnique({
            where: { userId: auth.session.user.id }
        });

        const widgets = layout?.widgets ? (layout.widgets as any[]) : DEFAULT_WIDGETS;

        // Populate missing widgets if new ones are added to the system
        const mergedWidgets = DEFAULT_WIDGETS.map(dw => {
            const existing = widgets.find(w => w.id === dw.id);
            if (existing) {
                return { ...dw, ...existing, label: dw.label }; // Ensure label is updated
            }
            return dw;
        }).sort((a, b) => a.order - b.order);

        return NextResponse.json({ success: true, widgets: mergedWidgets }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error fetching dashboard layout:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Düzen yüklenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const auth = await requireAuth(['DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const body = await request.json();
        const parsed = updateSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Geçersiz veri formatı' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
        }

        const layout = await prisma.dashboardLayout.upsert({
            where: { userId: auth.session.user.id },
            update: { widgets: parsed.data.widgets },
            create: {
                userId: auth.session.user.id,
                widgets: parsed.data.widgets
            }
        });

        return NextResponse.json({ success: true, widgets: layout.widgets }, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('Error updating dashboard layout:', error);
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        return NextResponse.json({ error: 'Düzen güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
