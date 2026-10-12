# Mağaza ekran görüntüleri

Üretici: `node scripts/generate-store-screenshots.mjs` → `docs/native/store/screenshots/`
(kaynak: `docs/design/galeri/img/*-l.webp`, 390px mobil tam sayfa, koyu tema; üstten kırpılır).

| # | Dosya | Ekran | Galeri | Altyazı TR | Caption EN |
|---|---|---|---|---|---|
| 1 | `01-ana-sayfa-koyu.jpg` | `/customer` | 0654 | Bakiyen, hedeflerin, ödüllerin tek ekranda | Your points, goals and rewards at a glance |
| 2 | `02-qr-tara-koyu.jpg` | `/customer/scan` | 0658 | Masadaki QR'ı okut, deneyimini anlat | Scan the table QR, share your experience |
| 3 | `03-oduller-koyu.jpg` | Cüzdan › Ödüller | 0794 | Puanını ödüle çevir | Turn points into rewards |
| 4 | `04-kartim-koyu.jpg` | Cüzdan › Kartım | 0767 | Kasada kartını göster, ödül işlensin | Show your card at the counter |
| 5 | `05-firsatlar-koyu.jpg` | Keşfet › Fırsatlar | 0801 | Çift puan saatlerini kaçırma | Never miss double-point hours |
| 6 | `06-profil-koyu.jpg` | Ben | 0711 | Seviye, seri ve rozetlerin | Levels, streaks and badges |
| 7 | `07-mekanlar-koyu.jpg` | Keşfet › Yakınımda | 0819 | Yakındaki Qratex mekânları | Qratex venues near you |
| 8 | `08-bayi-islem-defteri-koyu.jpg` | `/dealer/consumptions` | 0540 | İşletmen için: işlem defteri ve ciro | For venues: transaction log and revenue |

Boyutlar:
- `ios-6.9/` 1290×2796 — App Store Connect "iPhone 6.9"/6.7"" kümesi (zorunlu; diğer iPhone boyutları buradan ölçeklenir).
- `play-phone/` 1080×1920 — Google Play telefon (en az 2, en çok 8).
- iPad: `ios/App` iPad'i destekliyor (`UISupportedInterfaceOrientations~ipad`). iPad görüntüsü (2064×2752) yoksa
  App Store Connect yüklemeyi kabul etmez → ya tablet görüntüleri ekleyin (galeride `vp=tablet` var) ya da
  Xcode'da *Targeted Device Families* = iPhone yapın.
- Play özellik grafiği: `assets/feature-graphic-1024x500.png`; Play ikonu: `assets/play-icon-512.png`.

Bilinen eksikler (yayından önce):
- Görüntüler tarayıcıdan alındı: üstte iOS/Android durum çubuğu yok, alt gezinme çubuğu sayfa içinde kırpılmış
  konumda. Simülatörde (`Cmd+S`) veya cihazda alınan görüntülerle değiştirmek önerilir; dosya adları aynı kalırsa
  tablo geçerli kalır.
- Demo veride bildirim sayısı (49) ve "Demo Customer" adı görünüyor; mağaza için temiz bir vitrin hesabı
  (gerçekçi ad, düşük bildirim sayısı) ile yeniden çekin.
- Altyazılar şimdilik metin; çerçeveli/başlıklı görsel istenirse Figma/fastlane frameit ile eklenir.
