import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { chatWithQRA, MODELS } from '@/lib/groq';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import { INPUT_LIMITS } from '@/lib/input-limits';
import {
  checkQraChatRateLimit,
  getClientIdentifier,
  type QraChatTier,
} from '@/lib/rate-limit';
import { fingerprintChatIp } from '@/lib/ip-fingerprint';

export const dynamic = 'force-dynamic';

const MAX_HISTORY_ITEMS = 24;

function normalizeConversationHistory(raw: unknown): Array<{
  role: 'user' | 'assistant';
  content: string;
}> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const item of raw.slice(-MAX_HISTORY_ITEMS)) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: string }).role;
    const content = (item as { content?: unknown }).content;
    if (
      (role === 'user' || role === 'assistant') &&
      typeof content === 'string' &&
      content.length > 0
    ) {
      const clipped = content.slice(0, INPUT_LIMITS.messageText);
      out.push({ role, content: clipped });
    }
  }
  return out;
}

function resolveChatTier(role: string | undefined, userId: string | undefined): QraChatTier {
  if (!userId) return 'anonymous';
  if (role === 'ADMIN') return 'admin';
  if (role === 'DEALER' || role === 'STAFF') return 'dealer_staff';
  return 'customer';
}

function snapshotRole(role: string | undefined, userId: string | undefined): string {
  if (!userId) return 'ANON';
  return role || 'CUSTOMER';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationHistory } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mesaj gerekli' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    if (message.length > INPUT_LIMITS.messageText) {
      return NextResponse.json(
        { error: `Mesaj çok uzun (max ${INPUT_LIMITS.messageText} karakter)` }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const role = session?.user?.role as string | undefined;

    const tier = resolveChatTier(role, userId);
    const rateKey = userId ?? fingerprintChatIp(getClientIdentifier(request));
    const rl = checkQraChatRateLimit(rateKey, tier);

    if (!rl.ok) {
      const retryAfterMs = rl.retryAfterMs ?? 60_000;
      const res = NextResponse.json(
        {
          error:
            tier === 'anonymous'
              ? 'Çok fazla istek. Bir süre sonra tekrar dene veya giriş yap.'
              : 'Çok hızlı yazıyorsun. Bir dakika sonra tekrar dene.',
          retryAfterMs,
          code: 'RATE_LIMIT',
        }, { status: 429 , headers: PRIVATE_NO_STORE_HEADERS });
      res.headers.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res;
    }

    let userContext:
      | {
          name?: string;
          role?: string;
          stats?: { points?: number; level?: number };
        }
      | undefined;

    if (session?.user) {
      userContext = {
        name: session.user.name || undefined,
        role: session.user.role || 'CUSTOMER',
      };
      try {
        const userStats = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { points: true, level: true },
        });
        if (userStats) {
          userContext.stats = {
            points: userStats.points,
            level: userStats.level,
          };
        }
      } catch {
        // Stats alınamazsa devam et
      }
    }

    const history = normalizeConversationHistory(conversationHistory);

    const started = Date.now();
    const responseText = await chatWithQRA(message, history, userContext);
    const latencyMs = Date.now() - started;

    const ipFingerprint = userId ? null : fingerprintChatIp(getClientIdentifier(request));

    try {
      await prisma.qraChatLog.create({
        data: {
          userId: userId ?? undefined,
          ipFingerprint,
          userRoleSnapshot: snapshotRole(role, userId),
          userMessage: message.slice(0, INPUT_LIMITS.messageText),
          assistantMessage: responseText.slice(0, 16_000),
          model: MODELS.fast,
          latencyMs,
        },
      });
    } catch (logErr) {
      console.error('QraChatLog write failed:', logErr);
    }

    return NextResponse.json({
      success: true,
      message: responseText,
      timestamp: new Date().toISOString(),
      remaining: rl.remaining,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Bir hata oluştu' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
