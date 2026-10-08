# /admin/ekip

**Amaç:** Qratex'in iç ekibi (departmanlar, stajyerler, yöneticiler) için haftalık görev panosu: görev oluşturma/atama, kanban + onay akışı (Yapılacak → Devam → Onayda → Bitti), zorunlu kanıt (not/dosya), AI yardımcıları, otomasyon kuralları, şablonlar, dosya/aktivite/performans görünümleri. Aynı `TeamBoard` bileşeni `/customer/ekip` altında üyelere de servis ediliyor (çift panel).

**Genel puan:** 5/10 · **Karar:** yeniden tasarla (veri modeli ve API'ler korunur; bilgi mimarisi, 1642 satırlık istemci monoliti ve detay paneli yeniden kurulur, aşağıdaki bozuk iş kuralları düzeltilir)

Dosya zinciri: `app/admin/ekip/page.tsx` → `components/team/team-board.tsx` (1642 satır) → `task-detail-sheet.tsx`, `templates-dialog.tsx`, `ai-summary-dialog.tsx`, `ai-qa-dialog.tsx`, `automations-dialog.tsx`, `tags-dialog.tsx`, `team-files.tsx`, `team-activity.tsx`, `team-performance.tsx` · API: `app/api/admin/team/*` (18 route) · lib: `team-access.ts`, `team-week.ts`, `team-automation-engine.ts`, `team-autotask.ts`, `team-notify.ts`, `team-task-presets.ts` · cron: `app/api/internal/inngest/team-daily-maintenance/route.ts` · model: `CompanyTask` (`prisma/schema.prisma:2860`), `TaskChecklistItem`, `TaskComment`, `TaskActivity`, `TaskAttachment`, `TaskTemplate`, `TeamAutomation`, `TeamTag`, `TeamSavedView`, `Department`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Özellik yüzeyi çok geniş ve çekirdek akış (oluştur → taşı → kanıt → onayla) çalışıyor; ama öncelik sıralaması bozuk, görev oluşturulduktan sonra düzenlenemiyor, birkaç seçenek (günlük tekrar, iki otomasyon tetiği, etiket havuzu) sahte. |
| UX | 5/10 | 7 görünüm sekmesi + 10'a yakın aksiyon butonu + 7 filtre tek satırda; onaysız silme, `window.prompt` ile red notu ve görünüm adı, filtreye bağlı yanıltıcı KPI'lar ve yanlış tetiklenen havai fişek. |
| Görsel | 6/10 | Temiz shadcn kartları, durum renkleri ve geri sayım rozetleri iyi; ancak sütun başlıklarında emoji, sürekli nabız atan gradyan butonlar ve AI mor gradyanı admin aracının sakin diliyle (Linear/Stripe) çelişiyor. |
| Mimari | 4/10 | Tek dosyada 40+ state, fetch, iş kuralı ve 7 görünüm; iş kuralları (kanıt, onay, aktivite, bildirim) PUT, bulk, otomasyon ve cron'da dört farklı biçimde tekrar/eksik uygulanmış; üye kapsamı backend'de yok. |
| Performans | 5/10 | Tüm diyaloglar, recharts ve tam `motion` paketi statik yükleniyor; istek iptali yok; otomatik görev üretimi N+1; trend her görev sayısı değişiminde yeniden çekiliyor. |
| Erişilebilirlik + mobil | 4/10 | Mobil "Taşı" menüsü ve snap kolonlar iyi düşünülmüş; fakat kanban kartı klavyeyle açılamıyor, masaüstünde sürükle-bırakın klavye alternatifi yok, hover-only aksiyonlar dokunmatik/klavyede görünmez, sekmelerde `aria-pressed`/`role` yok, konfeti reduced-motion'ı yok sayıyor. |

---

## Özellik envanteri

Durum: ÇALIŞIYOR / KISMİ / BOZUK / SAHTE / EKSİK. Satır numaraları aksi belirtilmedikçe `components/team/team-board.tsx`.

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Rota erişimi (ADMIN rolü + gizli kapı çerezi) | ÇALIŞIYOR | `proxy.ts:51`, `proxy.ts:79-87` | Sayfa korumalı; `/api/admin/team/*` ise proxy'de gate çerezinden muaf (`proxy.ts:105-118`), yalnız `requireTeamAccess` ile korunuyor. |
| 2 | Rol tespiti (`isManager` = ADMIN veya `yonetici`) | ÇALIŞIYOR | `:119-124`, `lib/team-access.ts:11-34` | Backend DB'den taze rol okuyor. |
| 3 | Hero başlık + rol açıklaması | ÇALIŞIYOR | `:592-602` | ADMIN'in `adminTeamRole`'ü yoksa genel metin. |
| 4 | Yönetici-özel sekmelerin üyeden gizlenmesi | ÇALIŞIYOR | `:142-146`, `:637-639` | |
| 5 | Hafta geri/ileri | ÇALIŞIYOR | `:607-616`, `lib/team-week.ts:53-57` | |
| 6 | Hafta etiketi (UTC, hydration-güvenli) | ÇALIŞIYOR | `:610-613`, `lib/team-week.ts:73-80` | |
| 7 | "Bu hafta"ya dönüş | ÇALIŞIYOR | `:617-619` | |
| 8 | Departman filtresi (yönetici) | ÇALIŞIYOR | `:623-633`, `tasks/route.ts:54` | |
| 9 | Görünüm modu (Pano/Liste/Kişiler/Takvim/Dosyalar/Akış/Performans) | ÇALIŞIYOR | `:636-651` | `aria-pressed`/`role="tab"` yok. |
| 10 | "N görev onayını bekliyor" rozeti | KISMİ | `:655-665` | Sayı aktif filtrelere bağlı; Durum=Bitti filtresinde rozet kaybolur, oysa onay kuyruğu global olmalı. |
| 11 | AI'ya Sor (doğal dil Q&A) | KISMİ | `ai-qa-dialog.tsx:28-42`, `ai-qa/route.ts:41-56` | Bağlam `take: 300` ve `orderBy` yok → 300'den fazla aktif görevde rastgele alt küme; geçmiş oturum kapanınca kaybolur; cevap kaynak/görev linki vermiyor. |
| 12 | AI Haftalık Özet | KISMİ | `ai-summary-dialog.tsx:122-136`, `ai/route.ts:80-97` | Arşivlenmiş görevleri de sayar (`where: { weekKey }`, `archivedAt` filtresi yok); diyalog her açılışta yeniden üretir, önbellek yok. |
| 13 | CSV dışa aktarma | ÇALIŞIYOR | `:567-587`, `lib/export-utils.ts:56-65` | Yalnız görünen (filtreli) görevler; `=`, `+`, `-`, `@` ile başlayan hücreler kaçırılmıyor (CSV formül enjeksiyonu). |
| 14 | Otomasyon kuralları diyaloğu (listele/oluştur/aç-kapa/sil) | KISMİ | `automations-dialog.tsx:208-246` | Durum tetiğinde "Onayda" (review) yok (`:196`); hatalar yutuluyor (`:239-246`); kural düzenleme yok. |
| 15 | Otomasyon tetikleri "Görev oluşunca" ve "Gecikince" | SAHTE | `automations-dialog.tsx:194`, yalnız `tasks/route.ts:360-373` çağırıyor | `runAutomations` yalnız `status_changed` ve `assigned` için çağrılıyor; `created`/`overdue` hiçbir yerde tetiklenmiyor. |
| 16 | Etiket Havuzu (renkli, merkezi etiketler) | SAHTE | `tags-dialog.tsx`, `tags/route.ts`; kartlar `:65-82` | `TeamTag` tablosu hiçbir yerde okunmuyor; kartlar etiket rengini isimden hash'leyerek üretiyor, görev formu serbest CSV. Havuz görsel olarak hiçbir şeyi değiştirmiyor. |
| 17 | Şablonlar (hazır galeri + şablonlarım + uygula) | ÇALIŞIYOR | `templates-dialog.tsx:78-132`, `templates/route.ts:62-89` | Hazır şablon uygulamak 3 istek (geçici şablon POST → PUT → DELETE); şablondan doğan görev aktivite/denetim kaydı ve atama bildirimi üretmiyor. |
| 18 | Otomatik görev üret (incident + aksiyon maddesi) | ÇALIŞIYOR | `:554-564`, `lib/team-autotask.ts:37-92` | Önizleme yok (API'de `GET` aday sayısı var ama UI kullanmıyor, `autotask/route.ts:10-19`); her zaman bu haftaya yazar; N+1. |
| 19 | Toplu seçim modu ("Seç") | KISMİ | `:689-691`, `:1007-1015` | Checkbox yalnız kanban kartında; Liste/gruplu görünümde seçim yok; "tümünü seç" yok. |
| 20 | Arşiv görünümü aç/kapa | ÇALIŞIYOR | `:692-694`, `tasks/route.ts:53` | |
| 21 | Departmanlar sayfasına bağlantı | ÇALIŞIYOR | `:697-699` | `<a>` ile tam sayfa yenileme; `next/link` değil. |
| 22 | Yeni Görev butonu | ÇALIŞIYOR | `:700-704` | |
| 23 | Arama (300 ms debounce, başlık/açıklama/etiket) | ÇALIŞIYOR | `:180-183`, `tasks/route.ts:62-68` | |
| 24 | "Benim Görevlerim" | ÇALIŞIYOR | `:714-716`, `tasks/route.ts:58` | |
| 25 | Durum filtresi | ÇALIŞIYOR | `:717-726` | |
| 26 | Öncelik filtresi | ÇALIŞIYOR | `:727-735` | |
| 27 | Atanan filtresi (+ Atanmamış) | ÇALIŞIYOR | `:736-743`, `tasks/route.ts:59-60` | |
| 28 | Sıralama (tarih, başlık, oluşturma, güncelleme, süre) | KISMİ | `:745-756`, `tasks/route.ts:72-81` | `manual` (boardOrder) API'de var, UI'da yok; `boardOrder` hiç yazılmıyor. |
| 29 | Önceliğe göre sıralama + varsayılan sıra | BOZUK | `tasks/route.ts:74`, `:81` | `priority` string alanı alfabetik `desc` sıralanıyor → "medium, low, high"; en yüksek öncelikli işler en altta. Varsayılan sıra da aynı hatayı taşıyor. |
| 30 | Gruplama (kişi/öncelik/departman) | KISMİ | `:305-318`, `:935-959` | Öncelik grupları sayıya göre sıralanıyor (Yüksek önde değil); "Onayda" görevler gri nokta ile "Yapılacak"tan ayırt edilemiyor (`:947`). |
| 31 | Karttaki etikete tıklayıp filtreleme | KISMİ | `:1062-1069`, `tasks/route.ts:61` | `contains` eşleşmesi: `#v2` filtresi `v22`, `iv2` gibi etiketleri de getirir. |
| 32 | Filtreleri temizle (sayaçlı) | ÇALIŞIYOR | `:249-255`, `:772-776` | Sıralama/gruplama/arşiv sıfırlanmıyor (tasarım tercihi olabilir). |
| 33 | Görünümü kaydet | ÇALIŞIYOR | `:267-279` | Ad `window.prompt` ile alınıyor. |
| 34 | Kayıtlı görünümü uygula | KISMİ | `:280-292` | Arama metni ve hafta saklanmıyor; uygulama sonrası URL değişmiyor (paylaşılamaz). |
| 35 | Kayıtlı görünümü sil | KISMİ | `:293-296`, `views/route.ts:59-62` | Başkasının paylaştığı görünümde de X çıkar; sunucu 403 döner ama istemci iyimser olarak listeden siler ve hatayı yutar. |
| 36 | Ekip geneline paylaşılan görünüm | EKSİK | `views/route.ts:24`, `:42` | API `isShared` destekliyor, UI'da seçenek yok. |
| 37 | Toplu: durum ata | KISMİ | `:802-810`, `bulk/route.ts:247-288` | `done` dışındaki geçişlerde kanıt kontrolü yok (toplu "Onayda" kanıtsız); toplu işlemler `TaskActivity` yazmıyor, bildirim/otomasyon çalıştırmıyor; atlanan görevler kullanıcıya söylenmiyor ("3 görev güncellendi" ama 5 seçildi). |
| 38 | Toplu: öncelik ata | ÇALIŞIYOR | `:811-818` | Aktivite kaydı yok. |
| 39 | Toplu: kişiye ata | KISMİ | `:819-825`, `bulk/route.ts:279-280` | Tekil atamadaki mail + uygulama içi bildirim toplu atamada yok. |
| 40 | Toplu: arşivle/çıkar | ÇALIŞIYOR | `:826-828` | |
| 41 | Toplu: sil | KISMİ | `:829-831`, `bulk/route.ts:235-237` | Onay adımı yok; 200 göreve kadar kalıcı silme, geri alma yok, R2 dosyaları yetim kalır. |
| 42 | Toplu: departman ata / etiket ekle | EKSİK | `bulk/route.ts:214-216` | API'de `department` ve `tag_add` var, UI'da yok. |
| 43 | "Bu Hafta" KPI kartı (toplam, halka, 4 sayaç) | KISMİ | `:839-866`, `:321-340` | Başlık başka hafta görüntülenirken de "Bu Hafta"; tüm değerler arama/filtreye bağlı ama bu belirtilmiyor. |
| 44 | 6 haftalık tamamlanma sparkline | KISMİ | `:848-855`, `trend/route.ts:21-30` | Seçili haftadan bağımsız, hep içinde bulunulan haftaya göre; arşivlenen görevleri sayıyor; `tasks.length` her değiştiğinde yeniden çekiliyor (`:239`). |
| 45 | Durum dağılımı donut | ÇALIŞIYOR | `:869-874` | |
| 46 | Kişi başı yük çubukları | ÇALIŞIYOR | `:877-886` | Yalnız ilk isim: aynı ilk isme sahip iki kişi aynı etiketle görünür (`:338`). |
| 47 | Haftalık Tempo alan grafiği | KISMİ | `:890-909` | #44 ile aynı kapsam sorunu; `byDepartment` API'den geliyor ama kullanılmıyor (`trend/route.ts:48-56`). |
| 48 | Hafta %100 olunca havai fişek + fanfar + titreşim | BOZUK | `:343-353` | Oran filtreli listeden hesaplanıyor: Durum=Bitti filtresi veya tamamı bitmiş geçmiş bir haftaya geçmek 5 sn'lik havai fişek ve ses tetikliyor. |
| 49 | Görev bitince yıldız konfetisi + ses | ÇALIŞIYOR | `:424-428` | `canvas-confetti`'ye `disableForReducedMotion` verilmiyor (`components/providers/confetti-provider.tsx:52-66`); `navigator.vibrate` kontrolsüz çağrılıyor. |
| 50 | 4 kolonlu kanban + sayaç rozetleri | ÇALIŞIYOR | `:963-986` | |
| 51 | Sürükle-bırak (masaüstü, yönetici) | ÇALIŞIYOR | `:967-999` | HTML5 drag; klavye alternatifi yok. |
| 52 | İyimser taşıma + hata durumunda geri alma | ÇALIŞIYOR | `:355-393` | Başarı sonrası sunucu yanıtı (otomasyonun değiştirdiği alanlar) state'e yazılmıyor. |
| 53 | Kanıt yoksa (PROOF_REQUIRED) detay panelini açma | ÇALIŞIYOR | `:371-373`, `tasks/route.ts:252-266` | |
| 54 | Kart içeriği (başlık, açıklama, bağımlılık, öncelik, tekrar, tahmin, departman, avatar) | ÇALIŞIYOR | `:1016-1058` | |
| 55 | Bitiş tarihi geri sayım rozeti | KISMİ | `:104-116` | Tarih UTC gece yarısı olarak saklanıyor (`:439`); Liste görünümü aynı günü "gecikmiş" kırmızı gösteriyor (`:1229-1230`), cron aynı gün otomatik onaylıyor (bkz. Bulgu 9). |
| 56 | Kart etiket rozetleri | KISMİ | `:1059-1072` | Havuzdaki renkleri kullanmıyor (bkz. #16). |
| 57 | Alt görev / yorum / ek sayaçları (tooltip) | ÇALIŞIYOR | `:1074-1086` | |
| 58 | Onayla (review → done) | ÇALIŞIYOR | `:1125-1132`, `tasks/route.ts:236-276` | |
| 59 | Reddet (not ile revizyona döndür) | ÇALIŞIYOR | `:396-421` | Not `window.prompt` ile alınıyor; not sonradan UI'da hiçbir yerde görünmüyor (bkz. #99). |
| 60 | Üye: Başla / Onaya gönder butonları | ÇALIŞIYOR | `:1092-1121` | Admin panelinde görünmez (ADMIN her zaman yönetici). |
| 61 | Mobil "Taşı" menüsü | ÇALIŞIYOR | `:1142-1170` | Yalnız `lg:hidden`; masaüstü klavye kullanıcısına sunulmuyor. |
| 62 | Kartı kopyala | KISMİ | `:473-480`, `duplicate/route.ts:30` | Kopya her zaman içinde bulunulan haftaya yazılıyor; geçmiş haftayı görüntülerken "kopyalandı" deyip ekranda göstermiyor. |
| 63 | Kartı arşivle | ÇALIŞIYOR | `:483-492` | |
| 64 | Kartı sil | KISMİ | `:467-470` | Onaysız, geri alınamaz; fetch hatası ve 403 yutuluyor (iyimser silme geri alınmıyor). |
| 65 | Boş kolon durumu | ÇALIŞIYOR | `:1193-1200` | |
| 66 | Yükleniyor iskeleti | KISMİ | `:912-934` | 4 kolonlu panoda 3 kolon iskelet gösteriyor; her filtre değişiminde tüm pano iskelete dönüyor (yanıp sönme). |
| 67 | Kanban kartının klavyeyle açılması | EKSİK | `:1016` | Tıklanabilir alan `div onClick`; `button`/`tabIndex`/`onKeyDown` yok. |
| 68 | Liste görünümü | KISMİ | `:1205-1246` | Sütun başlığı/sıralama yok, seçim yok; "Onayda" gri nokta (`:1217-1218`). |
| 69 | Kişiler görünümü | ÇALIŞIYOR | `:1247-1285` | "Onayda" gri nokta (`:1276`). |
| 70 | Takvim görünümü | KISMİ | `:1515-1642` | "Bugün" UTC'ye göre (TR'de 00:00–03:00 arası yanlış gün); tarihe sürükleyerek yeniden planlama yok; "Onayda" gri. |
| 71 | Dosyalar görünümü (ara, tür, departman) | ÇALIŞIYOR | `team-files.tsx:63-77`, `files/route.ts:30-70` | Haftadan bağımsız, `take: 300`, sayfalama yok. |
| 72 | Akış (aktivite feed) | KISMİ | `team-activity.tsx:41-97`, `activity/route.ts:13-37` | Yorum "canlı feed" diyor ama tek seferlik yükleme; API'deki `actor`/`action` filtreleri UI'da yok; 100 kayıt sınırı, sayfalama yok; toplu işlemler hiç loglanmadığı için akışta görünmüyor. |
| 73 | Performans paneli | KISMİ | `team-performance.tsx:38-80`, `performance/route.ts:18-28` | Tüm zamanlar, seçili hafta ve departmandan bağımsız; "biten sayısına göre" sıralı liderlik tablosu bağlamsız. |
| 74 | Yeni görev: başlık + açıklama | ÇALIŞIYOR | `:1318-1372` | |
| 75 | Yeni görev: renkli öncelik seçimi | ÇALIŞIYOR | `:1375-1397` | `aria-pressed` yok. |
| 76 | Yeni görev: departman + atanan + "Bana ata" | KISMİ | `:1399-1428` | ADMIN'in `adminTeamRole`'ü yoksa `members` listesinde değil (`departments/route.ts:36-44`) → "Bana ata" sonrası Select boş görünür. |
| 77 | Yeni görev: etiketler | KISMİ | `:1431-1447` | Serbest CSV; havuzdan otomatik tamamlama yok. |
| 78 | Yeni görev: bitiş tarihi | KISMİ | `:1449-1456`, `:439` | Gün sonu yerine UTC gün başı olarak kaydediliyor. |
| 79 | Yeni görev: tahmini süre | ÇALIŞIYOR | `:1460-1469` | |
| 80 | Yeni görev: tekrar (Her gün/hafta/ay) | BOZUK | `:1472-1480`, `team-daily-maintenance/route.ts:41-43` | "Her gün" = haftada bir kopya (`offset = monthly ? 4 : 1`); "Her ay" = 4 hafta. Ayrıca kopya yalnız görev "Bitti" olunca üretiliyor. |
| 81 | AI alt görev önerisi | ÇALIŞIYOR | `:512-526`, `:447-454` | Görev oluştuktan sonra N paralel istek; hatalar yutuluyor, sıra garantisi yok (`order: count` yarışı, `[id]/route.ts:97-99`). |
| 82 | AI ata önerisi (departman + kişi) | ÇALIŞIYOR | `:497-511`, `ai/route.ts:59-77` | Öneri listede doğrulanıyor — iyi. |
| 83 | Oluştururken bağımlılık seçimi | EKSİK | `:430-443` | Yalnız detay panelinden. |
| 84 | Atama maili + uygulama içi bildirim | ÇALIŞIYOR | `tasks/route.ts:144-154` | `after()` ile güvenilir. |
| 85 | Derin bağlantı `?task=<id>` | ÇALIŞIYOR | `:186-190`, `:242-247` | Filtre/hafta URL'e yazılmıyor. |
| 86 | Detay: durum/öncelik/departman başlığı | KISMİ | `task-detail-sheet.tsx:345-366` | Departman slug olarak gösteriliyor (`:351`), isim değil. |
| 87 | Detay: görevi düzenleme (başlık, açıklama, atanan, öncelik, tarih, departman, durum, etiket) | EKSİK | `task-detail-sheet.tsx:271-290` | `patchTask` yalnız `spentMin` ve `blockedById` için kullanılıyor; oluşturulan görevin başlığı/ataması/tarihi tekil olarak hiç düzenlenemiyor. |
| 88 | Detay: zaman kaydı ("+dk") | KISMİ | `task-detail-sheet.tsx:285-290` | Oku-değiştir-yaz: iki eşzamanlı kayıtta biri kaybolur; üye için API 403 (`tasks/route.ts:195-200`), yani üyeye gösterilen bir buton hep hata verir. |
| 89 | Detay: bağımlılık bağla/kaldır | KISMİ | `task-detail-sheet.tsx:403-413`, `tasks/route.ts:223-235` | Aday listesi yalnız ekrandaki (filtreli, bu haftanın) ilk 50 görev; döngü kontrolü yalnız A↔B (A→B→C→A geçer). |
| 90 | Detay: alt görev ekle/işaretle/sil/ata | ÇALIŞIYOR | `task-detail-sheet.tsx:436-481`, `[id]/route.ts:96-122` | Alt göreve bitiş tarihi API'de var, UI'da girilemiyor; `act()` hataları yutuyor (`:224-231`). |
| 91 | Detay: AI ile alt görev öner ve ekle | ÇALIŞIYOR | `task-detail-sheet.tsx:300-316` | |
| 92 | Detay: dosya eki yükle (sürükle-bırak, ilerleme çubuğu) | KISMİ | `task-detail-sheet.tsx:128-151`, `attachments/route.ts:10`, `:142-144` | UI "max 50MB" diyor, hata metni "8MB altında olmalı" diyor; Vercel Function istek gövdesi sınırı 4,5 MB olduğundan büyük dosyalar sunucuya ulaşmadan 413 alır (canlıda doğrulanmadı). Magic-byte doğrulaması örnek nitelikte. |
| 93 | Detay: ek sil | ÇALIŞIYOR | `task-detail-sheet.tsx:153-158`, `attachments/route.ts:188-221` | Onaysız. |
| 94 | Detay: yorum + @bahsetme + yanıt + emoji tepki + yoruma dosya | ÇALIŞIYOR | `task-detail-sheet.tsx:256-268`, `[id]/route.ts:123-190` | Yoruma iliştirmek için yüklenen dosya yorum gönderilmese de ek olarak kalıyor ve "kanıt" sayılıyor. |
| 95 | Detay: yorum düzenle/sil | KISMİ | `task-detail-sheet.tsx:638-639`, `[id]/route.ts:157-166` | Düzenle butonu herkesin yorumunda görünüyor; sunucu 403 dönünce sessizce hiçbir şey olmuyor. |
| 96 | Detay: yorum ve aktivite zaman damgası | BOZUK | `task-detail-sheet.tsx:94-97` | `getUTCHours()` yerel saat gibi gösteriliyor → Türkiye'de tüm zamanlar 3 saat geride. |
| 97 | Detay: aktivite zaman tüneli | KISMİ | `task-detail-sheet.tsx:722-753` | Son 30 kayıt; toplu işlem, şablon ve otomasyon değişiklikleri loglanmadığından eksik tarih. |
| 98 | Otomasyon motorunun çalıştırılması | KISMİ | `tasks/route.ts:359-373`, `lib/team-automation-engine.ts:110-121` | `after()` dışında fire-and-forget (sunucusuz ortamda yanıt sonrası kesilebilir — doğrulanmadı); `set_status: done` kanıt/onay kuralını atlıyor. |
| 99 | Red notu / onay geçmişinin gösterimi | EKSİK | `grep reviewNote components/team` yalnız `team-board.tsx:51,408` | `reviewNote`, `approvedAt`, `submittedForReviewAt` hiçbir yerde gösterilmiyor. |
| 100 | Çok kullanıcılı canlı güncelleme (SSE/polling) | EKSİK | — | Başka yöneticinin onayı sayfa yenilenene kadar görünmez. |
| 101 | Çok dillilik (i18n) | EKSİK | Modülde `useAppT` yok; admin layout i18n kullanıyor (`app/admin/layout.tsx:12-16`) | EN arayüz seçen admin bu sayfayı Türkçe görür. |
| 102 | Geri al (undo) — silme/arşiv/taşıma | EKSİK | — | Linear/Notion'da standart. |
| 103 | Kaynağa geri bağlantı (otomatik görev → incident/aksiyon) | EKSİK | `lib/team-autotask.ts:59-61` | `sourceType/sourceRef` yazılıyor ama kartta gösterilmiyor; görev bitince kaynak incident kapanmıyor (tek yönlü). |

**Sayım:** 103 özellik · ÇALIŞIYOR 52 · KISMİ 35 · BOZUK 4 · SAHTE 2 · EKSİK 10.

---

## Bulgular

### 1. [YÜKSEK · Hata · Doğruluk] Öncelik sıralaması alfabetik: yüksek öncelikli işler en altta
- **Kanıt:** `app/api/admin/team/tasks/route.ts:74` → `priority: [{ priority: 'desc' }, …]`; varsayılan `:81` → `[{ status: 'asc' }, { priority: 'desc' }, …]`; `priority` bir `String` (`schema.prisma:2865`).
- **Sorun:** Postgres metin sıralamasında `desc` = `medium > low > high`. "Önceliğe göre" seçeneği ve varsayılan kolon içi sıra, Yüksek öncelikli görevleri en sona koyuyor. Pano kolon içinde bu sırayı kullandığı için yönetici kritik işi en altta görüyor.
- **Öneri:** Önceliği sayısal bir sıra alanına çevirin (`priorityRank Int` 3/2/1, migration ile backfill) ya da Prisma enum (`TaskPriority { high medium low }`) kullanıp sıralamada `CASE` ifadesi kullanan bir `$queryRaw` görünümü kurun. En az maliyetli yol: `priorityRank` ek kolonu + create/update/bulk/otomasyon yollarında yazılması (tek bir `setPriority()` yardımcı fonksiyonunda). Varsayılan sıralama: `priorityRank desc, dueAt asc nulls last, createdAt desc`.
- **Efor:** S

### 2. [YÜKSEK · Veri bütünlüğü · UX] Onaysız kalıcı silme (tekil ve 200'e kadar toplu), geri alma yok, R2 dosyaları yetim kalıyor
- **Kanıt:** `team-board.tsx:467-470` (`deleteTask`, onay yok, hata yutuluyor), `:829-831` (toplu Sil), `bulk/route.ts:235-237` (`deleteMany`), `tasks/route.ts:397` (hard delete). `TaskAttachment` satırları cascade ile silinir ama R2 nesneleri silinmez (`attachments/route.ts:207-210` yalnız tekil ek silmede çalışıyor).
- **Sorun:** Hover'da beliren çöp kutusuna yanlış tıklama, yorumlar, kanıt dosyaları ve aktivite geçmişiyle birlikte görevi geri dönülmez siler. Toplu modda tek tık 200 görevi siler. Onay akışının "kanıt" mantığı bu verinin kalıcılığına dayanıyor.
- **Öneri:** Silmeyi arşivle birleştirin: "Sil" = soft delete (`deletedAt`), 30 gün sonra cron ile R2 temizleyerek kalıcı silme. UI'da `sonner` toast içinde "Geri al" (5 sn), toplu silmede seçilen sayıyı ve kanıtlı görev sayısını gösteren `AlertDialog` ("12 görev, 4'ünde kanıt dosyası var — silinsin mi?"). Kalıcı silme yalnız Arşiv görünümünde ve ayrı yetkiyle.
- **Efor:** M

### 3. [YÜKSEK · Güvenlik · Yetki] Üye kapsamı backend'de yok: ekip üyesi tüm şirketin görevlerini, yorumlarını, dosyalarını ve AI bağlamını okuyabiliyor
- **Kanıt:** `team-board.tsx:622` yorumu "üye tüm departmanları görmemeli" diyor ama `tasks/route.ts:44-61` GET'te üye için hiçbir departman/atanan kısıtı yok; `tasks/[id]/route.ts:10-42` herhangi bir görevin tüm yorumlarını/eklerini döndürüyor; `files/route.ts:30-44` tüm ekleri listeliyor (Dosyalar sekmesi üyeye açık); `ai-qa/route.ts:18` "manager DEĞİL" ile tüm aktif görevleri ve üyeleri LLM'e veriyor.
- **Sorun:** Bu sayfa admin içindir, ama aynı API'ler `/customer/ekip` altındaki stajyer/üyelere de açık. Niyet (UI'da departman filtresini gizlemek) ile uygulama (API her şeyi döndürüyor) çelişiyor: bir stajyer devtools ile `GET /api/admin/team/tasks?weekKey=…` çağırarak finans/hukuk departmanı görevlerini ve ek URL'lerini görebilir.
- **Öneri:** `requireTeamAccess` dönüşüne bir `scope` ekleyin (`{ departments: string[] } | 'all'`) ve tüm okuma uçlarında tek bir `taskVisibilityWhere(auth)` yardımcı fonksiyonuyla Prisma `where`'ine enjekte edin (görev: kendi departmanları + kendine atanan; dosya: görünür görevlere ait; AI bağlamı: aynı kapsam). Politikayı bir kez yazıp tüm uçlarda kullanın; e2e testte "üye başka departman görevini 404 alır" senaryosu ekleyin.
- **Efor:** M

### 4. [YÜKSEK · Veri bütünlüğü · İş kuralı] Onay akışı dört farklı yolda tutarsız: üye onaylanmış görevi geri alabiliyor, otomasyon ve cron kanıtsız "Bitti" yapabiliyor
- **Kanıt:**
  - Üye: `tasks/route.ts:189-205` yalnız hedef durumu kontrol ediyor, mevcut durumu değil → üye kendi `done` görevini `in_progress`/`review`'a taşıyabilir; `:277-281` bu durumda `approvedBy/approvedAt` silinir. UI da üyeye Bitti kartında "Taşı" menüsü sunuyor (`team-board.tsx:89-91`, `:1142-1143`).
  - Otomasyon: `lib/team-automation-engine.ts:110-121` `set_status: done` kanıt, bağımlılık ve `approvedById` olmadan `done` yapıyor.
  - Toplu: `bulk/route.ts:270-276` `review`'a kanıtsız geçiriyor, `TaskActivity`/bildirim yok.
  - Cron: `team-daily-maintenance/route.ts:86-95` bitiş tarihi geçmiş `review` görevleri kanıt kontrolü olmadan otomatik onaylıyor (`approvedById: null`).
- **Sorun:** "done = onaylanmış ve kanıtlı" değişmezi (PUT'taki yorum, `tasks/route.ts:248-251`, `:270-272`) yalnızca tekil PUT'ta korunuyor. Performans paneli, AI özeti ve trend bu `done` verisine güveniyor.
- **Öneri:** Tek bir durum makinesi modülü (`lib/team-task-transitions.ts`): `transition(task, to, actor, { source: 'ui'|'bulk'|'automation'|'cron' })` — izinli geçiş tablosu (üye: `todo↔in_progress→review`, `done`'dan çıkamaz), kanıt kuralı, bağımlılık kuralı, damgalar, `TaskActivity`, bildirim ve otomasyon tetiği burada. PUT, bulk, otomasyon motoru ve cron bunu çağırsın. Otomasyonun `set_status` aksiyonu `done`'u hedef olarak kabul etmesin (ya da "review"a göndersin). Cron'un otomatik onayı bir ayar arkasına alınsın ve kanıt yoksa onaylamak yerine yöneticiye "onay gecikti" bildirimi üretsin.
- **Efor:** L

### 5. [YÜKSEK · İşlevsellik · UX] Görev oluşturulduktan sonra düzenlenemiyor
- **Kanıt:** `task-detail-sheet.tsx:271-290` `patchTask` yalnız `spentMin` (`:288`) ve `blockedById` (`:398`, `:404`) için çağrılıyor; başlık (`:353`), açıklama (`:354`), atanan (`:356-364`), öncelik/durum (`:347-350`) salt okunur. API (`tasks/route.ts:207-221`) bu alanların hepsini destekliyor.
- **Sorun:** Yazım hatası, tarih kayması veya yeniden atama için tek yol toplu seçim moduna girip (yalnız durum/öncelik/atanan) işlem yapmak; başlık, açıklama, tarih, departman, etiket ve tahmin hiç düzenlenemiyor. Bir görev panosunun temel işlevi eksik.
- **Öneri:** Detay panelini Linear tarzı "özellik paneli"ne çevirin: başlık/açıklama yerinde düzenleme (blur'da kaydet, `Esc` iptal), sağ sütunda Durum/Öncelik/Atanan/Departman/Bitiş/Tahmin/Etiket/Tekrar için `Popover` + `Command` seçiciler; her alan tek alanlı PUT gönderir, iyimser günceller, sunucudan dönen `task` ile state'i senkronlar. Değişiklikler zaten `TaskActivity`'ye yazılıyor; başlık/açıklama/tarih için de satır eklenmeli (`tasks/route.ts:342-357`).
- **Efor:** M

### 6. [ORTA · Hata · Veri gösterimi] Yorum ve aktivite saatleri 3 saat kayık
- **Kanıt:** `task-detail-sheet.tsx:94-97` `fmt()` → `getUTCHours()/getUTCMinutes()`; `:582`, `:746` kullanıyor.
- **Sorun:** "Hydration-güvenli" olsun diye UTC kullanılmış, ama bu bileşen yalnız istemcide (Sheet açıkken) render ediliyor; Türkiye (UTC+3) kullanıcısı 14:00'te yazılan yorumu "11:00" görüyor. Onay akışında "ne zaman onaya gönderildi" sorusu yanlış cevaplanıyor.
- **Öneri:** `Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', … })` ile ortak bir `formatTeamDate()` (lib/team-week.ts yanına) ve göreli zaman ("2 saat önce") + `title`'da tam tarih. Aynı yardımcı `team-files.tsx:25-28` ve takvimde de kullanılsın.
- **Efor:** S

### 7. [ORTA · Hata · Motion] Kutlama efekti yanlış tetikleniyor ve reduced-motion'ı yok sayıyor
- **Kanıt:** `team-board.tsx:343-353` oran `report.pct` filtreli `tasks` üzerinden; `:321-340`. `confetti-provider.tsx:69-84` 5 sn'lik interval, `disableForReducedMotion` yok; `:349` `navigator.vibrate` doğrudan.
- **Sorun:** Durum filtresinde "Bitti" seçmek, "Benim görevlerim"de hepsi bitmişken açmak ya da tamamı bitmiş geçmiş bir haftaya geçmek her seferinde havai fişek + fanfar çalıyor. Bir admin aracında beklenmedik ses ve tam ekran parçacık hem rahatsız edici hem erişilebilirlik ihlali (WCAG 2.3.3).
- **Öneri:** Kutlamayı veri olayına bağlayın, görünüme değil: yalnızca kullanıcının kendi eylemiyle (onay) haftanın filtresiz tamamlanma oranı 100'e ulaştığında ve yalnız içinde bulunulan haftada. `canvas-confetti` çağrılarına `disableForReducedMotion: true`; ses ve titreşimi `game-sounds` içindeki `muted()` kapısından geçirin. Admin panelinde kutlamayı ayarlardan kapatılabilir yapın; varsayılan olarak yalnızca hafif bir "check" mikro-animasyonu (kartta 200 ms ölçek + yeşil vurgu).
- **Efor:** S

### 8. [ORTA · İşlevsellik · Sahte özellik] "Her gün" tekrarı haftalık, iki otomasyon tetiği hiç çalışmıyor, Etiket Havuzu hiçbir şeye bağlı değil
- **Kanıt:** `team-daily-maintenance/route.ts:41-43` (`daily/weekly → +1 hafta`); `automations-dialog.tsx:194` `created`, `overdue` seçenekleri — `runAutomations` yalnız `tasks/route.ts:360-373`'te iki tetik için; `TeamTag` yalnız `tags/route.ts` içinde okunuyor, kart renkleri `team-board.tsx:65-82`'de hash.
- **Sorun:** Kullanıcı bir ayar yapıp sonuç görmüyor; güven kaybı. Özellikle "Gecikince yöneticilere bildir" kuralı kuran yönetici bildirim almayacağını bilmiyor.
- **Öneri:** Ya gerçekleyin ya kaldırın. Gerçekleme: `created` → POST/şablon/kopya/otomatik üretim yollarında `transition` modülünden tetik; `overdue` → günlük cron'da yeni gecikenler için (idempotent `overdueTriggeredAt`). Günlük tekrar: haftalık panoda gün bazlı örnek üretmek yerine "haftanın günleri" (Pzt–Cum) seçimi ile o haftaya N alt görev/örnek. Etiket havuzu: `CompanyTask.tags` CSV yerine `TaskTag` ilişki tablosu; formda havuzdan `Command` ile seçim + yeni etiket oluşturma; kart rengi `TeamTag.color`'dan.
- **Efor:** M

### 9. [ORTA · Hata · Tarih semantiği] Bitiş tarihi gün başı (UTC 00:00) olarak saklanıyor: görev son gününde "gecikmiş" sayılıyor ve otomatik onaylanıyor
- **Kanıt:** `team-board.tsx:439` `new Date('YYYY-MM-DD').toISOString()` → UTC gece yarısı; Liste `:1229-1230` `dueAt < now` ile kırmızı; cron `team-daily-maintenance/route.ts:67` `dueAt lt now` ile aynı gün otomatik onay; `ai-qa/route.ts:72` aynı gün "[GECİKMİŞ]"; `dueBadge` (`:104-116`) ise aynı günü "BUGÜN" diyor.
- **Sorun:** Aynı veri üç ekranda üç farklı anlam taşıyor; stajyer son gününün sabahında "gecikmiş" görünüyor, onaydaki işi yönetici bakmadan sistem kapatıyor.
- **Öneri:** Bitiş tarihini "gün sonu, Europe/Istanbul" olarak normalize edin (sunucu tarafında `dueAt = endOfDay(date, 'Europe/Istanbul')`) ve gecikme kontrolünü tek bir `isOverdue(task, now)` yardımcı fonksiyonunda toplayın; tüm UI/AI/cron bunu kullansın. Mevcut kayıtlar için migration: saat bileşeni 00:00Z olanlara +20:59 ekle.
- **Efor:** S

### 10. [ORTA · Mimari] 1642 satırlık istemci monoliti; iş kuralları UI'da kopyalanmış; veri katmanı yok
- **Kanıt:** `team-board.tsx` tek dosyada ~40 `useState` (`:126-177`, `:495-496`, `:553`), 9 farklı fetch, 7 görünüm, takvim alt bileşeni; renk/etiket eşlemeleri `team-board.tsx:57-98` ve `task-detail-sheet.tsx:84-91`'de ikişer kez; durum noktası rengi 5 yerde elle (`:947`, `:1217`, `:1276`, `:1592`, `:1632`) ve hepsinde "review" unutulmuş.
- **Sorun:** Her yeni özellik aynı dosyaya ekleniyor; "review" kolonu sonradan eklendiğinde 5 yerden hiçbiri güncellenmemiş — bu, kopyalanmış eşlemelerin doğrudan sonucu. İstek iptali olmadığından hızlı hafta/filtre geçişlerinde eski yanıt yenisini ezebilir (`:214-235`); `json.success` false olduğunda önceki haftanın görevleri yeni hafta etiketiyle ekranda kalır (`:229`).
- **Öneri:** `components/team/` altında özellik klasörleri: `board/` (kanban, list, grouped, calendar), `toolbar/`, `filters/` (URL senkronlu `useTeamFilters` — `nuqs` benzeri `useSearchParams` sarmalayıcı), `task/` (detail, form). Veri: SWR/TanStack Query ile `useTeamTasks(filters)` (anahtar = filtreler, otomatik iptal ve önbellek, mutasyonlarda `mutate` ile iyimser güncelleme). Ortak `TASK_STATUS_META` / `PRIORITY_META` tek modülde (`lib/team-meta.ts`), hem kart hem sheet hem CSV kullansın. Hata durumunda boş/eski veri yerine `ErrorState` + "Tekrar dene".
- **Efor:** L

### 11. [ORTA · Performans] Ağır bağımlılıklar statik yükleniyor, tam `motion` paketi LazyMotion'ı boşa çıkarıyor, otomatik üretim N+1
- **Kanıt:** `team-board.tsx:14` `import { motion } from 'framer-motion'` (proje deseni `m as Motion` + global non-strict `LazyMotion`, `components/providers.tsx:241`); recharts grafikleri (`:34-37`, `components/charts/donut-chart.tsx:4`) ve 6 diyalog + Sheet (`:25-33`) statik import; `lib/team-autotask.ts:48-64`, `:73-90` her kaynak için sıralı `findFirst` + `create` (200 kayda kadar); `tasks/route.ts` PUT tek taşıma için 7-9 sıralı sorgu (`:182`, `:229`, `:243`, `:253`, `:291`, `:310`, `:356`, `:375`); trend `tasks.length` değişimine bağlı yeniden çekiliyor (`:239`).
- **Sorun:** İlk yükte kullanıcının açmadığı AI/otomasyon/şablon diyalogları ve grafik kütüphanesi indiriliyor; `motion.div` + `layout` her kartta tam özellik setini çekiyor.
- **Öneri:** Diyalogları, Sheet'i, Takvim/Dosyalar/Akış/Performans görünümlerini `next/dynamic` ile (`ssr: false`, iskeletli) bölün; `motion` → `m as Motion` (layout gerekiyorsa sayfa düzeyinde `domMax` ile yerel `LazyMotion`). Otomatik üretimde kaynak id'lerini tek `findMany({ where: { sourceType, sourceRef: { in } } })` ile çekip `createMany` kullanın ve `@@unique([sourceType, sourceRef])` ekleyin (eşzamanlı iki tıklamada mükerrer görevleri de engeller). PUT'ta `actorName` sorgusunu oturumdan alın, kanıt/blocker sorgularını tek `findUnique` + `_count` ile birleştirin.
- **Efor:** M

### 12. [ORTA · Güvenilirlik] Otomasyon motoru `after()` dışında çalıştırılıyor
- **Kanıt:** `tasks/route.ts:361`, `:368` `import(...).then(runAutomations)` — `await` veya `after()` yok; aynı dosyada bildirimler `after()` ile sarılmış (`:146`, `:313`).
- **Sorun:** Sunucusuz ortamda yanıt döndükten sonra bekleyen promise'ler kesilebilir; kurallar rastgele çalışmayabilir (canlıda doğrulanmadı, ancak projenin kendi notlarında `after()` güvenilirlik düzeltmesi daha önce gerekmiş). Hatalar da motor içinde tamamen yutuluyor (`team-automation-engine.ts:128-134`), yani başarısız kural iz bırakmıyor.
- **Öneri:** `after(() => runAutomations(...))`; motor her çalışmada `TeamAutomationRun` (kural, görev, sonuç, hata) kaydı yazsın ve otomasyon diyaloğunda "son çalışmalar / hata" sütunu gösterilsin (Zapier/Linear tarzı gözlemlenebilirlik).
- **Efor:** S

### 13. [ORTA · Veri bütünlüğü] Kullanıcı silinince oluşturduğu tüm görevler (başkalarına atanmış olanlar dahil) siliniyor
- **Kanıt:** `prisma/schema.prisma:2900` `createdBy … onDelete: Cascade`.
- **Sorun:** Ayrılan bir yöneticinin hesabını silmek, ekibe atadığı tüm görevleri, yorumları ve kanıt eklerini yok eder.
- **Öneri:** `createdById String?` + `onDelete: SetNull` (UI "Silinmiş kullanıcı" gösterir) veya kullanıcı silme akışında görevlerin sahipliğini bir sistem kullanıcısına devretme. Migration canlı Neon'da dikkatle (önce nullable yap, sonra ilişkiyi değiştir).
- **Efor:** S

### 14. [ORTA · Erişilebilirlik] Kanban klavye ile kullanılamıyor; hover-only aksiyonlar; sekmelerde ARIA yok
- **Kanıt:** Kart tıklama alanı `div onClick` (`:1016`); masaüstünde taşıma yalnız HTML5 drag (`:997-999`), "Taşı" menüsü `lg:hidden` (`:1149`); kopyala/arşivle/sil `opacity-0 group-hover:opacity-100` (`:1175`), alt görev sil/ata ve yorum aksiyonları da aynı (`task-detail-sheet.tsx:453`, `:469`, `:620`); görünüm sekmeleri düz `button` (`:640-649`); otomasyon anahtarında `role="switch"`/`aria-checked` yok (`automations-dialog.tsx:278`).
- **Sorun:** Klavye/ekran okuyucu kullanıcısı görevi açamıyor, taşıyamıyor; dokunmatik cihazda hover olmadığından kopyala/arşivle/sil hiç görünmüyor.
- **Öneri:** Kartı `button` (veya `role="button" tabIndex=0` + Enter/Space) yapın; `@dnd-kit/core` + `KeyboardSensor` ile erişilebilir sürükle-bırak (duyurularla); "Taşı" menüsünü her genişlikte kart menüsüne (`DropdownMenu`, "…" butonu) taşıyın ve kopyala/arşivle/sil'i de oraya koyun; `group-hover` yerine `group-hover:opacity-100 group-focus-within:opacity-100` + dokunmatikte her zaman görünür. Sekmeler için shadcn `Tabs` veya `ToggleGroup` (`aria-pressed`). Klavye kısayolları: `C` yeni görev, `/` arama, `J/K` gezinme, `1-4` durum.
- **Efor:** M

### 15. [ORTA · UX · Bilgi mimarisi] Araç çubuğu aşırı yüklü ve KPI'lar bağlamı yanlış anlatıyor
- **Kanıt:** Üst satır: 7 sekme + onay rozeti + 10 buton (`:636-705`); ikinci satır: arama + 7 kontrol + görünümler (`:709-795`); "Bu Hafta" başlığı sabit (`:840`), KPI'lar filtreli listeden (`:321-340`), trend her zaman bugüne göre (`trend/route.ts:21-24`), Performans tüm zamanlar (`performance/route.ts:23-27`).
- **Sorun:** 400 px genişlikte içerik başlamadan önce 6-8 satır kontrol akıyor. Yönetici "geçen hafta %80" gördüğünde bunun filtreli mi, hangi haftaya göre mi olduğunu bilemiyor; aynı ekranda üç farklı zaman kapsamı var.
- **Öneri:** Hiyerarşi: (1) üst başlıkta hafta seçici + tek birincil eylem "Yeni görev" + "…" menüsü (Şablonlar, Otomasyon, Etiketler, Otomatik üret, CSV, Departmanlar); (2) görünüm sekmeleri + "Filtre" butonu (Linear tarzı filtre çipleri: `Durum: Onayda ×`); (3) KPI şeridi kompakt (4 sayı + oran) ve başlığı dinamik ("6–12 Eki · filtreli" rozeti). Trend seçili haftada bitsin; Performans hafta/departman kapsamını alsın. AI düğmeleri tek "AI" menüsünde. Mobilde araç çubuğu tek satır + alt sayfa (sheet) filtreler.
- **Efor:** M

### 16. [ORTA · UX] Red notu ve onay geçmişi kayboluyor; `window.prompt` ile toplanıyor
- **Kanıt:** `team-board.tsx:398-400` (`window.prompt` red nedeni), `:268` (görünüm adı); `reviewNote/approvedAt/submittedForReviewAt` bileşenlerde gösterilmiyor (yalnız `team-board.tsx:51` tip ve `:408` gönderim).
- **Sorun:** Yönetici neden reddettiğini yazıyor, ama not yalnız bildirimde gidiyor; görev panelinde üye de yönetici de göremiyor. `prompt` PWA/iOS'ta kötü görünür, çok satırlı geri bildirime izin vermez.
- **Öneri:** "Reddet" → küçük `Dialog` (çok satırlı not, hazır şablon çipleri: "Kanıt yetersiz", "Eksik alt görev"), not ayrıca otomatik bir yorum olarak thread'e düşsün ("Revizyon istendi: …"). Detay panelinin üstünde onay şeridi: "Onaya gönderildi 2 sa önce · Ahmet" / "Onaylandı · Furkan · 12:40" / "Otomatik onaylandı (süre doldu)".
- **Efor:** S

### 17. [DÜŞÜK · Hata] Dosya yükleme sınırı üç yerde üç farklı değer
- **Kanıt:** UI "max 50MB" (`task-detail-sheet.tsx:559`), sunucu `MAX_FILE_SIZE = 50MB` (`attachments/route.ts:10`), hata metni "8MB altında olmalı" (`:143`); dosya Vercel Function gövdesi üzerinden geçiyor (`req.formData()`, `:137`).
- **Sorun:** Vercel'in istek gövdesi sınırı (4,5 MB) nedeniyle 5-50 MB arası dosyalar route'a ulaşmadan reddedilir ve kullanıcı anlamsız bir hata görür (canlıda doğrulanmadı).
- **Öneri:** R2'ye presigned PUT URL ile doğrudan istemciden yükleme (`/attachments/presign` → istemci PUT → `/attachments/confirm` ile magic-byte kontrolü için ilk 4 KB'ı R2'den `Range` ile okuma). Sınırı tek sabitte tutup UI'a API'den servis edin.
- **Efor:** M

### 18. [DÜŞÜK · Hata] Hatalar yutuluyor, sessiz başarısızlık
- **Kanıt:** `task-detail-sheet.tsx:224-231` (`act` hiçbir yanıtı kontrol etmiyor — 403/404'te hiçbir şey olmuyor), `:153-158`; `automations-dialog.tsx:239-246`; `tags-dialog.tsx:366-370`; `templates-dialog.tsx:92-95`; `team-board.tsx:293-296`, `:467-470`; `team-activity.tsx:51`, `team-performance.tsx:47` (`/* sessiz */`).
- **Sorun:** Örneğin başkasının yorumunu düzenleyen yönetici (sunucu 403, `[id]/route.ts:161-163`) değişikliğin neden kaydolmadığını anlamıyor; iyimser silinen kayıt yenilemede geri geliyor.
- **Öneri:** Tek bir `teamFetch()` sarmalayıcısı: `!res.ok` → `toast.error(json.error)` + iyimser değişikliği geri al; listeleme hatalarında `ErrorState`. UI'da yetkisi olmayan aksiyonu hiç göstermeyin (yorum düzenle yalnız yazara).
- **Efor:** S

### 19. [DÜŞÜK · Tutarlılık] Bildirim bağlantıları rolden bağımsız sabit
- **Kanıt:** `lib/team-notify.ts:84`, `:110`, `:179` `/admin/ekip?task=…` (alıcılar `role: 'ADMIN' OR adminTeamRole: 'yonetici'`, `:98`); `team-automation-engine.ts:62` aynı; `:129`, `:142`, `:155`, `:193` `/customer/ekip`.
- **Sorun:** CUSTOMER rolündeki yönetici "onay bekliyor" bildirimine tıklayınca proxy onu `/customer`'a atar (`proxy.ts:61-71`), görev açılmaz. Admin'e giden atama bildirimi ise `/customer/ekip`'e gider.
- **Öneri:** Bildirimde rol-bağımsız `/ekip/t/<id>` yönlendirici rota (sunucu bileşeni rolü okuyup doğru panele `redirect` eder).
- **Efor:** S

### 20. [DÜŞÜK · Güvenlik] CSV formül enjeksiyonu
- **Kanıt:** `lib/export-utils.ts:61` yalnız çift tırnak kaçırılıyor; otomatik görevler işletme verisinden başlık alıyor (`lib/team-autotask.ts:51`, `:76`).
- **Öneri:** `=`, `+`, `-`, `@`, tab, CR ile başlayan hücrelerin başına `'` ekleyin (OWASP önerisi), tüm export'lar için ortak.
- **Efor:** S

### 21. [DÜŞÜK · Görsel] Admin diliyle uyumsuz görsel öğeler
- **Kanıt:** Sütun başlıklarında emoji (`:58-61`, `:980`), boş kolonda emoji (`:1195`); sonsuz `animate-pulse` olan gradyan "Başla" ve onay rozeti (`:659`, `:1098`, `:1116`); AI butonları mor-fuşya gradyan (`:666`); hover'da `scale-105` çoğu butonda.
- **Sorun:** Linear/Stripe kıyasında dikkat ekonomisi bozuluyor: her şey parlıyor, hiçbir şey öne çıkmıyor. `motion-safe` koruması iyi ama varsayılan hâlde bile sürekli nabız yorucu.
- **Öneri:** Lucide durum ikonları (Circle, CircleDashed, CircleDot, CheckCircle2) ve durum rengini yalnız ikon/kenar çizgisinde kullanın; nabız animasyonunu yalnız "yeni geldi" anında bir kez (framer `animate` 1 tekrar) oynatın; AI eylemleri nötr buton + küçük ✦ ikon.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Görev düzenleme ve özellik paneli** (Linear issue detail): yerinde başlık/açıklama düzenleme, alan seçiciler, markdown açıklama, alt görevlerin gerçek görev olarak açılması.
- **URL'de durum** (Linear/PostHog filtre URL'leri): hafta, görünüm, filtreler, sıralama URL query'sinde; kayıtlı görünüm = paylaşılabilir link; ekip geneline paylaşılan görünümler.
- **Gerçek zamanlı ortak çalışma**: SSE/polling ile kart güncellemeleri, "Ahmet bu görevi görüntülüyor" göstergesi; çakışma için `updatedAt` tabanlı iyimser kilit (412).
- **Geri al ve çöp kutusu** (Notion/Linear): her yıkıcı eylemde 5 sn "Geri al", 30 günlük çöp kutusu.
- **Klavye öncelikli kullanım** (Linear): komut paleti (`⌘K` → "görev oluştur / ata / taşı"), kısayollar, erişilebilir sürükle-bırak.
- **Onay kuyruğu ve SLA** (Retool/Jira Service Management): "Onay bekleyenler" ayrı görünüm, bekleme süresi, toplu onay/ret, yöneticiye günlük özet; otomatik onay yerine eskalasyon.
- **İş yükü ve kapasite** (Linear Cycles, Asana Workload): kişi başı tahmini saat vs. kapasite, aşırı yüklenen kişide uyarı; hafta sonunda bitmeyenleri sonraki haftaya taşıma ("rollover") sihirbazı.
- **Otomasyon gözlemlenebilirliği** (Zapier/Linear): kural çalışma geçmişi, hata günlüğü, test et (dry-run), koşul birleştirme (VE/VEYA).
- **Kaynak bağlantısı**: otomatik üretilen görevde incident/aksiyon maddesine link ve görev bitince kaynağı kapatma (çift yönlü senkron).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Yönetici sayfayı açtığında 3 saniyede şunu görmeli: "Bu hafta neredeyiz, kim tıkandı, onayımı ne bekliyor?" ve 2 tıkla aksiyon almalı. Üye ise yalnız kendi işini ve sıradaki adımı görmeli. Ton: Linear'ın sakin yoğunluğu, kutlama yalnızca anlamlı anda.

**Yerleşim (masaüstü):**
1. **Başlık şeridi** — sol: "Ekip · 6–12 Eki 2026" hafta seçici (◀ ▶, takvim popover'ı, "Bu hafta"); sağ: birincil "Yeni görev" (`C`), "…" taşma menüsü (Şablonlar, Otomasyonlar, Etiketler, İşletme verisinden üret — önizlemeli, CSV, Departmanlar).
2. **Durum şeridi** (tek satır, 56 px): Toplam · Devam · Onay bekliyor (tıklanabilir, global sayım) · Geciken · Tamamlanma %; yanında 6 haftalık mini çizgi seçili haftada biter. Filtre aktifse "filtreli" rozeti.
3. **Görünüm + filtre satırı:** `Tabs` (Pano, Liste, Takvim, Kişiler | Dosyalar, Akış, Performans "Analiz" altında), sağda "Filtre" (çip tabanlı), "Görünüm" (gruplama/sıralama/alanlar), "Kayıtlı görünümler".
4. **İçerik:** Pano 4 kolon; kartta yalnız başlık, öncelik ikonu, atanan avatar, bitiş rozeti, sayaçlar — gerisi hover/"…" menüsünde. Onay kolonu başlığında "Tümünü incele" (sırayla açan inceleme modu: sol görev, sağ kanıt + Onayla/Revizyon iste, `A`/`R` kısayolları).
5. **Detay:** Sağdan açılan geniş panel (`sm:max-w-2xl`), iki sütun: sol içerik (başlık, açıklama, alt görevler, yorum thread'i, ekler), sağ özellikler (Durum, Öncelik, Atanan, Departman, Bitiş, Tahmin/Harcanan, Etiketler, Tekrar, Bağımlılık, Kaynak), üstte onay şeridi.

**Mobil:** Varsayılan görünüm "Benim işlerim" listesi (kanban ikinci sekme); alt sabit çubuk: Filtre · Yeni görev; detay tam ekran sheet; kart menüsünden taşıma (mevcut "Taşı" menüsü korunur ve genelleştirilir).

**Motion (yerinde ve ölçülü):** Kart taşımada `layout` geçişi (mevcut yay ayarı iyi, `m as Motion` ile); kolon sayaçlarında sayı geçişi; onaylanan kartta 200 ms yeşil kenar vurgusu + tek seferlik check ikonu çizimi; havai fişek yalnız içinde bulunulan haftanın gerçekten tamamlandığı anda, ayarlardan kapatılabilir ve `prefers-reduced-motion`'da hiç oynamaz. 3B gerekmez; bu bir iş aracıdır, three.js eklemek değer katmaz.

**Veri/API değişiklikleri:**
- `lib/team-task-transitions.ts` durum makinesi (Bulgu 4) — PUT, bulk, otomasyon, cron, şablon ve kopya hepsi buradan geçer; aktivite + bildirim + otomasyon tek yerde.
- `taskVisibilityWhere(auth)` kapsam politikası tüm okuma uçlarında (Bulgu 3).
- `priorityRank` (veya enum) + bitiş tarihi gün sonu normalizasyonu (Bulgu 1, 9).
- Soft delete (`deletedAt`) + R2 temizleme cron'u (Bulgu 2); `createdBy` için `SetNull` (Bulgu 13).
- `TaskTag` ilişki tablosu ile etiket havuzunun gerçekten kullanılması; `@@unique([sourceType, sourceRef])`.
- `GET /api/admin/team/board?weekKey&filters` tek uç: görevler + global sayımlar (filtre bağımsız onay kuyruğu) + trend tek yanıtta, SWR ile; mutasyonlar `task` döndürüp önbelleği günceller.
- `TeamAutomationRun` günlüğü; `created`/`overdue` tetiklerinin gerçeklenmesi.
- R2 presigned yükleme (Bulgu 17).
- Modül i18n anahtarlarına taşınır (`useAppT`), admin locale ile uyumlu.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/ekip`** — aynı `TeamBoard` bileşeni (`app/customer/ekip/page.tsx:4`). Bilinçli çift panel tasarımı; kopya değil. Ancak yetki kapsamı backend'de tanımlanmadığı için (Bulgu 3) iki panel fiilen aynı veriyi görüyor. Öneri: tek bileşen kalsın, `mode: 'manager' | 'member'` açıkça prop olarak verilsin ve üye modunda varsayılan görünüm "Benim işlerim" olsun.
- **`/admin/intern-emails`** (Stajyer Görev Mailleri) — departman bazlı "görev" + son teslim tarihi + okundu takibi (`app/admin/intern-emails/page.tsx:271-272`, `:480`, `:581`). Bu, ekip panosundaki "departmana görev ata + bitiş tarihi + mail bildirimi" ile kavramsal olarak çakışan ikinci bir görev sistemi; bir stajyerin işi iki yerde (mail ve pano) ayrı izleniyor. Öneri: Görev maili gönderimi `CompanyTask` oluşturan bir eylem olsun ("Mail ile ata"): mail şablonu görevin açıklaması olur, açılma takibi görevin aktivitesine düşer, son teslim = `dueAt`. intern-emails sayfası şablon/tasarım editörü olarak kalabilir, görev kaydı tek kaynak (`CompanyTask`) olur.
- **`/admin/ekip/departmanlar`** — aynı modülün alt sayfası; ayrı rota yerine pano içinde "…" menüsünden açılan yönetim sayfası olarak kalması uygun, ancak `<a>` yerine `Link` ve geri dönüşte hafta/filtre durumu korunmalı.
- **Otomatik görev üretimi ↔ işletme incident/aksiyon modülleri** — tek yönlü kopya üretiyor (`lib/team-autotask.ts`); kaynak ile görev durumu senkron değil. Birleştirme değil, çift yönlü bağlantı önerilir.

---

## Doğrulama (şüpheci inceleme)

Her iddia, ilgili kod baştan okunarak çürütülmeye çalışıldı (route'lar, `lib/team-access.ts`, `lib/team-automation-engine.ts`, cron route'u, `prisma/schema.prisma`, `components/team/*`). Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Önceliğe göre ve varsayılan sıralama ters — **DOĞRULANDI**
- `app/api/admin/team/tasks/route.ts:74` `priority: [{ priority: 'desc' }, ...]`, `:81` varsayılan `[{ status: 'asc' }, { priority: 'desc' }, ...]`; `prisma/schema.prisma:2865` `priority String`.
- Metin sıralamasında (C veya en_US harmanlaması fark etmez) `high < low < medium`; `desc` sonucu **medium, low, high**. İstemcide yeniden sıralama yok: `components/team/team-board.tsx:226` `sort` parametresini olduğu gibi gönderiyor, `:300` kolon haritası sunucu sırasını koruyor.
- Yeniden üretim: aynı kolonda bir "Yüksek" ve bir "Orta" görev oluştur, "Önceliğe göre" seç: Yüksek en altta. Varsayılan sırada da her kolon içinde Orta > Düşük > Yüksek dizilir. `status: 'asc'` da alfabetik (done, in_progress, review, todo); kanbanda etkisiz ama Liste görünümünde "Bitti" en üstte çıkar.
- Önem: orta (yanlış önceliklendirme, veri kaybı yok). Düzeltme yaklaşımı: `priorityRank Int` kolonu (veya Postgres enum) ile sıralama; yazma yollarında tek yardımcıdan türetilmeli.

### 2. Üye için veri kapsamı yok — **BELİRSİZ** (teknik olarak doğru, "UI'da gizli / API'de açık" çerçevesi yanlış)
- Doğru olan: `tasks/route.ts:44-61`, `tasks/[id]/route.ts:10-42`, `files/route.ts:30-44`, `ai-qa/route.ts:17-18,42-44` üye için hiçbir departman/atanan kısıtı uygulamıyor.
- Çürütülen kısım: bu bir "UI kısıtının API ile atlatılması" değil. Üye arayüzü zaten tüm departmanların görevlerini gösteriyor: `team-board.tsx:127` `department` varsayılanı `'all'`, `:218` `'all'` iken parametre gönderilmiyor, `:621-622` yalnız filtre açılır listesi gizleniyor. "Dosyalar" görünümü de üyeye açık (`:637` filtresi yalnız people/activity/performance'ı gizliyor). `ai-qa` yorumu bilinçli olarak "manager DEĞİL" diyor; modülün tasarım notu da "tasks GET + checklist/yorum açık" der. Yani mevcut davranış tasarım gereği şeffaflık.
- Neden belirsiz: Stajyerlerin diğer departman görevlerini ve ek URL'lerini görmemesi gerekiyorsa bu gerçek bir eksik (o zaman `taskVisibilityWhere(auth)` ile tüm okuma uçlarına kapsam eklenmeli, AI bağlamı da aynı filtreden geçmeli); gerekmiyorsa hata yok. Bu bir ürün politikası kararı, kod okumasıyla kesinleşmiyor.

### 3. Üye onaylanmış (done) kendi görevini geri taşıyabiliyor — **DOĞRULANDI** (önem: orta)
- `tasks/route.ts:189-205` üye kontrolünde yalnız hedef durum (`MEMBER_ALLOWED_STATUSES`) denetleniyor, mevcut durumun `done` olması engellenmiyor; `:278-281` done'dan çıkışta `approvedBy` koparılıyor, `approvedAt` ve `:286` `completedAt` siliniyor.
- UI bunu açıkça sunuyor: `team-board.tsx:89-91` `moveTargets('done', false)` todo/in_progress/review döndürüyor; `:1142-1143` kendi görevinde mobil "Taşı" menüsü gösteriliyor (masaüstü sürükleme yalnız yöneticide, `:997`).
- Yeniden üretim: yönetici üyenin görevini onaylar; üye mobilde karttan "Taşı > Yapılacak" der; yönetici onay damgası ve tamamlanma zamanı silinir, performans/trend sayımlarından düşer. Ek etki: üye görevi "Onayda"ya geri alırsa ve bitiş tarihi geçmişse günlük cron (`team-daily-maintenance/route.ts:86-95`) görevi `approvedById: null` ile "sistem onayı"na çevirir, yönetici onayı izi kalıcı kaybolur. Ayrıcalık kazancı yok ama "done = yönetici kararı" değişmezi bozuluyor. Düzeltme: üye için `existing.status === 'done'` iken 403 (yeniden açma yalnız yönetici).

### 4. Otomasyon, toplu işlem ve cron kanıt/onay kuralını atlıyor — **DOĞRULANDI** (kısmen; iddiadaki bulk satır numaraları hatalı)
- Satır düzeltmesi: `app/api/admin/team/tasks/bulk/route.ts` 108 satır; iddiadaki `:270-276` yok. Toplu **done** yolu (`:53-73`) kanıt ve bağımlılığı **doğru şekilde** denetliyor; bu kısım çürütüldü. Toplu **review** (`:76-82`) kanıt denetlemiyor ve aktivite/bildirim yazmıyor; ancak yalnız yönetici (`:29`) çağırabildiği için etkisi sınırlı.
- Otomasyon: `lib/team-automation-engine.ts:110-121` `set_status` kanıt, bağımlılık ve `approvedById/approvedAt` olmadan yazıyor; `actionValue` da doğrulanmıyor (`automations/route.ts:18` serbest string), geçersiz durum değeri yazılabilir. Kuralı yönetici kurar ama tetik üyenin eylemidir: "status_changed=review > set_status done" kuralı varsa üyenin her onaya gönderimi onaysız/bağımlılığı çözülmemiş "done" üretir.
- Cron (en somut açık): `team-daily-maintenance/route.ts:67-95` review'deki görevi kanıt yeniden sayılmadan done yapıyor. Senaryo: üye tek yorumla onaya gönderir (`tasks/route.ts:252-266` geçer), sonra kendi yorumunu siler (`tasks/[id]/route.ts:167-175` yazara izin veriyor); bitiş tarihi geçince cron kanıtsız görevi "Bitti" yapar. PUT'taki "done'da her zaman yeniden kontrol" ilkesi (`tasks/route.ts:248-251`) burada uygulanmıyor. Düzeltme: tüm geçişleri tek bir durum makinesi yardımcısından (`lib/team-task-transitions.ts`) geçirmek.

### 5. Onaysız kalıcı görev silme, R2 eklerinin yetim kalması — **DOĞRULANDI** (yalnız yönetici)
- `team-board.tsx:467-470` iyimser silme, onay yok, hata `catch(() => {})` ile yutuluyor (başarısızlıkta kart UI'dan kaybolur ama sunucuda kalır). Çöp kutusu düğmesi Arşivle düğmesinin hemen altında, 14 px'lik hover ikonları (`:1179-1186`); yanlış tık olasılığı yüksek.
- Toplu sil: `:829-831` `runBulk({ op: 'delete' })` doğrudan, onay yok; sunucu `bulk/route.ts:41-43` `deleteMany` (iddiadaki `:235-237` hatalı satır, içerik doğru), 200'e kadar id.
- `tasks/route.ts:397` hard delete; şema cascade ile yorum, checklist, aktivite, ek kayıtlarını siliyor (`schema.prisma` TaskComment/TaskActivity/TaskAttachment `onDelete: Cascade`). R2 temizliği yalnız tekil ek silmede (`attachments/route.ts:206-210`); görev veya toplu silmede R2 nesneleri ve yorum ekleri (`attachmentPath`, `tasks/[id]/route.ts:53,127`) yetim kalır.

### 6. Kullanıcı silinince oluşturduğu görevler cascade siliniyor — **DOĞRULANDI**
- `prisma/schema.prisma:2900` `createdBy ... onDelete: Cascade`. Silme yolları gerçekten var: `app/api/admin/users/route.ts:676` (tekil), `app/api/admin/users/bulk/route.ts:79` (toplu), `app/api/user/delete-account/route.ts:39` (kullanıcının kendi hesabını silmesi). User'a bağlı `Restrict`/onDelete'siz zorunlu ilişki taraması silmeyi engelleyecek bir kısıt bulmadı.
- Yeniden üretim: CUSTOMER rolündeki bir "yonetici" kendi hesabını siler; oluşturduğu, başkalarına atanmış tüm görevler ve bunların yorum/ek/aktivite kayıtları yok olur. Daha geniş etki: `TaskComment.author`, `TaskActivity.actor`, `TaskAttachment.uploadedBy` de Cascade; ayrılan bir stajyerin hesabı silinince onun kanıt yorumları ve ekleri de silinir, onaylanmış görevler kanıtsız kalır. Düzeltme: `createdById` nullable + `SetNull`, yazar/aktör ilişkilerinde de `SetNull` ve "silinmiş kullanıcı" gösterimi.

### 7. Zaman damgaları UTC'yi yerel saat gibi gösteriyor — **DOĞRULANDI** (önem: orta)
- `components/team/task-detail-sheet.tsx:94-97` `fmt()` `getUTCDate/getUTCHours/getUTCMinutes` kullanıyor; kullanım `:582` (yorum) ve `:746` (aktivite). Bileşen istemcide çalışıyor; UTC'ye sabitlemenin hidrasyon gerekçesi yok.
- Yeniden üretim: TR saatiyle 14:30'da yorum yaz, "11:30" görünür; 00:00-03:00 arası yazılan yorum bir önceki günün tarihiyle görünür. Onay akışında "ne zaman onaya gönderildi" bilgisi 3 saat kayık. Düzeltme: `Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', ... })` ile paylaşılan bir biçimlendirici.

### Özet
| # | Karar | Not |
|---|---|---|
| 1 | Doğrulandı | String sıralama: desc = medium, low, high |
| 2 | Belirsiz | Kapsam yok ama UI da her şeyi gösteriyor; politika kararı |
| 3 | Doğrulandı | Üye done görevini geri taşıyıp onay damgasını silebiliyor |
| 4 | Doğrulandı (kısmen) | Toplu done doğru; cron + otomasyon + toplu review açık |
| 5 | Doğrulandı | Onaysız hard delete, R2 yetim |
| 6 | Doğrulandı | createdBy Cascade + üç gerçek kullanıcı silme yolu |
| 7 | Doğrulandı | UTC gösterimi, TR'de 3 saat geri |
