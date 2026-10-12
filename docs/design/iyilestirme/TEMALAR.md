# Tema presetleri — profesyonelleştirme (2026-10-12)

Kapsam: `lib/design/theme-derive.ts` (türetme), `lib/theme-presets.ts` (+3 aile), `lib/design-system/theme-model.ts` (grup "Sade ve kurumsal"), `components/admin/a-tasarim-sistemi/theme/family-picker.tsx`.

## Envanter
- Hazır aileler (iki varyantlı, seçilebilir): purple, blue, arctic, obsidian, aurora, green, forestNight, orange, lava, royalGold, pink, cyberpunk, amethyst + **yeni**: navy (Derin Lacivert), charcoal (Sıcak Kömür), pine (Çam). Tek varyantlı `light` (Aydınlık) seçici dışı, silinmedi.
- DB (canlı, `/api/settings/theme`): `activeTheme = custom` (#8B5CF6 / #A855F7 / #F472B6), `defaultMode = dark`. DB'ye dokunulmadı; özel tema da aynı türetmeden geçtiği için iyileştirmeler ona da uygulanır.
- Kullanıcı tarafı yalnız açık/koyu/sistem seçer (`/customer/settings` → Görünüm, next-themes `qratex-theme`); preset seçimi admin'de (`/admin/design-system?tab=temalar`, önizleme tuvali + kontrast raporu zaten var; yeni grup eklendi).

## Algoritma değişiklikleri
1. **OKLCH evcilleştirme**: dolgular (birincil/ikincil/vurgu) koyu modda kroma ≤ 0.20, açıkta ≤ 0.26 (yalnız aşırı neon özel renkler). Ton ve açıklık korunur, gamut dışı kroma düşürülerek eşlenir.
2. **Dolgu üstü metin**: önce beyaz; yetmezse dolgu OKLCH'de ≤ 0.10 L koyulaşıp beyaz alır; yalnız gerçekten açık dolgular (altın, açık yeşil, buz mavisi) koyu mürekkep alır. Eski: Okyanus/Çiçek/Lav/Neon koyu ve Gün Batımı/Orman açık düğmelerinde siyah yazı.
3. **Seçili/hover yüzeyi** (`brand-subtle`) kartta ≥ 1,2:1 koyu / 1,1:1 açık (eski Çiçek koyu 1,03 — seçim görünmüyordu); `brand-border` ≥ 1,8:1.
4. **Odak halkası** zemin + kart + yüzey-2'nin hepsinde ≥ 3:1 (eskiden yalnız zemin+kart; Aurora koyu 3,12 sınırdaydı).
5. **Açık yüzey merdiveni**: kart/zemin ≥ 1,06:1 (Kraliyet Altını / Aurora / Gece Ormanı 1,04'tü), gerekirse zemin hafif koyulaşır.

## Önce → sonra kontrast (yalnız değişen hücreler kalın)
W = beyaz yazı, ink = koyu mürekkep. Hepsi AA: gövde ≥ 4.5, halka ≥ 3.

| Preset / mod | Metin/zemin | İkincil metin (min) | Marka metni/kart | Düğme yazısı | Odak halkası (min) | Kart/zemin | Seçili/kart | Birincil C (OKLCH) |
|---|---|---|---|---|---|---|---|---|
| purple / light | 14.77 | 7.99 | 5.67 | 5.67 W | 5.24 | 1.08 | 1.15 | 0.25 |
| purple / dark | 18.98 | 8.27 | 5.51 → **5.75** | 5.50 W | 3.26 → **5.75** | 1.07 | 1.15 → **1.20** | 0.25 → **0.20** |
| blue / light | 8.69 | 6.58 | 5.39 | 5.20 W | 4.79 | 1.08 | 1.13 | 0.22 |
| blue / dark | 17.09 | 7.11 | 5.69 → **5.85** | 4.92 ink → **4.71 W** | 4.46 → **5.85** | 1.11 | 1.11 → **1.22** | 0.19 |
| green / light | 8.77 → **8.66** | 6.13 → **6.06** | 5.60 → **5.26** | 4.65 ink → **4.66 W** | 3.65 → **4.37** | 1.05 → **1.06** | 1.05 → **1.11** | 0.13 → **0.12** |
| green / dark | 18.18 | 8.37 | 7.55 | 7.78 ink | 7.55 | 1.09 | 1.54 | 0.19 |
| orange / light | 8.72 | 7.04 | 5.33 → **5.49** | 5.02 ink → **4.64 W** | 3.33 → **4.33** | 1.07 | 1.10 → **1.12** | 0.19 → **0.17** |
| orange / dark | 15.72 | 7.59 | 5.71 | 6.42 ink | 5.60 | 1.12 | 1.18 → **1.22** | 0.19 |
| pink / light | 8.95 | 7.32 | 5.55 | 4.82 W | 4.26 → **4.41** | 1.09 | 1.13 | 0.22 |
| pink / dark | 15.65 | 6.40 | 5.41 → **5.75** | 5.02 ink → **4.69 W** | 4.31 → **5.75** | 1.12 | 1.03 → **1.21** | 0.21 → **0.20** |
| aurora / light | 15.36 → **14.96** | 8.30 → **8.09** | 7.24 | 7.24 W | 6.96 → **6.78** | 1.04 → **1.07** | 1.14 | 0.24 |
| aurora / dark | 15.35 | 7.65 | 5.77 → **5.75** | 5.50 W | 3.12 → **5.75** | 1.08 | 1.11 → **1.21** | 0.25 → **0.20** |
| cyberpunk / light | 13.88 | 7.37 | 5.35 | 4.82 W | 4.36 → **4.51** | 1.07 | 1.13 | 0.22 |
| cyberpunk / dark | 17.86 | 8.07 | 5.75 → **5.83** | 5.02 ink → **4.69 W** | 5.16 → **3.92** | 1.07 | 1.24 | 0.21 → **0.20** |
| royalGold / light | 8.89 → **8.64** | 7.02 → **6.83** | 5.51 | 6.03 ink | 5.31 → **5.17** | 1.04 → **1.07** | 1.06 → **1.11** | 0.14 |
| royalGold / dark | 16.94 | 8.45 | 8.16 | 8.50 ink | 8.16 | 1.09 | 1.50 | 0.14 |
| obsidian / light | 17.09 → **16.70** | 7.57 → **7.39** | 5.20 | 5.20 W | 4.96 → **4.85** | 1.05 → **1.07** | 1.13 | 0.22 |
| obsidian / dark | 15.42 | 7.51 | 6.96 | 7.08 ink | 6.96 | 1.09 | 1.24 | 0.14 |
| lava / light | 8.78 | 7.24 | 5.57 | 4.67 W | 4.21 | 1.11 | 1.13 | 0.22 |
| lava / dark | 16.47 | 7.07 | 5.43 → **5.75** | 4.84 ink → **4.71 W** | 4.64 → **3.64** | 1.09 | 1.14 → **1.21** | 0.22 → **0.20** |
| arctic / light | 8.83 | 6.68 | 5.44 → **5.37** | 4.69 W | 4.42 → **4.39** | 1.07 | 1.08 → **1.11** | 0.13 |
| arctic / dark | 16.49 | 7.49 | 6.21 | 6.27 ink | 5.96 | 1.10 | 1.33 | 0.15 |
| forestNight / light | 8.85 → **8.61** | 6.19 → **6.02** | 5.24 → **5.26** | 4.65 ink → **4.66 W** | 3.69 → **4.35** | 1.04 → **1.07** | 1.05 → **1.11** | 0.13 → **0.12** |
| forestNight / dark | 17.00 | 8.17 | 7.19 | 6.89 ink | 6.51 | 1.11 | 1.52 | 0.15 |
| amethyst / light | 10.08 | 7.65 | 5.39 | 5.39 W | 5.02 | 1.07 | 1.14 | 0.25 |
| amethyst / dark | 17.00 | 7.11 | 5.42 → **5.75** | 4.60 W | 3.80 | 1.08 | 1.12 → **1.20** | 0.25 → **0.20** |
| navy / light (yeni) | 15.81 | 7.24 | 10.25 | 10.25 W | 9.46 | 1.08 | 1.12 | 0.14 |
| navy / dark (yeni) | 16.04 | 7.35 | 5.73 | 4.64 W | 3.73 | 1.09 | 1.22 | 0.14 |
| charcoal / light (yeni) | 15.58 | 6.47 | 5.51 | 5.51 W | 5.07 | 1.09 | 1.10 | 0.13 |
| charcoal / dark (yeni) | 16.21 | 7.93 | 5.99 | 6.31 ink | 5.99 | 1.10 | 1.27 | 0.11 |
| pine / light (yeni) | 14.77 | 5.94 | 6.44 | 6.44 W | 5.94 | 1.08 | 1.12 | 0.09 |
| pine / dark (yeni) | 15.97 | 8.10 | 6.78 | 6.53 ink | 6.13 | 1.12 | 1.45 | 0.11 |

## Görüntüler
`.wf-tmp/shots/tema/` (git dışı):
- `after-<aile>-<light|dark>-<landing|customer|dealer|admin>-390.png` — 16 aile × 2 mod × 4 sayfa
- `before-<aile>-<mod>-customer-390.png` — eski türetme, karşılaştırma
- `after-{purple,navy,charcoal,pine}-<mod>-admin-1440.png`
Yöntem: sayfa yüklenince `deriveThemeVars` çıktısı `<style>` olarak enjekte edildi (DB'ye yazılmadı).

## Açık noktalar
- Koyu tema ajanı `globals.css` `.dark` değerlerini değiştiriyor; `BASE_THEME_VARS.dark` henüz eşitlenmediği için `theme-derive.test.ts` "globals ile birebir" testi geçici kırık (HEAD globals ile tüm 51 test geçiyor). Eşitleme o işe ait.
- Açık modda yüzey-2 = kart (tasarım dili: ayrışma gölgeyle); dokunulmadı.
