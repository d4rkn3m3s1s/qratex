/**
 * GET /api/admin/users/list — Kullanıcılar tablosu BFF'i (sunucu sayfalama, filtre, sıralama).
 * Eski `GET /api/admin/users` başka admin sayfalarının seçici listeleri için geriye uyumlu kalır.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { listQuerySchema } from '@/lib/admin-users/contract';
import { listUsers } from '@/lib/admin-users/list.server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.users.list', roles: ['ADMIN'], query: listQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listUsers(query))
);
