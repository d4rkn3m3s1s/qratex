import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { generateCardsSchema } from '@/lib/validations';
import { generateCardToken, generateBatchId } from '@/lib/utils';


export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/cards/generate
 * Toplu kart üretimi (admin only)
 * Tek seferde 10.000'e kadar kart üretilebilir
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const body = await request.json();
    const validatedData = generateCardsSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: validatedData.error.errors[0].message }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const { quantity, batchName, prefix } = validatedData.data;

    // Batch oluştur
    const batchId = generateBatchId();
    
    const batch = await prisma.cardBatch.create({
      data: {
        id: batchId,
        name: batchName,
        quantity,
        prefix: prefix || null,
        createdById: session.user.id,
      },
    });

    // Kartları batch halinde oluştur (performans için)
    const BATCH_SIZE = 500; // Her seferde 500 kart
    const batches = Math.ceil(quantity / BATCH_SIZE);
    let createdCount = 0;
    const tokens: string[] = [];

    for (let i = 0; i < batches; i++) {
      const batchQuantity = Math.min(BATCH_SIZE, quantity - createdCount);
      const cardData = [];

      for (let j = 0; j < batchQuantity; j++) {
        let token: string;
        let attempts = 0;
        const maxAttempts = 10;

        // Benzersiz token üret
        do {
          token = generateCardToken(prefix);
          attempts++;
        } while (tokens.includes(token) && attempts < maxAttempts);

        if (attempts >= maxAttempts) {
          // Çok nadir durumda, ekstra güvenlik için
          token = generateCardToken(prefix) + Date.now().toString(36);
        }

        tokens.push(token);
        cardData.push({
          token,
          batchId: batch.id,
          status: 'UNUSED' as const,
        });
      }

      // Batch insert
      await prisma.physicalCard.createMany({
        data: cardData,
        skipDuplicates: true,
      });

      createdCount += batchQuantity;
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CARDS_GENERATED',
        entity: 'PhysicalCard',
        entityId: batch.id,
        newData: {
          batchId: batch.id,
          batchName,
          quantity,
          prefix,
        },
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
        userAgent: request.headers.get('user-agent') || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${createdCount} kart başarıyla oluşturuldu`,
      batch: {
        id: batch.id,
        name: batch.name,
        quantity: createdCount,
        prefix,
        createdAt: batch.createdAt,
      },
      // İlk 10 token'ı göster (demo amaçlı)
      sampleTokens: tokens.slice(0, 10),
    });
  } catch (error) {
    console.error('Error generating cards:', error);
    return NextResponse.json(
      { error: 'Kartlar oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
