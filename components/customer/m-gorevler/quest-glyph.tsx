'use client';

import {
  Camera,
  Gift,
  MapPin,
  MessageSquareText,
  PenLine,
  Sparkles,
  Target,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestIcon, QuestMechanic, QuestState } from './types';

const MECHANIC_ICON: Record<QuestMechanic, LucideIcon> = {
  give_feedback: MessageSquareText,
  feedback_with_photo: Camera,
  detailed_feedback: PenLine,
  visit_businesses: MapPin,
  visit_category: MapPin,
  referral: UserPlus,
  achievement: Sparkles,
  custom: Target,
};

export function mechanicIcon(mechanic: QuestMechanic): LucideIcon {
  return MECHANIC_ICON[mechanic] ?? Target;
}

/**
 * Görev simgesi: admin'in seçtiği `Quest.icon` (emoji ya da /images/... SVG) — Bulgu 13.
 * Yoksa mekanik ikonu. Dekoratiftir (ad metinde okunur).
 */
export function QuestGlyph({
  icon,
  mechanic,
  state,
  size = 'md',
}: {
  icon: QuestIcon;
  mechanic: QuestMechanic;
  state: QuestState;
  size?: 'md' | 'lg';
}) {
  const Fallback = mechanicIcon(mechanic);
  const done = state === 'claimed' || state === 'auto_rewarded';
  const ready = state === 'claimable';
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-control ring-1 ring-inset',
        size === 'lg' ? 'h-14 w-14 text-3xl' : 'h-11 w-11 text-2xl',
        ready
          ? 'bg-success-subtle ring-success-border'
          : done
            ? 'bg-surface-2 ring-subtle opacity-80'
            : 'bg-brand-subtle ring-brand-border',
      )}
    >
      {icon.kind === 'emoji' ? (
        <span className="leading-none">{icon.value}</span>
      ) : icon.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- yerel SVG rozet görselleri (Türkçe adlı dosyalar)
        <img src={encodeURI(icon.src)} alt="" className={cn(size === 'lg' ? 'h-10 w-10' : 'h-8 w-8', 'object-contain')} loading="lazy" decoding="async" />
      ) : (
        <Fallback className={cn(size === 'lg' ? 'h-7 w-7' : 'h-5 w-5', ready ? 'text-success' : 'text-brand')} />
      )}
      {ready ? (
        <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-fg ring-2 ring-surface-1">
          <Gift className="h-3 w-3" />
        </span>
      ) : null}
    </span>
  );
}
