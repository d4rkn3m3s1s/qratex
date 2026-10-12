'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { useSlidingIndicator } from '@/lib/motion/use-sliding-indicator';

const Tabs = TabsPrimitive.Root;

/**
 * Kayan gösterge: aktif tetikleyicinin kutusu ölçülür, tek bir mutlak `span` oraya
 * transform + boyut geçişiyle kayar (layoutId muadili; global LazyMotion `domAnimation`
 * layout içermediği için CSS ile — ek paket yok). Ölçüm hazır olana dek (SSR/ilk boya)
 * tetikleyicinin kendi aktif zemini görünür → yanıp sönme yok. Azaltılmış harekette
 * global politika geçişi sıfırlar (anında atlar).
 */
const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const indicatorRef = React.useRef<HTMLSpanElement | null>(null);
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref]
  );
  const ready = useSlidingIndicator(innerRef, indicatorRef);

  return (
    <TabsPrimitive.List
      ref={setRefs}
      data-indicator={ready ? 'ready' : undefined}
      className={cn(
        'group/tabs relative inline-flex h-auto min-h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
        className
      )}
      {...props}
    >
      <span
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 rounded-sm bg-background opacity-0 shadow-sm transition-[transform,width,height,opacity] duration-slow ease-emphasized"
      />
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'relative z-[1] inline-flex min-h-10 sm:min-h-9 cursor-pointer touch-manipulation items-center justify-center whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium ring-offset-background transition-[color,background-color,box-shadow] duration-base ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm group-data-[indicator=ready]/tabs:data-[state=active]:bg-transparent group-data-[indicator=ready]/tabs:data-[state=active]:shadow-none',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };




