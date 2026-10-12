# Müşteri B — olay animasyonu / ses taraması

| Yer | Durum | Yapılan |
|---|---|---|
| Lig sıralaması (m-lig/league-list) | sıra değişince satırlar zıplıyordu | `useFlipRows` (WAAPI FLIP, 420 ms, yalnız transform; `layout` prop domAnimation'da yok). Liste anahtarı değişince (dönem/sayfa) çalışmaz, giriş stagger'ı korunur |
| Davet linki/kod kopyalama (m-davet/invite-hero) | statik tik, ses yok | `DrawCheck` çizimi + `playSound('success')` |
| Ayar anahtarları (m-ayarlar/ui SettingSwitchRow) | sessiz | `playSound('toggle')` (yay topuz zaten ui/switch'te) |
| Telafi kabul anı (m-seslerim/remedy-panel) | durağan kart | bekleyen→kabul geçişinde bir kez `DrawCheck` + `Burst light`; ses toast köprüsünden |
| İlerleme çubukları (lig, rozet koleksiyonu, oyun durum şeridi, davet limiti, katkı kartı) | ilk çizimde dolu geliyordu | `.qx-fx-fill` scaleX 0→1 (720 ms), sonraki değişimler width geçişi |
| Seri alevi (oyun hub durum şeridi) | durağan | `.qx-fx-flame` girişte 2 kısa titreşim (sonsuz değil) |
| Görevler, rozet ızgarası, StreakFlame, yıl özeti slaytları, karakter rozeti, çark | zaten var / özel an | dokunulmadı |
| Klan katılma/ayrılma | toast (ses köprüsü) mevcut | yeterli, eklenmedi |
| feedbacks/[id]/journey | `permanentRedirect` | kapsam dışı |

Tümü `prefers-reduced-motion`'da kapalı; CLS yok; puan mantığına dokunulmadı.
