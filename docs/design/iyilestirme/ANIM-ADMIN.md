# Admin animasyonları

İlke: yönetim ekranı hızlı ve sakin (<400 ms), yalnız transform/opacity/renk, CLS yok, reduced-motion'da sade. Ses admin'de varsayılan KAPALI (tercihle açılır).

| Özellik | Yer | Efekt |
|---|---|---|
| Sağlık nabzı | a-gozlemlenebilirlik/observability-center | `animate-ping` → `qx-fx-pulse-calm` (2.4 s) |
| Sır / API anahtarı kopyala | a-entegrasyonlar/secret-reveal | `DrawCheck` tik (panel + CodeBlock) |
| Webhook test anı | a-entegrasyonlar/test-panel | başarı: DrawCheck + `playSound('success')`; hata: XCircle spin-in + kutu `qx-fx-shake-once` + `playSound('error')` |
| Kanban bırakma | components/team/board/kanban-view | bırakılan kart `qx-fx-settle` yayı (380 ms) |
| Sidebar sırası sürükle | a-navigasyon-studyosu/studio | üst düzey düğümlerde HTML5 sürükle-bırak (hedef halkası, kaynak soluk), mevcut `layout="position"` yayı taşır; ↑/↓ düğmeleri klavye/mobil için duruyor; arama varken kapalı |
| Onay/ret anı | a-segmentler/ui/proposals-tab | onay: DrawCheck, ret: X spin-in; rozet rengi `qx-fx-status` |
| Durum rozeti renk geçişi | ds/data/status-badge | tüm StatusBadge'lere `qx-fx-status` (420 ms renk geçişi) |
| Toplu işlem sayacı | ds/data/data-table BulkBar | `AnimatedNumber` (sr metni ayrı) |
| Tablo satırı ekleme / filtre / sayfa | ds/data/data-table | sonradan gelen satır `qx-fx-row-fade` (240 ms, `useNewIds`); kart (mobil) görünümünde yok |
| Tema seçimi | a-tasarim-sistemi/theme/preview-canvas | `qx-theme-xfade` — önizlemenin tüm renkleri 280 ms geçer |
| Ayar kaydet | a-ayarlar-kapi/gate-settings, section-security (profil + şifre) | `Button success` (`useSavedFlash`, 1.4 s) |
| KPI sayıları | komuta + analitik | MetricTile zaten sayaçlı (`animate` varsayılan true) — değişiklik gerekmedi |

## Bilinen sınırlar
- Tabloda satır SİLME çöküşü yok (`<table>` içinde CollapseList uygun değil); kart listelerinde CollapseList inbox/KVKK/kanban'da zaten var.
- DirtyBar ile kaydedilen bölümlerde (erişim, kimlik, bakım) bar kaydedince kapandığı için success tiki yok; toast yeterli.
- Tema yayınla düğmesi ConfirmAction içinde, success eklenmedi.
