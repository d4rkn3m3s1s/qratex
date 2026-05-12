import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/**
 * Authorization: Bearer qrx_... ile ApiKey doğrula. İsteğe bağlı scope.
 */
export async function authenticatePartnerApiKey(
  authHeader: string | null,
  requiredScope?: string
): Promise<{ ok: true; apiKeyId: string } | { ok: false; status: number; error: string }> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Bearer token gerekli' };
  }
  const raw = authHeader.slice(7).trim();
  if (!raw.startsWith('qrx_')) {
    return { ok: false, status: 401, error: 'Geçersiz anahtar biçimi' };
  }
  const digest = hashKey(raw);
  const key = await prisma.apiKey.findFirst({
    where: { keyHash: digest },
    select: { id: true, scope: true },
  });
  if (!key) {
    return { ok: false, status: 401, error: 'Geçersiz API anahtarı' };
  }
  if (requiredScope) {
    const scopes = (key.scope as string[] | null) || [];
    if (!scopes.includes(requiredScope) && !scopes.includes('*')) {
      return { ok: false, status: 403, error: `Gerekli yetki: ${requiredScope}` };
    }
  }
  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });
  return { ok: true, apiKeyId: key.id };
}
