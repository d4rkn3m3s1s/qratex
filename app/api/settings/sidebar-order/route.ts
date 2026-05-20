import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { normalizeSidebarNavOrder, type SidebarRole, SIDEBAR_NAV_ORDER_SETTINGS_KEY } from '@/lib/sidebar-order-settings';

export const dynamic = 'force-dynamic';

function roleToSidebarRole(role: string | undefined): SidebarRole | null {
  if (role === 'ADMIN') return 'admin';
  if (role === 'DEALER') return 'dealer';
  if (role === 'CUSTOMER') return 'customer';
  return null;
}

export async function GET() {
  const auth = await requireAuth(['ADMIN', 'DEALER', 'CUSTOMER']);
  if ('error' in auth) return auth.error;
  const sr = roleToSidebarRole(auth.session.user.role);
  if (!sr) {
    return NextResponse.json({ success: true, order: null }, { headers: PRIVATE_NO_STORE_HEADERS });
  }
  const row = await prisma.settings.findUnique({
    where: { key: SIDEBAR_NAV_ORDER_SETTINGS_KEY },
    select: { value: true },
  });
  const payload = normalizeSidebarNavOrder(row?.value);
  const order = payload[sr] ?? null;
  return NextResponse.json({ success: true, order }, { headers: PRIVATE_NO_STORE_HEADERS });
}
