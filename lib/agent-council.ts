import { prisma } from '@/lib/prisma';
import { AGENT_PERSONAS, type AgentName } from '@/lib/agent-personas';
import { runChatCompletion, isAIConfigured } from '@/lib/ai-engine';

export interface CouncilAction {
  title: string;
  owner: AgentName;
  priority: 'low' | 'medium' | 'high';
  expectedImpact: number;
}

export interface CouncilComputationResult {
  metrics: {
    feedbackCount30d: number;
    averageRating30d: number;
    negativeRatio30d: number;
    highChurnCount30d: number;
    unresolvedSuspicious: number;
  };
  proposals: Array<{
    agentName: AgentName;
    proposalType: string;
    title: string;
    details: string;
    expectedImpact: number;
    confidence: number;
    priority: 'low' | 'medium' | 'high';
  }>;
  critiques: Array<{
    agentName: AgentName;
    content: string;
    score: number;
  }>;
  winner: AgentName;
  consensusScore: number;
  rationale: string;
  actions: CouncilAction[];
  /** true: proposals/critiques/rationale gerçek LLM ile üretildi; false: metrik-şablon. */
  enriched: boolean;
}

const AGENTS: AgentName[] = ['Harper', 'Benjamin', 'Lucas', 'Grok'];

export async function computeCouncil(goal: string): Promise<CouncilComputationResult> {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [feedbackCount30d, ratingAgg, negativeCount30d, highChurnCount30d, unresolvedSuspicious] =
    await Promise.all([
      prisma.feedback.count({ where: { createdAt: { gte: last30 } } }),
      prisma.feedback.aggregate({
        where: { createdAt: { gte: last30 } },
        _avg: { rating: true },
      }),
      prisma.feedback.count({
        where: { createdAt: { gte: last30 }, sentiment: 'negative' },
      }),
      prisma.feedback.count({
        where: { createdAt: { gte: last30 }, churnRisk: { gte: 0.7 } },
      }),
      prisma.suspiciousActivity.count({ where: { isResolved: false } }),
    ]);

  const averageRating30d = Number((ratingAgg._avg.rating ?? 0).toFixed(2));
  const negativeRatio30d = feedbackCount30d > 0 ? Number((negativeCount30d / feedbackCount30d).toFixed(3)) : 0;

  const dataScore = clamp(42 + negativeRatio30d * 90 + Math.min(feedbackCount30d / 25, 18), 0, 100);
  const logicScore = clamp(48 + highChurnCount30d * 2.2 + Math.abs(averageRating30d - 3.5) * 14, 0, 100);
  const creativeTensionScore = clamp(40 + unresolvedSuspicious * 3.5 + (1 - negativeRatio30d) * 12, 0, 100);
  const captainScore = clamp(44 + (feedbackCount30d > 80 ? 12 : 0) + (averageRating30d >= 4 ? 10 : 0), 0, 100);

  const proposals = [
    {
      agentName: 'Harper' as const,
      proposalType: 'research',
      title: 'Veri kesiti: son 30 gün geri bildirim ve risk sinyalleri',
      details: `${feedbackCount30d} geri bildirim; negatif payı ~${(negativeRatio30d * 100).toFixed(1)}%. Önce ölçüm netleştirilmeden ölçek önerisi yapılmamalı.`,
      expectedImpact: 18,
      confidence: normalize(dataScore),
      priority: 'high' as const,
    },
    {
      agentName: 'Benjamin' as const,
      proposalType: 'logic',
      title: 'Mantıksal öncelik: churn ve SLA bağı',
      details: `Yüksek churn sinyali ${highChurnCount30d}. Ortalama puan ${averageRating30d}. Önce tanım uzayı, sonra ölçek — tersi halde tutarsızlık riski.`,
      expectedImpact: 16,
      confidence: normalize(logicScore),
      priority: 'high' as const,
    },
    {
      agentName: 'Lucas' as const,
      proposalType: 'creative',
      title: 'Karşı senaryo: metrik başarısının görünmeyen maliyeti',
      details: `Açık şüpheli kayıt: ${unresolvedSuspicious}. Başarı tek KPI ile ölçülürse mitigasyon körlüğü oluşabilir; kohort kırılımı şart.`,
      expectedImpact: 14,
      confidence: normalize(creativeTensionScore),
      priority: 'medium' as const,
    },
    {
      agentName: 'Grok' as const,
      proposalType: 'captain',
      title: 'Kaptan sentezi: tek paket yol haritası',
      details: `Hedef "${goal.slice(0, 120)}${goal.length > 120 ? '…' : ''}" için Harper→Benjamin→Lucas zinciriyle uyumlu, tek sayfada önceliklendirilmiş çerçeve.`,
      expectedImpact: 15,
      confidence: normalize(captainScore),
      priority: 'high' as const,
    },
  ];

  const critiques = [
    critiqueFor('Harper', dataScore, goal),
    critiqueFor('Benjamin', logicScore, goal),
    critiqueFor('Lucas', creativeTensionScore, goal),
    critiqueFor('Grok', captainScore, goal),
  ];

  const winner = critiques.sort((a, b) => b.score - a.score)[0]?.agentName ?? 'Harper';
  const consensusScore = critiques.reduce((sum, c) => sum + c.score, 0) / AGENTS.length;

  // Şablon (deterministik) varsayılanlar — LLM yoksa veya başarısız olursa kullanılır.
  let rationale = `${AGENT_PERSONAS[winner].codename} bu metrik setinde en güçlü çizgiyi taşıyor. ` +
    `Grok çoklu ajan düzeninde (Harper veri, Benjamin mantık, Lucas karşı senaryo) hedef “${goal.slice(0, 80)}” için önce ölçüm ve risk mitigasyonu birlikte yürütülmeli.`;

  let actions: CouncilAction[] = [
    { title: 'Harper: KPI panosu + kontrol grubu + başarısızlık eşiği', owner: 'Harper', priority: 'high', expectedImpact: 18 },
    { title: 'Benjamin: öncelik matrisi ve bağımlılık sırası', owner: 'Benjamin', priority: 'high', expectedImpact: 16 },
    { title: 'Lucas: kohort risk mitigasyonu ve iletişim metni', owner: 'Lucas', priority: 'medium', expectedImpact: 14 },
    { title: 'Grok: tek sayfa konsensüs özeti (ana cevap)', owner: 'Grok', priority: 'medium', expectedImpact: 15 },
  ];

  // GERÇEK LLM zenginleştirmesi: gerçek metrikleri besleyip proposals.details,
  // critiques.content, rationale ve actions'ı modele ürettir. Metrikler gerçek
  // olduğu için halüsinasyon riski düşüktür. LLM yoksa şablon korunur.
  let enriched = false;
  if (isAIConfigured()) {
    const metricsText =
      `feedbackCount30d=${feedbackCount30d}, averageRating30d=${averageRating30d}, ` +
      `negativeRatio30d=${(negativeRatio30d * 100).toFixed(1)}%, highChurnCount30d=${highChurnCount30d}, ` +
      `unresolvedSuspicious=${unresolvedSuspicious}`;
    const personaText = AGENTS.map((a) => `${a} (${AGENT_PERSONAS[a].codename}): ${AGENT_PERSONAS[a].grokRole}`).join('\n');

    const res = await runChatCompletion({
      system:
        'Sen bir çoklu-ajan konsey orkestratörüsün. Dört uzman ajan (Harper=veri, ' +
        'Benjamin=mantık, Lucas=karşı senaryo, Grok=kaptan/sentez) GERÇEK metriklere ' +
        'dayanarak bir hedefi değerlendirir. Yalnızca verilen metriklere dayan, sayı UYDURMA. ' +
        'Türkçe yaz. SADECE şu şemada JSON döndür: ' +
        '{"proposals":[{"agentName":"Harper|Benjamin|Lucas|Grok","details":string}],' +
        '"critiques":[{"agentName":"Harper|Benjamin|Lucas|Grok","content":string}],' +
        '"rationale":string,' +
        '"actions":[{"title":string,"owner":"Harper|Benjamin|Lucas|Grok","priority":"low|medium|high","expectedImpact":number}]}',
      user:
        `Hedef: "${goal}"\n\nGerçek metrikler (son 30 gün):\n${metricsText}\n\n` +
        `Ajanlar:\n${personaText}\n\nÖne çıkan uzman (skor bazlı): ${winner}.\n\n` +
        `Her ajan için 1 öneri (details) ve 1 eleştiri (content) üret; bir gerekçe (rationale) ` +
        `ve 3-5 uygulanabilir aksiyon yaz. Metriklere atıfta bulun.`,
      temperature: 0.5,
      maxTokens: 1100,
      jsonMode: true,
    });

    if (res) {
      try {
        const parsed = JSON.parse(res.content);
        if (typeof parsed.rationale === 'string' && parsed.rationale.trim()) {
          rationale = parsed.rationale.trim();
        }
        if (Array.isArray(parsed.proposals)) {
          for (const p of parsed.proposals) {
            const target = proposals.find((x) => x.agentName === p.agentName);
            if (target && typeof p.details === 'string' && p.details.trim()) {
              target.details = p.details.trim();
            }
          }
        }
        if (Array.isArray(parsed.critiques)) {
          for (const c of parsed.critiques) {
            const target = critiques.find((x) => x.agentName === c.agentName);
            if (target && typeof c.content === 'string' && c.content.trim()) {
              target.content = c.content.trim();
            }
          }
        }
        if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
          const mapped = parsed.actions
            .filter((a: { title?: string }) => a && typeof a.title === 'string' && a.title.trim())
            .slice(0, 5)
            .map((a: { title: string; owner?: string; priority?: string; expectedImpact?: number }) => ({
              title: a.title.trim(),
              owner: (AGENTS.includes(a.owner as AgentName) ? a.owner : 'Grok') as AgentName,
              priority: (['low', 'medium', 'high'].includes(a.priority as string) ? a.priority : 'medium') as 'low' | 'medium' | 'high',
              expectedImpact: typeof a.expectedImpact === 'number' ? Math.round(a.expectedImpact) : 12,
            }));
          if (mapped.length > 0) actions = mapped;
        }
        enriched = true;
      } catch {
        // JSON parse başarısızsa şablon değerler korunur (enriched=false).
      }
    }
  }

  return {
    metrics: { feedbackCount30d, averageRating30d, negativeRatio30d, highChurnCount30d, unresolvedSuspicious },
    proposals,
    critiques,
    winner,
    consensusScore: Number(consensusScore.toFixed(1)),
    rationale,
    actions,
    enriched,
  };
}

function critiqueFor(agentName: AgentName, score: number, goal: string) {
  const toned = score >= 70 ? 'hedef ile güçlü hizalı' : score >= 50 ? 'kısmen hizalı' : 'ikincil ama gerekli düzeltme';
  const persona = AGENT_PERSONAS[agentName];
  return {
    agentName,
    score: Number(score.toFixed(1)),
    content: `${persona.codename} — ${toned}. Rol: ${persona.grokRole} · ${persona.thinkingStyle}. Hedef: "${goal.slice(0, 200)}".`,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(score: number) {
  return Number((clamp(score, 0, 100) / 100).toFixed(2));
}
