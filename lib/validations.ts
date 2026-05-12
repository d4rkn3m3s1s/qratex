import { z } from 'zod';
import { INPUT_LIMITS } from '@/lib/input-limits';

// ─────────────────────────────────────────────────────────────
// AUTH VALIDATIONS
// ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'validation.login.emailRequired')
    .email('validation.login.emailInvalid'),
  password: z
    .string()
    .min(1, 'validation.login.passwordRequired')
    .min(8, 'validation.login.passwordMinLength'),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, 'validation.register.nameRequired')
      .min(2, 'validation.register.nameMinLength')
      .max(50, 'validation.register.nameMaxLength'),
    email: z
      .string()
      .min(1, 'validation.register.emailRequired')
      .email('validation.register.emailInvalid'),
    password: z
      .string()
      .min(1, 'validation.register.passwordRequired')
      .min(8, 'validation.register.passwordMinLength')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'validation.register.passwordComplexity'
      ),
    confirmPassword: z.string().min(1, 'validation.register.confirmPasswordRequired'),
    role: z.enum(['CUSTOMER', 'DEALER']).default('CUSTOMER'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'validation.register.passwordsMismatch',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'İsim en az 2 karakter olmalı')
    .max(50, 'İsim en fazla 50 karakter olabilir')
    .optional(),
  image: z
    .string()
    .refine(
      (value) => value.startsWith('/') || /^https?:\/\//.test(value),
      'Geçerli bir URL veya / ile başlayan dosya yolu girin'
    )
    .optional()
    .nullable(),
  businessName: z.string().max(100).optional().nullable(),
  businessDesc: z.string().max(500).optional().nullable(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mevcut şifre gerekli'),
    newPassword: z
      .string()
      .min(8, 'Yeni şifre en az 8 karakter olmalı')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermeli'
      ),
    confirmPassword: z.string().min(1, 'Şifre tekrarı gerekli'),
  })
  .refine(data => data.newPassword === data.confirmPassword, {
    message: 'Şifreler eşleşmiyor',
    path: ['confirmPassword'],
  });

// ─────────────────────────────────────────────────────────────
// LIST QUERY (K1: sayfalama - genel API listeleri)
// ─────────────────────────────────────────────────────────────
export const listQueryPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// ─────────────────────────────────────────────────────────────
// FEEDBACK VALIDATIONS
// ─────────────────────────────────────────────────────────────

export const feedbackSchema = z.object({
  qrCodeId: z.string().min(1, 'QR kod gerekli'),
  rating: z
    .number()
    .min(1, 'Puan 1-5 arasında olmalı')
    .max(5, 'Puan 1-5 arasında olmalı'),
  text: z.string().max(INPUT_LIMITS.feedbackText, `Metin en fazla ${INPUT_LIMITS.feedbackText} karakter olabilir`).optional(),
  media: z
    .array(
      z.union([
        z.string().url(),
        z.object({ url: z.string().url(), type: z.enum(['image', 'audio', 'video']).optional() }),
      ])
    )
    .max(5, 'En fazla 5 medya yüklenebilir')
    .optional(),
  isPublic: z.boolean().default(true),
  npsScore: z.number().min(0, 'NPS 0-10 arası').max(10, 'NPS 0-10 arası').optional().nullable(),
  utmSource: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  attributionSource: z.string().max(100).optional(),
  dealerStaffId: z.string().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────
// QR CODE VALIDATIONS
// ─────────────────────────────────────────────────────────────

export const createQRCodeSchema = z.object({
  name: z
    .string()
    .min(1, 'İsim gerekli')
    .min(2, 'İsim en az 2 karakter olmalı')
    .max(100, 'İsim en fazla 100 karakter olabilir'),
  description: z.string().max(500, 'Açıklama en fazla 500 karakter olabilir').optional(),
});

export const updateQRCodeSchema = z.object({
  name: z
    .string()
    .min(2, 'İsim en az 2 karakter olmalı')
    .max(100, 'İsim en fazla 100 karakter olabilir')
    .optional(),
  description: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  revoke: z.boolean().optional(), // true = set revokedAt to now, false = clear revokedAt
  segmentConfig: z
    .record(z.string(), z.object({ welcomeText: z.string().optional() }).passthrough())
    .optional()
    .nullable(),
});

// ─────────────────────────────────────────────────────────────
// GAMIFICATION VALIDATIONS
// ─────────────────────────────────────────────────────────────

export const createBadgeSchema = z.object({
  name: z.string().min(1, 'İsim gerekli').max(50),
  description: z.string().min(1, 'Açıklama gerekli').max(200),
  icon: z.string().min(1, 'İkon gerekli'),
  category: z.string().min(1, 'Kategori gerekli'),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
  requirement: z.object({
    type: z.string(),
    value: z.union([z.number(), z.boolean()]),
  }),
});

export const createQuestSchema = z.object({
  name: z.string().min(1, 'İsim gerekli').max(50),
  description: z.string().min(1, 'Açıklama gerekli').max(200),
  icon: z.string().min(1, 'İkon gerekli'),
  type: z.enum(['daily', 'weekly', 'special']),
  requirement: z.object({
    type: z.string(),
    count: z.number().positive(),
  }),
  reward: z.object({
    points: z.number().nonnegative(),
    xp: z.number().nonnegative(),
  }),
  expiresAt: z.date().optional().nullable(),
});

export const createRewardSchema = z.object({
  name: z.string().min(1, 'İsim gerekli').max(50),
  description: z.string().min(1, 'Açıklama gerekli').max(200),
  icon: z.string().min(1, 'İkon gerekli'),
  cost: z.number().positive('Maliyet pozitif olmalı'),
  type: z.enum(['digital', 'physical', 'coupon']),
  stock: z.number().min(-1, 'Stok -1 veya daha fazla olmalı'),
  metadata: z
    .object({
      perUserLimit: z.number().int().positive().optional(),
      validFrom: z.string().datetime().optional(),
      validUntil: z.string().datetime().optional(),
    })
    .optional(),
});

// ─────────────────────────────────────────────────────────────
// ADMIN VALIDATIONS
// ─────────────────────────────────────────────────────────────

export const updateSettingsSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  category: z.string().optional(),
});

