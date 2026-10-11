/**
 * Konsey motoru — tek adım (bir tartışma turu ya da sentez) üretir. Kalıcılık
 * sessions.server.ts'te; burada yalnız istem kurulumu ve LLM çağrıları var.
 *
 * İlkeler:
 *  - ŞABLON YOK: LLM yanıt vermezse adım açık bir hatayla düşer, hiçbir şey kaydedilmez,
 *    operatör adımı yeniden dener. (Eski motor şablon metni "canlı" diye gösteriyordu.)
 *  - Bir turda uzmanlar PARALEL konuşur, ardından Kaptan turu modere eder → adım başına en fazla
 *    iki ardışık çağrı süresi (60 sn sınırı içinde kalır).
 *  - Kazanan, güven, karşı görüş ve aksiyonlar tek yapılandırılmış sentez çağrısından gelir
 *    (eski regex'le "kazanan seçimi" kaldırıldı).
 *  - AI yalnız mevcut geçitten: lib/ai-engine runChatCompletion (maliyet bekçisi + dakikalık limit).
 */
import { runChatCompletion } from '@/lib/ai-engine';
import { isAiGuardError } from '@/lib/ai-cost-guard';
import { ApiError } from '@/lib/http/define-route';
import {
  AGENT_PROFILES,
  CAPTAIN,
  parseSynthesis,
  unknownMetricRefs,
  type CouncilAgent,
  type CouncilConfig,
  type DataPack,
  type SessionDecision,
} from '@/lib/council/contract';
import { dataPackPrompt } from '@/lib/council/context.server';

export type Completion = (p: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  actorKey?: string;
}) => Promise<{ content: string; modelUsed: string } | null>;

export interface StepInput {
  topic: string;
  scopeLabel: string;
  config: CouncilConfig;
  dataPack: DataPack | null;
  /** Önceki kayıtlı mesajlar (tur sırasıyla). */
  prior: Array<{ round: number; agent: string; kind: string; content: string }>;
  actorKey: string;
}

export interface GeneratedMessage {
  round: number;
  agent: CouncilAgent;
  kind: 'turn' | 'moderation' | 'synthesis';
  content: string;
  model: string;
  latencyMs: number;
}

const TRANSCRIPT_BUDGET = 7000;

function guidanceLine(config: CouncilConfig): string {
  return config.guidance ? ` Kurum talimatı (her zaman uy): ${config.guidance}` : '';
}

export function systemPrompt(agent: CouncilAgent, config: CouncilConfig): string {
  const p = AGENT_PROFILES[agent];
  return (
    `Sen Qratex müşteri deneyimi platformunun yönetim konseyinde "${p.name} (${p.role})" üyesisin. ` +
    `Odak alanın: ${p.focus}. Görevin: ${p.brief} ` +
    'Türkçe yaz, 3-5 cümle, somut ol, dolgu ve klişe cümle kullanma. Diğer üyelerin önceki görüşlerine gerçekten yanıt ver; tekrar etme.' +
    guidanceLine(config)
  );
}

/** Önceki konuşmayı bütçe içinde (en yeniler korunarak) metne döker. */
export function transcriptText(prior: StepInput['prior']): string {
  if (prior.length === 0) return '(henüz konuşma yok — ilk tur)';
  const lines = prior.map((m) => `[Tur ${m.round}] ${AGENT_PROFILES[m.agent as CouncilAgent]?.name ?? m.agent}: ${m.content}`);
  const out: string[] = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    used += lines[i].length + 1;
    if (used > TRANSCRIPT_BUDGET) {
      out.unshift('(daha eski konuşma kısaltıldı)');
      break;
    }
    out.unshift(lines[i]);
  }
  return out.join('\n');
}

function header(input: StepInput, round: number | 'synthesis'): string {
  const r = round === 'synthesis' ? 'Nihai sentez' : `Tur ${round}/${input.config.rounds}`;
  return `Konu / soru: "${input.topic}"\nKapsam: ${input.scopeLabel}\nAşama: ${r}\n\n${dataPackPrompt(input.dataPack)}`;
}

async function call(complete: Completion, params: Parameters<Completion>[0], who: string): Promise<{ content: string; model: string; latencyMs: number }> {
  const started = Date.now();
  let res: Awaited<ReturnType<Completion>>;
  try {
    res = await complete(params);
  } catch (err) {
    if (isAiGuardError(err)) {
      throw new ApiError('RATE_LIMITED', err.message, {
        status: 429,
        retryable: true,
        headers: err.retryAfterMs ? { 'Retry-After': String(Math.ceil(err.retryAfterMs / 1000)) } : undefined,
      });
    }
    throw err;
  }
  const content = res?.content?.trim();
  if (!res || !content) {
    throw new ApiError(
      'AI_FAILED',
      `${who} yanıt üretemedi (zaman aşımı, kota ya da güvenlik filtresi). Hiçbir şey kaydedilmedi; adımı yeniden deneyin.`,
      { status: 502, retryable: true }
    );
  }
  return { content, model: res.modelUsed, latencyMs: Date.now() - started };
}

