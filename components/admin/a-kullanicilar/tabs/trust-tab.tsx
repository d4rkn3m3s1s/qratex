'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KeyValueList, StatusBadge, Timeline, statusBadgeProps } from '@/components/ds/data';
import { SectionCard } from '@/components/ds/page';
import { QueryState } from '@/components/states';
import type { User360 } from '@/lib/admin-users/contract';
import { fetchActivity, usersKeys } from '../api';
import { FRAUD, TRUST, fmtDateTime } from '../format';
import { AdminKullanicilarText } from '../copy';

const SEVERITY_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = { LOW: 'info', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' };

export function TrustTab({ user: u }: { user: User360 }) {
  const q = useQuery({ queryKey: usersKeys.sub(u.identity.id, 'activity'), queryFn: () => fetchActivity(u.identity.id), staleTime: 30_000 });
  return (
    <div className="space-y-6">
      <SectionCard
        title="Güven ve suistimal"
        icon={<ShieldAlert />}
        actions={
          <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
            <Link href="/admin/trust"><AdminKullanicilarText k="trustCenter" /></Link>
          </Button>
        }
      >
        <KeyValueList
          items={[
            { label: 'Güven kademesi', value: <StatusBadge size="sm" {...statusBadgeProps(TRUST, u.trust.tier)} /> },
            { label: 'Güven puanı', value: `${u.trust.score} / 100`, hint: u.trust.updatedAt ? `Güncellendi: ${fmtDateTime(u.trust.updatedAt)}` : 'Henüz hesaplanmadı' },
            { label: 'Suistimal durumu', value: <StatusBadge size="sm" {...statusBadgeProps(FRAUD, u.trust.fraudStatus)} /> },
            { label: 'Suistimal puanı', value: u.trust.fraudScore != null ? u.trust.fraudScore.toFixed(2) : null },
            { label: 'Açık şüpheli etkinlik', value: String(u.trust.openSuspicious) },
          ]}
        />
      </SectionCard>

      <SectionCard title="Son etkinlik" icon={<Activity />} description="Uygulama olayları ve şüpheli etkinlik kayıtları (en yeni 60).">
        <QueryState query={q} skeleton="list" isEmpty={(d) => d.items.length === 0} empty={{ title: 'Kayıtlı etkinlik yok', compact: true }}>
          {(d) => (
            <Timeline
              groupByDay
              events={d.items.map((a) => ({
                id: a.id,
                at: a.createdAt,
                title: a.kind === 'suspicious' ? `Şüpheli: ${a.title}` : a.title,
                description: a.detail ?? undefined,
                tone: a.kind === 'suspicious' ? SEVERITY_TONE[a.severity ?? ''] ?? 'warning' : 'neutral',
                icon: a.kind === 'suspicious' ? AlertTriangle : undefined,
                meta: a.kind === 'suspicious' ? <StatusBadge size="sm" tone={a.resolved ? 'success' : 'warning'} label={a.resolved ? 'Çözüldü' : 'Açık'} /> : undefined,
              }))}
            />
          )}
        </QueryState>
      </SectionCard>
    </div>
  );
}
