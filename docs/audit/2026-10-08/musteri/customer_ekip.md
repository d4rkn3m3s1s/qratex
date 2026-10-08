# /customer/ekip

**Amaç:** Şirket içi ekip üyelerinin (rolü CUSTOMER kalan ama `adminTeamRole` atanmış çalışan ve stajyerlerin) haftalık görev panosu. Kanban, liste, takvim ve dosyalar görünümleri; onay akışı (üye → "Onayda" → yönetici onayı); AI soru-cevap; yöneticiler için toplu işlem, şablon ve otomasyon. Sayfa son kullanıcıya (tüketiciye) yönelik değildir. Müşteri paneline yalnızca rol mimarisi yüzünden yerleştirilmiş bir **iç araçtır**.

**Genel puan:** 5/10 · **Karar:** **birleştir**. `/admin/ekip` ile tek bir "Ekip Çalışma Alanı" rotasında (kendi layout'u ve rol kapısıyla) birleştirilmeli, müşteri kabuğundan çıkarılmalı. Aynı rotada iç bileşen de parçalanıp yeniden tasarlanmalı.

> Sayfa dosyası tek satırdır: `app/customer/ekip/page.tsx:4` → `<TeamBoard basePath="/customer/ekip" />`. Bütün davranış `components/team/team-board.tsx` (1642 satır), `components/team/task-detail-sheet.tsx` (759 satır), yardımcı diyaloglar ve `/api/admin/team/*` uçlarındadır. `/admin/ekip` aynı bileşeni render eder.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 6/10 | Özellik yelpazesi çok geniş. Ancak sayfanın asıl kitlesi olan **üye** için "AI Özet" ve "Süre ekle" bozuk, başkasının görevindeki aksiyonlar sessizce başarısız oluyor, biten olmayan görevler haftaya devretmiyor. |
| UX | 5/10 | Araç çubuğunda 13'e varan buton ve 6 seçici var. Varsayılan görünüm üyeye "kendi işim" yerine şirketin tüm görevlerini gösteriyor. `window.prompt` ile not alınıyor, her filtrede tüm pano iskelete dönüp titriyor. |
| Görsel | 6/10 | Renk dili ve rozetler tutarlı, kanban kartları okunaklı. "Onayda" durumu liste, takvim ve gruplu görünümde gri noktaya düşüyor. Gradyan, nabız ve parıltı efektleri aşırı yoğun. |
| Mimari | 4/10 | Tek bir 1642 satırlık "god component" var. Müşteri panelinden `/api/admin/*` çağrılıyor. Yetki kapısı oturumdaki bayat role düşebiliyor (fail-open). Bildirim linkleri rolü dikkate almıyor. `createdBy` cascade silme veri kaybına yol açabilir. |
| Performans | 6/10 | Açılışta 4 paralel istek var ve kabul edilebilir. Ancak trend her `tasks.length` değişiminde yeniden çekiliyor, ağır diyaloglar ve grafikler tembel yüklenmiyor, `motion` doğrudan import edildiği için LazyMotion kazancı kayboluyor, detay panelindeki her alt işlem panoyu yeniden yüklüyor. |
| Erişilebilirlik + mobil | 4/10 | Kanban kartı klavyeyle açılamıyor (`div onClick`). Kart, yorum ve checklist aksiyonları yalnızca hover ile görünüyor, dokunmatikte erişilemiyor. Sekmelerde `aria-pressed` yok. Konfeti, `prefers-reduced-motion` ayarını yok sayıyor. |

---

## Özellik envanteri

Durumlar: ÇALIŞIYOR / KISMİ / BOZUK / SAHTE / EKSİK. TB = `components/team/team-board.tsx`, TDS = `components/team/task-detail-sheet.tsx`.

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Erişim kapısı (DB'den güncel ekip rolü) | KISMİ | `app/customer/ekip/layout.tsx:17-22`; `proxy.ts:59-70` | Kodda "ADMIN de erişir" yazıyor, ancak proxy ADMIN'i `/customer/*` altından `/admin`'e yönlendirdiği için bu dal ölü kod. |
| 2 | Hero (rol + departman) | KISMİ | TB:592-602 | Departman, ad yerine **slug** olarak görünüyor (ör. `uretim-ve-gelistirme`). Müşteri panelinde admin bileşeni (`AdminPremiumHero`) kullanılıyor. |
| 3 | Hafta gezinme ‹ › | ÇALIŞIYOR | TB:606-616 | Chevron butonlarında `aria-label` yok. |
| 4 | "Bu hafta"ya dönüş | ÇALIŞIYOR | TB:617-619 | |
| 5 | Departman filtresi (yalnızca yönetici) | ÇALIŞIYOR | TB:623-633 | |
| 6 | Görünüm sekmeleri (Pano/Liste/Takvim/Dosyalar + yöneticiye Kişiler/Akış/Performans) | ÇALIŞIYOR | TB:636-651, 142-146 | `role="tablist"` ve `aria-pressed` yok. |
| 7 | "N görev onayını bekliyor" rozeti (yönetici) | ÇALIŞIYOR | TB:655-665 | Sonsuz `pulse` animasyonu var. |
| 8 | AI'ya Sor (doğal dille soru) | ÇALIŞIYOR | TB:666; `components/team/ai-qa-dialog.tsx:28-44`; `app/api/admin/team/ai-qa/route.ts:16-111` | Hız sınırı yok, sohbet geçmişi modele gitmiyor, hata durumunda soru kayboluyor (`setQuestion('')` istekten önce çalışıyor, satır 31). |
| 9 | AI Haftalık Özet | **BOZUK** (üye) | Buton koşulsuz: TB:669. API yönetici istiyor: `app/api/admin/team/ai/route.ts:30` | Üye her tıkladığında "Bu işlem için yönetici olmalısınız" hatası alıyor. |
| 10 | CSV dışa aktarma | ÇALIŞIYOR | TB:567-587 | Durum etiketleri Türkçe. |
| 11 | Otomasyon kuralları (durum/atama tetiği) | KISMİ | `components/team/automations-dialog.tsx`; `app/api/admin/team/tasks/route.ts:360-373` | Motor `after()` dışında, fire-and-forget çalışıyor; serverless ortamda kesilebilir. `set_status=done` aksiyonu onay ve kanıt kuralını atlıyor (`lib/team-automation-engine.ts:110-119`). |
| 12 | Otomasyon tetikleri "Görev oluşunca" / "Gecikince" | **SAHTE** | Seçenek sunuluyor: `automations-dialog.tsx:21`. `runAutomations` yalnızca `status_changed` ve `assigned` ile çağrılıyor: `tasks/route.ts:361,368` | Kural kaydediliyor ama hiçbir zaman tetiklenmiyor. |
| 13 | Etiket havuzu (yönetici) | ÇALIŞIYOR | `components/team/tags-dialog.tsx` | Yüzeysel doğrulandı. Silmede hata yönetimi yok (satır 50). |
| 14 | Şablonlar + hazır şablon galerisi (yönetici) | ÇALIŞIYOR | `components/team/templates-dialog.tsx:59-140` | Hazır şablon akışı POST→PUT→DELETE zinciriyle ilerliyor, atomik değil (satır 121-128). |
| 15 | Otomatik görev üretimi (olay/aksiyondan) | ÇALIŞIYOR | TB:554-564 | |
| 16 | Toplu seçim modu | ÇALIŞIYOR | TB:689-691, 529-550 | |
| 17 | Arşiv görünümü | ÇALIŞIYOR | TB:692-694; `tasks/route.ts:53` | |
| 18 | "Departmanlar" bağlantısı | KISMİ | TB:697-699 | `next/link` yerine düz `<a>` kullanıldığı için tam sayfa yenileniyor. Üyeye de gösteriliyor. Hedef sayfa (`team-departments.tsx`) rol kontrolü olmadan yönetici kontrollerini sunuyor, işlemler 403 alıyor. |
| 19 | Yeni Görev (yönetici) | ÇALIŞIYOR | TB:700-704, 430-465 | |
| 20 | Görev arama (300 ms debounce) | ÇALIŞIYOR | TB:180-183, 710-713 | |
| 21 | "Benim Görevlerim" | KISMİ | TB:714-716; `tasks/route.ts:58` | Hafta kapsamlı. Üye için varsayılan değil, üye açılışta şirketin tüm görevlerini görüyor. |
| 22 | Durum filtresi | ÇALIŞIYOR | TB:717-726 | |
| 23 | Öncelik filtresi | ÇALIŞIYOR | TB:727-735 | |
| 24 | Atanan filtresi | ÇALIŞIYOR | TB:736-743 | |
| 25 | Sıralama | KISMİ | TB:745-756; `tasks/route.ts:74,81` | `priority` alanı String olduğu için **"Önceliğe göre" alfabetik sıralıyor** (desc: medium > low > high), yani Yüksek en sona düşüyor. Kanban kolon içinde sıralama yalnızca kısmen anlamlı. `manual`/`boardOrder` API'de var, UI'da yok. |
| 26 | Gruplama (kişi/öncelik/departman) | ÇALIŞIYOR | TB:305-318, 935-959 | "Onayda" durumu gri noktayla gösteriliyor (satır 947). |
| 27 | Etiket filtresi (#etiket çipi) | KISMİ | TB:767-771; `tasks/route.ts:61` | `contains` kullanıldığı için `#tas` etiketi "tasarım"ı da eşleştiriyor. |
| 28 | Filtreleri temizle | ÇALIŞIYOR | TB:249-255, 772-776 | Sıralama, gruplama ve arşiv sıfırlanmıyor. Tasarım tercihi olabilir. |
| 29 | Kaydedilmiş görünümler | KISMİ | TB:258-296, 778-794; `app/api/admin/team/views/route.ts` | Ad `window.prompt` ile alınıyor. Paylaşılan (başkasına ait) görünüm silinince UI'dan iyimser olarak düşüyor, sunucu 403 dönse de geri gelmiyor (TB:293-296). `isShared` için arayüz yok. Sil butonu yalnızca hover'da görünüyor. |
| 30 | Toplu işlem çubuğu (durum/öncelik/ata/arşiv/sil) | KISMİ | TB:798-834 | **Toplu sil onay istemeden** kalıcı `deleteMany` çalıştırıyor (satır 829 → `bulk/route.ts:41-42`). |
| 31 | "Bu Hafta" KPI kartı (sayaç + halka + 6 haftalık sparkline) | KISMİ | TB:839-866; `app/api/admin/team/trend/route.ts:26-29` | Trend sorgusu arşivlenmiş görevleri de sayıyor, pano saymıyor. Bu haftanın yüzdesi iki yerde farklı çıkabiliyor. |
| 32 | Durum dağılımı donut | ÇALIŞIYOR | TB:869-874 | |
| 33 | Kişi başı yük bar grafiği | ÇALIŞIYOR | TB:877-886 | Üye, tüm ekibin iş yükünü görüyor (veri kapsamı kararı yok). |
| 34 | Haftalık tempo alan grafiği | ÇALIŞIYOR | TB:890-909 | |
| 35 | Yükleniyor iskeleti | KISMİ | TB:912-934 | 4 kolon yerine 3 iskelet kolonu var. Her filtre ve kayıt sonrası tüm pano iskelete dönüyor (titreme). |
| 36 | Kanban sürükle-bırak (yönetici, masaüstü) | ÇALIŞIYOR | TB:966-999 | Klavye alternatifi yok, "Taşı" menüsü masaüstünde gizli (`lg:hidden`, satır 1149). |
| 37 | Kart içeriği (öncelik, tekrar, süre, departman, avatar, etiket, meta sayaçları) | ÇALIŞIYOR | TB:1016-1086 | |
| 38 | Bitiş tarihi geri sayım rozeti | KISMİ | TB:104-116; oluşturma TB:439 | Tarih UTC gece yarısı olarak kaydediliyor. Sunucu, bitiş gününün **kendisini** gecikmiş sayıyor (bkz. Bulgu Y5). |
| 39 | Üye "Başla" | ÇALIŞIYOR | TB:1094-1104 | |
| 40 | Üye "Onaya gönder" + kanıt zorunluluğu (PROOF_REQUIRED → detay açılır) | ÇALIŞIYOR | TB:1105-1114, 371-373; `tasks/route.ts:252-265` | |
| 41 | "Yönetici onayı bekleniyor" etiketi | ÇALIŞIYOR | TB:1115-1119 | |
| 42 | Yönetici "Onayla" | ÇALIŞIYOR | TB:1125-1132; `tasks/route.ts:236-276` | |
| 43 | Yönetici "Reddet" + red notu | KISMİ | TB:396-421 | Not `window.prompt` ile alınıyor. `reviewNote` **hiçbir arayüzde gösterilmiyor** (TB'de yalnızca tipte geçiyor, satır 51; TDS tipinde yok, satır 62-70). |
| 44 | Mobil "Taşı" popover | KISMİ | TB:1142-1170, 89-91 | Üye, onaylanmış (done) kendi görevini todo/in_progress/review'e geri alabiliyor. Sunucu buna izin veriyor (`tasks/route.ts:15,202`) ve onay damgaları siliniyor (satır 278-281). |
| 45 | Kart hover aksiyonları (kopyala/arşivle/sil) | KISMİ | TB:1174-1188, 467-470 | `opacity-0 group-hover` olduğu için dokunmatikte ve klavyede görünmüyor. **Sil onay istemiyor**, geri alma yok, hata yutuluyor. |
| 46 | Kolon boş durumu | ÇALIŞIYOR | TB:1193-1200 | |
| 47 | Liste görünümü | KISMİ | TB:1205-1246 | "Onayda" gri görünüyor (1217-1218). Boş durum metni üyeye "Yeni bir görev ekleyerek başla" diyor, oysa üye görev ekleyemez (1210). |
| 48 | Kişiler görünümü (yönetici) | ÇALIŞIYOR | TB:1247-1285 | |
| 49 | Takvim görünümü (7 gün + tarihsiz bölmesi) | KISMİ | TB:1521-1642 | "Onayda" gri görünüyor (1592). Tarihsiz görevlerde departman **üyeye de gösteriliyor** (1634); diğer yerlerde üyeden gizleniyor. |
| 50 | Dosyalar görünümü | KISMİ | `components/team/team-files.tsx:62-77`; `app/api/admin/team/files/route.ts:31-68` | Üye, şirketteki **tüm** görev eklerini (300 adede kadar) görüyor. Kapsam kararı yok. |
| 51 | Akış (yönetici) | ÇALIŞIYOR | TB:1297-1299; `activity/route.ts` (manager) | Yüzeysel doğrulandı. |
| 52 | Performans (yönetici) | ÇALIŞIYOR | TB:1300-1303; `performance/route.ts` (manager) | Yüzeysel doğrulandı. |
| 53 | Yeni görev diyaloğu (başlık, açıklama, öncelik, departman, atanan, "Bana ata", etiket, tarih, süre, tekrar) | ÇALIŞIYOR | TB:1306-1492 | |
| 54 | AI alt görev önerisi (modal) | ÇALIŞIYOR | TB:512-526, 1342-1361 | |
| 55 | AI ata (departman + kişi) | ÇALIŞIYOR | TB:497-511; `ai/route.ts:59-77` | Önerilen değerler listeyle doğrulanıyor. |
| 56 | Tekrar: "Her gün" | **SAHTE** | Seçenek: TB:1476. Cron: `app/api/internal/inngest/team-daily-maintenance/route.ts:41-42` | `daily` de +1 hafta klonlanıyor. Günlük tekrar yok. |
| 57 | Tekrar: haftalık/aylık | KISMİ | `team-daily-maintenance/route.ts:29-58` | Yalnızca `weekKey = bu hafta` ve `done` olanlar klonlanıyor. Pazar 06:00 UTC'den sonra tamamlanan görev ertesi gün "geçen hafta"da kaldığı için **hiç klonlanmıyor**. "Aylık" = +4 hafta. |
| 58 | Hafta %100 havai fişeği | KISMİ | TB:343-353 | Filtreye bağlı: "Durum = Bitti" filtresi seçilince her seferinde tetikleniyor. %100'lük geçmiş bir haftaya her dönüşte yeniden patlıyor. Reduced-motion'a uymuyor. |
| 59 | Görev bitti yıldız + ses + titreşim | KISMİ | TB:424-428 | Kod yorumu "reduce-motion'a saygılı" diyor, ama yalnızca ses susuyor (`lib/game-sounds.ts:10-13`). Konfeti (`components/providers/confetti-provider.tsx:52-86`) ve `navigator.vibrate` koşulsuz çalışıyor. |
| 60 | Derin bağlantı `?task=` | KISMİ | TB:186-190, 242-247; TDS:211-222, 325 | Geçersiz veya erişilemeyen id verilince `json.success=false` olur ama `task` null kalır, panel **sonsuz iskelette** asılı kalıyor. Bildirim linkleri role göre seçilmiyor (Bulgu Y3). |
| 61 | Detay başlığı (durum/öncelik/departman/atanan/oluşturan) | KISMİ | TDS:345-367 | Departman ham slug olarak görünüyor ve üyeye de gösteriliyor (351). |
| 62 | Zaman takibi "Süre ekle" | **BOZUK** (üye) | TDS:285-290, 381-385 → `tasks/route.ts:195-200` | Üyenin PUT isteğinde yalnızca `status` alanına izin var, `spentMin` 403 alıyor. Zaman kaydı, işi yapan kişi için çalışmıyor. |
| 63 | Bağımlılık seçici (yönetici) | ÇALIŞIYOR | TDS:388-417; `tasks/route.ts:223-235` | Yalnızca o haftanın ilk 50 görevi seçilebiliyor. Döngü koruması yalnızca A↔B için var (A→B→C→A korunmuyor). |
| 64 | Checklist ekle/işaretle/sil | KISMİ | TDS:224-231, 436-481 | `act()` yanıtı kontrol etmiyor. Başkasının görevinde 403 **sessizce yutuluyor**. Sil butonu yalnızca hover'da görünüyor. |
| 65 | Checklist madde ataması | KISMİ | TDS:447-468 | Üyeye de gösteriliyor. Kendi görevi dışında sessizce başarısız oluyor. |
| 66 | AI öner (detay, doğrudan ekler) | KISMİ | TDS:300-316; `tasks/[id]/route.ts:79-80` | N madde paralel ekleniyor, `order = count()` yarış koşulu yüzünden aynı sıra numaraları oluşuyor. Her `act` panoyu ve detayı yeniden yüklüyor (N×2 istek). |
| 67 | Dosya eki yükleme (tıkla/sürükle, ilerleme çubuğu) | KISMİ | TDS:128-151, 533-561; `attachments/route.ts:10,138-139` | UI ve sunucu "max 50MB" diyor, hata mesajı ise "8MB" diyor. Vercel fonksiyon gövde sınırı (~4.5 MB) nedeniyle büyük dosyalar canlıda büyük olasılıkla 413 alıyor (**canlıda doğrulanmadı**). |
| 68 | Ek önizleme/indir/sil | KISMİ | TDS:492-530, 153-158 | Sil işleminde onay ve hata yönetimi yok. Ekler R2 public URL'den sunuluyor (yetkisiz erişilebilir). |
| 69 | Yorum + yanıt (thread) + @mention + yoruma dosya | KISMİ | TDS:257-268; `tasks/[id]/route.ts:94-125` | Gönderim beklenmiyor: girdi istekten önce temizleniyor, hata yutuluyor, metin kayboluyor. Mention mail ve bildirimi `after()` dışında. `attachmentPath` serbest metin olarak kabul ediliyor (dış link enjeksiyonu). |
| 70 | Yorum düzenle/sil | KISMİ | TDS:638-639 | Butonlar herkese gösteriliyor. Sunucu yalnızca yazarın düzenlemesine izin veriyor (`[id]/route.ts:127-135`), diğerlerinde sessiz başarısızlık. |
| 71 | Emoji reaksiyon | ÇALIŞIYOR | TDS:609-632; `[id]/route.ts:148-161` | Ekleme butonu yalnızca hover'da görünüyor. |
| 72 | Aktivite zaman tüneli | KISMİ | TDS:94-97, 722-753 | Saatler **UTC** (`getUTCHours`) gösteriliyor, Türkiye'deki kullanıcı 3 saat geri görüyor. |
| 73 | Red notunun (reviewNote) gösterimi | EKSİK | TDS:62-70 (tipte yok) | Üye, düzeltmesi gerekeni yalnızca bildirimden görebiliyor. |
| 74 | Detay panelinde durum aksiyonu ("Onaya gönder", "Onayla") | EKSİK | TDS'de durum değiştiren kontrol yok | Kanıt eksik olunca panel açılıyor, kullanıcı not ekliyor, sonra paneli kapatıp karttaki butona yeniden basmak zorunda kalıyor. |
| 75 | Önceki haftadan devreden açık/gecikmiş görevler | EKSİK | `tasks/route.ts:55` (sıkı `weekKey` filtresi); bakım cron'unda devir yok | Pazartesi biten olmayan işler panodan kayboluyor. |
| 76 | Canlı güncelleme / odakta yenileme | EKSİK | TB:237-239 yalnızca mount ve filtre değişiminde | Başkasının değişikliği sayfa yenilenmeden görünmüyor. |
| 77 | Hata durumu ekranı (pano yüklenemedi) | EKSİK | TB:227-233 | `json.success=false` (ör. 403) olduğunda hiçbir şey gösterilmiyor. Yalnızca ağ hatası toast'u var. |
| 78 | Klavye ile görev kartını açma | EKSİK | TB:1016 (`div onClick`, `tabIndex` ve `role` yok) | |

**Sayım:** ÇALIŞIYOR 37 · KISMİ 31 · BOZUK 2 · SAHTE 2 · EKSİK 6 → **78 özellik**.

---

## Bulgular (önem sırasına göre)

### K1 · KRİTİK · Güvenlik/Yetki: Ekipten çıkarılan kişinin erişimi, oturumdaki bayat role düşerek açık kalıyor (fail-open)
- **Kanıt:** `lib/team-access.ts:15,21`: `const teamRole = user?.adminTeamRole ?? sessionRole;` · JWT'de `adminTeamRole` yalnızca girişte yazılıyor: `lib/auth.ts:252` · Üye çıkarma: `app/api/admin/team/members/route.ts:150` (`adminTeamRole: null`).
- **Sorun:** Yönetici bir stajyeri ekipten çıkardığında DB'deki değer `null` oluyor, `??` operatörü JWT'deki eski `'uye'` değerine düşüyor. Kişinin oturumu sürdükçe (`maxAge`) tüm `/api/admin/team/*` okuma uçlarına erişimi devam ediyor: görev listesi, dosyalar (public R2 linkleriyle), AI Q&A ve üye e-postaları. Layout kapısı (`layout.tsx:21`) yalnızca DB'ye baktığı için sayfa yönlendirmesi doğru çalışıyor ve bu durum sorunu gizliyor. API, hesap silinmiş olsa bile (`user` null) oturuma güveniyor.
- **Öneri:** Yetki kaynağı tek olmalı: DB. `teamRole = user?.adminTeamRole ?? null` yazılmalı, `user` yoksa 401 dönülmeli. Token-replay için kullanılan "Redis sıcak katman + DB doğruluk" deseni burada da uygulanabilir: `team-role:{userId}` 60 sn TTL ile tutulur, üye çıkarma ve rol değişiminde anahtar silinir. Ek olarak `members` DELETE ve PUT işlemleri, kullanıcının oturum sürümünü (`sessionVersion`) artırıp JWT'yi geçersiz kılmalı.
- **Efor:** S

### K2 · KRİTİK · Veri bütünlüğü: Görevi oluşturan kullanıcı silinince şirketin görevleri cascade ile siliniyor
- **Kanıt:** `prisma/schema.prisma:2900`: `createdBy User @relation("CompanyTaskCreator", …, onDelete: Cascade)`.
- **Sorun:** Bir yönetici veya ADMIN hesabı silindiğinde (KVKK silme talebi, hesap temizliği, test hesabı silme) onun oluşturduğu **tüm** `CompanyTask` kayıtları silinir. Bunlara başkasına atanmış ve devam eden işler, tüm checklist, yorum ve ekler (alt tablolar da cascade) dahildir. Otomatik görevlerde `createdById` görevi tetikleyen yöneticidir, yani etki alanı geniştir.
- **Öneri:** `createdById` nullable yapılmalı ve `onDelete: SetNull` kullanılmalı (veya silinen kullanıcı için "Eski üye" sistem kullanıcısına devredilmeli). Göç sırasında canlı Neon üzerinde `prisma migrate` planı gerekir. Aynı denetim `TaskComment.author` ve `TaskAttachment.uploadedBy` ilişkileri için de yapılmalı (bu raporda doğrulanmadı).
- **Efor:** M

### Y1 · YÜKSEK · İşlevsellik: Asıl kitle olan üye için iki ana özellik bozuk
- **Kanıt:** AI Özet butonu koşulsuz: TB:669. API `requireTeamAccess({ manager: true })`: `app/api/admin/team/ai/route.ts:30`. Süre ekle: TDS:285-290 → PUT `spentMin`. Üye kısıtı: `app/api/admin/team/tasks/route.ts:195-200`.
- **Sorun:** `/customer/ekip` sayfasının birincil kullanıcısı üyedir (yöneticiler çoğunlukla `/admin/ekip` kullanır). Üye "AI Özet"e her bastığında 403 metnini görüyor. Zaman takibi, yani işi yapan kişinin kendi süresini girmesi, hiç çalışmıyor. Bu yüzden Performans panelindeki "tahmini ve harcanan" raporu fiilen boş kalıyor.
- **Öneri:** (a) Rol-yetenek matrisi tek bir yerde tanımlanmalı (`lib/team-permissions.ts`: `can(role, 'ai.summary')`). UI butonları ve API kapıları aynı matristen okumalı. (b) Üye için ayrı bir "zaman kaydı" işlemi eklenmeli: `POST /tasks/[id] { op: 'log_time', minutes }`. Bu işlem yalnızca atanan kişiye açık olmalı, `TaskTimeEntry` (userId, minutes, note, createdAt) tablosuna yazmalı, `spentMin` değerini toplam olarak güncellemeli. Böylece kim ne kadar çalıştı izlenebilir ve geri alınabilir. (c) AI Özet üyeye açılacaksa kapsamı "benim haftam" olmalı.
- **Efor:** M

### Y2 · YÜKSEK · UX/Veri modeli: Haftalık pano, biten olmayan işleri yeni haftaya taşımıyor
- **Kanıt:** `tasks/route.ts:55` (`where.weekKey = week`). `team-daily-maintenance/route.ts` yalnızca tekrar, otomatik onay ve deadline işliyor, devir yok. Kanban hafta değişince sıfırlanıyor: TB:126, 214-235.
- **Sorun:** Pazartesi sabahı üye panoyu açtığında geçen haftanın "Devam Ediyor" ve gecikmiş görevleri yok. Eski haftaya dönmek dışında görme yolu yok. "Benim Görevlerim" de hafta kapsamlı. Bu durum hem gerçek iş yükünü gizliyor hem de KPI'ları yanıltıyor (bu hafta %100, geçen hafta %40 açık kalmış olabilir).
- **Öneri:** Hafta, bir **filtre** olmalı, panonun **sınırı** olmamalı. İki seçenek var: (1) Haftalık bakım cron'u her pazartesi `status != done && archivedAt null` olan görevlerin `weekKey` değerini yeni haftaya taşır, `carriedOverCount` sayacını artırır ve kartta "↻ 2. hafta" rozeti gösterir. (2) Daha doğrusu: pano varsayılanı "Açık işler (tüm haftalar) + bu hafta biten" olur. Sorgu `OR: [{ status: { not: 'done' } }, { weekKey: current }]` biçiminde kurulur. Haftalık görünüm ayrı bir "Sprint" sekmesine taşınır.
- **Efor:** M

### Y3 · YÜKSEK · Mimari: Bildirim derin bağlantıları rolü dikkate almıyor, linkler kopuyor
- **Kanıt:** `lib/team-notify.ts:84,110,179` (`/admin/ekip?task=`) ve `:129,142,155,193` (`/customer/ekip?task=`). Proxy, rol-yol uyumsuzluğunda ana panele yönlendiriyor: `proxy.ts:59-70`.
- **Sorun:** "yonetici" rolündeki CUSTOMER kullanıcıya giden "Onay bekliyor" bildirimi `/admin/ekip` adresine gidiyor, proxy onu `/customer` adresine atıyor ve görev açılmıyor. "Otomatik onaylandı" bildirimi üyeye de `/admin/ekip` linkiyle gidiyor. Tersine, ADMIN'e giden atama ve mention linkleri `/customer/ekip` adresine gidiyor ve `/admin`'e düşüyor. Onay akışının en kritik anı (yöneticinin onay kuyruğuna gitmesi) kırık.
- **Öneri:** Bildirim verisine href yerine **mantıksal hedef** yazılmalı: `{ kind, taskId }`. Href, istemcide veya `createNotification` içinde alıcının rolüne göre çözülmeli (`teamTaskHref(user)`). Uzun vadede iki panel tek bir `/ekip` rotasında birleşince sorun kökten kalkar (bkz. Çakışmalar).
- **Efor:** S

### Y4 · YÜKSEK · Güvenlik/Veri kapsamı: Üye, şirketin tüm görevlerini, dosyalarını ve iş yükünü görüyor; "gizleme" yalnızca UI'da
- **Kanıt:** `tasks/route.ts:39-96` (üye için kapsam filtresi yok, `?department=` ile her departmanı çekebiliyor). `files/route.ts:31-68`. `ai-qa/route.ts:39-66` (300 görev ve tüm üyeler LLM bağlamında). UI'daki gizleme: TB:622-633, 1038.
- **Sorun:** Kodda "üye tüm departmanları görmemeli" deniyor (TB:622) ama bu yalnızca bir dropdown'u gizliyor. Stajyerler, olay (Incident) kaynaklı görevleri (müşteri şikâyeti içerikleri, `lib/team-autotask.ts`) ve finans/hukuk departmanının dosyalarını görebiliyor. Bilinçli bir şeffaflık kararıysa UI tutarsız. Değilse bu bir veri sızıntısı.
- **Öneri:** Ürün kararı açıkça verilmeli ve sunucuda uygulanmalı. Önerilen model: üye = kendi görevleri + kendi departmanlarının görevleri (`teamDepartments` junction zaten var) + kendisinin mention edildiği görevler. Bunun için `buildTaskScope(auth)` adlı tek bir yardımcı yazılmalı; tasks, files, trend ve ai-qa uçları bu kapsamı kullanmalı. Departmanlar arası görünürlük `Department.visibility` ile yönetilmeli.
- **Efor:** M

### Y5 · YÜKSEK · Doğruluk: Bitiş tarihi "günün başı" olarak kaydediliyor; görev son gün sabahı gecikmiş sayılıp otomatik onaylanıyor
- **Kanıt:** Oluşturma TB:439 (`new Date('YYYY-MM-DD')`, UTC 00:00). Otomatik onay `dueAt < now`: `team-daily-maintenance/route.ts:65-70` (cron 06:00 UTC). Deadline "süresi doldu" bildirimi: `:102-115`. İstemci rozeti ise yerel gün başına göre "BUGÜN" diyor: TB:109-113.
- **Sorun:** Bitiş tarihi 10 Ekim olan ve onayda bekleyen bir görev, 10 Ekim 09:00 (TR) cron'unda "bitiş tarihi geçti" denerek otomatik onaylanıyor. Aynı sabah üyeye "⏰ Görev süresi doldu" bildirimi gidiyor, kart ise "BUGÜN" yazıyor. Liste görünümü (TB:1230) aynı gün kırmızı gösteriyor. Kullanıcıya üç farklı gerçek sunuluyor.
- **Öneri:** `dueAt` değeri "gün sonu, Europe/Istanbul" olarak normalize edilmeli: sunucuda `endOfDayIstanbul(date)`. Ya da `dueDate` (DATE tipi) ile isteğe bağlı `dueTime` alanları ayrılmalı. Tüm karşılaştırmalar tek bir yardımcıdan (`lib/team-due.ts`) geçmeli. Mevcut kayıtlar için +20:59 UTC düzeltmesi yapan göç betiği yazılmalı (canlı DB, dikkatli uygulanmalı).
- **Efor:** M

### Y6 · YÜKSEK · Bildirim spam'i: Gecikmiş her görev için her gün, süresiz bildirim gidiyor
- **Kanıt:** `team-daily-maintenance/route.ts:101-115` (`dueAt <= now+36h`, alt sınır yok, `archivedAt` filtresi yok). `lib/team-notify.ts:185-195` (tekilleştirme yok). Şemada `dueReminderSentAt` alanı var (`schema.prisma`, CompanyTask) ama bu döngüde kullanılmıyor.
- **Sorun:** Üç hafta önce gecikmiş ve arşivlenmiş bir görev bile her sabah "⏰ Görev süresi doldu" bildirimi ve push üretiyor. Bildirim yorgunluğu, ekip üyelerinin bildirimleri (dolayısıyla onay ve red bildirimlerini de) kapatmasına yol açar.
- **Öneri:** "Yaklaşıyor" bildirimi bir kez (`dueReminderSentAt`) gönderilmeli. "Gecikti" bildirimi bir kez gönderilmeli, sonra haftalık özete dahil edilmeli (`overdueNotifiedAt`). Sorgu `archivedAt: null` ile sınırlandırılmalı.
- **Efor:** S

### Y7 · YÜKSEK · Erişilebilirlik/Mobil: Temel aksiyonlar yalnızca hover ile görünüyor, kart klavyeyle açılamıyor
- **Kanıt:** Kart aksiyonları TB:1175 (`opacity-0 group-hover:opacity-100`). Yorum aksiyonları TDS:620. Checklist sil TDS:469. Atama "+" TDS:453. Görünüm silme TB:790. Kart açma TB:1016 (`div onClick`). Masaüstü taşıma yalnızca fareyle sürükleme: TB:997, 1149 (`lg:hidden`).
- **Sorun:** Dokunmatik cihazlarda yönetici kartı kopyalayamıyor, arşivleyemiyor, silemiyor. Üye yorumu yanıtlayamıyor, emoji ekleyemiyor, düzenleyemiyor. Klavye kullanıcısı Tab ile kartlara ulaşamıyor, masaüstünde görevi taşıyamıyor. WCAG 2.1.1 (Klavye) ve 2.5 (Giriş yöntemleri) ihlali.
- **Öneri:** Kart `<button>` veya `role="button" tabIndex=0` olmalı (Enter/Space detayı açar). Hover aksiyonları tek bir "⋯" menüsünde toplanmalı (her zaman görünür, `DropdownMenu`). İçinde Taşı, Kopyala, Arşivle ve Sil olmalı; Taşı tüm ekranlarda erişilebilmeli. Yorum aksiyonları mobilde her zaman görünmeli (`[@media(hover:none)]:opacity-100`) ya da uzun basma menüsüne taşınmalı. Sürükle-bırak için `@dnd-kit` ile klavye sensörü (Space ile tut, ok tuşlarıyla taşı) kullanılmalı.
- **Efor:** M

### O1 · ORTA · Hata yönetimi: Detay paneli işlemleri sessizce başarısız oluyor, yorum metni kayboluyor
- **Kanıt:** TDS:224-231 (`act`, `res.ok` kontrol edilmiyor). TDS:257-268 (input istekten önce temizleniyor). TDS:153-158 (ek silme). TB:467-470 (görev silme). Sunucu ret noktaları: `tasks/[id]/route.ts:66-68,127-135,138-144`.
- **Sorun:** Üye başkasının görevine yorum yazıyor, input temizleniyor, yorum görünmüyor, bir hata da gösterilmiyor. Düzenleme ve silme butonları herkese görünüyor ama sunucu reddediyor. Ağ koptuğunda uzun bir yorum geri alınamaz şekilde kayboluyor.
- **Öneri:** `useTaskMutation` adlı tek bir hook yazılmalı: iyimser güncelleme, hata durumunda geri alma, sunucunun `error` metnini toast olarak gösterme ve girdiyi geri yükleme. UI kontrolleri yetki matrisine (Y1) göre gösterilmeli: `canComment(task)`, `canEditComment(c)`. SWR veya React Query'ye geçilirse `mutate` ile bu desen hazır gelir.
- **Efor:** M

### O2 · ORTA · Doğruluk: "Önceliğe göre" sıralama ters (alfabetik)
- **Kanıt:** `tasks/route.ts:74` (`priority: 'desc'`), varsayılan sıra `:81`. Şemada `priority String`.
- **Sorun:** String desc sırası `medium > low > high` olduğu için "Yüksek" öncelikli işler en sona düşüyor. Liste görünümünde ve varsayılan sırada da etkili.
- **Öneri:** `priorityRank Int` (high=3) alanı eklenip onunla sıralanmalı, ya da Prisma `enum TaskPriority` ile `CASE` kullanan `$queryRaw` yazılmalı. En temiz yol: status ve priority alanlarını Prisma enum'a çevirmek (tip güvenliği de kazanılır).
- **Efor:** S

### O3 · ORTA · Onay akışı bütünlüğü: Üye onaylanmış görevi geri alabiliyor; otomasyon onayı atlayabiliyor
- **Kanıt:** `tasks/route.ts:15,201-204` (`done` → `todo/in_progress/review` geçişine üye için izin var). `:278-281` (onay damgaları siliniyor). TB:89-91, 1142-1170 (UI bu hedefleri sunuyor). `lib/team-automation-engine.ts:110-119` (`set_status=done`; `approvedBy` ve kanıt kontrolü yok).
- **Sorun:** Onaylanmış bir görevi üye "Onayda"ya geri çekip yeniden gönderebiliyor. Bu, yöneticilere yinelenen "Onay bekliyor" bildirimi düşürüyor ve onay geçmişini siliyor. Bir yönetici "review olunca done yap" otomasyonu kurarsa onay akışı tümüyle devre dışı kalıyor.
- **Öneri:** Durum geçişleri tek bir **durum makinesi** olarak tanımlanmalı (`lib/team-task-fsm.ts`: `canTransition(from, to, role)`). PUT, bulk ve otomasyon motoru bunu kullanmalı. Üye için `done → *` yasak olmalı. Otomasyonda `done` hedefi kaldırılmalı ya da `approvedBy: system` ve kanıt kontrolüyle sınırlanmalı.
- **Efor:** S

### O4 · ORTA · Sahte seçenekler: "Her gün" tekrarı ve iki otomasyon tetiği hiç çalışmıyor; tekrar klonlama bazı görevleri kaçırıyor
- **Kanıt:** TB:1476 ve `team-daily-maintenance/route.ts:41-42`. `automations-dialog.tsx:21` ve `tasks/route.ts:360-373`. Kaçırma: `team-daily-maintenance/route.ts:29-30` (`weekKey: thisWeek`).
- **Sorun:** Kullanıcı "Her gün" seçiyor, görev haftada bir doğuyor. "Görev oluşunca" ve "Gecikince" kuralları kaydediliyor ama hiç tetiklenmiyor. Pazar günü 06:00 UTC'den sonra biten haftalık görev bir sonraki çalışmada "geçen hafta"da kaldığı için tekrar zinciri kırılıyor.
- **Öneri:** Gerçeklenmeyen seçenekler hemen kaldırılmalı. Tekrar mantığı `weekKey` yerine `completedAt` ve `nextOccurrenceAt` alanlarına dayanmalı: tamamlanınca bir sonraki tarih hesaplanır, cron `nextOccurrenceAt <= now` olanları üretir (idempotent). `created` tetiği POST, şablon ve autotask yollarına eklenmeli. `overdue` tetiği bakım cron'una eklenmeli. Hepsi `after()` içinde çalışmalı.
- **Efor:** M

### O5 · ORTA · Güvenilirlik: Fire-and-forget yan etkiler `after()` dışında
- **Kanıt:** `tasks/route.ts:361-372` (otomasyon motoru). `tasks/[id]/route.ts:113-124` (mention e-posta ve bildirim).
- **Sorun:** Serverless ortamda yanıt döndükten sonra süreç dondurulabilir, mention e-postaları ve otomasyonlar ara ara kaybolur. Projede bu tuzak daha önce feedback akışında yaşanmış ve `after()` ile çözülmüştü.
- **Öneri:** Tamamı `after(() => …)` içine alınmalı. Kritik olanlar (mention) Inngest olayına (`team/comment.mentioned`) taşınmalı ki yeniden denensin.
- **Efor:** S

### O6 · ORTA · UX: Red notu hiçbir yerde görünmüyor; detay panelinden durum ilerletilemiyor
- **Kanıt:** `reviewNote` yalnızca tipte: TB:51. TDS tipinde yok: TDS:62-70. Kanıt eksikliğinde detay açılıyor: TB:371-373. TDS'de durum kontrolü yok.
- **Sorun:** Revizyona dönen üye neyi düzelteceğini panoda göremiyor. Kanıt eklemek için açılan panelde "Onaya gönder" butonu yok, bu da bağlam kopmasına yol açıyor.
- **Öneri:** Detay başlığına bir **onay durumu şeridi** eklenmeli: "↩️ Revizyon istendi: {reviewNote} — {yönetici}, {tarih}". Altında birincil aksiyon butonu olmalı (üye için "Onaya gönder", yönetici için "Onayla / Reddet"). Kanıt kontrolü canlı yapılmalı ("1 not ✓ · 0 dosya" ve buton etkinliği). Red notu `window.prompt` yerine bu panelde, satır içi bir `Textarea` ile alınmalı.
- **Efor:** M

### O7 · ORTA · Derin bağlantı: Geçersiz veya yetkisiz `?task=` sonsuz iskelete düşüyor
- **Kanıt:** TDS:211-222 (`json.success=false` dalı yok), TDS:325 (`loading || !task` → iskelet).
- **Sorun:** Silinmiş bir görevin bildirim linki ya da başka bir paylaşılan link, sonsuza kadar dönen bir iskelet gösteriyor. Kullanıcıya ne olduğu söylenmiyor.
- **Öneri:** `status: 'loading' | 'ready' | 'not_found' | 'forbidden'` durum makinesi kurulmalı. 404 ve 403 için `EmptyState` ("Bu görev silinmiş ya da erişimin yok") ve "Panoya dön" butonu gösterilmeli.
- **Efor:** S

### O8 · ORTA · Performans/Mimari: 1642 satırlık istemci bileşeni; tembel yükleme yok, her işlemde tüm pano yeniden çekiliyor
- **Kanıt:** TB tamamı. Eager import'lar TB:25-43 (5 diyalog, 4 grafik, Files/Activity/Performance). `motion` doğrudan import ediliyor: TB:14 (global LazyMotion strict değil: `components/providers.tsx:241`, bu yüzden tam framer paketi geliyor). Trend her `tasks.length` değişiminde yeniden çekiliyor: TB:239. `onChanged={loadTasks}`: TB:1499 (her checklist tikinde pano iskelete dönüyor: TB:215).
- **Sorun:** Üyeler, hiç göremeyecekleri yönetici diyaloglarının (Otomasyon, Şablon, Etiket, Performans) kodunu da indiriyor. Detay panelinde her tıklama arka plandaki panoyu iskelete düşürüp titretiyor. Bileşen test edilemez ve değiştirilmesi riskli.
- **Öneri:** Bileşen parçalanmalı: `BoardToolbar`, `BoardFilters`, `KanbanView`, `ListView`, `CalendarView`, `StatsStrip`, `NewTaskDialog`. Veri katmanı SWR/React Query'ye taşınmalı (`useTasks(filters)`, `keepPreviousData`, odakta yenileme). Yönetici diyalogları ve görünümleri `next/dynamic` ile yüklenmeli. `motion` yerine `m as Motion` kullanılmalı. Yenileme "sessiz" olmalı (iskelet yalnızca ilk yüklemede).
- **Efor:** L

### O9 · ORTA · Maliyet/Kötüye kullanım: AI Q&A ucunda hız sınırı yok
- **Kanıt:** `app/api/admin/team/ai-qa/route.ts:16-111` (rate limit yok). Her istek 300 görev ve tüm üyelerle LLM'e gidiyor (`:39-66`).
- **Sorun:** Herhangi bir ekip üyesi, kaba bir döngüyle Groq/OpenAI kotasını tüketebilir. İstek başına bağlam büyük.
- **Öneri:** Projede mevcut olan Upstash rate-limit deseniyle (kullanıcı başına 20 istek/saat) sınırlandırılmalı. Bağlam Y4'teki kapsam yardımcısıyla daraltılmalı. Aynı soru ve veri özeti için 5 dakikalık Redis önbelleği eklenmeli.
- **Efor:** S

### O10 · ORTA · Dosya yükleme vaadi platformla çelişiyor
- **Kanıt:** TDS:559 ("max 50MB"). `attachments/route.ts:10` (`50 * 1024 * 1024`). Hata metni `:138-139` ("8MB altında olmalı"). Yükleme, route handler'a `FormData` ile gidiyor (`:132`).
- **Sorun:** Vercel fonksiyon gövde sınırı (~4.5 MB) yüzünden 5–50 MB arası video ve PDF'lerin canlıda başarısız olması çok olası (**canlıda doğrulanmadı**). Hata metni de yanlış sınırı söylüyor. Ekler public R2 URL'sinden sunuluyor; adı tahmin edilebilir (`slug-timestamp`).
- **Öneri:** R2 **presigned PUT** akışı kullanılmalı: istemci önce `POST /attachments/sign` çağırır, R2'ye doğrudan yükler, sonra `POST /attachments/confirm` ile magic-byte doğrulaması yapılır (ilk 4 KB `GetObject Range` ile okunur). Özel bucket ve kısa ömürlü imzalı GET linkleri kullanılmalı. Sınır metinleri tek bir sabitten okunmalı.
- **Efor:** M

### D1 · DÜŞÜK · Görsel tutarlılık: "Onayda" durumu üç görünümde gri
- **Kanıt:** TB:947, 1217-1218, 1276, 1592, 1632 (yalnızca done/in_progress kontrol ediliyor, review slate'e düşüyor).
- **Öneri:** `STATUS_META` (renk, etiket, emoji) tek bir modülde tanımlanmalı ve bütün görünümler oradan okumalı. TDS:84-90'da doğru bir tablo zaten var, taşınıp paylaşılmalı.
- **Efor:** S

### D2 · DÜŞÜK · Saat ve dil: Aktivite ve yorum saatleri UTC; departman slug olarak görünüyor; hero'da slug
- **Kanıt:** TDS:94-97 (`getUTCHours`). TDS:351. TB:597. TB:1634.
- **Öneri:** Kullanıcı saat diliminde `Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul' })` ile göreli zaman ("2 sa önce") gösterilmeli. Hydration sorunu `suppressHydrationWarning` ya da istemci formatlayıcıyla çözülmeli. Departman adı `departments` sözlüğünden çözülmeli.
- **Efor:** S

### D3 · DÜŞÜK · Kutlama mantığı ve hareket
- **Kanıt:** TB:343-353 (filtreye bağlı %100 ve geçmiş haftada tekrar). `confetti-provider.tsx:52-86` (`disableForReducedMotion` yok). TB:349, 427 (koşulsuz `vibrate`). Sonsuz `pulse` animasyonları: TB:659, 1098, 1116.
- **Öneri:** Kutlama, filtre uygulanmamış **gerçek** hafta verisine ve bir olaya ("son görev şimdi onaylandı") bağlanmalı, yüzde eşiğine değil. Konfeti `disableForReducedMotion: true` ile çağrılmalı ve `reduce-animations` sınıfına uymalı. Titreşim `lib/game-sounds.ts`'deki haptic yardımcısından geçmeli. Sonsuz nabız yalnızca "yeni" öğede birkaç kez çalışıp durmalı.
- **Efor:** S

### D4 · DÜŞÜK · Yerel tarayıcı diyalogları ve onaysız yıkıcı işlemler
- **Kanıt:** `window.prompt` TB:268, 398-400. Onaysız silme TB:467-470, 829.
- **Öneri:** `AlertDialog` tabanlı onay ve 5 saniyelik "Geri al" toast'u kullanılmalı (soft-delete: silme yerine `archivedAt` ve 30 gün sonra temizlik). Görünüm adı ve red notu için satır içi popover formu kullanılmalı.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

> Görev metni müşteri paneli için Starbucks/Duolingo/Revolut/Spotify kıyasını öneriyor. Ancak bu sayfa bir **iç ekip aracı** olduğu için doğru kıyas Linear, Asana, Notion ve Trello'dur. Ekip motivasyonu tarafında Duolingo'nun seri ve haftalık hedef mekanikleri anlamlı bir kaynaktır.

1. **"Bugünüm / Odak" görünümü (Linear "My Issues", Asana "My Tasks"):** Üye açılışta kendi açık işlerini, gecikenleri, onayda bekleyenleri ve revizyon isteyenleri tek bir listede görmeli. Şu an şirketin tüm haftalık panosuyla karşılaşıyor.
2. **Devreden iş ve backlog (Linear cycles, Jira sprint carry-over):** Biten olmayan iş haftaya otomatik devretmeli. Haftaya atanmamış iş havuzu (backlog) olmalı.
3. **Gerçek zamanlı iş birliği (Trello, Notion):** Başkasının taşıdığı kart canlı olarak hareket etmeli. Odakta yenileme, presence ("Didar bu görevi görüntülüyor") ve yorumlarda canlı akış olmalı.
4. **Komut paleti ve klavye kısayolları (Linear `C`, `⌘K`):** Hızlı görev oluşturma, durum değiştirme ve atama klavyeden yapılabilmeli.
5. **Geri al ve soft-delete (Gmail/Linear "Undo"):** Yıkıcı işlemler 5 saniye geri alınabilir olmalı. Çöp kutusu 30 gün tutulmalı.
6. **Ekip motivasyonu (Duolingo):** Kişisel "bu hafta X görev onaylandı" serisi, zamanında teslim oranı ve haftalık ekip hedef halkası olmalı. Yıldız kutlaması rastgele değil, anlamlı bir olaya (onay) bağlanmalı. Mevcut platform puan ekonomisine **bağlanmamalı** (iç iş, tüketici puanı üretmemeli; ekonomi değişmezleriyle çelişir).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Ekip üyesi telefondan bildirime dokunur, doğrudan ilgili görevin detayına iner. Red notunu görür, kanıtını ekler, "Onaya gönder"e basar ve 10 saniyede işi biter. Yönetici sabah tek ekranda "Onay kuyruğu (3)", "Gecikenler (2)" ve "Bu haftanın ilerlemesi"ni görür ve kuyruğu klavyeyle (J/K, A=onayla, R=reddet) eritir.

**Yerleşim (rol bazlı iki varsayılan, aynı bileşen):**
- **Üye ana ekranı "Benim İşlerim":** Üstte üç sekmeli şerit: Yapılacaklar · Onayda · Revizyon istendi (rozet sayılı). Altında gecikenler kırmızı başlıklı gruptan başlar. Kart birincil aksiyonu tek bir büyük buton olur (Başla / Onaya gönder). Kanban, ikincil sekme olarak "Ekip panosu" altında kalır.
- **Yönetici ana ekranı:** Sol tarafta 280 px "Onay kuyruğu" paneli (kanıt önizlemesi: son yorum ve küçük ek görselleri; satır içi Onayla/Reddet). Sağda kanban veya liste. Üstte tek satır KPI şeridi (açık, geciken, onayda, bu hafta biten). Donut ve bar grafikleri ayrı bir "Rapor" sekmesine taşınır; şu an her açılışta ekranın üçte birini kaplıyorlar.
- **Araç çubuğu sadeleştirme:** Görünüm sekmeleri + arama + "Filtre" (tek popover: durum, öncelik, atanan, etiket, sırala, grupla) + "Görünümler" + birincil "Yeni görev". Otomasyon, Etiketler, Şablonlar, Otomatik, CSV ve Arşiv bir "⋯ Daha fazla" menüsüne toplanır. Mobilde araç çubuğu tek satıra iner, filtreler alt sayfada (bottom sheet) açılır.
- **Detay paneli:** Masaüstünde sağdan sheet, mobilde tam ekran. Başlıkta durum şeridi ve birincil aksiyon. Sekmeler: Ayrıntı · Alt görevler · Dosyalar · Yorumlar · Geçmiş. Yorum kutusu altta yapışkan, `safe-area` uyumlu.

**Motion ve 3D (yerinde ve ölçülü):**
- 3D yok. Bu bir verimlilik aracı, three.js burada maliyetten başka bir şey getirmez.
- Kart taşımada `layout` animasyonu kalmalı (zaten var). Sonsuz `pulse` ve parıltı efektleri kaldırılmalı; yalnızca yeni gelen onay öğesinde 2 nabız yeterli.
- Onay anında kart yeşile dönerek "Bitti" kolonuna akmalı, küçük bir yıldız patlaması eşlik etmeli (reduced-motion açıkken yalnızca renk geçişi). Hafta kutlaması gerçek veriye bağlı ve haftada bir kez olmalı.
- Global `MotionConfig reducedMotion="user"` (`components/providers.tsx:232`) zaten var. Konfeti ve titreşim de bu ayara bağlanmalı.

**Veri ve API değişiklikleri:**
1. Yetki: `requireTeamAccess` yalnızca DB'ye bakmalı (K1). Tek yetenek matrisi `lib/team-permissions.ts` yazılmalı, UI ve API onu kullanmalı (Y1).
2. Kapsam: `buildTaskScope(auth)` ile tasks, files, trend ve ai-qa uçları rol ve departmana göre sınırlanmalı (Y4).
3. Durum makinesi: `lib/team-task-fsm.ts` PUT, bulk, otomasyon ve cron tarafından kullanılmalı (O3).
4. Şema: `createdById` → SetNull (K2). `status` ve `priority` → Prisma enum (O2). `TaskTimeEntry` modeli (Y1). `dueAt` gün sonu normalizasyonu (Y5). `overdueNotifiedAt` alanı (Y6). Tekrar için `nextOccurrenceAt` alanı (O4).
5. Uçlar: `GET /api/team/tasks?view=mine|board|review-queue` (rota `/api/admin/*` dışına taşınmalı, çünkü üyeler admin değil). `POST /api/team/tasks/[id]/time`. `POST /api/team/attachments/sign` ve `confirm` (O10).
6. İstemci: SWR/React Query + odakta yenileme. İkinci aşamada Upstash Redis pub/sub veya Pusher/Ably ile kart olayları yayınlanabilir.
7. Bildirimler: alıcı rolüne göre çözülen hedefler (Y3), tekilleştirme (Y6), `after()` ve Inngest (O5).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/ekip` ile birebir kopya:** Aynı `TeamBoard` bileşeni yalnızca `basePath` farkıyla iki panelde render ediliyor (`app/customer/ekip/page.tsx:4`, `/admin/ekip`). Bu durum bildirim linki kopukluğunu (Y3), ölü ADMIN dalını (layout.tsx:21) ve "hangi panelde olduğumu bilmiyorum" hissini yaratıyor.
- **Müşteri kabuğuna yanlış yerleşim:** Sayfa, tüketici için tasarlanmış `customer-shell` içinde. Bu kabuk karşılama videosu, onboarding, doğum günü bonusu ve tüketici sidebar'ını taşıyor (`app/customer/layout.tsx:31-51`). Ekip üyesi stajyer, iş aracını oyunlaştırılmış tüketici kabuğunun içinde kullanıyor. Ekip üyeleri de dolaylı olarak "müşteri" metriklerine (aktif müşteri, DAU) karışıyor (**doğrulanmadı**, analitik tarafı ayrıca incelenmeli).
- **`/customer/ekip/departmanlar`:** Rol farkındalığı olmadan yönetici kontrollerini üyeye sunuyor (`components/team/team-departments.tsx`, UI'da `isManager` kontrolü yok). Ekip çalışma alanında yalnızca yöneticiye görünen bir "Ayarlar → Departmanlar ve Üyeler" sekmesine taşınmalı.
- **Öneri: birleştir.** İki rota tek bir **`/ekip`** (veya `/workspace`) segmentinde birleştirilmeli. Bu segmentin kendi layout'u (sade iş aracı kabuğu) ve kendi erişim kapısı (`requireTeamAccess`, DB doğrulamalı) olmalı. Proxy'ye `/ekip` için "rol değil ekip rolü" kuralı eklenmeli. Mevcut `/customer/ekip` ve `/admin/ekip` adresleri 308 ile `/ekip` adresine yönlendirilmeli (bildirim ve e-posta linkleri bozulmaz). Admin ve müşteri sidebar'larında aynı hedefe giden bir "Ekip" öğesi kalmalı. API, `/api/admin/team/*` yerine `/api/team/*` altına taşınmalı. Böylece "admin olmayan kullanıcı admin API'si çağırıyor" istisnası (proxy'nin `/api/*` için rol kontrolünü atladığı yer) ortadan kalkar.

---

## Doğrulama (şüpheci inceleme)

Her iddia çürütülmeye çalışılarak kod baştan okundu: `lib/team-access.ts`, `lib/api-auth.ts`, `lib/auth.ts` (jwt/session callback), `proxy.ts`, `app/customer/ekip/layout.tsx`, `app/api/admin/team/{tasks,members,automations}/route.ts`, `lib/team-automation-engine.ts`, `lib/team-notify.ts`, `app/api/internal/inngest/team-daily-maintenance/route.ts`, `lib/inngest/functions.ts`, `app/api/cron/daily/route.ts`, `vercel.json`, `prisma/schema.prisma` ve kullanıcı silme uçları. Kod değiştirilmedi, DB'ye dokunulmadı.

| # | İddia | Karar | Not |
|---|---|---|---|
| 1 | `requireTeamAccess` fail-open (bayat JWT rolü) | **DOĞRULANDI** (beklenenden ağır) | Aşağıda |
| 2 | `CompanyTask.createdBy` Cascade | **DOĞRULANDI** | Aşağıda |
| 3 | Üye onaylı görevi geri alıyor / otomasyon onayı atlıyor | **DOĞRULANDI** (önem: Orta) | Aşağıda |
| 4 | `dueAt` UTC 00:00, aynı gün otomatik onay | **DOĞRULANDI** (cron kısmı Inngest'e bağlı) | Aşağıda |
| 5 | Gecikmiş görev bildirimi tekilleştirilmemiş | **DOĞRULANDI** (canlı etki Inngest'e bağlı) | Aşağıda |

### 1. `requireTeamAccess` fail-open — DOĞRULANDI (önem yükseltilmeli)

- `lib/team-access.ts:21` `user?.adminTeamRole ?? sessionRole`: DB'de rol `null` ise (ekipten çıkarma: `members/route.ts:150`) veya kullanıcı satırı yoksa, JWT'deki değere düşülüyor.
- JWT'deki `adminTeamRole` yalnızca giriş anında yazılıyor (`lib/auth.ts:214-252`, `if (user)` bloğu). `trigger === 'update'` dalı (`:272-281`) bu alanı hiç yenilemiyor. `requireAuth` (`lib/api-auth.ts:52-80`) yalnızca rol listesi ve token-replay kontrol ediyor, DB'de kullanıcı varlığına veya ekip rolüne bakmıyor.
- `proxy.ts:105-119`: `/api/*` için yalnızca güvenlik/CORS başlığı ekleniyor, rol kontrolü yok. Tek kapı `requireTeamAccess`.
- `app/customer/ekip/layout.tsx` yalnızca DB'ye baktığı için sayfa yönlendirmesi doğru çalışıyor ve açık UI'dan görünmüyor.
- Oturum ömrü varsayılan 24 saat (`lib/auth.ts:31-39`), env ile uzatılabilir.
- **İddiadan ağır olan kısım:** Çıkarılan kişi **yönetici** ise, JWT'deki `'yonetici'` değeri `isManager = true` üretiyor (`team-access.ts:29`). Bu kişi oturum süresince `POST /api/admin/team/members` (`members/route.ts:54-84`, `manager: true`) ile **kendini yeniden `yonetici` olarak ekleyebilir**. Böylece 24 saatlik bayatlık kalıcı yetkiye dönüşür. Aynı pencerede görev silme (`tasks/route.ts:391-397`), otomasyon kurma ve üye çıkarma da açık.
- **Yeniden üretim:** (1) A kullanıcısı `yonetici` olarak giriş yapar. (2) Başka bir yönetici A'yı ekipten çıkarır (`DELETE /api/admin/team/members?id=A`). (3) A, aynı tarayıcıdan `/customer/ekip` sayfasına girmeye çalışınca `/customer`'a yönlendirilir. Ama DevTools'tan `fetch('/api/admin/team/members',{method:'POST',body:JSON.stringify({email:'A@…',teamRole:'yonetici'})})` 200 döner ve A ekibe geri döner. Aynı şekilde `GET /api/admin/team/tasks` tüm görevleri döndürür.
- **Öneri:** `requireTeamAccess` yalnızca DB'yi kaynak kabul etmeli: `const teamRole = user?.adminTeamRole ?? null;` ve `if (!user) return 401`. Rol değişikliğinde (members PUT/DELETE) kullanıcının aktif oturumlarını geçersiz kılmak için mevcut token-replay altyapısına (Redis sıcak katman + DB) "rol sürümü" (`authVersion` alanı) eklenmeli ve JWT callback her istekte bu sürümü karşılaştırmalı. Ek olarak kendini ekibe ekleme/rolünü yükseltme işlemleri (`id === auth.session.user.id`) engellenmeli.

### 2. `CompanyTask.createdBy` `onDelete: Cascade` — DOĞRULANDI

- `prisma/schema.prisma:2900`. Alt ilişkiler (checklist, comments, activities, attachments) görevle birlikte gidiyor.
- Gerçek silme yolları var: kullanıcının kendi hesabını silmesi `app/api/user/delete-account/route.ts:39` (CUSTOMER/DEALER/ADMIN, yani müşteri hesabıyla ekipte yönetici olan kişi de), admin tekil silme `app/api/admin/users/route.ts:676`, toplu silme `app/api/admin/users/bulk/route.ts:79`. Hiçbirinde ekip görevi için ön kontrol veya devir yok.
- Etki ek olarak: oluşturanın silinmesi, R2'deki ek dosyalarını sahipsiz bırakır (DB satırı gider, nesne kalır; **doğrulanmadı**, attachment silme kancası incelenmedi). Tekrarlayan görev klonlama (`team-daily-maintenance/route.ts:56`) da `createdById`'yi kopyaladığı için gelecekteki örnekler de aynı kişiye bağlanıyor.
- **Yeniden üretim:** Yönetici Y, stajyer S'ye 10 görev atar. Y, `/customer/ayarlar` üzerinden hesabını siler. S'nin panosundaki 10 görev, yorumları ve ekleriyle birlikte yok olur. Audit log'da yalnızca "user delete" kaydı kalır.
- **Öneri:** `createdById` → `String?` + `onDelete: SetNull` (göç: kolonu nullable yap). UI'da "Oluşturan: silinmiş kullanıcı" gösterimi. Hesap silme akışında ekip görevi olan kullanıcılar için "görevleri şu yöneticiye devret" adımı. Aynı desen `TaskTemplate` (`:2932`) ve `TeamAutomation` (`:3019`) için de uygulanmalı.

### 3. Onaylı görevin üye tarafından geri alınması / otomasyonun onayı atlaması — DOĞRULANDI (önem Orta)

- Üye kısıtı yalnızca **hedef** durumu kontrol ediyor (`tasks/route.ts:15, 201-204`), **kaynak** durumu kontrol etmiyor. `existing.status === 'done'` iken `done → review/in_progress/todo` serbest. UI de buna izin veriyor (`team-board.tsx:89-91`, `moveTargets` yalnızca `done` hedefini gizliyor).
- Geri alınca `approvedBy`/`approvedAt`/`completedAt` temizleniyor (`:278-286`). `done → review` geçişinde `movingToReview` true olduğu için yöneticilere yeni "onay bekliyor" bildirimi gidiyor (`:312-318`). Onay izi görev satırından siliniyor; `TaskActivity` ve `AuditLog` kayıtları kalıyor, bu yüzden "onay geçmişi tamamen siliniyor" ifadesi abartılı. Asıl kayıp: görev satırındaki "kim, ne zaman onayladı" bilgisi ve haftalık tekrar klonlamasının (`team-daily-maintenance/route.ts:30`, `status: 'done'`) kaçırılması.
- Otomasyon: `set_status` kuralları yalnızca yönetici tarafından yaratılabiliyor (`automations/route.ts:44`), yani "dışarıdan saldırı" değil. Ama `lib/team-automation-engine.ts:110-119` durum makinesini tamamen atlıyor: kanıt kontrolü yok, blocker kontrolü yok, `approvedBy/approvedAt` yazılmıyor, `done`'dan çıkışta onay izi temizlenmiyor. "review → done" kuralı varken üyenin `review`'e geçişi anında kendi kendini onaylaması demek ve "done = onaylanmış" değişmezi (`tasks/route.ts:270-272` yorumu) bozuluyor.
- **Yeniden üretim:** Üye U'nun görevi yönetici tarafından onaylanmış (`done`). U, mobil "taşı" menüsünden "Onayda"yı seçer. PUT 200 döner, `approvedById` null olur, tüm yöneticilere "onay bekliyor" bildirimi gider.
- **Öneri:** Tek bir durum makinesi (`lib/team-task-fsm.ts`): `canTransition(from, to, actor)` ve `applyTransition()` PUT, toplu işlem, otomasyon ve cron tarafından ortak kullanılmalı. Üye için `done` kaynaklı her geçiş kapalı olmalı (yalnızca yönetici "yeniden aç" diyebilmeli, gerekçe notu zorunlu). Otomasyon `set_status=done` aksiyonu ya kaldırılmalı ya da `applyTransition` üzerinden "sistem onayı" olarak (kanıt + blocker kontrolüyle) çalışmalı.

### 4. `dueAt` UTC gece yarısı — DOĞRULANDI (cron kısmı koşullu)

- `team-board.tsx:1450-1453` `type="date"` → `"YYYY-MM-DD"`. `:439` `new Date("YYYY-MM-DD")` ECMAScript gereği **UTC** 00:00 olarak ayrıştırılır, yani TR saatiyle bitiş gününün 03:00'ü.
- Cron'dan bağımsız, kesin etkiler: Liste görünümü `team-board.tsx:1228-1230` (`new Date(dueAt) < new Date()`) bitiş günü TR 03:00'ten itibaren görevi kırmızı/gecikmiş gösteriyor; aynı anda kanban rozeti `dueBadge` (`:104-116`, yerel gün başı) "BUGÜN" diyor. İki görünüm çelişiyor.
- Cron etkisi: `team-daily-maintenance/route.ts:67-95` `dueAt lt now` → bitiş günü 06:00 UTC'de (TR 09:00) `review` görevi yönetici onayı olmadan `done` yapılıyor. **Koşul:** bu rota yalnızca Inngest cron'u (`lib/inngest/functions.ts:98-104`, `0 6 * * *`) ile tetikleniyor; `vercel.json`'daki tek cron `/api/cron/daily` bu rotayı çağırmıyor (`app/api/cron/daily/route.ts:5-11`). Inngest'in prod'da kayıtlı/çalışır olup olmadığı koddan doğrulanamadı (bkz. `docs/audit/2026-10-08/sistem/arka-plan-sistemleri.md:127`). Inngest canlıysa bulgu tam olarak iddia edildiği gibi gerçekleşir.
- **Yeniden üretim:** 10 Ekim bitişli görev oluştur, üye 9 Ekim'de Onayda'ya göndersin. 10 Ekim TR 03:00'ten sonra Liste görünümü görevi gecikmiş gösterir; Inngest canlıysa TR 09:00'da görev "otomatik onaylandı" notuyla Bitti'ye geçer.
- **Öneri:** Bitiş tarihini "gün" olarak modelle: istemci `YYYY-MM-DD` göndersin, sunucu bunu `Europe/Istanbul` 23:59:59.999'a çevirsin (tek yardımcı `lib/team-dates.ts`: `endOfBusinessDay(dateStr, tz)`). Tüm "gecikti" karşılaştırmaları (liste, rozet, ai-qa, cron) aynı yardımcıyı kullansın. Otomatik onay ayrıca bir tolerans (ör. bitişten 24 saat sonra) ve kanıt kontrolüyle çalışmalı. Mevcut veriler için tek seferlik göç: saati tam 00:00:00Z olan `dueAt` değerleri TR gün sonuna kaydırılmalı.

### 5. Gecikmiş görev bildirimi tekilleştirilmemiş — DOĞRULANDI (canlı etki koşullu)

- `team-daily-maintenance/route.ts:107-124`: `status != done && dueAt <= now+36h`, alt sınır yok, `archivedAt` filtresi yok, `take: 1000`. Her çalışmada her görev için `notifyDeadline` çağrılıyor.
- `lib/team-notify.ts:185-195` → `createNotification` (`:18-60`) her çağrıda yeni `Notification` satırı yaratıyor ve push gönderiyor; tekilleştirme anahtarı yok. Yalnızca kullanıcının tercihlerinde `team-task-deadline` grubunu kapatması durduruyor; bu da onay/red gibi aynı gruptaki kritik bildirimleri susturma riski taşıyor (**grup eşlemesi doğrulanmadı**).
- `dueReminderSentAt` kullanılıyor ama yalnızca e-posta cron'unda (`app/api/cron/team-task-due/route.ts:51, 97`); in-app/push döngüsünde değil. Ek olarak "yaklaşıyor" penceresi 36 saat olduğu için bitiş tarihinden önce de iki gün üst üste bildirim gidebiliyor.
- **Koşul:** Bulgu 4'teki gibi yalnızca Inngest canlıysa çalışır.
- **Yeniden üretim:** Arşivlenmiş, bitiş tarihi 1 ay önce olan, `todo` durumundaki bir görev; her sabah atanan kişiye "Görev süresi doldu" bildirimi ve push üretir, arşivden çıkarılmadıkça veya `done` yapılmadıkça sonsuza dek.
- **Öneri:** Sorguya `archivedAt: null` eklenmeli. Şemaya `overdueNotifiedAt` (ve "yaklaşıyor" için `dueSoonNotifiedAt`) alanı eklenip tek seferlik bildirim garanti edilmeli; `dueAt` değişince bu alanlar sıfırlanmalı. Süresiz tekrar yerine kademeli hatırlatma (1., 3., 7. gün) ve yöneticiye tek bir "gecikmiş görev özeti" gönderilmeli. `createNotification` içine `(userId, kind, taskId, gün)` tekilleştirme anahtarı eklenmesi diğer tüm cron bildirimlerini de korur.