/** Bir tartışma turu: uzmanlar paralel, ardından Kaptan moderasyonu. */
export async function runDiscussionRound(input: StepInput, round: number, complete: Completion = runChatCompletion): Promise<GeneratedMessage[]> {
  const transcript = transcriptText(input.prior);
  const specialists = input.config.specialists;
  const turns = await Promise.all(
    specialists.map(async (agent) => {
      const r = await call(
        complete,
        {
          system: systemPrompt(agent, input.config),
          user: `${header(input, round)}\n\nŞimdiye kadarki konuşma:\n${transcript}\n\nŞimdi ${AGENT_PROFILES[agent].name} olarak bu tura katkını yaz.`,
          temperature: 0.6,
          maxTokens: 380,
          actorKey: input.actorKey,
        },
        AGENT_PROFILES[agent].name
      );
      return { round, agent, kind: 'turn' as const, content: r.content, model: r.model, latencyMs: r.latencyMs };
    })
  );

  const thisRound = turns.map((t) => `${AGENT_PROFILES[t.agent].name}: ${t.content}`).join('\n');
  const isLast = round >= input.config.rounds;
  const mod = await call(
    complete,
    {
      system: systemPrompt(CAPTAIN, input.config),
      user:
        `${header(input, round)}\n\nÖnceki turlar:\n${transcriptText(input.prior)}\n\nBu turda uzmanlar:\n${thisRound}\n\n` +
        (isLast
          ? 'Bu son tartışma turu. Uzlaşılan noktaları ve hâlâ açık kalan anlaşmazlığı 2-4 cümlede belirt; sentez bir sonraki adımda.'
          : 'Uzlaşılan noktayı, çatışmayı ve bir sonraki turda cevaplanması gereken TEK soruyu 2-4 cümlede belirt.'),
      temperature: 0.5,
      maxTokens: 320,
      actorKey: input.actorKey,
    },
    AGENT_PROFILES[CAPTAIN].name
  );

  return [...turns, { round, agent: CAPTAIN, kind: 'moderation', content: mod.content, model: mod.model, latencyMs: mod.latencyMs }];
}

/** Nihai sentez: tek yapılandırılmış JSON çağrısı. Geçersiz JSON bir kez yeniden istenir; yine olmazsa hata. */
export async function runSynthesis(
  input: StepInput,
  complete: Completion = runChatCompletion
): Promise<{ message: GeneratedMessage; decision: SessionDecision }> {
  const allowed = [...input.config.specialists, CAPTAIN];
  const names = allowed.map((a) => `"${a}" (${AGENT_PROFILES[a].name} · ${AGENT_PROFILES[a].role})`).join(', ');
  const system =
    systemPrompt(CAPTAIN, input.config) +
    ' Şimdi NİHAİ SENTEZ aşamasındasın. Yalnızca geçerli JSON döndür, başka metin yazma. Şema: ' +
    '{"answer": string (en fazla 8 cümle, net karar), "winner": ' +
    allowed.map((a) => `"${a}"`).join('|') +
    ', "winnerRationale": string (kararı en çok hangi görüşün belirlediği ve neden), "confidence": 0-100 arası sayı (kanıtın gücü; veri azsa düşük ver), ' +
    '"dissent": string[] (karşı görüşler ve riskler, en fazla 4), "actions": [{"title": string, "detail": string (ne, kim, nasıl ölçülür), "priority": "high"|"medium"|"low"}] (2-5 adet)}. ' +
    `winner değerleri: ${names}.`;
  const user = `${header(input, 'synthesis')}\n\nTartışmanın tamamı:\n${transcriptText(input.prior)}\n\nJSON kararı üret.`;

  let last: { content: string; model: string; latencyMs: number } | null = null;
  let correction = '';
  let invented: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await call(
      complete,
      { system, user: user + correction, temperature: 0.3, maxTokens: 1200, jsonMode: true, actorKey: input.actorKey },
      'Kaptan (sentez)'
    );
    const decision = parseSynthesis(last.content, allowed);
    // Halüsinasyon bekçisi: veri paketinde olmayan metrik anahtarı geçen karar kabul edilmez.
    invented = decision ? unknownMetricRefs(decision, input.dataPack) : [];
    if (decision && invented.length > 0) {
      const keys = (input.dataPack?.metrics ?? []).map((m) => m.key);
      correction =
        `\n\nÖNCEKİ YANITIN REDDEDİLDİ: veri paketinde olmayan metrik(ler) kullandın: ${invented.join(', ')}. ` +
        (keys.length ? `Yalnız şu anahtarlara atıf yapabilirsin: ${keys.join(', ')}.` : 'Bu oturumda veri paketi yok; hiçbir metrik anahtarı yazma.') +
        ' Ölçüm önerirken yeni anahtar adı uydurma, düz Türkçe yaz.';
      continue;
    }
    if (decision) {
      const round = input.config.rounds + 1;
      return {
        decision,
        message: { round, agent: CAPTAIN, kind: 'synthesis', content: decision.answer, model: last.model, latencyMs: last.latencyMs },
      };
    }
  }
  if (invented.length > 0) {
    throw new ApiError(
      'AI_FAILED',
      `Sentez veri paketinde olmayan metrik uydurdu (${invented.join(', ')}). Hiçbir şey kaydedilmedi; adımı yeniden deneyin.`,
      { status: 502, retryable: true }
    );
  }
  throw new ApiError('AI_FAILED', 'Sentez geçerli bir karar biçiminde üretilemedi. Hiçbir şey kaydedilmedi; adımı yeniden deneyin.', {
    status: 502,
    retryable: true,
  });
}
