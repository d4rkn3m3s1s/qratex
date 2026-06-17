import { AGENT_PERSONAS, type AgentName } from '@/lib/agent-personas';
import { runChatCompletion, isAIConfigured } from '@/lib/ai-engine';

export type DialogueStance = 'research' | 'logic' | 'creative' | 'captain' | 'consensus';

export interface DialogueMessage {
  id: string;
  round: number;
  agentName: AgentName;
  content: string;
  stance: DialogueStance;
  /** true: gerçek LLM üretimi, false: LLM yokken kullanılan şablon (demo). */
  live?: boolean;
}

export interface DialogueState {
  topic: string;
  round: number;
  messages: DialogueMessage[];
  /** Bu turun gerçek LLM ile mi yoksa şablonla mı üretildiği. UI'da "demo" rozeti için. */
  live: boolean;
  decision?: {
    winner: AgentName;
    summary: string;
    actions: Array<{ title: string; owner: AgentName; priority: 'high' | 'medium' | 'low' }>;
    live: boolean;
  };
}

/** Tur sırası: Harper → Benjamin → Lucas → Grok (xAI çoklu ajan düzenine paralel). */
export const COUNCIL_AGENT_ORDER: AgentName[] = ['Harper', 'Benjamin', 'Lucas', 'Grok'];

const ORDER = COUNCIL_AGENT_ORDER;

const FINAL_ROUND = 4;

/**
 * ŞABLON tabanlı tur üretimi (LLM YOK). Gerçek AI yapılandırılmadığında
 * kullanılır ve `live: false` ile açıkça "demo" olarak işaretlenir.
 * Tercih edilen yol gerçek LLM'dir → generateDialogueRoundLive().
 */
