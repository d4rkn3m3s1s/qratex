# Müşteri A — olay animasyonu + ses haritası

Not: /customer/shop, /rewards, /favorites, /nearby, /campaigns, /trends, /spending-overview, /experiences, /consumptions yalnız yönlendirme; asıl yüzeyler cüzdan + Keşfet (places) + scan.

| Sayfa / bileşen | Eklenen |
|---|---|
| places/[dealerId] — `m-mekan-detay/favorite-button` | Kaydetmede kalp `Burst` (8 parçacık) + `playSound('success')`; çıkarma sessiz |
| Keşfet kartları — `m-kesfet/venue-parts` SaveButton | mevcut ölçek darbesine kalp `Burst` + `success` sesi (yalnız kaydetme) |
| wallet/donate — `donate-sheet` başarı | çizilen tik (`DrawCheck`) + kalp patlaması + `playSound('thanks')` |
| scan — `m-tara/result-sheet` | işletme bulundu: logo çevresinde çift `qx-fx-wave` + `success`; kart bağlandı: dalga + `DrawCheck` + `success`; uyarı/hata: `error` |
| wallet/card — `card-face` | kartı kasada göster dokunuşu: `playSound('flip')` |
| wallet/rewards kozmetik — `cosmetic-sheet` | satın alma: `coin` sesi + satır içi `DrawCheck` |
| hediye — `gift-dialog` | gönderildi: `reward` sesi (toast ikonu zaten pop/çizim) |
| Listeler (yeni `qx-fx-stagger`, app/event-fx.css'e EKLENDİ) | hareketler puan/geçmiş/ziyaret, bağış projeleri, ödül+kozmetik katalog, kutular, pass'ler, fırsatlar, top liste — ilk 8 öğe 40 ms arayla 320 ms fade+6px; azaltılmış harekette kapalı |

Zaten vardı (dokunulmadı): balance-hero `PointsGain`+AnimatedNumber, reward-sheet ödül anı+`reward` sesi, box-reveal, ana sayfa status-hero/spin, venue-card stagger, history-list, sonner toast efektleri, boş durum nefesi.
