import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// AUTH VALIDATIONS
// ─────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email gerekli')
    .email('Geçerli bir email adresi girin'),
  password: z
    .string()
    .min(1, 'Şifre gerekli')
    .min(8, 'Şifre en az 8 karakter olmalı'),
});

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, 'İsim gerekli')
      .min(2, 'İsim en az 2 karakter olmalı')
      .max(50, 'İsim en fazla 50 karakter olabilir'),
    email: z
      .string()
      .min(1, 'Email gerekli')
      .email('Geçerli bir email adresi girin'),
    password: z
      .string()
      .min(1, 'Şifre gerekli')
      .min(8, 'Şifre en az 8 karakter olmalı')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermeli'
      ),
    confirmPassword: z.string().min(1, 'Şifre tekrarı gerekli'),
    role: z.enum(['CUSTOMER', 'DEALER']).default('CUSTOMER'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Şifreler eşleşmiyor',
    path: ['confirmPassword'],
  });

export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'İsim en az 2 karakter olmalı')
    .max(50, 'İsim en fazla 50 karakter olabilir')
    .optional(),
  image: z.string().url('Geçerli bir URL girin').optional().nullable(),
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
// FEEDBACK VALIDATIONS
// ─────────────────────────────────────────────────────────────

export const feedbackSchema = z.object({
  qrCodeId: z.string().min(1, 'QR kod gerekli'),
  rating: z
    .number()
    .min(1, 'Puan 1-5 arasında olmalı')
    .max(5, 'Puan 1-5 arasında olmalı'),
  text: z.string().max(2000, 'Metin en fazla 2000 karakter olabilir').optional(),
  media: z.array(z.string().url()).max(5, 'En fazla 5 medya yüklenebilir').optional(),
  isPublic: z.boolean().default(true),
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

