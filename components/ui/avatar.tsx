'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/utils';
import { resolveAvatarImage } from '@/lib/avatar-options';

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',
      className
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, ...props }, ref) => {
  // Boş string src tarayıcının sayfayı yeniden indirmesine neden olur; img render etme
  if (src === '' || src == null) return null;
  // Hazır avatar yolu (DB'de kimlik olarak duran `/images/avatar/*.svg`) → içerik hash'li,
  // 1 yıl `immutable` önbellekli küçük WebP (perf K2). Yüklenmiş/OAuth görselleri aynen geçer.
  // Böylece header, sidebar, ekip, lig, klan gibi tüm Radix avatar noktaları tek yerden hafifler.
  const resolved = typeof src === 'string' ? (resolveAvatarImage(src) ?? src) : src;
  return (
    <AvatarPrimitive.Image
      ref={ref}
      className={cn('aspect-square h-full w-full object-cover transition-opacity duration-200', className)}
      src={resolved}
      decoding="async"
      // Harici avatarlar (Google lh3 vb.) yabancı Referer ile 429 + HTML döndürüyor → tarayıcı
      // ERR_BLOCKED_BY_ORB ile kesiyordu (ölçüldü: Referer'lı 429 text/html, Referer'sız 200 image/png).
      // Radix ön-yükleyicisi de bu değeri kullanır.
      referrerPolicy={typeof resolved === 'string' && /^https?:\/\//i.test(resolved) ? 'no-referrer' : undefined}
      {...props}
    />
  );
});
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      'flex h-full w-full items-center justify-center rounded-full bg-muted font-medium text-muted-foreground',
      className
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };

