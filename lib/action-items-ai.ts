/**
 * Aksiyon öğeleri otomatik tetikleme:
 * 1) Feedback actionSuggestions'dan oluşturma
 * 2) Sidebar menülerindeki tüm verilerden AI ile öneri üretme (öğrenme)
 */

import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkAiCostGuard, recordAiCostUsage } from '@/lib/ai-cost-guard';

function getAIClient(): OpenAI | null {
  if (process.env.GROQ_API_KEY) {
    return new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return null;
}

function getModel(): string {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  if (process.env.GROQ_API_KEY) return 'llama-3.1-8b-instant';
  return process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
}

/**
 * 1) Geri bildirimlerdeki AI actionSuggestions'dan henüz oluşturulmamış aksiyonları ekle
 */
export async function createFromFeedbackSuggestions(dealerId: string): Promise<number> {
  const feedbacks = await prisma.feedback.findMany({
    where: {
      deletedAt: null,
      qrCode: { dealerId },
      actionSuggestions: { not: Prisma.JsonNull },
    },
    select: {
      id: true,
      actionSuggestions: true,
    },
  });

  let created = 0;
  for (const fb of feedbacks) {
    const suggestions = Array.isArray(fb.actionSuggestions) ? fb.actionSuggestions : [];
    if (suggestions.length === 0) continue;

    const existing = await prisma.actionItem.count({
      where: { feedbackId: fb.id },
    });
    if (existing >= suggestions.length) continue;

    for (let i = existing; i < suggestions.length; i++) {
      const s = suggestions[i] as { action?: string; priority?: string } | null;
      if (!s?.action) continue;
      await prisma.actionItem.create({
        data: {
          feedbackId: fb.id,
          dealerId,
          suggestionText: s.action,
          priority: (s.priority === 'high' || s.priority === 'low' ? s.priority : 'medium') as 'low' | 'medium' | 'high',
          sourceModule: 'feedback',
        },
      });
      created++;
    }
  }
  return created;
}

/**
 * 2) Sidebar menülerindeki verileri topla; AI ile 3–5 aksiyon önerisi üret ve ekle
 */
export async function generateFromDealerContext(dealerId: string): Promise<number> {
  const client = getAIClient();
  if (!client) return 0;

  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Tüm sidebar verilerinden veri topla
  const [qrCodes, feedbacks, incidents, actionItems, consumptions, staffCount, churnCount] =
    await Promise.all([
      prisma.qRCode.findMany({
        where: { dealerId },
        select: { id: true, name: true, scanCount: true, isActive: true, _count: { select: { feedbacks: true } } },
      }),
      prisma.feedback.findMany({
        where: { deletedAt: null, qrCode: { dealerId }, createdAt: { gte: last30 } },
        select: { rating: true, sentiment: true, intent: true, urgency: true, isToxic: true, createdAt: true, text: true },
      }),
      prisma.incident.findMany({
        where: { dealerId, status: { not: 'resolved' } },
        select: { type: true, severity: true, title: true, status: true },
      }),
      prisma.actionItem.count({ where: { dealerId } }),
      prisma.consumption?.count?.({ where: { dealerId } }).catch(() => 0) ?? 0,
      prisma.dealerStaff.count({ where: { dealerId } }).catch(() => 0) ?? 0,
      // Churn: urgency/churnRisk yüksek feedback sayısı
      prisma.feedback.count({
        where: {
          deletedAt: null,
          qrCode: { dealerId },
          createdAt: { gte: last7 },
          OR: [{ churnRisk: { gte: 0.7 } }, { urgency: { gte: 0.7 } }],
        },
      }).catch(() => 0) ?? 0,
    ]);

  const totalFeedbacks = feedbacks.length;
  const avgRating = totalFeedbacks > 0
    ? feedbacks.reduce((s, f) => s + f.rating, 0) / totalFeedbacks
    : 0;
  const negativeCount = feedbacks.filter((f) => f.rating <= 2 || f.sentiment === 'negative').length;
  const openIncidents = incidents.length;
  const totalScans = qrCodes.reduce((s, q) => s + q.scanCount, 0);
  const activeQrCodes = qrCodes.filter((q) => q.isActive).length;

  const context = {
    qrCodes: { total: qrCodes.length, active: activeQrCodes, totalScans },
    feedbacks: { total: totalFeedbacks, avgRating: avgRating.toFixed(1), negativeCount },
    incidents: { open: openIncidents, items: incidents.slice(0, 5).map((i) => ({ type: i.type, severity: i.severity, title: i.title })) },
    actionItems: { total: actionItems },
    consumptions,
    staffCount,
    churnRiskCount: churnCount,
  };

  const contextJson = JSON.stringify(context, null, 0);
  const dealer = await prisma.user.findUnique({ where: { id: dealerId }, select: { name: true } });
  const dealerName = dealer?.name || 'İşletme';

  try {
    await checkAiCostGuard(dealerId);
  } catch {
    return 0; // Günlük AI limiti aşıldı
  }

  const startTime = Date.now();
  try {
    const response = await client.chat.completions.create({
      model: getModel(),
      messages: [
        {
          role: 'system',
          content: `Sen QRATEX platformunun aksiyon öneri motorusun. Bir işletme (dealer) için dashboard verilerini analiz edip 3-5 somut aksiyon önerisi üret.

Kurallar:
- Sadece JSON array döndür, başka metin yazma
- Her öğe: { "action": "öneri metni (1 cümle, Türkçe)", "priority": "low" | "medium" | "high" }
- Öneriler somut ve uygulanabilir olsun (örn: "Negatif geri bildirime telafi teklifi gönder", "QR kodları müşterilere tanıt", "Yüksek churn riskli müşterilere kampanya başlat")
- Veri yoksa bile onboarding/başlangıç önerileri ver (QR oluştur, feedback topla vb.)`,
        },
        {
          role: 'user',
          content: `İşletme: ${dealerName}\n\nVeri:\n${contextJson}\n\n3-5 aksiyon önerisi üret (JSON array):`,
        },
      ],
      temperature: 0.6,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return 0;

    // JSON parse (markdown code block varsa temizle)
    let parsed: { action?: string; priority?: string }[] = [];
    try {
      const cleaned = content.replace(/^```\w*\n?|\n?```$/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return 0;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) return 0;

    // Zaten yeterli aksiyon varsa sınırlı sayıda ekle
    const toCreate = actionItems < 2 ? parsed.slice(0, 5) : parsed.slice(0, 2);
    let created = 0;

    for (const item of toCreate) {
      if (!item?.action || typeof item.action !== 'string') continue;
      await prisma.actionItem.create({
        data: {
          feedbackId: null,
          dealerId,
          suggestionText: item.action,
          priority: (item.priority === 'high' || item.priority === 'low' ? item.priority : 'medium') as 'low' | 'medium' | 'high',
          sourceModule: 'ai_aggregate',
        },
      });
      created++;
    }

    const u = (response as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
    await recordAiCostUsage(dealerId, u?.prompt_tokens ?? 0, u?.completion_tokens ?? 0, 'action_suggest', getModel(), Date.now() - startTime);
    return created;
  } catch (err) {
    console.error('[action-items-ai] generateFromDealerContext:', err);
    return 0;
  }
}

/**
 * Otomatik tetikleme: önce feedback suggestions, sonra AI aggregate (boşsa)
 */
export async function runActionItemsAutoTrigger(dealerId: string): Promise<{ fromFeedback: number; fromAI: number }> {
  const fromFeedback = await createFromFeedbackSuggestions(dealerId);
  const currentCount = await prisma.actionItem.count({
    where: { dealerId, status: { in: ['pending', 'assigned', 'in_progress'] } },
  });
  const fromAI = currentCount < 3 ? await generateFromDealerContext(dealerId) : 0;
  return { fromFeedback, fromAI };
}
