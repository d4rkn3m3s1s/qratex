'use client';

import { useEffect, useState } from 'react';
import { Bot, Save } from 'lucide-react';
import { AdminPremiumHero } from '@/components/admin/admin-premium-hero';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/admin-toast';

interface AgentWeight {
  name: string;
  weight: number;
}

const defaultWeights: AgentWeight[] = [
  { name: 'Harper', weight: 1 },
  { name: 'Benjamin', weight: 1 },
  { name: 'Lucas', weight: 1 },
  { name: 'Grok', weight: 1 },
];

export default function AgentCouncilAgentsPage() {
  const [weights, setWeights] = useState<AgentWeight[]>(defaultWeights);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/settings?key=agent_council_profiles');
        const data = await res.json();
        const value = data?.setting?.value;
        if (value && Array.isArray(value.weights)) {
          setWeights(value.weights);
        }
      } catch {
        // ignore and keep defaults
      }
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'agent_council_profiles',
          category: 'ai',
          value: { weights },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kayit basarisiz');
      toast.success('Ajan profilleri kaydedildi');
    } catch {
      toast.error('Ajan profilleri kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPremiumHero
        title="Ajan Profilleri"
        description="Konseydeki ajan agirliklarini ayarlayin"
        icon={<Bot className="text-white" />}
      />

      <Card className="rounded-none border-4 border-black dark:border-zinc-700">
        <CardHeader>
          <CardTitle className="font-mono uppercase flex items-center gap-2">
            <Bot className="h-5 w-5" /> Agent Weights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {weights.map((agent, index) => (
            <div key={agent.name} className="flex items-center gap-3 border p-3 rounded-none">
              <div className="flex-1">
                <p className="font-medium">{agent.name}</p>
                <p className="text-xs text-muted-foreground">0.1 - 3.0 arasi etki katsayisi</p>
              </div>
              <Input
                type="number"
                min={0.1}
                max={3}
                step={0.1}
                className="w-28"
                value={agent.weight}
                onChange={(e) => {
                  const next = [...weights];
                  next[index] = { ...agent, weight: Number(e.target.value) };
                  setWeights(next);
                }}
              />
            </div>
          ))}
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
