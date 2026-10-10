# `components/ds/a11y` — QDL erişilebilirlik bileşenleri

Yol haritası §4.1 "Erişilebilirlik" grubu. WCAG 2.2 AA hedefi: rol/aria, klavye, görünür odak halkası (`ring-focus`),
≥ 44px dokunma hedefi, yalnız renge dayanmayan durum, azaltılmış harekete saygı (`useMotionPolicy`), açık/koyu tema rol token'ları.

```ts
import {
  IconButton, RatingInput, ChoiceChips, PhotoPicker, FullscreenModal,
  VisuallyHidden, SkipLink, LiveRegion, useAnnouncer, announce,
} from '@/components/ds/a11y';
```

## IconButton — `aria-label` tipte zorunlu

```tsx
<IconButton aria-label="Kaydı sil" icon={<Trash2 />} variant="danger" tooltip />
<IconButton aria-label="Favorilere ekle" icon={<Star />} pressed={fav} onClick={toggle} />
<IconButton aria-label="Filtreler" icon={<SlidersHorizontal />} size="sm" />   {/* görsel 36, dokunma 44 */}
<IconButton aria-label="Profile git" icon={<User />} asChild><Link href="/profil" /></IconButton>
// <IconButton icon={<X />} />  → derlenmez
```

Varyantlar: `ghost` (varsayılan) · `outline` · `subtle` · `solid` · `danger`. Boyut: `sm` 36 / `md` 44 / `lg` 56. `loading`, `pressed`, `shape="circle"`.

## RatingInput — radiogroup

```tsx
<RatingInput aria-label="Hizmeti puanlayın" value={v} onChange={setV} />                      {/* 1–5 yıldız */}
<RatingInput aria-label="Ruh hâli" appearance="emoji" value={m} onChange={setM} register="play" size="lg" />
<RatingInput aria-labelledby="nps-q" scale="nps" value={nps} onChange={setNps} size="lg" />  {/* 0–10 */}
```

Klavye: ←/→/↑/↓ (uçlarda durur), Home/End, rakam tuşları, Boşluk/Enter. Tek sekme durağı. NPS'te seçili renk kova
anlamı taşır (0–6 / 7–8 / 9–10) ama uç etiketleri ("Hiç olası değil" / "Kesinlikle") uç seçeneklerin adına da eklenir.
Mobilde NPS 6+5 ızgara (her hücre ≥ 44px), ≥ sm tek satır. `name` → yerel form için gizli input.

## ChoiceChips — tekli / çoklu

```tsx
<ChoiceChips aria-label="Dönem" options={[{ value: '7d', label: '7 gün' }, { value: '30d', label: '30 gün' }]}
  value={period} onChange={setPeriod} />
<ChoiceChips aria-labelledby="tags-label" mode="multiple" max={3}
  options={tags} value={selected} onChange={setSelected} size="sm" scroll />
```

Tekli: `radiogroup` (oklar dairesel gezer ve seçer). Çoklu: `group` + `aria-pressed`. Seçili çipte onay ikonu.
`max` dolunca kalan çipler `aria-disabled` ve sınır duyurulur.

## PhotoPicker — kamera/galeri, önizleme, küçültme

```tsx
const [photos, setPhotos] = useState<PickedPhoto[]>([]);
<PhotoPicker aria-label="Fiş fotoğrafı" value={photos} onChange={setPhotos}
  maxFiles={3} maxOutputBytes={1.5 * 1024 * 1024} resize={{ maxDimension: 1600, quality: 0.8 }} />
// gönderim: photos.forEach((p) => fd.append('photos', p.file));
```

- Dokunmatik cihazda **Kamera + Galeri**, masaüstünde yalnız Galeri (+ sürükle-bırak). `sources` ile zorlanabilir.
- Canvas ile istemci tarafı küçültme (uzun kenar 1600px, JPEG 0.82; sığmazsa kalite → boyut kademeli düşer).
- Yeniden kodlama **EXIF'i (GPS konumu dahil) siler**; `createImageBitmap({ imageOrientation: 'from-image' })` yönü düzeltir.
- Boyut/biçim hataları satır içinde (`InlineError`) + ekran okuyucu duyurusu; ekleme/kaldırma da duyurulur.
- Önizleme object URL'leri kaldırınca ve bileşen kalkınca serbest bırakılır (`revokeOnUnmount`).
- Tek başına küçültme: `await resizeImage(file, { maxDimension: 1200, maxBytes: 500_000 })`.

## FullscreenModal — odak tuzağı, Esc, güvenli alan

```tsx
<FullscreenModal open={open} onOpenChange={setOpen} title="Deneyimini puanla"
  footer={<Button className="w-full sm:w-auto" onClick={submit}>Gönder</Button>}>
  …
</FullscreenModal>

<FullscreenModal title="Kamera" hideTitle bleed dismissible={!uploading} register="play" desktop="fullscreen">…</FullscreenModal>
```

Radix Dialog: odak tuzağı, Esc, açana geri odak, `aria-modal`. Çentik/ev çubuğu için `env(safe-area-inset-*)` payları.
`dismissible={false}` → Esc/dış tıklama/✕ kapatmaz (yükleme sürerken). Masaüstünde varsayılan ortalanmış büyük panel.

## VisuallyHidden · SkipLink · LiveRegion

```tsx
<button><Trash2 aria-hidden /><VisuallyHidden>Sil</VisuallyHidden></button>

// Kabuğun en üstü + <main id="main-content">
<SkipLink />

// Bildirimsel: kalıcı render edin, içeriği değiştirin
<LiveRegion visible className="qx-small text-fg-muted">{count} sonuç bulundu</LiveRegion>

// Emredici
const announce = useAnnouncer();
announce('3 kayıt silindi');
announce('Kaydedilemedi', { politeness: 'assertive' });
useAnnounceOnChange(saving ? 'Kaydediliyor' : undefined);
```

`announce()` React dışından da çağrılabilir; body sonunda iki kalıcı canlı bölge kullanır (aynı mesaj tekrar okunur).

## Kayıtlar

- **ops** (varsayılan): sakin; seçili durum açık marka zemini, hareket yok/kısa.
- **play**: `register="play"` → dolu marka, gölge, seçimde küçük yaylı vurgu (azaltılmış harekette kapalı), büyük hedefler (`size="lg"`).
