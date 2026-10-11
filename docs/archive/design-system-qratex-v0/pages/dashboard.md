# Dashboard Page Overrides

> **PROJECT:** Qratex
> **Generated:** 2026-05-01 05:36:58
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/qratex/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- No overrides — use Master colors

### Component Overrides

- Avoid: Static output only
- Avoid: Overuse vibration feedback
- Avoid: Silent success

---

## Page-Specific Components

- No unique components for this page

---

## Stack notes (Next.js + shadcn)

- Use route-level **`loading.tsx`** next to **`page.tsx`** for dashboard-style flows instead of ad-hoc `useState` spinners where it fits.
- Keep fonts on the **root layout** (`body` / CSS variables); avoid per-page font imports.
- Modals: **`<Dialog>`** with **`DialogHeader` / `DialogTitle` / `DialogDescription`**; avoid alert-styled overlays for modal content.
- Theme: **`bg-primary`** / **`text-primary-foreground`** (tokens), not raw `bg-blue-500`-style literals in components.

---

## Recommendations

- Effects: Testimonial carousel animations, logo grid fade-in, stat counter animations (number count-up), review star ratings
- AI Interaction: Thumps up/down or 'Regenerate'
- Touch: Use for confirmations and important actions
- Feedback: Brief success message