export const createMenuItemSchema = z.object({
  location: z.enum(['header', 'footer', 'sidebar']),
  label: z.string().min(1, 'Etiket gerekli').max(50),
  href: z.string().min(1, 'Link gerekli'),
  icon: z.string().optional(),
  order: z.number().nonnegative().optional(),
  roles: z.array(z.enum(['ADMIN', 'DEALER', 'CUSTOMER'])).optional().nullable(),
});

export const createPricingPlanSchema = z.object({
  name: z.string().min(1, 'İsim gerekli').max(50),
  description: z.string().max(200).optional(),
  price: z.number().nonnegative('Fiyat negatif olamaz'),
  currency: z.string().default('TRY'),
  interval: z.enum(['monthly', 'yearly', 'lifetime']),
  features: z.array(z.string()),
  isPopular: z.boolean().default(false),
  order: z.number().nonnegative().optional(),
});

export const createCouponSchema = z.object({
  code: z
    .string()
    .min(1, 'Kod gerekli')
    .max(20)
    .regex(/^[A-Z0-9]+$/, 'Kod sadece büyük harf ve rakam içermeli'),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().positive('Değer pozitif olmalı'),
  minPurchase: z.number().nonnegative().optional().nullable(),
  maxUses: z.number().min(-1).optional(),
  expiresAt: z.date().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────
// PHYSICAL CARD SYSTEM VALIDATIONS
// ─────────────────────────────────────────────────────────────

export const generateCardsSchema = z.object({
  quantity: z
    .number()
    .min(1, 'En az 1 kart üretilmeli')
    .max(10000, 'Tek seferde en fazla 10.000 kart üretilebilir'),
  batchName: z
    .string()
    .min(1, 'Batch adı gerekli')
    .max(100, 'Batch adı en fazla 100 karakter olabilir'),
  prefix: z
    .string()
    .max(10, 'Prefix en fazla 10 karakter olabilir')
    .regex(/^[A-Z0-9]*$/, 'Prefix sadece büyük harf ve rakam içerebilir')
    .optional(),
});

export const activateCardSchema = z.object({
  token: z.string().min(1, 'Token gerekli'),
});

export const updateCardStatusSchema = z.object({
  status: z.enum(['UNUSED', 'ACTIVATED', 'BLOCKED']),
  blockReason: z.string().max(500).optional(),
});

export const createConsumptionSchema = z.object({
  cardToken: z.string().min(1, 'Kart token gerekli'),
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  productName: z.string().max(200).optional(), // Manuel ürün adı
  amount: z.number().nonnegative('Tutar negatif olamaz').optional(),
  note: z.string().max(500, 'Not en fazla 500 karakter olabilir').optional(),
});

export const createConsumptionReviewSchema = z.object({
  rating: z
    .number()
    .min(1, 'Puan 1-5 arasında olmalı')
    .max(5, 'Puan 1-5 arasında olmalı'),
  text: z
    .string()
    .max(INPUT_LIMITS.feedbackText, `Yorum en fazla ${INPUT_LIMITS.feedbackText} karakter olabilir`)
    .optional(),
  dimensions: z
    .object({
      taste: z.number().min(1).max(5).optional(),
      service: z.number().min(1).max(5).optional(),
      ambiance: z.number().min(1).max(5).optional(),
      value: z.number().min(1).max(5).optional(),
      cleanliness: z.number().min(1).max(5).optional(),
    })
    .optional(),
});

export const createProductCategorySchema = z.object({
  name: z
    .string()
    .min(1, 'Kategori adı gerekli')
    .max(50, 'Kategori adı en fazla 50 karakter olabilir'),
  icon: z.string().default('🍽️'),
  order: z.number().nonnegative().default(0),
});

export const createProductSchema = z.object({
  name: z
    .string()
    .min(1, 'Ürün adı gerekli')
    .max(100, 'Ürün adı en fazla 100 karakter olabilir'),
  description: z.string().max(500).optional(),
  price: z.number().nonnegative('Fiyat negatif olamaz').optional(),
  categoryId: z.string().min(1, 'Kategori gerekli'),
  image: z.string().url('Geçerli bir URL girin').optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  price: z.number().nonnegative().optional().nullable(),
  categoryId: z.string().optional(),
  image: z.string().url().optional().nullable(),
  isActive: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────
// TYPE EXPORTS
// ─────────────────────────────────────────────────────────────

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export type CreateQRCodeInput = z.infer<typeof createQRCodeSchema>;
export type UpdateQRCodeInput = z.infer<typeof updateQRCodeSchema>;
export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
export type CreateQuestInput = z.infer<typeof createQuestSchema>;
export type CreateRewardInput = z.infer<typeof createRewardSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type CreatePricingPlanInput = z.infer<typeof createPricingPlanSchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

// Physical Card System Types
export type GenerateCardsInput = z.infer<typeof generateCardsSchema>;
export type ActivateCardInput = z.infer<typeof activateCardSchema>;
export type UpdateCardStatusInput = z.infer<typeof updateCardStatusSchema>;
export type CreateConsumptionInput = z.infer<typeof createConsumptionSchema>;
export type CreateConsumptionReviewInput = z.infer<typeof createConsumptionReviewSchema>;
export type CreateProductCategoryInput = z.infer<typeof createProductCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;