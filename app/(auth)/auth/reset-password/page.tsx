'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { m as Motion } from 'framer-motion';
import { Lock, Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppT } from '@/lib/app-locale';
import { safePostLoginRedirect } from '@/lib/safe-callback-url';

function ResetPasswordInner() {
  const t = useAppT();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const rawCallback = searchParams.get('callbackUrl');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const safeCallback = safePostLoginRedirect(rawCallback, origin);
  const loginHref = safeCallback
    ? `/auth/login?callbackUrl=${encodeURIComponent(safeCallback)}`
    : '/auth/login';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error(t('auth.resetPasswordInvalidToken'));
      return;
    }
    if (password.length < 8) {
      toast.error(t('auth.passwordMinLength'));
      return;
    }
    if (password !== confirm) {
      toast.error(t('auth.passwordsDoNotMatch'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t('auth.resetPasswordInvalidToken'));
        return;
      }
      toast.success(data.message || t('auth.resetPasswordSuccess'));
      setPassword('');
      setConfirm('');
      const target = loginHref;
      window.setTimeout(() => {
        window.location.href = target;
      }, 600);
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
            <CardTitle className="text-xl">{t('auth.resetPasswordPageTitle')}</CardTitle>
            <CardDescription>{t('auth.resetPasswordPageDesc')}</CardDescription>
          </CardHeader>
          <form onSubmit={submit}>
            <CardContent className="space-y-4">
              {!token ? (
                <p className="text-sm text-destructive">{t('auth.resetPasswordInvalidToken')}</p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="np">{t('auth.passwordLabel')}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    id="np"
                    type="password"
                    className="pl-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="npc">{t('auth.confirmPasswordLabel')}</Label>
                <Input
                  id="npc"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={loading || !token}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {t('auth.resetPasswordSubmit')}
              </Button>
            </CardContent>
          </form>
          <CardFooter>
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
