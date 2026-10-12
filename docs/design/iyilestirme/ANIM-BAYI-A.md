# Bayi A (operasyon) — olay animasyonları ve sesler

İlke: hızlı, sakin, verimli. Yalnız transform/opacity (+ QR'de clip-path), <520 ms, CLS yok, reduced-motion'da animasyon yok. Ses yalnız anlamlı anda; bayi tarafında tercih varsayılan KAPALI.

## Eklenenler
| Olay | Yer | Efekt / ses |
|---|---|---|
| Yeni mesaj geldi | b-gelen-kutusu/inbox-list (`useFreshInbox`) | Satır yükseklikten açılır (CollapseItem) + `qx-fx-row-in` vurgusu + `notify` sesi. Tabandaki en yeni `createdAt`'ten DAHA YENİ kayıtlar sayılır; filtre/sekme/sayfa değişimi yanlış alarm vermez |
| Yanıt gönderildi | b-gelen-kutusu/detail-body | Gönder ikonu ~1.4 sn `DrawCheck`'e döner; ses toast köprüsünden `success` |
| Atama değişti | detail-body CasePanel | "Atanan: X" anahtarla yeniden doğar → kayarak giriş |
| Durum rozeti | b-gelen-kutusu/parts `Chip` | `qx-fx-status` renk geçişi (yeni/yanıtlandı/çözüldü, telafi durumları) |
| QR oluşturma | b-qr-kodlar/print-panel | Önizleme yüklenince yukarıdan aşağı "çizilme" perdesi (`qx-fx-qr-draw`, app/event-fx.css'e eklendi) |
| Kopyala | print-panel bağlantı + UTM | Başarılı kopyada ikon ~1.2 sn çizilen tik; `copyText` artık boolean döndürür |
| Görev tamamlandı | b-ekip/tasks-panel | "✓" metni yerine çizilen tik |

## Zaten vardı (dokunulmadı)
KPI sayımı (MetricTile içindeki ticker — bugün, gelen kutusu, müşteriler), kasa okundu dalgası + tik, tüketim akışı yeni satır, gelen kutusu satır kapanışı (CollapseList), ürün kartları AnimatePresence, toplu seçim çubuğu, sekme kayan gösterge (SectionTabs), çekmece/sheet açılışları (ui), InlineConfirm, toast başarı/hata sesleri (tek nokta köprü).

## Bilinçli olarak eklenmeyenler
- Bayi tarafında dokunma/geçiş sesleri: operasyon ekranında gürültü olur.
- Sürükle-bırak: bu yüzeyde yok (ekip kanbanı components/team, başka ajanın).
- Görev listesinde avatar geçişi: her ilk yüklemede tüm satırları oynatacağı için kaldırıldı.
