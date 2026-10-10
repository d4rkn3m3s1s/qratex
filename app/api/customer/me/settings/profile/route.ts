import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError, defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { isAllowedCustomerAvatar } from '@/lib/customer-settings/avatar-policy';

export const dynamic = 'force-dynamic';

const Body = z
  .object({
    name: z
      .string()
      .transform((s) => s.replace(/\s+/g, ' ').trim())
      .pipe(z.string().min(2, 'Ad en az 2 karakter olmalı.').max(80, 'Ad en fazla 80 karakter olabilir.'))
      .optional(),
    image: z.string().min(1).max(2048).optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.image !== undefined, { message: 'Değiştirilecek bir alan gönderin.' });

/**
 * PATCH /api/customer/me/settings/profile — müşteri profili (ad, avatar).
 * Avatar yalnız hazır müşteri avatarlarından ya da hesapta zaten kayıtlı görselden olabilir
 * (denetim B3: keyfi URL → başkalarının tarayıcısından takip pikseli). Bayi alanları bu uçta yok.
 */
export const PATCH = defineRoute(
  { name: 'customer.me.settings.profile', roles: ['CUSTOMER'], schema: Body, rateLimit: 'mutation' },
  async ({ user, body, request }) => {
    const current = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, image: true } });
    if (!current) throw new ApiError('NOT_FOUND', 'Hesap bulunamadı.');
    if (body.image !== undefined && !isAllowedCustomerAvatar(body.image, current.image)) {
      throw new ApiError('AVATAR_NOT_ALLOWED', 'Bu avatar seçilemez. Listeden bir avatar seç.', { status: 400 });
    }

    const data: { name?: string; image?: string } = {};
    if (body.name !== undefined && body.name !== current.name) data.name = body.name;
    if (body.image !== undefined && body.image !== current.image) data.image = body.image;

    if (Object.keys(data).length === 0) {
      return ok({ name: current.name ?? '', image: current.image ?? null, changed: false });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: user.id }, data, select: { name: true, image: true } });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'UPDATE_PROFILE',
          entity: 'User',
          entityId: user.id,
          oldData: { name: current.name, image: current.image } as object,
          newData: data as object,
          ...getAuditRequestMeta(request),
        },
      });
      return u;
    });

    return ok({ name: updated.name ?? '', image: updated.image ?? null, changed: true });
  },
);
