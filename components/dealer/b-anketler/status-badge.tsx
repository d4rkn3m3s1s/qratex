'use client';

import { PauseCircle, Radio } from 'lucide-react';
import { StatusBadge } from '@/components/ds/data';
import { useSurveyCopy } from './copy';

/** Yayın durumu — ikon + metin + ton (yalnız renge/opaklığa dayanmaz; denetim #7/#12). */
export function SurveyStatusBadge({ active, size = 'sm' }: { active: boolean; size?: 'sm' | 'md' }) {
  const { copy } = useSurveyCopy();
  return <StatusBadge label={active ? copy.live : copy.paused} tone={active ? 'success' : 'neutral'} icon={active ? Radio : PauseCircle} size={size} />;
}
