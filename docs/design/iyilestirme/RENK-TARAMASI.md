# Sabit renk taraması (2026-10-12)

## Sayım
| Tür | Önce | Sonra |
|---|---|---|
| Tailwind ham palet sınıfı (app/components/lib, ts/tsx) | 295 (31 dosya) | 268 |
| `#rrggbb` içeren tsx dosyası (app/components) | 94 | 92 |

## Dönüştürülenler
- `lib/tw-brand-classes.ts`: marka gradyanının `violet-500/600/700` ucu → `brand-text` (tema presetiyle birlikte döner); bozuk `via-primary/80/20` → `via-primary/20`.
- `components/chat/chatbot.tsx`: `zinc-*` koyu cam zeminler → `background`/`card`/`muted`, `text-zinc-100`/`text-white` → `foreground`, mor ışıma → `primary`, silme hover `red-*` → `danger`.
- `components/pwa/install-banner.tsx`: adım daireleri `bg-blue-500/10` → `bg-primary/10`.
- `components/customer/customer-birthday-bonus-host.tsx`: `text-amber-500` → `text-warning`.
- `components/team/shared.tsx`, `team/departments/members-panel.tsx`: departman rengi fallback `#6b7280` → `hsl(var(--muted-foreground))`.

## Bilerek bırakılanlar
- Oyun/çark/kutu sanatı: `components/customer/games/**`, `lib/league-egg-themes.ts`, `lib/league-rules-core.ts` (lig kimlik gradyanları), turnuva/lider tablosu altın-gümüş-bronz madalya renkleri.
- Karakter rozeti / gizemli bar kimlik renkleri (`mystery-bar.tsx`), `components/ui/avatar-frame.tsx` (çerçeve sanatı; ayrıca ui başka ajanda).
- `lib/team-task-presets.ts`: şablon kategori kimlik renkleri (kategorik ayrım).
- Kendi sabit zeminli yüzeyler: `wall-display.tsx` (TV duvarı, hep koyu), cüzdan kart yüzü/sunum sayfası (kart sanatı + beyaz QR zemini), karşılama videosu siyah çerçevesi, admin-gate + `gate-settings` kapı önizlemesi (uzay ekranı), offline belge.
- QR kodlar (`#000/#fff` tarama kontrastı), Leaflet harita path renkleri (SVG attribute `var()` çözmez), OAuth marka logoları, `global-error.tsx` (CSS yüklenmeden çalışır), mail şablon önizlemeleri, OG görselleri, confetti.
- `app/lab/zoom/**` (atılabilir deneme), `lib/design-system/drift-scan.ts` + tasarım sistemi kopya metinleri (örnek metin, renk değil).
- Başka ajan alanı: `lib/utils.ts` durum/rarity chip haritaları, `components/charts/**`, `components/ui|ds`, theme-studio.
