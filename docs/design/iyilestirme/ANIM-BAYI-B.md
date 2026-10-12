# Bayi B — animasyon/ses taraması (büyüme · analitik · ayar)

## Eklenenler
- **`components/ds/data/use-chart-enter.ts`** (yeni, ortak): recharts ilk çizim kancası. 460ms ease-out, yalnız ilk çizimde (veri yenilemede tekrar oynamaz), reduced-motion'da kapalı. `chartEnterDelay(p, i)` seri kademesi (≤120ms).
- Grafikler `isAnimationActive={false}` → `{...enter}`: analitik trend (duygu yığını + hacim/ortalama), anket trendi, kampanya zaman çizelgesi, kıyas bandı/medyan, etki trendleri (4 panel). Çubuklar büyür, çizgiler çizilir.
- **Anket oluşturucu**: soru `<li>`'lerine `layout="position"` + `SPRING.snappy` → yukarı/aşağı taşıma ve silmede kalanlar yayla yerleşir (reduced-motion'da kapalı).

## Zaten var olan (dokunulmadı)
- KPI sayıları: `MetricTile` içinde sayaç animasyonu.
- AI asistan: NDJSON akış + 3 noktalı yazıyor göstergesi (`message-bubble`).
- TV/VoC duvarı: yeni yorum tespiti + AnimatePresence geçişi (`wall-display`).
- Ses: tüm `toast.success` → `toast-sound-bridge` (kampanya gönder/zamanla, otomasyon aç/kapa, ayar kaydet). Bayi kapsamında varsayılan KAPALI.
- Switch yay topuzu, Button basma/spinner (components/ui).

## Bilinçli atlananlar
- Kaydet `success` tiki: anket/kampanya düzenleyicileri kayıttan sonra kapanıyor/yönleniyor, `DirtyBar` kayıtta gizleniyor → tik görünmez; onay toast+ses ile.
- `/dealer/onboarding` artık yönlendirme (permanentRedirect); adım animasyonu yüzeyi yok.
- Kampanya yayınında parçacık: B2B ekranında abartı; toast başarı sesi yeterli.
