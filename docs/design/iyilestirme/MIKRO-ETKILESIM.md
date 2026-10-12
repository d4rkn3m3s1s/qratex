# Mikro-etkileşim ilkeleri (2026-10)

Kısa, uygulanmış ilkeler. Kaynaklar sonda.

| İlke | Kaynak | Qratex'te |
|---|---|---|
| Basınca ölçek **0.97**, hızlı dönüş | Emil Kowalski — 7 practical animation tips | `Button` `active:scale-[0.97]` + `active:duration-fast` |
| Asla `scale(0)`'dan başlama; 0.85–0.95'ten | Emil | Popover/Dropdown/Select/Dialog `zoom-in-95`, buton üst katmanı 0.85→1 |
| Köken farkındalığı (transform-origin = tetikleyici) | Emil; Radix `--radix-*-content-transform-origin` | Popover, Dropdown(+Sub), Select, Tooltip |
| Giriş `ease-out` (emphasized), çıkış daha kısa ve hızlanan | Emil; Vercel/Linear menüleri | açılış `duration-base ease-emphasized`, kapanış `duration-fast ease-exit` |
| UI animasyonu < 300 ms; sık kullanılan eylemlerde hareketi azalt | Emil; Rauno — Interaction design | token'lar 120/200/320 ms; tooltip yalnız `fast` |
| Çapraz geçişte ~2px blur örtüşmeyi gizler | Emil | `.qx-content-in` (iskelet→içerik) |
| Kesintiye uğratılabilir, fiziksel hareket | Rauno | CSS transition (animasyon değil) → yarıda tersine döner: switch, sekme göstergesi, kart |
| Uzamsal süreklilik: seçim kayarak taşınır | Linear/Vercel sekmeleri, framer `layoutId` | `useSlidingIndicator` (SectionTabs, ui/Tabs) |
| Genişlik kaymadan durum değişimi | Vercel/Raycast butonları | loading spinner ve `success` tiki etiketin ÜSTÜNE biner |
| Hata: tek seferlik titreşim, döngü yok | macOS parola alanı deseni | `.qx-field[aria-invalid=true]` 360 ms |
| Çizgi çizimi ile onay | Jhey Tompkins (SVG stroke demoları) | Checkbox ve Button `success` → `.qx-draw` |
| Dokunmatikte hover yok | Rauno; Tailwind `hoverOnlyWhenSupported` | `@media (hover:hover)` (config zaten açık) |
| Yalnız transform/opacity; reduced-motion'da sadeleş | web.dev, Emil | global politika + `.qx-*` için ayrıca `none` |

## Kaynaklar
- https://emilkowal.ski/ui/7-practical-animation-tips
- https://animations.dev (Emil Kowalski — "Animations on the Web")
- https://emilkowal.ski/ui/building-a-toast-component (Sonner) · https://vaul.emilkowal.ski
- https://rauno.me/craft/interaction-design
- https://jhey.dev · https://css-tricks.com/author/jheytompkins/
- https://www.radix-ui.com/primitives/docs/components/popover (transform-origin değişkenleri)
- https://linear.app/now/how-we-redesigned-the-linear-ui

## Kapsam dışı / not
- Accordion/Collapsible bileşeni `components/ui`'da yok; liste aç-kapa için `lib/motion` `CollapseList` (yay) kullanılır.
- `AnimatedNumber` sayı değişimleri için mevcut; bu turda değiştirilmedi.
- Global LazyMotion `domAnimation` → `layoutId` yok; sekme göstergesi bu yüzden CSS ölçümüyle (ek paket yok).
