'use client';

/**
 * Yerinde onay — `ConfirmAction`'ın hafif varyantı. Düşük riskli, geri alınabilir
 * yıkıcı işlemler (arşivle, geri çek, iptal) için: buton tıklanınca AYNI yerde
 * "Emin misin? · Evet / Vazgeç" hâline döner; diyalog açılmaz, bağlam kaybolmaz.
 *
 *   <InlineConfirm onConfirm={() => archive(id)}>
 *     <Archive className="h-4 w-4" aria-hidden /> Arşivle
 *   </InlineConfirm>
 *
 * Kalıcı / kitlesel / tipli onay gerektiren işlemler `ConfirmAction`'da kalır.
 *
 * Erişilebilirlik: onay hâline geçince odak "Vazgeç"e taşınır (yanlışlıkla ikinci
 * Enter'ın onaylamaması için), durum `role="group"` + canlı bölgeyle duyurulur;
 * Esc, odak dışarı çıkınca veya `timeoutMs` dolunca başlangıç butonuna döner.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useA11yCopy } from './copy';
import { announce } from './live-region';

export type InlineConfirmProps = {
  /** Başlangıç butonunun içeriği (ikon + etiket). */
  children: ReactNode;
  onConfirm: () => unknown | Promise<unknown>;
  /** Onay hâlindeki soru; varsayılan "Emin misin?". */
  prompt?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** Başlangıç butonunun varyantı (varsayılan `ghost`). */
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  /** Onay hâlinden kendiliğinden dönme süresi (ms). 0 = kapalı. Varsayılan 5000. */
  timeoutMs?: number;
  /** `danger` → Evet yıkıcı renkte; `neutral` → olağan. */
  tone?: 'danger' | 'neutral';
  disabled?: boolean;
  /** Yalnız başlangıç butonuna uygulanır (onay hâli kendi ölçüsünü kullanır). */
  className?: string;
  /** Başlangıç butonunun erişilebilir adı (yalnız ikon gösteriliyorsa zorunlu). */
  'aria-label'?: string;
};

export function InlineConfirm({
  children,
  onConfirm,
  prompt,
  confirmLabel,
  cancelLabel,
  variant = 'ghost',
  size = 'sm',
  timeoutMs = 5000,
  tone = 'danger',
  disabled,
  className,
  'aria-label': ariaLabel,
}: InlineConfirmProps) {
  const copy = useA11yCopy();
  const promptId = useId();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  const disarm = useCallback((focusTrigger: boolean) => {
    restoreFocus.current = focusTrigger;
    setArmed(false);
  }, []);

  // Onay hâline geçince odağı güvenli seçeneğe taşı + duyur.
  useEffect(() => {
    if (armed) {
      cancelRef.current?.focus();
      announce(copy.confirmOpened);
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [armed, copy.confirmOpened]);

  // Zaman aşımı (işlem sürerken sayılmaz).
  useEffect(() => {
    if (!armed || pending || !timeoutMs) return;
    const t = window.setTimeout(() => {
      const inside = groupRef.current?.contains(document.activeElement) ?? false;
      disarm(inside);
    }, timeoutMs);
    return () => window.clearTimeout(t);
  }, [armed, pending, timeoutMs, disarm]);

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      // Başarılı: satır genelde listeden çıkar; hâlâ duruyorsa başlangıca dön.
      disarm(false);
    } catch {
      // Hata bildirimini çağıran tarafın toast'ı yapar; onay hâli açık kalır, yeniden denenebilir.
    } finally {
      setPending(false);
    }
  };

  if (!armed) {
    return (
      <Button
        ref={triggerRef}
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        aria-label={ariaLabel}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          setArmed(true);
        }}
      >
        {children}
      </Button>
    );
  }

  return (
    <div
      ref={groupRef}
      role="group"
      aria-labelledby={promptId}
      className="inline-flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !pending) {
          e.stopPropagation();
          disarm(true);
        }
      }}
      onBlur={(e) => {
        if (pending) return;
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) disarm(false);
      }}
    >
      <span id={promptId} className="qx-small whitespace-nowrap px-1 text-fg-muted">
        {prompt ?? copy.confirmPrompt}
      </span>
      <Button
        type="button"
        size="sm"
        variant={tone === 'danger' ? 'destructive' : 'default'}
        className="shadow-none"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={confirm}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        {confirmLabel ?? copy.confirmYes}
      </Button>
      <Button ref={cancelRef} type="button" size="sm" variant="ghost" disabled={pending} onClick={() => disarm(true)}>
        {cancelLabel ?? copy.confirmNo}
      </Button>
    </div>
  );
}
