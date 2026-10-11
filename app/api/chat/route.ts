import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalSession } from '@/lib/api-auth';
import { parseJsonBody } from '@/lib/http/parse-body';
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
import { checkQraDailyCap, isAiGuardError } from '@/lib/ai-cost-guard';

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

/** İstemcinin gönderdiği asistan turlarının doğrulandığı geriye bakış penceresi. */
const ASSISTANT_TURN_LOOKBACK_MS = 6 * 60 * 60 * 1000;

/**
 * Denetim O1 (sahte few-shot jailbreak): geçmiş istemciden gelir ve eskiden `assistant` rolündeki
 * HER metin modele "QRA'nın kendi söylediği" diye veriliyordu — saldırgan uydurma asistan turlarıyla
 * modeli koşullandırabiliyordu. Artık bir asistan turu yalnız bu aktörün (girişli kullanıcı ya da
 * anonim IP parmak izi) son 6 saatte gerçekten aldığı bir QRA yanıtıyla BİREBİR eşleşirse kalır;
 * eşleşmeyen (uydurma, istemci tarafı hata metni) tur düşer. Kullanıcı turları kişinin kendi
 * sözüdür ve korunur. Yalnız istemcinin zaten sahip olduğu metin karşılaştırılır → başka bir
 * kişinin (aynı NAT arkasındaki anonim) sohbeti bağlama asla taşınmaz.
 */
async function verifyAssistantTurns(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  actor: { userId?: string; ipFingerprint: string | null }
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (!history.some((m) => m.role === 'assistant')) return history;
  let logged = new Set<string>();
  if (actor.userId || actor.ipFingerprint) {
    try {
      const rows = await prisma.qraChatLog.findMany({
        where: {
          ...(actor.userId ? { userId: actor.userId } : { ipFingerprint: actor.ipFingerprint }),
          createdAt: { gte: new Date(Date.now() - ASSISTANT_TURN_LOOKBACK_MS) },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_HISTORY_ITEMS,
        select: { assistantMessage: true },
      });
      logged = new Set(rows.map((r) => r.assistantMessage.slice(0, INPUT_LIMITS.messageText).trim()));
    } catch {
      logged = new Set();
    }
  }
  return history.filter((m) => m.role === 'user' || logged.has(m.content.trim()));
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

/** mimari-api B6: gövde zod ile (bozuk JSON 500 değil 400; geçmiş öğeleri ayrıca süzülür). */
const chatBodySchema = z.object({
  message: z
    .string({ required_error: 'Mesaj gerekli', invalid_type_error: 'Mesaj gerekli' })
    .min(1, 'Mesaj gerekli')
    .max(INPUT_LIMITS.messageText, `Mesaj çok uzun (max ${INPUT_LIMITS.messageText} karakter)`),
  conversationHistory: z.array(z.unknown()).max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonBody(request, chatBodySchema, { maxBytes: 200_000 });
    if (!parsed.ok) return parsed.response;
    const { message, conversationHistory } = parsed.data;

    const session = await getOptionalSession();
    const userId = session?.user?.id;
    const role = session?.user?.role as string | undefined;

    const tier = resolveChatTier(role, userId);
    const rateKey = userId ?? fingerprintChatIp(getClientIdentifier(request));
    const rl = await checkQraChatRateLimit(rateKey, tier);

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

    // F0.7: kademe başına GÜNLÜK mesaj tavanı (anonimde IP parmak izi; dakikalık limit tek
    // başına günde binlerce isteğe izin veriyordu → ortak Groq kotası tükeniyordu).
    const daily = await checkQraDailyCap(rateKey, tier);
    if (!daily.ok) {
      const retryAfterMs = daily.retryAfterMs ?? 60 * 60 * 1000;
      const res = NextResponse.json(
        {
          error:
            tier === 'anonymous'
              ? 'Bugünkü ücretsiz mesaj hakkın doldu. Devam etmek için giriş yapabilir ya da yarın tekrar deneyebilirsin.'
              : 'Bugünkü QRA mesaj hakkın doldu. Yarın tekrar deneyebilirsin.',
          retryAfterMs,
          code: 'DAILY_LIMIT',
        }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
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

    const ipFingerprint = userId ? null : fingerprintChatIp(getClientIdentifier(request));
    const history = await verifyAssistantTurns(normalizeConversationHistory(conversationHistory), {
      userId,
      ipFingerprint,
    });

    const started = Date.now();
    let responseText: string;
    try {
      responseText = await chatWithQRA(message, history, userContext, { actorKey: `${tier}:${rateKey}` });
    } catch (err) {
      // Platform günlük QRA token tavanı / dakikalık AI limiti → 429 (500 değil).
      if (isAiGuardError(err)) {
        const retryAfterMs = err.retryAfterMs ?? 60 * 60 * 1000;
        const res = NextResponse.json(
          { error: err.message, retryAfterMs, code: err.code }, { status: 429, headers: PRIVATE_NO_STORE_HEADERS });
        res.headers.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
        return res;
      }
      throw err;
    }
    const latencyMs = Date.now() - started;

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
      remainingToday: daily.remaining,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: 'Bir hata oluştu' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}
