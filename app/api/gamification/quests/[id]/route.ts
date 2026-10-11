import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { updateQuestSchema } from '@/lib/validations';

// GET /api/gamification/quests/[id]

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const quest = await prisma.quest.findUnique({
      where: { id },
    });

    // Bulgu 4 (customer_quests): pasif/arşiv görev tanımı yalnız yöneticiye döner; aktif görev
    // modül kapısına tabidir (kapalıyken 403). Admin paneli bu GET'i kullanmıyor (PATCH/DELETE).
    let visible = !!quest;
    if (quest && (!quest.isActive || quest.archivedAt)) {
      const admin = await requireAuth(['ADMIN']);
      visible = !('error' in admin);
    } else if (quest) {
      const { assertModuleEnabled } = await import('@/lib/module-gate');
      const gate = await assertModuleEnabled('quests');
      if (gate) return gate;
    }

    if (!quest || !visible) {
      return NextResponse.json(
        { success: false, error: 'Görev bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    return NextResponse.json({ success: true, data: quest }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching quest:', error);
    return NextResponse.json(
      { success: false, error: 'Görev getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// PATCH /api/gamification/quests/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    // P0-01: yönetici yazma ucu → gizli kapı + DB rolü (`requireAuth`); ham oturum rolü yetmez.
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    // admin_quests Bulgu 8: doğrulamasız tam üzerine yazma kaldırıldı. Yalnız GÖNDERİLEN alanlar
    // (zod ile) güncellenir; eksik `expiresAt`/`isActive` artık silinmez/aktifleşmez.
    // Yönetim paneli /api/admin/quests uçlarını kullanır; bu uç geriye uyumluluk içindir.
    const parsed = updateQuestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Görev bilgileri geçersiz', code: 'VALIDATION_ERROR' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const body = parsed.data;

    const oldQuest = await prisma.quest.findUnique({ where: { id } });
    if (!oldQuest) {
      return NextResponse.json(
        { success: false, error: 'Görev bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const quest = await prisma.quest.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.requirement !== undefined ? { requirement: body.requirement as object } : {}),
        ...(body.reward !== undefined ? { reward: body.reward as object } : {}),
        ...(body.expiresAt !== undefined ? { expiresAt: body.expiresAt } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        // Yeniden aktifleştirilen görev arşivden çıkar (aksi hâlde claim/ilerleme onu yok sayar).
        ...(body.isActive === true ? { archivedAt: null } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE_QUEST',
        entity: 'Quest',
        entityId: quest.id,
        oldData: oldQuest as object,
        newData: quest as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, data: quest }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error updating quest:', error);
    return NextResponse.json(
      { success: false, error: 'Görev güncellenemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

// DELETE /api/gamification/quests/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    // P0-01: yönetici yazma ucu → gizli kapı + DB rolü (`requireAuth`); ham oturum rolü yetmez.
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    const quest = await prisma.quest.findUnique({ where: { id } });
    if (!quest) {
      return NextResponse.json(
        { success: false, error: 'Görev bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    // Hard delete YOK: UserQuest cascade ile kullanıcıların ilerlemesi ve ödeme kaydı
    // (rewardedAt — P0-15'in tek-sefer guard'ı) kalıcı olarak silinirdi. Görev arşivlenir:
    // listelerden düşer (isActive=false), yeni ilerleme/ödeme almaz, geçmiş korunur.
    const archivedAt = quest.archivedAt ?? new Date();
    await prisma.$transaction([
      prisma.quest.update({ where: { id }, data: { isActive: false, archivedAt } }),
      prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'DELETE_QUEST',
          entity: 'Quest',
          entityId: id,
          oldData: quest as object,
          newData: { archived: true, archivedAt: archivedAt.toISOString() },
          ...auditMeta,
        },
      }),
    ]);

    return NextResponse.json(
      { success: true, archived: true, message: 'Görev arşivlendi' },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Error deleting quest:', error);
    return NextResponse.json(
      { success: false, error: 'Görev silinemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}


