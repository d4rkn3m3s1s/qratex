'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/hooks/use-pwa';
import { cn } from '@/lib/utils';

export function InstallBanner() {
  const { isInstallable, isInstalled, isIOS, promptInstall, isStandalone } = usePWA();
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Check localStorage for dismissed state
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedAt = new Date(dismissed);
      const now = new Date();
      // Show again after 7 days
      if (now.getTime() - dismissedAt.getTime() < 7 * 24 * 60 * 60 * 1000) {
        setIsDismissed(true);
      }
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  };

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
    } else {
      const installed = await promptInstall();
      if (installed) {
        setIsDismissed(true);
      }
    }
  };

  // Don't show if already installed or dismissed
  if (isInstalled || isStandalone || isDismissed) {
    return null;
  }

  // Don't show if not installable (and not iOS)
  if (!isInstallable && !isIOS) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 safe-bottom"
        >
          <div className="max-w-lg mx-auto">
            <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-4">
              <div className="flex items-start gap-4">
                {/* App Icon */}
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-500/25">
                  <span className="text-white font-bold text-2xl">Q</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold mb-1">QRATEX'i Yükle</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Ana ekranınıza ekleyin, daha hızlı erişin!
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleInstall}
                      variant="gradient"
                      size="sm"
                      className="flex-1"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Yükle
                    </Button>
                    <Button
                      onClick={handleDismiss}
                      variant="ghost"
                      size="sm"
                    >
                      Sonra
                    </Button>
                  </div>
                </div>

                {/* Close */}
                <button
                  onClick={handleDismiss}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* iOS Guide Modal */}
      <AnimatePresence>
        {showIOSGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setShowIOSGuide(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-card rounded-t-3xl p-6 w-full max-w-lg safe-bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">Ana Ekrana Ekle</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">1</span>
                  </div>
                  <div>
                    <p className="font-medium">Paylaş butonuna tıklayın</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Safari'de alttaki
                      <Share className="w-4 h-4" />
                      ikonuna tıklayın
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">2</span>
                  </div>
                  <div>
                    <p className="font-medium">"Ana Ekrana Ekle" seçin</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      Açılan menüde
                      <Plus className="w-4 h-4" />
                      Ana Ekrana Ekle'yi bulun
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">3</span>
                  </div>
                  <div>
                    <p className="font-medium">"Ekle" butonuna tıklayın</p>
                    <p className="text-sm text-muted-foreground">
                      QRATEX ana ekranınıza eklenecek
                    </p>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => setShowIOSGuide(false)}
                variant="outline"
                className="w-full mt-6"
              >
                Anladım
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default InstallBanner;




