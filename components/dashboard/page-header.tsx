'use client';

import type { ReactNode } from 'react';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Varsayılan: Yönetim paneli */
  eyebrow?: string;
};

export function PageHeader({ title, description, actions, eyebrow = 'Yönetim paneli' }: PageHeaderProps) {
  return (
    <DashboardPageHero
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={actions}
    />
  );
}
