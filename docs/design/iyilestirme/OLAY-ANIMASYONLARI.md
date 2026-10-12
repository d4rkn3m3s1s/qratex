# Olay animasyonları — araştırma notları + uygulama

## Kısa araştırma notları
- **Emil Kowalski (Sonner, Vaul, animations.dev):** kısa süre (150–400 ms), `ease-out`/özel bezier, sık tekrarlanan etkileşimde animasyonu kıs ya da kaldır; yalnız `transform`/`opacity`. Kaynak: <https://animations.dev>, <https://emilkowal.ski>
- **Jhey Tompkins:** CSS değişkenleriyle (`--x/--y/--r`) parçacık başına rastgelelik; tek keyframe, çok öğe. Kaynak: <https://codepen.io/jh3y>
- **Duolingo / Headspace / Apple Fitness ödül anları:** önce net "tamamlandı" sinyali (tik/halka kapanışı), sonra kısa kutlama; tekrar eden olayda kutlama küçülür, büyük an nadir (seviye/rozet). Projede büyük anlar zaten An Motoru'nda (components/moments).
- **canvas-confetti:** canvas tabanlı, ~10 KB; bizde ihtiyaç küçük patlamalar olduğundan CSS parçacık yeterli, kütüphane eklenmedi. <https://github.com/catdad/canvas-confetti>
- **CSS confetti:** saf CSS keyframe ile şekil + düşüş. <https://dev.to/logrocket/how-to-create-a-confetti-effect-in-css-4d7c>
- **Lottie/dotLottie:** LottieFiles ücretsiz animasyonlar "Lottie Simple License" (ticari kullanım serbest, atıf gerekmez, dosyayı tek başına yeniden dağıtma/satma yok) — ancak AE eklenti dokümanı lisansın üreticiye göre değişebildiğini söylüyor; **her animasyonun sayfasındaki lisans esastır**. Oynatıcı (~60 KB+) gerekirse tembel yüklenmeli. Şimdilik kullanılmadı.
  - <https://help.lottiefiles.com/hc/en-us/articles/900002438343-Can-I-use-a-free-animation-on-Lottiefiles-for-commercial-business-use>
  - <https://docs.lottiefiles.com/en/integrations/after-effects/02_explore/premium-animations>

## İlkeler
transform/opacity/stroke-dashoffset · <900 ms · yerleşim değişmez (absolute katman, CLS yok) · `prefers-reduced-motion` → anında son durum · ses yeri `// SES:` yorumu.

## Uygulama (app/event-fx.css + components/fx/event-fx.tsx)
| Olay | Yer | Efekt |
|---|---|---|
| Puan kazanımı | m-cuzdan-oduller/balance-hero | AnimatedNumber + `PointsGain` (+N yüzen + parıltı) |
| Görev tamamlandı | m-gorevler/quest-row | `DrawCheck` + `qx-fx-bump` (yalnız durum geçişinde) |
| Ödül alındı | m-cuzdan-oduller/reward-sheet | ışık patlaması + dönerek gelen tik + parçacık |
| Kutu açılışı / seviye / rozet anı | mevcut özel anlar (box-reveal 3B, An Motoru) | dokunulmadı |
| Yeni rozet | m-rozetler/badge-grid | madalyonda parlama süpürmesi (`isNew`) |
| Geri bildirim teşekkürü | p-qr-geri-bildirim/success-panel | çizilen tik + kalp/yıldız parçacıkları |
| Toast | sonner `[data-sonner-toast]` (CSS) | başarı: pop; hata: hafif sarsıntı |
| Boş durum | components/states/empty-state | ikon 4.8 sn sakin nefes |
| Bayi kasa kart okundu | b-kasa-tuketim/scanner-panel | yeşil çift dalga + çizilen tik |
| Tüketim kaydı | b-kasa-tuketim/today-feed | yeni satır kayarak + yeşil vurgu (`useNewIds`) |
| Gelen kutusu yanıt | b-gelen-kutusu/inbox-list | mevcut CollapseList satırı kapatıyor |
| Admin onay | a-segmentler proposals-tab | durum rozetinde renk geçişi (`qx-fx-status`) |
