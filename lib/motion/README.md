# QDL motion dili — kullanım kılavuzu

> **İlke:** hareket durum değişikliğini anlatır, dekor değildir.
> Kaynak: `docs/audit/2026-10-08/00-YOL-HARITASI.md` §4.2 · Canlı örnekler: `/admin/design-language`

## 1. Token'lar (`tokens.ts`)

| Token | Değer | Ne zaman |
|---|---|---|
| `DURATION.fast` | 120 ms | hover, press, toggle |
| `DURATION.base` | 200 ms | sheet, dialog, popover, sekme |
| `DURATION.slow` | 320 ms | sayfa içi geçiş, liste girişi |
| `DURATION.celebrate` | ≤ 1,2 sn, atlanabilir | puan kapsülü, küçük kutlama (yalnız play) |
| `DURATION.moment` | ≤ 4,5 sn, Esc/dokunuşla geçilir | An Motoru tam ekran sahneleri |
| `EASE.standard` | `[0.2, 0, 0, 1]` | genel |
| `EASE.emphasized` | `[0.22, 1, 0.36, 1]` | giriş |
| `EASE.exit` | `[0.4, 0, 1, 1]` | çıkış |
| `SPRING.snappy / gentle` | 400/30 · 200/24 | sürükle-bırak, sayaç, toggle |
| `SPRING.bouncy` | 320/18 | **yalnız play** (ödül, rozet) |

CSS eşlenikleri `app/globals.css`'te: `--motion-fast|base|slow|celebrate`, `--ease-standard|emphasized|exit`.
Tailwind: `duration-fast|base|slow`, `ease-standard|emphasized|exit` (tailwindcss-animate ile `animate-in` süresi de bunlardan).

Yeni kodda **ham süre/easing yazmayın** (`duration: 0.7`, `'easeInOut'`, `stiffness: 260` …).

## 2. Varyant ön ayarları (`variants.ts`)

```tsx
import { m as Motion, AnimatePresence } from 'framer-motion';
import { fadeUp, listContainer, listItem, scaleIn, overlay, sheetBottom } from '@/lib/motion';

<Motion.section variants={fadeUp} initial="hidden" animate="visible" exit="exit" />

<Motion.ul variants={listContainer} initial="hidden" animate="visible">
  {rows.slice(0, 50).map((r) => <Motion.li key={r.id} variants={listItem}>{r.name}</Motion.li>)}
</Motion.ul>

// Tek başına öğe: custom={index} → bütçeli gecikme (ilk 12 öğe, toplam ≤ 0,6 sn)
<Motion.div variants={listItem} custom={i} initial="hidden" animate="visible" />
```

| Ön ayar | Kullanım |
|---|---|
| `fadeUp` | kart, bölüm, satır girişi (y: 8px) |
| `fadeIn` | metin/durum değişimi |
| `scaleIn` | popover, kart açılışı (0.96 → 1) |
| `popIn` | play: ödül/rozet belirme (yaylı) |
| `overlay` | dialog/sheet örtüsü |
| `sheet(side)` / `sheetBottom` | kenardan kayan panel |
| `stagger(step)` / `listContainer` + `listItem` | liste (bütçeli) |
| `interactive` | `{...interactive}` → hover'da 2px kaldırma, basışta 0.98 (hover'da ölçek YOK) |
| `numberTicker` + `useNumberTicker(value)` | sayı değişimini say (ilk boyamada saymaz) |
| `staggerDelay(i)` | elle gecikme gerekiyorsa tek doğru formül |

Radix tabanlı primitifler (Dialog, Sheet, Dropdown, Select, Popover, Tooltip) animasyonu **CSS'te** taşır
(`tailwindcss-animate`: `data-[state=open]:animate-in …`). Onları framer ile sarmayın.

## 3. Politika: azaltılmış hareket (`policy.ts`, `use-reduced-motion-pref.ts`)

**Tek tercih kaynağı:** OS `prefers-reduced-motion` **VEYA** uygulama ayarı `html.reduce-animations`
(ayarlar → Erişilebilirlik). İkisi de canlı izlenir (medya sorgusu + `MutationObserver`).

