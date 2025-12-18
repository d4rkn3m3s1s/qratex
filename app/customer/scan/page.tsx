'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  QrCode,
  Camera,
  Keyboard,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function CustomerScanPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!code.trim()) {
      toast.error('Lütfen QR kodu girin');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/qr-codes/public/${code}`);
      const data = await res.json();

      if (data.success) {
        router.push(`/feedback/${code}`);
      } else {
        toast.error('QR kod bulunamadı');
      }
    } catch (error) {
      toast.error('Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleCameraClick = () => {
    toast.info('Kamera özelliği yakında eklenecek', {
      description: 'Şimdilik manuel kod girişi yapabilirsiniz',
    });
  };

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="QR Tara"
        description="Geri bildirim vermek için QR kod tarayın"
      />

      <div className="max-w-lg mx-auto space-y-6">
        {/* Camera Scan */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card glass className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20" />
            <CardContent className="p-8 relative">
              <div className="text-center space-y-4">
                <div className="inline-flex p-6 rounded-full bg-primary/10">
                  <Camera className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">Kamera ile Tara</h3>
                <p className="text-muted-foreground">
                  QR kodu kameranızla tarayın
                </p>
                <Button size="lg" className="w-full gap-2" onClick={handleCameraClick}>
                  <Camera className="h-5 w-5" />
                  Kamerayı Aç
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">veya</span>
          </div>
        </div>

        {/* Manual Entry */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Manuel Giriş
              </CardTitle>
              <CardDescription>
                QR kodun altındaki kodu yazın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="QR kodu girin..."
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="text-center text-lg tracking-widest"
                  maxLength={8}
                />
                <Button onClick={handleSubmit} disabled={loading}>
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card glass className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Puan Kazan!</p>
                  <p className="text-sm text-muted-foreground">
                    Her geri bildiriminiz için puan kazanın, rozetler toplayın ve özel ödüllerin kilidini açın.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

