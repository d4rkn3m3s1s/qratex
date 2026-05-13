import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { MODULE_CONTROLS_SETTINGS_KEY, normalizeModuleControls } from '@/lib/module-controls';
import {
  FEATURE_VISIBILITY_SETTINGS_KEY,
  MENU_VISIBILITY_CONTRACT_VERSION,
  MENU_VISIBILITY_SETTINGS_KEY,
  normalizeVisibilitySettings,
  type VisibilityRole,
} from '@/lib/visibility-controls';

export const dynamic = 'force-dynamic';

function toVisibilityRole(role: string | undefined): VisibilityRole | null {
  if (role === 'DEALER') return 'dealer';
  if (role === 'CUSTOMER') return 'customer';
  return null;
}

export async function GET() {
  try {
  const auth = await requireAuth(['DEALER', 'CUSTOMER', 'ADMIN']);
  if ('error' in auth) return auth.error;

  const role = toVisibilityRole(auth.session.user.role);
  if (!role) {
    return NextResponse.json({ success: true, role: null, menuVisibility: {}, featureVisibility: {}, moduleControls: {} }, { headers: PRIVATE_NO_STORE_HEADERS });
  }

  const [featureRow, menuRow, moduleControlsRow] = await Promise.all([
    prisma.settings.findUnique({
      where: { key: FEATURE_VISIBILITY_SETTINGS_KEY },
      select: { value: true },
    }),
    prisma.settings.findUnique({
      where: { key: MENU_VISIBILITY_SETTINGS_KEY },
      select: { value: true },
    }),
    prisma.settings.findUnique({
      where: { key: MODULE_CONTROLS_SETTINGS_KEY },
      select: { value: true },
    }),
  ]);
  const normalized = normalizeVisibilitySettings(featureRow?.value, menuRow?.value);
  const moduleControls = normalizeModuleControls(moduleControlsRow?.value);

  return NextResponse.json({
    success: true,
    role,
    menuVisibilityContractVersion: MENU_VISIBILITY_CONTRACT_VERSION,
    menuVisibility: normalized.menuVisibility[role],
    featureVisibility: normalized.featureVisibility[role],
    moduleControls,
  }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('settings/visibility GET:', error);
    return NextResponse.json(
      { success: false, error: 'Görünürlük ayarları yüklenemedi' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
