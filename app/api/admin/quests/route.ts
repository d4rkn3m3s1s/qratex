/**
 * /api/admin/quests — Görev Yönetimi BFF'i.
 *  GET  → sunucu sayfalı liste (durum/mekanik/dönem/arama/sıralama) + görev başına metrik.
 *  POST → yeni görev (taslak ya da yayında), denetimli; `Idempotency-Key` ile çift tık korumalı.
 * Modül kapısından MUAF: `quests` modülü müşterilere kapalıyken de yönetici görevleri yönetir.
 */
import { defineRoute, ok } from '@/lib/http/define-route';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { questCreateSchema, questListQuerySchema } from '@/lib/admin-quests/contract';
import { createQuest, listQuests } from '@/lib/admin-quests/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.quests.list', roles: ['ADMIN'], query: questListQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listQuests(query))
);

export const POST = defineRoute(
  { name: 'admin.quests.create', roles: ['ADMIN'], schema: questCreateSchema, rateLimit: 'mutation', idempotent: true },
  async ({ body, user, request }) => ok(await createQuest(body, { userId: user.id, ...getAuditRequestMeta(request) }), { status: 201 })
);
