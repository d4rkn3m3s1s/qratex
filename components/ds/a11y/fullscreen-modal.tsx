'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useA11yCopy } from './copy';
import { IconButton } from './icon-button';
import { VisuallyHidden } from './visually-hidden';
import { useRegisterContext, type Register } from '../play/register';

export type FullscreenModalProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  /** Açan öğe (kontrolsüz kullanım). */
  trigger?: React.ReactNode;
  /** ZORUNLU başlık — ekran okuyucu diyaloğu bununla adlandırır. */
  title: React.ReactNode;
  /** Görsel olarak gizle (ör. tam ekran kamera/oyun); ekran okuyucu yine okur. */
  hideTitle?: boolean;
  description?: React.ReactNode;
  hideDescription?: boolean;
  children: React.ReactNode;
  /** Alt eylem çubuğu (güvenli alan payıyla). */
  footer?: React.ReactNode;
  /** Başlık sağındaki ek eylemler (kapatma düğmesinden önce). */
  headerActions?: React.ReactNode;
  /**
   * Esc, dış tıklama ve kapatma düğmesiyle kapatılabilir mi (varsayılan: evet).
   * Kaydetme/yükleme sürerken `false` verin — kullanıcı işlemi yarıda kesmesin.
   */
  dismissible?: boolean;
  closeLabel?: string;
  /** Açılışta odaklanacak öğe (varsayılan: içerikteki ilk odaklanabilir öğe). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** `ops`: düz yüzey · `play`: marka ışıltılı zemin (oyun, ödül, an sahnesi). */
  register?: Register;
  /** Masaüstünde de tam ekran mı, yoksa ≥ sm'de ortalanmış büyük panel mi (varsayılan `panel`). */
  desktop?: 'fullscreen' | 'panel';
  /** Gövde dolgusunu kaldır (kamera önizlemesi, tuval). */
  bleed?: boolean;
  className?: string;
  bodyClassName?: string;
};

/**
 * Tam ekran modal — mobil akışlar (anket, fotoğraf, oyun, uzun form) için.
 * Radix Dialog üstüne kurulu: odak tuzağı, Esc ile kapanma, açanı geri odaklama,
 * `aria-modal`, başlık/açıklama bağları. Çentik/ev çubuğu için güvenli alan payları.
 * Animasyon CSS'te (tailwindcss-animate); azaltılmış harekette global kural kapatır.
 *
 *   <FullscreenModal open={open} onOpenChange={setOpen} title="Deneyimini puanla"
 *     footer={<Button className="w-full" onClick={submit}>Gönder</Button>}>
 *     <RatingInput aria-label="Genel puan" value={v} onChange={setV} size="lg" />
 *   </FullscreenModal>
 */
export function FullscreenModal({
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  title,
  hideTitle = false,
  description,
  hideDescription = false,
  children,
  footer,
  headerActions,
  dismissible = true,
  closeLabel,
  initialFocusRef,
  register: registerProp,
  desktop = 'panel',
  bleed = false,
  className,
  bodyClassName,
}: FullscreenModalProps) {
  // Prop → en yakın RegisterProvider (ör. PanelPage register) → ops.
  const ctxRegister = useRegisterContext();
  const register = registerProp ?? ctxRegister ?? 'ops';
  const copy = useA11yCopy();
  const play = register === 'play';
  const titleNode = <DialogPrimitive.Title className="qx-h2 min-w-0 truncate text-fg">{title}</DialogPrimitive.Title>;
  const descriptionNode = description ? (
    <DialogPrimitive.Description className="qx-small text-fg-muted">{description}</DialogPrimitive.Description>
  ) : null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-modal bg-overlay/70',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            'duration-base ease-standard',
          )}
        />
        <DialogPrimitive.Content
          data-register={register}
          // Açıklama yoksa Radix uyarısını bastırmak için açıkça undefined; varsa Radix bağlar.
          {...(!description ? { 'aria-describedby': undefined } : {})}
          onOpenAutoFocus={(event) => {
            if (initialFocusRef?.current) {
              event.preventDefault();
              initialFocusRef.current.focus();
            }
          }}
          onEscapeKeyDown={(event) => {
            if (!dismissible) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (!dismissible) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (!dismissible) event.preventDefault();
          }}
          className={cn(
            'fixed inset-0 z-modal flex flex-col bg-surface-0 text-fg outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4',
            'duration-base ease-emphasized data-[state=closed]:ease-exit',
            desktop === 'panel' &&
              'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(48rem,calc(100dvh-4rem))] sm:w-[min(40rem,calc(100vw-4rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-sheet sm:border sm:border-subtle sm:qx-elevation-3 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-bottom-0',
            play &&
              'bg-[radial-gradient(120%_70%_at_50%_0%,hsl(var(--brand)/0.16),transparent_60%),radial-gradient(90%_60%_at_100%_100%,hsl(var(--category-2)/0.10),transparent_60%)] bg-surface-0',
            className,
          )}
        >
          <header
            className={cn(
              'flex shrink-0 items-center gap-2 border-b border-subtle',
              'pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]',
              'pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-2',
              play && 'border-transparent',
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col py-1">
              {hideTitle ? <VisuallyHidden asChild>{titleNode}</VisuallyHidden> : titleNode}
              {descriptionNode && (hideDescription ? <VisuallyHidden asChild>{descriptionNode}</VisuallyHidden> : descriptionNode)}
            </div>
            {headerActions}
            <DialogPrimitive.Close asChild>
              <IconButton
                aria-label={closeLabel ?? copy.closeEsc}
                icon={<X />}
                size={play ? 'lg' : 'md'}
                shape="circle"
                disabled={!dismissible}
              />
            </DialogPrimitive.Close>
          </header>

          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain',
              !bleed && 'py-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]',
              !footer && !bleed && 'pb-[max(1rem,env(safe-area-inset-bottom))]',
              bodyClassName,
            )}
          >
            {children}
          </div>

          {footer && (
            <footer
              className={cn(
                'flex shrink-0 flex-col-reverse gap-2 border-t border-subtle bg-surface-1 sm:flex-row sm:justify-end',
                'pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]',
                'pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]',
                play && 'border-transparent bg-transparent',
              )}
            >
              {footer}
            </footer>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
