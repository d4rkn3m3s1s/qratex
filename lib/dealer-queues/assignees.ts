/**
 * Atanabilir kişiler (bayi sahibi + AKTİF personel) — P0-11 sözleşmesinin okuma tarafı.
 * Yazma tarafının doğrulaması `lib/dealer/assignee.ts → validateAssignee` ile yapılır; bu modül
 * yalnız seçici listesini ve yanıt DTO'sunu üretir (e-posta HİÇ dönmez).
 */
import { prisma } from '@/lib/prisma';
import type { AssigneeDto } from './types';

export const ASSIGNEE_LIST_MAX = 100;

export interface AssigneeDirectory {
  list: AssigneeDto[];
  /** Kimlik → DTO; listede olmayan (pasifleşmiş) kişi için `fallback` kullanılır. */
  get(id: string | null | undefined, fallbackName?: string | null): AssigneeDto | null;
}

function ownerLabel(user: { name: string | null; businessName: string | null } | null): string {
  return user?.name?.trim() || user?.businessName?.trim() || 'İşletme sahibi';
}

export async function loadAssigneeDirectory(dealerId: string, actorId: string): Promise<AssigneeDirectory> {
  const [owner, staff] = await Promise.all([
    prisma.user.findUnique({ where: { id: dealerId }, select: { id: true, name: true, businessName: true } }),
    prisma.dealerStaff.findMany({
      where: { dealerId, isActive: true },
      select: { userId: true, jobTitle: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: ASSIGNEE_LIST_MAX,
    }),
  ]);

  const list: AssigneeDto[] = [
    { id: dealerId, name: ownerLabel(owner), role: 'owner', jobTitle: null, isMe: dealerId === actorId },
  ];
  for (const s of staff) {
    if (!s.userId || s.userId === dealerId) continue;
    list.push({
      id: s.userId,
      name: s.user?.name?.trim() || 'Personel',
      role: 'staff',
      jobTitle: s.jobTitle?.trim() || null,
      isMe: s.userId === actorId,
    });
  }
  const byId = new Map(list.map((a) => [a.id, a]));

  return {
    list,
    get(id, fallbackName) {
      if (!id) return null;
      const hit = byId.get(id);
      if (hit) return hit;
      // Pasifleşmiş personel: geçmiş kayıtlarda adı görünür, seçicide yer almaz.
      return { id, name: fallbackName?.trim() || 'Eski personel', role: 'staff', jobTitle: null, isMe: id === actorId };
    },
  };
}

/** Aktif personel kimlikleri (bayi hariç) — "Ekibime" görünümü. */
export function staffIds(dir: AssigneeDirectory): string[] {
  return dir.list.filter((a) => a.role === 'staff').map((a) => a.id);
}
