# Şema istekleri (Dalga 3 sistem turu)

Schema.prisma değişikliği ajanlara yasak; ihtiyaçlar burada toplanır. Her madde: model/alan, gerekçe, kaynak rapor.

## guvenlik-bayi-api (Dalga 3)

- **DealerStaff.permissions String[] @default([])** (ya da `role String @default("cashier")` + kodda rol şablonu: `cashier` | `shift_lead` | `manager`).
  Gerekçe: Y4 personel yetki matrisi. Bugün AKTİF personel bayinin müşteri listesini (maskeli e-posta), gelen kutusunu, segmentleri, AI önerisini/anlamsal aramayı okuyabiliyor; işletme sahibiyle personel arasında okuma yetkisi farkı yok (yalnız toplu CSV dışa aktarımları personele kapalı). İzinler örneği: `customer.read`, `feedback.read_text`, `ai.use`, `remedy.publish`, `consumption.create`. Varsayılan şablon "Kasiyer": yalnız kasa (kart tarama + tüketim) ve kendi işleri. Uygulama: `lib/auth/scope.ts` `DealerScope`'a `permissions` eklenir, `defineRoute` tanımına `staffPermission: 'customer.read'` alanı; ekip panelinde rol seçici.
- **PricingPlan.maxStaff Int?** ve **PricingPlan.aiDailyTokens Int?** (null = sınırsız / ortam varsayılanı).
  Gerekçe: O7/Y5 plan bazlı kota. Bugün ekip tavanı kodda sabit (`MAX_TEAM_SIZE = 50`, `lib/staff-invitations.ts`) ve AI günlük token tavanı bütün bayiler için tek ortam değişkeni (`AI_DAILY_TOKEN_LIMIT_PER_DEALER`, `lib/ai-cost-guard.ts`). Uygulama: `getDealerPlanLimits` iki alanı döndürür; `createStaffInvitation` ve `checkAiCostGuard` plan değerini kullanır; ayarlar/faturalama ekranında kota göstergesi.
