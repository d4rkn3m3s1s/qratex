/**
 * Tasarım Sistemi → Temalar: sunucu doğrulama şemaları (zod). Saf model ./theme-model'de;
 * şemalar ayrı tutulur ki kök sağlayıcının (tema çalışma zamanı) istemci paketine zod girmesin.
 */
import { z } from 'zod';
import { FAMILY_IDS, normalizeHex, type ThemeDraft } from './theme-model';

const HexSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeHex(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Renk #RRGGBB biçiminde olmalı.' });
      return z.NEVER;
    }
    return n;
  });

const ModeSurfaceSchema = z
  .object({ background: HexSchema.optional(), foreground: HexSchema.optional() })
  .strict()
  .refine((v) => !!v.background === !!v.foreground, { message: 'Zemin ve metin rengi birlikte verilmeli.' });

export const CustomColorsSchema = z
  .object({
    primary: HexSchema,
    secondary: HexSchema,
    accent: HexSchema,
    modes: z.object({ light: ModeSurfaceSchema.optional(), dark: ModeSurfaceSchema.optional() }).strict().optional(),
  })
  .strict();

export const ThemeDraftSchema = z
  .object({
    activeTheme: z.string().refine((v) => v === 'custom' || FAMILY_IDS.includes(v), { message: 'Bilinmeyen tema.' }),
    customColors: CustomColorsSchema.nullable(),
    defaultMode: z.enum(['system', 'light', 'dark']),
  })
  .strict()
  .refine((v) => v.activeTheme !== 'custom' || v.customColors !== null, {
    message: 'Özel tema için renkler gerekli.',
    path: ['customColors'],
  });

export const PublishThemeBody = z
  .object({
    draft: ThemeDraftSchema,
    /** Okunan sürüm (iyimser kilit); hiç kayıt yoksa null. */
    baseVersion: z.string().max(64).nullable(),
    note: z.string().trim().max(280).optional(),
  })
  .strict();
export type PublishThemeInput = z.infer<typeof PublishThemeBody>;

export const RollbackThemeBody = z
  .object({ auditId: z.string().min(1).max(64), baseVersion: z.string().max(64).nullable() })
  .strict();

export const HistoryQuery = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  size: z.coerce.number().int().min(5).max(50).default(10),
});

// Tip uyumu derleme anında denetlenir: şema çıktısı modeldeki taslak tipine atanabilir olmalı.
const _draftCheck: (v: z.infer<typeof ThemeDraftSchema>) => ThemeDraft = (v) => v;
void _draftCheck;
