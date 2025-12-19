'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Mail, Lock, AlertCircle, User, ShieldCheck, Store } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { loginSchema, type LoginInput } from '@/lib/validations';
import { cn } from '@/lib/utils';

// Demo hesap bilgileri
const demoAccounts = [
  {
    role: 'ADMIN',
    email: 'admin@qratex.com',
    password: 'Admin123!',
    icon: ShieldCheck,
    label: 'Admin',
    description: 'Tam yetki',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    role: 'DEALER',
    email: 'dealer@qratex.com',
    password: 'Dealer123!',
    icon: Store,
    label: 'Bayi',
    description: 'İşletme hesabı',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  {
    role: 'CUSTOMER',
    email: 'customer@qratex.com',
    password: 'Customer123!',
    icon: User,
    label: 'Müşteri',
    description: 'Kullanıcı hesabı',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Check if mounted for theme
  useState(() => {
    setMounted(true);
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('Giriş başarısız', {
          description: 'Email veya şifre hatalı',
        });
      } else {
        toast.success('Giriş başarılı!', {
          description: 'Yönlendiriliyorsunuz...',
        });
        
        // Redirect to home and let middleware handle role-based routing
        if (callbackUrl && callbackUrl !== '/') {
          router.push(callbackUrl);
        } else {
          // Refresh to get session then redirect
          router.refresh();
          // Small delay to ensure session is set
          setTimeout(() => {
            window.location.href = '/';
          }, 500);
        }
      }
    } catch (error) {
      toast.error('Bir hata oluştu', {
        description: 'Lütfen tekrar deneyin',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (account: typeof demoAccounts[0]) => {
    setValue('email', account.email);
    setValue('password', account.password);
    
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email: account.email,
        password: account.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('Demo giriş başarısız', {
          description: 'Veritabanı seed edilmemiş olabilir',
        });
      } else {
        toast.success(`${account.label} olarak giriş yapıldı!`);
        
        // Route based on role
        const roleRoutes = {
          ADMIN: '/admin',
          DEALER: '/dealer',
          CUSTOMER: '/customer',
        };
        
        router.push(roleRoutes[account.role as keyof typeof roleRoutes]);
        router.refresh();
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md"
    >
      <Card glass>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Tekrar Hoş Geldiniz</CardTitle>
          <CardDescription>
            Hesabınıza giriş yapın
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Demo Accounts */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Demo Hesaplar</Label>
            <div className="grid grid-cols-3 gap-2">
              {demoAccounts.map((account) => (
                <motion.button
                  key={account.role}
                  type="button"
                  onClick={() => handleDemoLogin(account)}
                  disabled={isLoading}
                  className={cn(
                    'p-3 rounded-lg border border-border/50 transition-all duration-200',
                    'hover:border-primary/50 hover:bg-accent/50',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex flex-col items-center gap-1'
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className={cn('p-2 rounded-full', account.bgColor)}>
                    <account.icon className={cn('w-4 h-4', account.color)} />
                  </div>
                  <span className="text-xs font-medium">{account.label}</span>
                  <span className="text-[10px] text-muted-foreground">{account.description}</span>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">veya</span>
            </div>
          </div>

          {/* Google Sign In */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google ile Giriş Yap
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">email ile</span>
            </div>
          </div>

          {/* Email Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="ornek@email.com"
                  className="pl-10"
                  error={!!errors.email}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Şifre</Label>
                <span
                  className="text-sm text-muted-foreground cursor-not-allowed"
                  title="Yakında"
                >
                  Şifremi Unuttum
                </span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-10 pr-10"
                  error={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button type="submit" variant="gradient" className="w-full" loading={isLoading}>
              Giriş Yap
            </Button>
          </form>

          {/* Demo Info */}
          <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
            <p className="text-xs text-muted-foreground text-center">
              <strong>Demo giriş bilgileri:</strong>
              <br />
              Admin: admin@qratex.com / Admin123!
              <br />
              Bayi: dealer@qratex.com / Dealer123!
              <br />
              Müşteri: customer@qratex.com / Customer123!
            </p>
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Hesabınız yok mu?{' '}
            <Link href="/auth/register" className="text-primary hover:underline font-medium">
              Kayıt Olun
            </Link>
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
