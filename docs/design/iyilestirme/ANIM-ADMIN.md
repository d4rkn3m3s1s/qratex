# Admin animasyonları

İlke: yönetim ekranı hızlı ve sakin (<400 ms), yalnız transform/opacity, CLS yok, reduced-motion'da sade. Ses admin'de varsayılan KAPALI.

## Bu turda
| Yer | Değişiklik |
|---|---|
| Gözlemlenebilirlik canlı bağlantı noktası | `animate-ping` → `qx-fx-pulse-calm` (2.4 s yavaş halka, reduced-motion'da kapalı) |
| API anahtarı / webhook sırrı "bir kez göster" kopyala | lucide `Check` → `DrawCheck` (kendini çizen tik); CodeBlock kopyala da aynı |

## Zaten mevcut (dokunulmadı)
SecretReveal uyarı halkası, segment teklif durum rozetinde `qx-fx-status` renk geçişi, components/ui Button success / Switch / Checkbox mikro-etkileşimleri, SectionTabs kayan gösterge.

## Sonraki adaylar
Kanban yerleşme yayı, sidebar sırası sürükle, toplu işlem sayacında AnimatedNumber, tablo satır ekle/silde CollapseList.
