'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { m as Motion } from 'framer-motion';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppT } from '@/lib/app-locale';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';

function ForgotPasswordInner() {
  const t = useAppT();
  const searchParams = useSearchParams();
  const rawCallback = searchParams.get('callbackUrl');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const safeCallback = safePostLoginRedirect(rawCallback, origin);
  const loginHref = safeCallback
    ? `/auth/login?callbackUrl=${encodeURIComponent(safeCallback)}`
    : '/auth/login';

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      const body: { email: string; callbackUrl?: string } = { email: email.trim() };
      if (safeCallback) body.callbackUrl = safeCallback;

      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string; message?: string };

      if (res.status === 503 && data?.error) {
        toast.error(data.error);
      } else if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : t('common.error'));
      } else if (data?.message) {
        toast.success(data.message);
      } else {
        toast.success(t('auth.forgotPasswordToastOk'));
      }
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-10">
      <Motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/60 bg-card/80 backdrop-blur-sm shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl">{t('auth.forgotPasswordPageTitle')}</CardTitle>
            <CardDescription>{t('auth.forgotPasswordPageDesc')}</CardDescription>
          </CardHeader>
          <form onSubmit={submit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fp-email">{t('auth.emailLabel')}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    id="fp-email"
                    type="email"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t('auth.forgotPasswordSubmit')}
              </Button>
            </CardContent>
          </form>
          <CardFooter className="flex flex-col gap-2 border-t pt-4">
            <Button variant="ghost" size="sm" className="w-full gap-2" asChild>
              <Link href={loginHref}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {t('auth.forgotPasswordBack')}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </Motion.div>
    </div>
  );
}

function ForgotPasswordFallback() {
  const t = useAppT();
  return (
    <div className="flex justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<ForgotPasswordFallback />}>
      <ForgotPasswordInner />
    </Suspense>
  );
}
