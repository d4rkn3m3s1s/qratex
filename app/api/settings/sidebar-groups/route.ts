import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import {
  normalizeSidebarNavGroups,
  type SidebarGroupRole,
  SIDEBAR_NAV_GROUPS_SETTINGS_KEY,
} from '@/lib/sidebar-groups-settings';

export const dynamic = 'force-dynamic';

function roleToGroupRole(role: string | undefined): SidebarGroupRole | null {
  if (role === 'DEALER') return 'dealer';
  if (role === 'CUSTOMER') return 'customer';
  return null; // admin menüsünde grup override yok
}

/** Runtime: sidebar için çağıranın rolüne ait grup override'ını döndürür. */
export async function GET() {
  const auth = await requireAuth(['ADMIN', 'DEALER', 'CUSTOMER']);
  if ('error' in auth) return auth.error;
  const gr = roleToGroupRole(auth.session.user.role);
  if (!gr) {
    return NextResponse.json({ success: true, groups: null }, { headers: PRIVATE_NO_STORE_HEADERS });
  }
  const row = await prisma.settings.findUnique({
    where: { key: SIDEBAR_NAV_GROUPS_SETTINGS_KEY },
    select: { value: true },
  });
  const payload = normalizeSidebarNavGroups(row?.value);
  const groups = payload[gr] ?? null;
  return NextResponse.json({ success: true, groups }, { headers: PRIVATE_NO_STORE_HEADERS });
}
