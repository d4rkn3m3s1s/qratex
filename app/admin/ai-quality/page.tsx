'use client';

import { useState, useEffect } from 'react';
import { m as Motion } from 'framer-motion';
import {
  Eye,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Star,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/admin-toast';
import { BootstrapActionButton } from '@/components/admin/bootstrap-action-button';
import { useAppT } from '@/lib/app-locale';

interface FeedbackData {
  id: string;
  text: string | null;
  rating: number;
  sentiment: string | null;
  intent: string | null;
  aiAnalysis: unknown;
  aiProcessedAt: string | null;
  qrCode: { name: string } | null;
}

interface Sample {
  id: string;
  feedbackId: string;
  reviewedAt: string | null;
  reviewerId: string | null;
  accuracyScore: number | null;
  notes: string | null;
  status: string;
  createdAt: string;
  feedback: FeedbackData;
}

interface Stats {
  pendingCount: number;
  reviewedCount: number;
}

export default function AdminAIQualityPage() {
  const t = useAppT();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [stats, setStats] = useState<Stats>({ pendingCount: 0, reviewedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [score, setScore] = useState(75);
  const [notes, setNotes] = useState('');

  const fetchSamples = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-quality?status=${statusFilter}&limit=50`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.failedToLoad'));
      setSamples(data.samples || []);
      setStats(data.stats || { pendingCount: 0, reviewedCount: 0 });
    } catch (err) {
      toast.error('Örnekler yüklenemedi');
      setSamples([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSamples();
  }, [statusFilter]);

  const handleSave = async (sampleId: string) => {
    try {
      const res = await fetch('/api/admin/ai-quality', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sampleId, accuracyScore: score, notes: notes || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.failedToUpdate'));
      toast.success('Skor kaydedildi');
      setEditingId(null);
      setScore(75);
      setNotes('');
      fetchSamples();
    } catch (err) {
      toast.error('Kaydetme başarısız');
    }
  };

  const startEdit = (s: Sample) => {
    setEditingId(s.id);
    setScore(s.accuracyScore ?? 75);
    setNotes(s.notes ?? '');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Kalite İncelemesi"
        description="Haftalık AI analiz örneklerini manuel skorlayın (0–100)"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Bekleyen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pendingCount}</p>
            <p className="text-xs text-muted-foreground">Manuel inceleme bekliyor</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              İncelendi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.reviewedCount}</p>
            <p className="text-xs text-muted-foreground">Skor verildi</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <Button
          variant={statusFilter === 'pending' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('pending')}
        >
          Bekleyen
        </Button>
        <Button
          variant={statusFilter === 'reviewed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('reviewed')}
        >
          İncelendi
        </Button>
        <Button
          variant={statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('all')}
        >
          Tümü
        </Button>
        <BootstrapActionButton
          action="seed_ai_quality_samples"
          label="Demo örnek üret"
          onDone={fetchSamples}
        />
        <BootstrapActionButton
          action="clear_ai_quality_samples"
          label="Demo örnekleri sil"
          variant="destructive"
          onDone={fetchSamples}
        />
      </div>

      {/* Sample list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : samples.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>İncelenecek örnek yok.</p>
            <p className="text-sm">Haftalık cron ile 100 örnek eklenir.</p>
            <div className="mt-4 flex justify-center">
              <BootstrapActionButton
                action="seed_ai_quality_samples"
                label="Şimdi örnek üret"
                onDone={fetchSamples}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {samples.map((s) => (
            <Motion.div
              key={s.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Card>
                <CardContent className="p-4">
                  <div
                    className="flex items-start justify-between gap-4 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {s.feedback?.text || '(Metin yok)'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Badge variant="outline">Puan: {s.feedback?.rating ?? '-'}</Badge>
                        <Badge variant="outline">Sentiment: {s.feedback?.sentiment ?? '-'}</Badge>
                        {s.accuracyScore != null && (
                          <Badge variant="secondary">Skor: {s.accuracyScore}</Badge>
                        )}
                        {s.status === 'reviewed' && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(s);
                          }}
                        >
                          Skor Ver
                        </Button>
                      )}
                      {expandedId === s.id ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </div>
                  </div>

                  {expandedId === s.id && (
                    <div className="mt-4 pt-4 border-t space-y-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">AI Analizi</p>
                        <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-32">
                          {JSON.stringify(s.feedback?.aiAnalysis || {}, null, 2)}
                        </pre>
                      </div>

                      {editingId === s.id ? (
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium">Doğruluk Skoru (0–100)</label>
                            <div className="flex items-center gap-2 mt-1">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={score}
                                onChange={(e) => setScore(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                                className="w-24"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-sm font-medium">Notlar</label>
                            <Textarea
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              placeholder="İyileştirme notları..."
                              rows={2}
                              className="mt-1"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSave(s.id)}>
                              Kaydet
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(null);
                                setScore(75);
                                setNotes('');
                              }}
                            >
                              İptal
                            </Button>
                          </div>
                        </div>
                      ) : (
                        s.notes && (
                          <p className="text-sm text-muted-foreground">
                            <strong>Not:</strong> {s.notes}
                          </p>
                        )
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
