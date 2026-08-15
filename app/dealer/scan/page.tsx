'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { m as Motion, AnimatePresence } from 'framer-motion';
import {
  ScanLine,
  Camera,
  CameraOff,
  User,
  CheckCircle2,
  XCircle,
  Loader2,
  ShoppingBag,
  Plus,
  History,
  CreditCard,
  ArrowRight,
  X,
  RefreshCw,
  Volume2,
  VolumeX,
  FlipHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReceiptAmountScanner } from '@/components/ocr/receipt-amount-scanner';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/lib/admin-toast';
import { DashboardPageHero } from '@/components/layout/dashboard-page-hero';
import { formatCurrency, formatRelativeTime } from '@/lib/utils';
import { useAppT } from '@/lib/app-locale';

interface ScannedCard {
  id: string;
  token: string;
  status: string;
  customer: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    points: number;
    level: number;
  };
  recentConsumptions: any[];
  totalConsumptions: number;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  _count: { products: number };
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  category: {
    id: string;
    name: string;
    icon: string;
  };
}

export default function DealerScanPage() {
  const t = useAppT();
  const scannerRef = useRef<any>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  
  const [cameraActive, setCameraActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [scannedCard, setScannedCard] = useState<ScannedCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  
  // Consumption form
  const [showConsumptionForm, setShowConsumptionForm] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories();
    
    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      fetchProducts(selectedCategory);
    } else {
      setProducts([]);
    }
  }, [selectedCategory]);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/dealer/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchProducts = async (categoryId: string) => {
    try {
      const res = await fetch(`/api/dealer/products?categoryId=${categoryId}`);
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 1000;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch {
      // Web Audio yoksa sessizce geç (beep opsiyonel).
    }
  }, [soundEnabled]);

  const extractToken = (text: string): string => {
    // URL'den token çıkar: https://qratex.com/c/TOKEN veya /c/TOKEN
    const urlMatch = text.match(/\/c\/([A-Za-z0-9_-]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    // Düz token
    return text.trim();
  };

  const onScanSuccess = useCallback(async (decodedText: string) => {
    // Aynı kodu tekrar taramayı engelle
    if (lastScannedCode === decodedText) return;
    setLastScannedCode(decodedText);
    
    playBeep();
    
    const token = extractToken(decodedText);
    // (Debug log kaldırıldı — QR token'ı üretimde console'a basmamalı.)

    // Taramayı durdur ve işle
    await handleScan(token);
    
    // 3 saniye sonra tekrar taramaya izin ver
    setTimeout(() => setLastScannedCode(null), 3000);
  }, [lastScannedCode, playBeep]);

  const startCamera = async () => {
    try {
      // Dynamic import for html5-qrcode (client-side only)
      const { Html5Qrcode } = await import('html5-qrcode');
      
      if (!scannerContainerRef.current) {
        toast.error(t('dealerScan.scannerContainerError'));
        return;
      }

      // Eğer önceki scanner varsa temizle
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch (e) {}
      }

      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1,
      };

      await scanner.start(
        { facingMode },
        config,
        onScanSuccess,
        (errorMessage) => {
          // QR kodu bulunamadığında - sürekli çağrılır, ignore et
        }
      );

      setCameraActive(true);
      toast.success(t('dealerScan.cameraActiveSuccess'));
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        toast.error(t('dealerScan.cameraPermissionDenied'));
      } else if (err.name === 'NotFoundError') {
        toast.error(t('dealerScan.cameraNotFound'));
      } else {
        toast.error(`${t('dealerScan.cameraStartFailed')}${err.message ? `: ${err.message}` : ''}`);
      }
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (e) {
        console.error('Error stopping scanner:', e);
      }
    }
    setCameraActive(false);
    setLastScannedCode(null);
  };

  const switchCamera = async () => {
    await stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    // Kamera yeniden başlatılacak
    setTimeout(() => startCamera(), 500);
  };

  const handleScan = async (token: string) => {
    if (!token.trim()) {
      toast.error(t('dealerScan.tokenRequired'));
      return;
    }

    setScanning(true);
    setError(null);
    setScannedCard(null);

    try {
      const res = await fetch(`/api/dealer/cards/scan/${encodeURIComponent(token.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t('dealerScan.cardNotFound'));
        if (data.code === 'CARD_NOT_ACTIVATED') {
          toast.error(t('dealerScan.cardNotActivated'));
        } else if (data.code === 'CARD_BLOCKED') {
          toast.error(t('dealerScan.cardBlocked'));
        } else {
          toast.error(data.error);
        }
        return;
      }

      setScannedCard(data.card);
      toast.success(t('dealerScan.customerFoundToast').replace('{name}', data.card.customer.name));
      await stopCamera();
    } catch (err) {
      setError(t('dealerScan.scanFailedGeneric'));
      toast.error(t('dealerScan.genericError'));
    } finally {
      setScanning(false);
    }
  };

  const handleManualScan = () => {
    // URL veya düz token destekle
    const token = extractToken(manualToken);
    handleScan(token);
  };

  const handleSubmitConsumption = async () => {
    if (!scannedCard) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/dealer/consumptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardToken: scannedCard.token,
          productId: selectedProduct || undefined,
          amount: amount ? parseFloat(amount) : undefined,
          note: note || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || t('dealerScan.consumptionSaveFailed'));
        return;
      }

      toast.success(t('dealerScan.consumptionSaved'));
      setShowConsumptionForm(false);
      resetForm();
      
      // Kartı yeniden tara (güncel bilgi için)
      handleScan(scannedCard.token);
    } catch (err) {
      toast.error(t('dealerScan.genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedCategory('');
    setSelectedProduct('');
    setAmount('');
    setNote('');
  };

  const resetScan = () => {
    setScannedCard(null);
    setManualToken('');
    setError(null);
    setLastScannedCode(null);
  };

  return (
    <div className="space-y-6 pb-8">
      <DashboardPageHero
        eyebrow={t('dealerScan.eyebrow')}
        title={t('dealerScan.title')}
        description={t('dealerScan.description')}
        icon={<ScanLine className="h-7 w-7" aria-hidden />}
        tone="auto"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Scanner Section - full screen camera on mobile when active */}
        <Card className={`border-border/60 bg-card/50 backdrop-blur-sm md:block ${cameraActive ? 'fixed inset-0 z-40 m-0 rounded-none flex flex-col' : ''}`}>
          <CardHeader className={cameraActive ? 'flex-shrink-0' : ''}>
            <CardTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              {t('dealerScan.qrScannerTitle')}
            </CardTitle>
            <CardDescription>
              {t('dealerScan.qrScannerDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className={`space-y-4 flex-1 flex flex-col min-h-0 ${cameraActive ? 'md:flex-initial' : ''}`}>
            {/* Camera Preview - full area on mobile when active */}
            <div className={`relative bg-muted dark:bg-slate-900 rounded-xl overflow-hidden ${cameraActive ? 'flex-1 min-h-[50vh] md:min-h-0 md:aspect-square' : 'aspect-square'}`}>
              <div 
                id="qr-reader" 
                ref={scannerContainerRef}
                className={`w-full h-full ${!cameraActive ? 'hidden' : ''} ${cameraActive ? 'min-h-[60vh] md:min-h-0' : ''}`}
                style={{ 
                  minHeight: cameraActive ? undefined : '300px',
                }}
              />
              
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
                  <CameraOff className="w-16 h-16 mb-4" />
                  <p>{t('dealerScan.cameraOffTitle')}</p>
                  <p className="text-xs text-slate-600 mt-2">{t('dealerScan.cameraOffHint')}</p>
                </div>
              )}

              {cameraActive && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Scan overlay animation */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Motion.div
                      className="absolute inset-0 border-4 border-emerald-500/30"
                      animate={{ opacity: [0.3, 0.7, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>
                </div>
              )}

              {scanning && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center text-white">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    <p>{t('dealerScan.validatingCard')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Camera controls */}
            <div className="flex gap-2">
              {!cameraActive ? (
                <Button onClick={startCamera} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                  <Camera className="w-4 h-4 mr-2" />
                  {t('dealerScan.openCamera')}
                </Button>
              ) : (
                <>
                  <Button onClick={stopCamera} variant="destructive" className="flex-1">
                    <CameraOff className="w-4 h-4 mr-2" />
                    {t('dealerScan.closeCamera')}
                  </Button>
                  <Button onClick={switchCamera} variant="outline" size="icon" title={t('dealerScan.flipCameraTitle')}>
                    <FlipHorizontal className="w-4 h-4" />
                  </Button>
                  <Button 
                    onClick={() => setSoundEnabled(!soundEnabled)} 
                    variant="outline" 
                    size="icon"
                    title={soundEnabled ? t('dealerScan.soundMuteTitle') : t('dealerScan.soundOnTitle')}
                  >
                    {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </Button>
                </>
              )}
            </div>

            {/* Status indicator */}
            {cameraActive && (
              <Motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
              >
                <Motion.div 
                  className="w-3 h-3 rounded-full bg-emerald-500"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-sm text-emerald-400">{t('dealerScan.scanActiveHint')}</span>
              </Motion.div>
            )}

            {/* Manual input */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-xs text-muted-foreground">{t('dealerScan.manualTokenLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={t('dealerScan.manualTokenPlaceholder')}
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualScan()}
                  className="text-sm"
                />
                <Button 
                  onClick={handleManualScan} 
                  disabled={scanning || !manualToken.trim()}
                  size="sm"
                >
                  {scanning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Result Section */}
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              {t('dealerScan.customerInfoTitle')}
            </CardTitle>
            <CardDescription>
              {t('dealerScan.customerInfoDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnimatePresence mode="wait">
              {error ? (
                <Motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="text-center py-8"
                >
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-500" />
                  </div>
                  <p className="text-red-400 mb-4">{error}</p>
                  <Button variant="outline" onClick={resetScan}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    {t('dealerScan.retryScan')}
                  </Button>
                </Motion.div>
              ) : scannedCard ? (
                <Motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-4"
                >
                  {/* Customer info */}
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        {scannedCard.customer.image ? (
                          <img 
                            src={scannedCard.customer.image} 
                            alt={scannedCard.customer.name} 
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <User className="w-7 h-7 text-emerald-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold">{scannedCard.customer.name}</h3>
                        <p className="text-sm text-muted-foreground">{scannedCard.customer.email}</p>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {t('dealerScan.levelBadge')} {scannedCard.customer.level}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {scannedCard.customer.points} {t('dealerScan.points')}
                          </Badge>
                        </div>
                      </div>
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-2xl font-bold">{scannedCard.totalConsumptions}</p>
                      <p className="text-xs text-muted-foreground">{t('dealerScan.totalConsumption')}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="text-2xl font-bold">{scannedCard.recentConsumptions.length}</p>
                      <p className="text-xs text-muted-foreground">{t('dealerScan.recentFive')}</p>
                    </div>
                  </div>

                  {/* Recent consumptions */}
                  {scannedCard.recentConsumptions.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">{t('dealerScan.recentConsumptions')}</Label>
                      {scannedCard.recentConsumptions.slice(0, 3).map((consumption) => (
                        <div key={consumption.id} className="p-2 rounded-lg bg-muted/30 text-sm flex items-center justify-between">
                          <span>{consumption.product?.name || t('dealerScan.productUnspecified')}</span>
                          <span className="text-muted-foreground">
                            {formatRelativeTime(consumption.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600"
                      onClick={() => setShowConsumptionForm(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t('dealerScan.addConsumption')}
                    </Button>
                    <Button variant="outline" onClick={resetScan}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </Motion.div>
              ) : (
                <Motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-12"
                >
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                    <CreditCard className="w-10 h-10 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground">
                    {t('dealerScan.emptyHintTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('dealerScan.emptyHintSub')}
                  </p>
                </Motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* Consumption Form Dialog */}
      <Dialog open={showConsumptionForm} onOpenChange={setShowConsumptionForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              {t('dealerScan.consumptionDialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {scannedCard?.customer.name
                ? t('dealerScan.consumptionDialogDescription').replace('{name}', scannedCard.customer.name)
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Category selection */}
            <div className="space-y-2">
              <Label>{t('dealerScan.categoryLabel')}</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder={t('dealerScan.selectCategoryPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        {cat.name}
                        <span className="text-muted-foreground">({cat._count.products})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product selection */}
            {selectedCategory && (
              <div className="space-y-2">
                <Label>{t('dealerScan.productLabel')}</Label>
                <Select value={selectedProduct} onValueChange={(val) => {
                  setSelectedProduct(val);
                  const product = products.find(p => p.id === val);
                  if (product?.price) {
                    setAmount(product.price.toString());
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('dealerScan.selectProductPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        <span className="flex items-center justify-between w-full">
                          <span>{product.name}</span>
                          {product.price && (
                            <span className="text-muted-foreground ml-2">
                              {formatCurrency(product.price)}
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Amount — fiş fotoğrafından OCR ile de doldurulabilir (tarayıcıda, ücretsiz) */}
            <div className="space-y-2">
              <Label>{t('dealerScan.amountOptional')}</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <ReceiptAmountScanner onAmountDetected={(v) => setAmount(v)} />
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>{t('dealerScan.noteOptional')}</Label>
              <Textarea
                placeholder={t('dealerScan.notePlaceholder')}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConsumptionForm(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleSubmitConsumption} 
              disabled={submitting}
              className="bg-gradient-to-r from-emerald-600 to-teal-600"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('dealerScan.saving')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {t('common.save')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
