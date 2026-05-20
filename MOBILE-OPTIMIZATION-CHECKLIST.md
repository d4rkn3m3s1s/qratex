# Mobile Optimization Checklist & Guidelines

## Completed in Session ✅
- [x] Removed hardcoded Turkish strings (9 components)
- [x] Added i18n translations for common errors and table signal
- [x] Improved grid layouts with responsive breakpoints
- [x] Fixed responsive card widths and padding
- [x] Added proper text size scaling for mobile

## Testing Checklist

### Viewport Testing Required
- [ ] 320px (iPhone SE)
- [ ] 375px (iPhone 12/13)
- [ ] 425px (Pixel 5)
- [ ] 768px (iPad)
- [ ] 1024px (iPad Pro)
- [ ] 1440px (Desktop)

### Components to Test
- [ ] Table Signal page - form inputs, buttons spacing
- [ ] VOC Wall - grid layout, card truncation, live feed scrolling
- [ ] Dashboard cards - layout stacking, touch targets
- [ ] Navigation sidebar - responsive menu items, collapsing behavior
- [ ] Forms - input field sizing, label positioning
- [ ] Buttons - minimum 44x44px touch target

## Mobile-First Best Practices

### Responsive Breakpoints Pattern
```tsx
// ❌ Avoid desktop-first (old pattern)
className="grid grid-cols-4 lg:grid-cols-3 md:grid-cols-2"

// ✅ Use mobile-first with proper progression
className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
```

### Padding & Spacing
```tsx
// ✅ Mobile-optimized spacing
className="p-3 sm:p-4 md:p-6"
className="px-4 sm:px-6"
className="gap-2 sm:gap-4"
```

### Touch Targets
```tsx
// ✅ Minimum 44x44px for touch devices
<button className="h-12 w-12 sm:h-14 sm:w-14">
```

### Text Sizing
```tsx
// ✅ Responsive typography
<h1 className="text-xl sm:text-2xl md:text-3xl">
<p className="text-xs sm:text-sm">
```

### Fixed Width Issues
```tsx
// ❌ Avoid fixed widths on mobile
className="w-[260px]"

// ✅ Use responsive widths
className="w-[90vw] min-w-[140px] sm:w-[260px]"
className="max-w-[120px] sm:max-w-[260px]"
```

### Safe Area for Notched Devices
```tsx
// ✅ For fixed positioning (status bar safe areas)
className="fixed bottom-0 pb-[max(1rem,env(safe-area-inset-bottom))]"
className="fixed top-0 pt-[max(1rem,env(safe-area-inset-top))]"
```

## Translation Standards

### Pattern to Follow
```tsx
import { useAppT } from '@/hooks/use-app-t';

export function Component() {
  const t = useAppT();
  
  return (
    <>
      <h1>{t('module.key')}</h1>
      <p>{t('module.description')}</p>
      <button onClick={() => toast.error(t('common.failedToSubmit'))}>
        {t('common.submit')}
      </button>
    </>
  );
}
```

### Common Translation Keys
```json
{
  "common": {
    "loading": "Yükleniyor...",
    "failedToSubmit": "Gönderilemedi",
    "failedToLoad": "Yüklenemedi",
    "failedToUpdate": "Güncellenemedi",
    "updated": "Güncellendi",
    "show": "Göster",
    "hide": "Gizle"
  }
}
```

## Performance Optimization

### Mobile-Specific Performance
- [ ] Remove infinite animations on mobile (check Framer Motion `repeat: Infinity`)
- [ ] Lazy load images on mobile
- [ ] Minimize bundle size for 4G networks
- [ ] Test Core Web Vitals on mobile

### Testing Tools
- Google Lighthouse (DevTools)
- Chrome DevTools Mobile Emulation
- BrowserStack for real device testing
- Vercel Web Analytics for production monitoring

## Accessibility for Mobile

### Touch Targets
- Minimum 44x44px for buttons/links
- Adequate spacing between interactive elements
- Consider thumb-friendly zones (bottom of screen)

### Text Readability
- Minimum 16px font size on mobile (prevents auto-zoom)
- Adequate line-height for readability
- Sufficient color contrast (WCAG AA standard)

### Screen Reader Support
- Proper semantic HTML
- aria-labels for icon buttons
- Descriptive link text

## Common Mobile Issues Found

### Fixed Positioning Overlaps
- Issue: Fixed elements overlap content on small screens
- Solution: Use responsive `hidden lg:flex` or adjust safe-area padding
- Files: Check sidebar, fixed headers, floating buttons

### Horizontal Overflow
- Issue: Tables, code blocks overflow on mobile
- Solution: Use `overflow-x-auto` with horizontal scrolling
- Files: dashboard components, data tables

### Text Truncation
- Issue: Labels truncate unexpectedly
- Solution: Use `max-w-[90vw]` instead of fixed widths
- Files: VOC Wall, cards with long text

### Button Spacing Issues
- Issue: Buttons too close together on mobile
- Solution: Use responsive gap: `gap-2 sm:gap-4`
- Files: Form buttons, action button groups

## Rollout Plan

### Phase 1: Core Components (DONE)
- [x] Table Signal
- [x] VOC Wall
- [x] Common error messages

### Phase 2: Critical User Journeys
- [ ] Customer feedback form
- [ ] Dealer dashboard
- [ ] Authentication flows
- [ ] Checkout/rewards redemption

### Phase 3: Secondary Features
- [ ] Admin panels
- [ ] Analytics views
- [ ] Settings pages
- [ ] Notification center

## Monitoring

### Production Metrics to Track
- Mobile conversion rate
- Mobile bounce rate
- Lighthouse Mobile Score
- Core Web Vitals (mobile)
- User session duration on mobile

### Tools
- Vercel Analytics
- Sentry (error tracking)
- Hotjar (session recording)
- BrowserStack (device testing)

## Resources

### Documentation
- Next.js Responsive Design: https://nextjs.org/docs
- TailwindCSS Responsive Design: https://tailwindcss.com/docs/responsive-design
- Mobile Web Best Practices: https://web.dev/mobile-web-best-practices/

### Testing Guides
- [Mobile Accessibility Testing](https://www.w3.org/WAI/test-evaluate/mobile/)
- [Chrome DevTools Mobile Testing](https://developer.chrome.com/docs/devtools/device-mode/)
