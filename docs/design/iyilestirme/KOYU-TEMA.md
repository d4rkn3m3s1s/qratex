# Koyu tema profesyonel cila (2026-10-12)

Kapsam: `app/globals.css` `.dark:not(body)` nötr/durum token'ları. Marka tonları (primary, ring, brand-*, accent, secondary) canlıda çalışma zamanı teması (`:root.dark`, theme-runtime) tarafından ezildiği için buradaki değerler yalnız yedek. Grafik `--category-*` renklerine dokunulmadı (ayrı ajan).

## Önce / sonra token'ları

| Token | Önce | Sonra | Not |
|---|---|---|---|
| background | 222 47% 5% (rgb 7,10,19 — neredeyse siyah, çok doygun lacivert) | 228 18% 7% (rgb 15,16,21) | Saf siyah yerine hafif tonlu zemin |
| card | 222 38% 9% | 228 15% 10.5% | kart/zemin 1.08:1 |
| surface-2 | 222 32% 12.5% | 228 13% 13.5% | yüzey-2/kart 1.08:1 |
| popover | 222 32% 12.5% (**surface-2 ile aynı, 1.00:1**) | 228 13% 16% | popover/yüzey-2 1.08:1 — merdivenin son basamağı artık ayrışıyor |
| muted | 217 22% 15% | 228 11% 16% | iskelet/dolgu sakin nötr |
| border | 217 19% 20% | 228 11% 22% | ince ama görünür |
| input | 217 17% 24% | 228 11% 27% | input/kart 1.72:1 (önce 1.63) |
| border-strong | 217 13% 44% | 225 9% 42% | kart üzerinde 3.10:1 (≥3, bileşen sınırı) |
| foreground | 210 40% 98% | 220 20% 96% | göz yormayan kırık beyaz |
| muted-fg | 215 16% 68% | 222 12% 70% | |
| text-3 | 215 12% 57% | 222 9% 58% | |
| durum metin/subtle | doygunluk 90%+ | 50–80% | ör. success-text 146 52% 60%, danger-subtle 0 35% 15% |
| elevation inset highlight | 0.03 / 0.04 / 0.05 | 0.05 / 0.06 / 0.07 | gölge yerine ışık kenarı |
| primary (yedek) | 262 83% 58% | 262 68% 60% | beyaz metin 4.5+:1 |

## Ölçülen kontrast (WCAG)

| Metin | zemin | kart | yüzey-2 | popover | muted |
|---|---|---|---|---|---|
| foreground | 17.30 | 16.06 | 14.83 | 13.79 | ~13.5 |
| muted-foreground | 8.64 | 8.02 | 7.40 | 6.88 | ~6.8 |
| text-3 | 5.95 | 5.52 | 5.10 | 4.74 | 4.71 |
| canlı brand-text (257 72% 70%) / muted | — | — | — | — | 4.61 (17% denemesinde 4.47 → 16%e çekildi) |

Durum metni kendi subtle zemininde: success 7.68, warning 8.51, danger 6.45, info 7.82, brand 7.12. Üç kademe metin her yükseltide AA geçer.

Piksel örnekleri (/admin/users 1440): zemin 7,10,19 → 15,16,21; kart 14,19,32 → 23,24,31; sınır 41,49,61 → 50,52,62.

## Zaten iyi olan (değiştirilmedi)
- Input/Select koyu modda `bg-white/[0.07]` + inset highlight ile zeminden ayrışıyor; odak halkası `ring-2 ring-ring ring-offset-2`.
- Skeleton statik `bg-muted` (sakin).
- Sidebar `app-sidebar-surface` kart tonlu gradyan + `border-r` → içerikten ayrışıyor; aktif menü dolu marka rengi (belirgin).

## Görüntüler
`.wf-tmp/shots/koyu/once-*.png` ve `sonra-*.png` (public /, /login; müşteri /customer, ayarlar; bayi /dealer; admin /admin, /admin/users — 390 ve 1440).

## Açık iş
`__tests__/design/theme-derive.test.ts` "BASE_THEME_VARS globals.css ile birebir aynı" testi `lib/design/theme-derive.ts` içindeki `BASE_THEME_VARS.dark`'ın yukarıdaki yeni değerlere güncellenmesini bekliyor (dosya preset ajanının; dokunulmadı).