export function generateDialogueRound(topic: string, priorMessages: DialogueMessage[], nextRound: number): DialogueState {
  const trimmedTopic = topic.trim().slice(0, 500);

  if (nextRound === FINAL_ROUND) {
    const decision = buildDecision(trimmedTopic, priorMessages);
    const synthesis = buildCaptainSynthesis(trimmedTopic, priorMessages, decision);
    const finalMsg: DialogueMessage = {
      id: `r${FINAL_ROUND}-synthesis-${Date.now()}`,
      round: FINAL_ROUND,
      agentName: 'Grok',
      stance: 'consensus',
      content: synthesis,
      live: false,
    };
    return {
      topic: trimmedTopic,
      round: FINAL_ROUND,
      messages: [...priorMessages, finalMsg],
      live: false,
      decision: { ...decision, live: false },
    };
  }

  const roundMessages: DialogueMessage[] = ORDER.map((agentName, idx) => ({
    id: `r${nextRound}-${idx + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    round: nextRound,
    agentName,
    stance: stanceFor(agentName, nextRound),
    content: buildTurn(trimmedTopic, nextRound, agentName, priorMessages, ORDER),
    live: false,
  }));

  return {
    topic: trimmedTopic,
    round: nextRound,
    messages: [...priorMessages, ...roundMessages],
    live: false,
  };
}

/** Gerçek LLM yapılandırılmış mı? Route'lar gerçek/demo kararı için kullanır. */
export function councilLLMAvailable(): boolean {
  return isAIConfigured();
}

const STANCE_BRIEF: Record<AgentName, string> = {
  Harper: 'veriye ve ölçülebilir kanıta odaklan; metrik, oran, trend, belirsizlik aralığı konuş.',
  Benjamin: 'mantıksal tutarlılığı denetle; çelişki, kenar durum, başarı/başarısızlık ölçütü, bağımlılık ortaya koy.',
  Lucas: 'karşı senaryo ve kör nokta üret; çoğunluğun atladığı riski, kullanıcı algısını, yan etkiyi savun.',
  Grok: 'kaptan olarak tartışmayı yönet/sentezle; çatışmayı çöz, tek tutarlı yön ve uygulanabilir aksiyon çıkar.',
};

function personaSystemPrompt(agent: AgentName): string {
  const p = AGENT_PERSONAS[agent];
  return (
    `Sen "${p.codename}" adlı bir uzman ajanssın. Arketip: ${p.archetype}. ` +
    `Düşünme stilin: ${p.thinkingStyle}. Rolün: ${p.grokRole}. ` +
    `Bu turdaki görevin: ${STANCE_BRIEF[agent]} ` +
    `Türkçe yaz, 2-4 cümle, somut ol, klişe ve dolgu cümle kullanma. ` +
    `Diğer ajanların önceki sözlerine gerçekten yanıt ver; aynen tekrarlama.`
  );
}

function transcriptFor(priorMessages: DialogueMessage[], round: number): string {
  const recent = priorMessages.filter((m) => m.round === round - 1);
  if (recent.length === 0) return '(ilk tur — önceki konuşma yok)';
  return recent.map((m) => `${m.agentName}: ${m.content}`).join('\n');
}

/**
 * GERÇEK LLM ile tur üretimi. Her ajan persona'sıyla canlı yanıt verir.
 * LLM yoksa şablon fallback'e düşer ama state.live=false ile işaretlenir.
 */
export async function generateDialogueRoundLive(
  topic: string,
  priorMessages: DialogueMessage[],
  nextRound: number
): Promise<DialogueState> {
  const trimmedTopic = topic.trim().slice(0, 500);

  if (!isAIConfigured()) {
    // Gerçek AI yoksa sahte sunmuyoruz: şablonu açıkça demo (live:false) döndür.
    return generateDialogueRound(trimmedTopic, priorMessages, nextRound);
  }

  if (nextRound === FINAL_ROUND) {
    const winner = pickWinner(trimmedTopic, priorMessages);
    const debate = priorMessages
      .filter((m) => m.round < FINAL_ROUND)
      .map((m) => `${m.agentName}: ${m.content}`)
      .join('\n');

    const synthRes = await runChatCompletion({
      system:
        personaSystemPrompt('Grok') +
        ' Şimdi NİHAİ SENTEZ turundasın: tüm tartışmayı oku, tek tutarlı "ana cevap" üret. ' +
        'Maks 8 cümle. Net karar ver, çelişkileri çöz.',
      user: `Görev/soru: "${trimmedTopic}"\n\nKonsey tartışması:\n${debate}\n\nNihai sentezi ve önerini yaz.`,
      temperature: 0.5,
      maxTokens: 700,
    });

    const actionsRes = await runChatCompletion({
      system:
        'Sen bir karar sentezleyicisin. Verilen tartışmadan 3-5 uygulanabilir aksiyon çıkar. ' +
        'SADECE JSON döndür: {"summary": string, "actions": [{"title": string, "owner": "Harper"|"Benjamin"|"Lucas"|"Grok", "priority": "high"|"medium"|"low"}]}',
      user: `Görev: "${trimmedTopic}"\n\nTartışma:\n${debate}\n\nKazanan perspektif: ${winner}. JSON üret.`,
      temperature: 0.3,
      maxTokens: 600,
      jsonMode: true,
    });

    let summary = `${winner} çizgisi ana eksen olarak seçildi.`;
    let actions = buildDecision(trimmedTopic, priorMessages).actions;
    if (actionsRes) {
      try {
        const parsed = JSON.parse(actionsRes.content);
        if (typeof parsed.summary === 'string') summary = parsed.summary;
        if (Array.isArray(parsed.actions) && parsed.actions.length > 0) {
          actions = parsed.actions
            .filter((a: { title?: string; owner?: string; priority?: string }) => a && typeof a.title === 'string')
            .slice(0, 5)
            .map((a: { title: string; owner?: string; priority?: string }) => ({
              title: a.title,
              owner: (ORDER.includes(a.owner as AgentName) ? a.owner : 'Grok') as AgentName,
              priority: (['high', 'medium', 'low'].includes(a.priority as string) ? a.priority : 'medium') as 'high' | 'medium' | 'low',
            }));
        }
      } catch {
        // JSON parse başarısızsa template aksiyonları kullanılır (yukarıda).
      }
    }

    const synthesisContent = synthRes?.content ?? buildCaptainSynthesis(trimmedTopic, priorMessages, { winner, summary });
    const live = !!synthRes;

    const finalMsg: DialogueMessage = {
      id: `r${FINAL_ROUND}-synthesis-${Date.now()}`,
      round: FINAL_ROUND,
      agentName: 'Grok',
      stance: 'consensus',
      content: synthesisContent,
      live,
    };
    return {
      topic: trimmedTopic,
      round: FINAL_ROUND,
      messages: [...priorMessages, finalMsg],
      live,
      decision: { winner, summary, actions, live: !!actionsRes },
    };
  }

  // Sıralı turlar: her ajan bir öncekilerin yanıtlarını görerek konuşur.
  const accumulated: DialogueMessage[] = [...priorMessages];
  const roundMessages: DialogueMessage[] = [];
  let anyLive = false;

  for (let idx = 0; idx < ORDER.length; idx++) {
    const agentName = ORDER[idx];
    const sameRoundSoFar = roundMessages.map((m) => `${m.agentName}: ${m.content}`).join('\n');
    const priorRoundText = transcriptFor(accumulated, nextRound);

    const res = await runChatCompletion({
      system: personaSystemPrompt(agentName),
      user:
        `Tartışma konusu: "${trimmedTopic}"\nTur: ${nextRound}\n\n` +
        `Önceki turun özeti:\n${priorRoundText}\n\n` +
        (sameRoundSoFar ? `Bu turda senden önce konuşanlar:\n${sameRoundSoFar}\n\n` : '') +
        `Şimdi ${agentName} olarak konuş.`,
      temperature: 0.7,
      maxTokens: 320,
    });

    const live = !!res;
    if (live) anyLive = true;
    const content = res?.content ?? buildTurn(trimmedTopic, nextRound, agentName, accumulated, ORDER);

    const msg: DialogueMessage = {
      id: `r${nextRound}-${idx + 1}-${Date.now()}-${idx}`,
      round: nextRound,
      agentName,
      stance: stanceFor(agentName, nextRound),
      content,
      live,
    };
    roundMessages.push(msg);
    accumulated.push(msg);
  }

  return {
    topic: trimmedTopic,
    round: nextRound,
    messages: [...priorMessages, ...roundMessages],
    live: anyLive,
  };
}

function stanceFor(agentName: AgentName, round: number): DialogueStance {
  if (agentName === 'Grok') return round <= 2 ? 'captain' : 'captain';
  if (agentName === 'Harper') return 'research';
  if (agentName === 'Benjamin') return 'logic';
  return 'creative';
}

function otherNames(except: AgentName): AgentName[] {
  return ORDER.filter((n) => n !== except);
}

function buildTurn(
  topic: string,
  round: number,
  agent: AgentName,
  prior: DialogueMessage[],
  order: AgentName[]
): string {
  const p = AGENT_PERSONAS[agent];
  const lastRound = prior.filter((m) => m.round === round - 1);
  const peers = otherNames(agent)
    .map((n) => {
      const m = lastRound.find((x) => x.agentName === n);
      return m ? `${n}: “${m.content.slice(0, 140)}${m.content.length > 140 ? '…' : ''}”` : null;
    })
    .filter(Boolean)
    .join(' | ');

  if (round === 1) {
    if (agent === 'Harper') {
      return (
        `İlk tarama — ${p.codename}: Soruyu veri düzlemine indiriyorum. “${topic}” için önce ölçülebilir sinyalleri ayırırım: ` +
        `geri bildirim hacmi, negatif oranı, şüpheli kayıt birikimi ve son 7 günlük ivme. Henüz yorum yok; sadece hangi metriklerin kararı taşıyacağını seçiyorum. ` +
        `${p.grokRole}`
      );
    }
    if (agent === 'Benjamin') {
      return (
        `${p.codename}: Çıkarım ağacını kuruyorum. Başarı ölçütünü netleştirip (ör. churn azaltma vs memnuniyet artışı) çelişen iki hedef varsa hangisinin üstün olduğunu tartışmaya açıyorum. ` +
        `Risk: örneklem küçükse korelasyonu “kesin” saymayız. ${p.thinkingStyle}`
      );
    }
    if (agent === 'Lucas') {
      return (
        `${p.codename}: Ana akım çözümün tersine küçük bir senaryo ekliyorum: kullanıcıların görmediğimiz motivasyonu, ölçüm kör noktalarını ve “başarılı görünüp zararlı” yan etkileri. ` +
        `Erken turda itirazları görünür kılacağım ki üçüncü turda gerçek düello çıksın.`
      );
    }
    return (
      `${p.codename}: Üç uzmanın ilk hamlelerini çerçeveliyorum. Öncelik sırası: (1) Harper’ın kanıtı taşıyan metrikler, (2) Benjamin’in tutarlılık filtresi, (3) Lucas’ın karşı senaryosu. ` +
      `Bu oturumda hedefimiz tek doğru değil — tartışılmış, düşük halüsinasyonlu bir konsensüs. Konu: “${topic}”.`
    );
  }

  if (round === 2) {
    const ref = peers ? `Önceki turdan çekirdek alıntılar: ${peers}. ` : '';
    if (agent === 'Harper') {
      return (
        `${p.codename}: İkinci tur — ${ref}Benjamin’in mantık iskeletini veriyle besliyorum: aynı tabloyu hem ham hem normalize okuyorum. ` +
        `Lucas’ın “yan etki” endişesi için kontrol grubu ve segment kırılımı öneriyorum; aksi halde tek ölçüm tuzağına düşeriz.`
      );
    }
    if (agent === 'Benjamin') {
      return (
        `${p.codename}: Harper’ın rakamlarıyla Lucas’ın hipotezini yüzleştiriyorum: ikisi aynı anda doğru olabilir mi? ` +
        `Evet — ama farklı kullanıcı kohortlarında. Çelişkiyi çözmek için önce tanım uzayı şart; yoksa Benjamin olarak ben bile yanlış kesinlik veririm.`
      );
    }
    if (agent === 'Lucas') {
      return (
        `${p.codename}: Grok’un çerçevesini biraz zorluyorum: konsensüs aceleye gelmesin. “${topic}” için alternatif yorum — başarı metriği yanlış seçilirse ` +
        `optimizasyon doğru yanlışa gider. Harper ve Benjamin’e soruyorum: başarısızlık koşulunu da yazdık mı?`
      );
    }
    return (
      `${p.codename}: İkinci turda üçlü gerilimi görüyorum: veri (Harper), çerçeve (Benjamin), alternatif (Lucas). Rolüm çatışmayı kapatmak değil — görünür kılıp bir sonraki turda ` +
      `sentez için hammaddye çevirmek. Şimdilik süreç sağlıklı; üçüncü turda keskinleşeceğiz.`
    );
  }

  // round === 3
  const ref = peers ? `Özet girdi: ${peers}. ` : '';
  if (agent === 'Harper') {
    return (
      `${p.codename}: Son düello öncesi ${ref}rakamlarda hangi kanıtın “karar” için yeterli güven aralığına indiğini söylüyorum. ` +
      `Belirsizlik yüksekse öneri yerine ölçüm deneyi talep ediyorum — konsey böyle çalışır.`
    );
  }
  if (agent === 'Benjamin') {
    return (
      `${p.codename}: Üçüncü tur — artık kibarlığı bırakıyorum: bir önceki iki turda örtüşen çıkarımlar ile çelişenleri ayırıyorum. ` +
      `Lucas haklıysa risk mitigasyonu eklenmeden plan tutmaz. Harper’ın verisi zayıfsa ölçekleme önerisini düşürüyorum.`
    );
  }
  if (agent === 'Lucas') {
    return (
      `${p.codename}: Son hamle — “herkes hemfikir” halüsinasyonuna karşıyım. ${ref} ` +
      `Eğer tek bir aksiyon seçilecekse, hangi kullanıcı grubunun feda edildiğini açıkça yazalım; yoksa bu konsey yumuşak bir rapor olur, Grok’un da sentezi zayıflar.`
    );
  }
  return (
    `${p.codename}: Üç tur tamam; Harper kanıt taşıdı, Benjamin çerçeveyi sıkılaştırdı, Lucas blind spot’ları zorladı. Bir sonraki adım: benim tarafımdan tek parça “ana cevap” ve uygulanabilir aksiyon seti — ` +
    `çelişkileri içten çözülmüş biçimde sunacağım. Konu: “${topic}”.`
  );
}

function buildCaptainSynthesis(
  topic: string,
  prior: DialogueMessage[],
  decision: { winner: AgentName; summary: string }
): string {
  const debateExcerpt = prior
    .filter((m) => m.round < FINAL_ROUND)
    .slice(-6)
    .map((m) => `· ${m.agentName}: ${m.content.slice(0, 120)}…`)
    .join('\n');

  return (
    `── Ana cevap (Grok · Kaptan) ──\n\n` +
    `Soru / görev: “${topic}”\n\n` +
    `Konsey, paralel düşünme ve karşılıklı düello sonunda ortak bir çekirdek çıkardı. Özetle: ` +
    `${decision.summary}\n\n` +
    `Uzmanlar arasından öne çıkan çizgi: ${AGENT_PERSONAS[decision.winner].codename} perspektifi bu hedefde en yüksek tutarlılık ve etki dengesini veriyor. ` +
    `Lucas’ın uyarıları risk azaltmaya gömülmeli; Benjamin’in sıkı tanımlar ölçümü korur; Harper’ın verisi varsayımları ayakta tutar.\n\n` +
    `Tartışma özeti (kesit):\n${debateExcerpt || '(mesaj geçmişi)'}\n\n` +
    `Sonuç: Aşağıdaki aksiyonlar tutarlı bir paket olarak uygulanmalı; parça parça seçmek sentezi zayıflatır.`
  );
}

function buildDecision(
  topic: string,
  prior: DialogueMessage[]
): { winner: AgentName; summary: string; actions: Array<{ title: string; owner: AgentName; priority: 'high' | 'medium' | 'low' }> } {
  const winner = pickWinner(topic, prior);
  const summary =
    `${winner} (${AGENT_PERSONAS[winner].codename}) çizgisini ana eksen olarak seçiyorum: ` +
    `“${topic.slice(0, 160)}${topic.length > 160 ? '…' : ''}” hedefi için risk, ölçüm ve kullanıcı dengesi bu perspektifte en iyi örtüşüyor. ` +
    `Lucas’ın itirazları aksiyon listesine risk maddesi olarak işlendi; Benjamin ve Harper koşulları korundu.`;

  const actions: Array<{ title: string; owner: AgentName; priority: 'high' | 'medium' | 'low' }> = [
    {
      title: 'Ölçüm planı: KPI + kontrol grubu + başarısızlık eşiği (Harper)',
      owner: 'Harper',
      priority: 'high',
    },
    {
      title: 'Öncelik matrisi ve bağımlılık grafiği — çelişen hedefleri sırala (Benjamin)',
      owner: 'Benjamin',
      priority: 'high',
    },
    {
      title: 'Karşı senaryo ve kullanıcı kohortu risk mitigasyonu (Lucas)',
      owner: 'Lucas',
      priority: 'medium',
    },
    {
      title: 'Tek sayfa konsensüs özeti ve iletişim metni (Grok)',
      owner: 'Grok',
      priority: 'medium',
    },
  ];

  return { winner, summary, actions };
}

function pickWinner(topic: string, prior: DialogueMessage[]): AgentName {
  const t = topic.toLowerCase();
  if (/veri|metrik|oran|istatistik|rakam|kaç|chart|dashboard/.test(t)) return 'Harper';
  if (/mantık|algoritma|hesap|kod|matematik|doğrula|bug/.test(t)) return 'Benjamin';
  if (/yaratıcı|alternatif|kullanıcı|deneyim|algı|his|empati|neden/.test(t)) return 'Lucas';
  if (/strateji|öncelik|roadmap|hedef|okuma|sentez|özet/.test(t)) return 'Grok';

  const specialists = prior.filter((m) => m.agentName !== 'Grok' && m.round === 3);
  const last = specialists[specialists.length - 1];
  return (last?.agentName as AgentName) ?? 'Harper';
}
