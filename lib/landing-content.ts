import type { LucideIcon } from 'lucide-react';
import {
  QrCode,
  BarChart3,
  Trophy,
  Sparkles,
  Shield,
  Zap,
} from 'lucide-react';
import { TW_BRAND_GRADIENT_STOPS_WIDE } from '@/lib/tw-brand-classes';

/** Özellik kartları — başlık/açıklama messages içinde `landing.features.items.{id}` */
export const featureDefs = [
  {
    id: 'qr' as const,
    icon: QrCode as LucideIcon,
    color: 'from-primary to-primary/80',
  },
  {
    id: 'analytics' as const,
    icon: BarChart3 as LucideIcon,
    color: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'gamification' as const,
    icon: Trophy as LucideIcon,
    color: 'from-amber-500 to-orange-600',
  },
  {
    id: 'realtime' as const,
    icon: Sparkles as LucideIcon,
    color: TW_BRAND_GRADIENT_STOPS_WIDE,
  },
  {
    id: 'security' as const,
    icon: Shield as LucideIcon,
    color: 'from-emerald-500 to-green-600',
  },
  {
    id: 'integration' as const,
    icon: Zap as LucideIcon,
    color: 'from-yellow-500 to-amber-600',
  },
] as const;

/** Fiyat kartları — metinler messages `landing.pricing.plans.{id}` */
export const pricingPlanDefs = [
  { id: 'free' as const, price: '₺0', popular: false },
  { id: 'starter' as const, price: '₺299', period: true, popular: true },
  { id: 'professional' as const, price: '₺699', period: true, popular: false },
] as const;

/** Nasıl çalışır — metinler messages `landing.howItWorks.steps.{id}` */
export const howItWorksStepDefs = [
  { id: 'signup' as const, step: '1' },
  { id: 'createQr' as const, step: '2' },
  { id: 'collect' as const, step: '3' },
] as const;
