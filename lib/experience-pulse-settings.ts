import { z } from 'zod';

export const EXPERIENCE_PULSE_SETTINGS_KEY = 'experiencePulseStudio';

const loc = z.object({
  tr: z.string().max(160),
  en: z.string().max(160),
});

const perkLoc = z.object({
  tr: z.string().max(120),
  en: z.string().max(120),
});

export const pulseMoodSchema = z.enum(['aurora', 'sunset', 'noir', 'mint']);

export const pulseFaceSchema = z.object({
  title: loc,
  subtitle: loc,
  badgeLabel: loc,
  mood: pulseMoodSchema,
  perks: z.array(perkLoc).min(1).max(5),
  ctaLabel: loc,
  ctaPath: z
    .string()
    .max(200)
    .optional()
    .transform((v) => {
      const s = (v ?? '').trim();
      if (!s) return '';
      return s.startsWith('/') ? s : `/${s}`;
    }),
});

export const experiencePulsePayloadSchema = z.object({
  customer: pulseFaceSchema,
  dealer: pulseFaceSchema,
});

export type ExperiencePulsePayload = z.infer<typeof experiencePulsePayloadSchema>;
export type PulseFace = ExperiencePulsePayload['customer'];
export type PulseMood = z.infer<typeof pulseMoodSchema>;

const DEFAULT_CUSTOMER: PulseFace = {
  title: { tr: 'Ritim köşesi', en: 'Pulse lounge' },
  subtitle: {
    tr: 'Bugün ödül, görev ve keşif enerjini tek vitrinde topla.',
    en: 'Bundle rewards, quests, and discovery energy in one showcase.',
  },
  badgeLabel: { tr: 'Canlı vitrin', en: 'Live showcase' },
  mood: 'aurora',
  perks: [
    {
      tr: 'Gelişim merkezinde seviye, görev ve rozet nabzını gör.',
      en: 'See level, quest, and badge momentum in Progress hub.',
    },
    {
      tr: 'Keşfet ile kazanç, topluluk ve içgörü sayfalarını grupla.',
      en: 'Group earn, community, and insight flows via Discover.',
    },
    {
      tr: 'QR Tara ile ziyaretini kayda al, ödül zincirini besle.',
      en: 'Log visits with QR scan to fuel the reward chain.',
    },
  ],
  ctaLabel: { tr: 'Ödüllere git', en: 'Open rewards' },
  ctaPath: '/customer/rewards',
};

const DEFAULT_DEALER: PulseFace = {
  title: { tr: 'Vardiya ritmi', en: 'Shift pulse' },
  subtitle: {
    tr: 'Geri bildirim, telafi ve operasyon hızını bir nefeste hisset.',
    en: 'Feel feedback, remedy, and ops speed in one breath.',
  },
  badgeLabel: { tr: 'Operasyon vitrin', en: 'Ops showcase' },
  mood: 'mint',
  perks: [
    {
      tr: 'Operasyon özeti ile günün önceliklerini ilk ekranda aç.',
      en: 'Open Operations brief for the day’s priorities first.',
    },
    {
      tr: 'Geri bildirim + telafi kuyruğunu aynı ritimde tut.',
      en: 'Keep feedback and remedy queue on the same rhythm.',
    },
    {
      tr: 'Personel ve paylaşımlı cihazda güvenli oturum alışkanlığı.',
      en: 'Lean on secure sessions for staff and shared devices.',
    },
  ],
  ctaLabel: { tr: 'Operasyon özetine git', en: 'Open operations brief' },
  ctaPath: '/dealer/operations-brief',
};

export function getDefaultExperiencePulsePayload(): ExperiencePulsePayload {
  return { customer: DEFAULT_CUSTOMER, dealer: DEFAULT_DEALER };
}

function isLocObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeLoc(def: z.infer<typeof loc>, raw: unknown): z.infer<typeof loc> {
  if (!isLocObj(raw)) return def;
  return {
    tr: typeof raw.tr === 'string' ? raw.tr.slice(0, 160) : def.tr,
    en: typeof raw.en === 'string' ? raw.en.slice(0, 160) : def.en,
  };
}

function parseFace(key: 'customer' | 'dealer', rawRoot: Record<string, unknown>, defaults: PulseFace): PulseFace {
  const face = rawRoot[key];
  if (!isLocObj(face)) return defaults;
  const perksIn = Array.isArray(face.perks) ? face.perks : [];
  const perks: z.infer<typeof perkLoc>[] = [];
  for (let i = 0; i < Math.min(5, Math.max(perksIn.length, 1)); i++) {
    const p = perksIn[i];
    const d = defaults.perks[i] ?? defaults.perks[0];
    if (!isLocObj(p)) {
      perks.push(d);
      continue;
    }
    perks.push({
      tr: typeof p.tr === 'string' ? p.tr.slice(0, 120) : d.tr,
      en: typeof p.en === 'string' ? p.en.slice(0, 120) : d.en,
    });
  }
  if (!perks.length) perks.push(defaults.perks[0]);

  const moodParsed = pulseMoodSchema.safeParse(face.mood);
  const mood = moodParsed.success ? moodParsed.data : defaults.mood;

  let ctaPath = typeof face.ctaPath === 'string' ? face.ctaPath.trim() : defaults.ctaPath;
  if (ctaPath && !ctaPath.startsWith('/')) ctaPath = `/${ctaPath}`;

  return {
    title: normalizeLoc(defaults.title, face.title),
    subtitle: normalizeLoc(defaults.subtitle, face.subtitle),
    badgeLabel: normalizeLoc(defaults.badgeLabel, face.badgeLabel),
    mood,
    perks,
    ctaLabel: normalizeLoc(defaults.ctaLabel, face.ctaLabel),
    ctaPath: ctaPath || '',
  };
}

export function normalizeExperiencePulsePayload(raw: unknown): ExperiencePulsePayload {
  const def = getDefaultExperiencePulsePayload();
  if (!isLocObj(raw) || Array.isArray(raw)) return def;
  return {
    customer: parseFace('customer', raw, def.customer),
    dealer: parseFace('dealer', raw, def.dealer),
  };
}
