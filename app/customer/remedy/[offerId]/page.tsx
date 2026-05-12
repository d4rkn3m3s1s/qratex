'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Gift, Loader2, CheckCircle2, ArrowLeft, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineLoadingStatus } from '@/components/ui/inline-loading-status';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/admin-toast';
import { useAppT } from '@/lib/app-locale';

type RemedyOption = { type: string; label: string; unit?: string; values: (number | string)[] };
type OfferDetail = {
  id: string;
  message: string;
  status: string;
  options: RemedyOption[] | null;
  feedbackId: string;
  dealer: { id: string; name: string | null; businessName: string | null };
  feedback: { id: string; rating: number; text: string | null; createdAt: string } | null;
  createdAt: string;
};
type OfferResponse = {
  offer: OfferDetail & { selectedType?: string; selectedValue?: string; acceptedAt?: string; alreadyProcessed?: boolean };
  alreadyProcessed?: boolean;
};

export default function CustomerRemedyOfferPage() {
  const t = useAppT();
  const params = useParams();
  const router = useRouter();
  const offerId = params.offerId as string;
  const [data, setData] = useState<OfferResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedValue, setSelectedValue] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [timeline, setTimeline] = useState<{ at: string; label: string; kind: string }[]>([]);

  useEffect(() => {
    if (!offerId) return;
    fetch(`/api/customer/remedy/${offerId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.offer) setData(j);
        if (j.error) toast.error(j.error);
      })
      .catch(() => toast.error(t('customerRemedyOffer.loadError')))
      .finally(() => setLoading(false));
  }, [offerId, t]);

  useEffect(() => {
    if (!offerId) return;
    fetch(`/api/customer/remedy/${offerId}/timeline`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.timeline)) setTimeline(j.timeline);
      })
      .catch(() => setTimeline([]));
  }, [offerId, data?.offer?.status]);

  const offer = data?.offer;
  const options = (offer?.options as RemedyOption[] | null) || [];
  const selectedOption = options.find((o) => o.type === selectedType);
  const valueOptions = selectedOption ? selectedOption.values.map(String) : [];

  useEffect(() => {
    if (selectedType && (!selectedOption || !selectedOption.values.map(String).includes(selectedValue))) {
      setSelectedValue('');
    }
  }, [selectedType, selectedOption, selectedValue]);

  const handleAccept = async () => {
    if (!selectedType || !selectedValue) {
      toast.error(t('customerRemedyOffer.selectTypeAmount'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customer/remedy/${offerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedType, selectedValue }),
      });
      const j = await res.json();
      if (j.success) {
        toast.success(t('customerRemedyOffer.saved'));
        setData((prev) =>
          prev
            ? {
                ...prev,
                offer: {
                  ...prev.offer!,
                  status: 'accepted',
                  selectedType,
                  selectedValue,
                  acceptedAt: new Date().toISOString(),
                },
                alreadyProcessed: true,
              }
            : null
        );
        fetch(`/api/customer/remedy/${offerId}/timeline`, { cache: 'no-store' })
          .then((r) => r.json())
          .then((tj) => {
            if (Array.isArray(tj.timeline)) setTimeline(tj.timeline);
          })
          .catch(() => {});
      } else {
        toast.error(j.error || t('customerRemedyOffer.saveError'));
      }
    } catch {
      toast.error(t('customerRemedyOffer.connectionError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !data) {
    return (
      <InlineLoadingStatus className="min-h-[160px]" label={t('customerRemedyOffer.loading')} />
    );
  }

  if (!offer) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">{t('customerRemedyOffer.notFound')}</p>
        <Button asChild variant="outline">
          <Link href="/customer/remedy">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('customerRemedyOffer.backToOffers')}
          </Link>
        </Button>
      </div>
    );
  }

  const isAccepted = offer.status === 'accepted' || data.alreadyProcessed;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/customer/remedy">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t('common.back')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="h-6 w-6 text-amber-500" />
            {t('customerRemedyOffer.title')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {offer.dealer?.businessName || offer.dealer?.name || t('customerRemedy.business')} {t('customerRemedyOffer.offerFromBusiness')}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{offer.message}</p>

          {isAccepted ? (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="font-medium text-emerald-600 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                {t('customerRemedyOffer.accepted')}
              </p>
              <p className="text-sm mt-1">
                {t('customerRemedyOffer.selection')}: <strong>{offer.selectedType}</strong> / <strong>{offer.selectedValue}</strong>
              </p>
            </div>
          ) : (
            <>
              <div>
                <Label>{t('customerRemedyOffer.whatToRemedy')}</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder={t('customerRemedyOffer.selectType')} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((opt) => (
                      <SelectItem key={opt.type} value={opt.type}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedOption && (
                <div>
                  <Label>{t('customerRemedyOffer.howMuch')}</Label>
                  <Select value={selectedValue} onValueChange={setSelectedValue}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder={t('customerRemedyOffer.selectAmount')} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedOption.values.map((v) => (
                        <SelectItem key={String(v)} value={String(v)}>
                          {v} {selectedOption.unit || ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={handleAccept} disabled={submitting || !selectedType || !selectedValue} className="w-full gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {t('customerRemedyOffer.savePreference')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {timeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-5 w-5 text-muted-foreground" />
              Süreç zaman çizelgesi
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Teklifinizin hazırlandığı ve kullanıldığı adımlar — şeffaf takip.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 border-l-2 border-border pl-4 ml-1">
              {timeline.map((row, idx) => (
                <li key={`${row.at}-${idx}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                  <p className="text-xs text-muted-foreground">{new Date(row.at).toLocaleString()}</p>
                  <p className="font-medium">{row.label}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
