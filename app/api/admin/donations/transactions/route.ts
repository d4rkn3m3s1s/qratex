/** GET /api/admin/donations/transactions — bağış işlemleri (imleçli; kampanya/kullanıcı/tarih/puan/görünürlük filtreli). */
import { defineRoute, ok } from '@/lib/http/define-route';
import { prisma } from '@/lib/prisma';
import { transactionQuerySchema } from '@/lib/admin-donations/contract';
import { listTransactions } from '@/lib/admin-donations/server';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  { name: 'admin.donations.transactions', roles: ['ADMIN'], query: transactionQuerySchema, rateLimit: 'read' },
  async ({ query }) => ok(await listTransactions(prisma, query))
);
