import { prisma } from '@/lib/prisma';

export async function getBooleanSiteSetting(key: string, defaultValue = false): Promise<boolean> {
  try {
    const row = await prisma.settings.findUnique({
      where: { key },
      select: { value: true },
    });
    const v: unknown = row?.value;
    if (typeof v === 'boolean') return v;
    if (v === true || v === 'true') return true;
    if (v === false || v === 'false') return false;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}