| İhtiyaç | Kullan |
|---|---|
| React bileşeni | `useReducedMotionPref()` → `boolean` |
| Politika nesnesi | `useMotionPolicy()` → `{ reduce, allowAmbient, allowCelebrate, allowAutoplay, variants(v), transition(t) }` |
| React dışı (canvas, rAF, konfeti, ses, titreşim) | `isReducedMotion()` ve değişim için `subscribeReducedMotion(cb)` |
| framer genel | `components/providers.tsx` → `<MotionPolicyConfig>` (azaltılmışta `reducedMotion="always"`) |

framer'ın kendi `useReducedMotion()`'ı **yalnız OS** tercihini okur — yeni kodda kullanmayın.
An Motoru'nun `prefersReducedMotion()` fonksiyonu `isReducedMotion()`'ı çağırmalıdır (iki ayrı uygulama olmaz).

Azaltılmış harekette:
- transform/ölçek/konum animasyonları kapanır, opaklık kısa kalır;
- konfeti, ekran sarsıntısı, titreşim ve otomatik video **çalmaz** (statik özet gösterilir);
- `<Ambient>` çocuklarını hiç render etmez (`fallback` statik kare);
- canvas/three.js arka planları tek statik kare çizer.

## 4. Kayıtlar: nerede sade, nerede ifadeli

| | **ops** (admin, bayi, personel, müşteri cüzdan/ayar/geçmiş/yasal/auth) | **play** (müşteri ana sayfa vurguları, oyunlar, rozet, kutu, seviye/lig anları) |
|---|---|---|
| Süre | `fast` / `base` | + `celebrate`, spring |
| Döngü | **yok** (marquee, nabız, shimmer yok; iskelet statik) | yalnız `<Ambient>` içinde, görünürken |
| Hover | renk/gölge; en fazla 2px kaldırma | serbest (yine ölçek ≤ 1.02) |
| Stagger | ilk 12 öğe, ≤ 0,6 sn; yoğun tabloda yok | aynı bütçe |

## 5. 3D / canvas politikası

| Yüzey | Teknik |
|---|---|
| Sürpriz kutu açılışı, imza ödül kutusu, karakter rozeti reveal | three.js (mevcut altyapı), `next/dynamic`, statik PNG yedeği |
| An Motoru seviye/lig/rozet sahneleri | tek lazy `moment-stage-3d` chunk'ı |
| Kartım kart yüzü | CSS 3D tilt (`useMotionValue`) — three.js gereksiz |
| Mini oyunlar | 2D canvas, ortak sabit adımlı döngü (`lib/games/engine`) |
| Mağaza ekranı `/wall/[token]` | düşük GPU profilli ortam katmanı |
| Admin | 3D yalnız müşteri içeriğinin önizlemesinde; operasyon yüzeyleri sade |
| Yasal, ayarlar, hareketler, auth, bayi operasyonu | animasyonsuz ya da tek giriş (`fadeUp`) |

Her 3D/canvas bileşeni: `isReducedMotion()` → tek statik kare; `document.hidden` / görünmezken rAF durur;
`next/dynamic` ile yüklenir; WebGL yoksa statik görsel.

## 6. Kurallar (lint'e dönüşecek)

1. **Konum CSS'te, animasyon framer'da:** konumlandırma framer kullanmayan sarmalayıcıda; aynı elemanda
   `style.transform` + `animate` yasak (framer inline transform'u Tailwind `translate-*`/`-translate-x-1/2`'yi ezer).
2. `motion.*` değil `m.*` (`import { m as Motion } from 'framer-motion'`) — global `LazyMotion`.
3. `repeat: Infinity` yalnız `<Ambient>` içinde.
4. Projeye özel CSS animasyon sınıfları `qx-` önekli (ör. `qx-enter`); Tailwind/eklenti adlarıyla
   (`animate-in`, `fade-in`, `delay-*` …) asla çakışmaz.
5. Kutlamalar An Motoru üzerinden, sunucu "görüldü" bayrağıyla — "her ziyarette konfeti" olmaz.
