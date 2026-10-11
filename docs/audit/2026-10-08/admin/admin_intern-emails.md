# /admin/intern-emails

**Amaç:** Stajyerlere (ve genel alıcılara) giden markalı mail şablonlarını tek ekranda yönetmek: şablon listesi, tür seçimi (görev / genel / hoş geldin / hatırlatma / minimal), içerik düzenleme, `{{değişken}}` kişiselleştirme, canlı HTML önizleme, test gönderimi, tekli ve toplu gerçek gönderim, alıcı bazında "gitti / açıldı / hata" takibi.

**Genel puan: 6/10** · **Karar: koru-iyileştir** (orta vadede `/admin/inbox` ile tek bir "Mail Merkezi" altında birleştirilmeli; bkz. son bölüm)

İncelenen dosyalar: `app/admin/intern-emails/page.tsx` (659 satır), `app/admin/layout.tsx`, `app/api/admin/intern-emails/route.ts`, `app/api/admin/intern-emails/preview/route.ts`, `app/api/track/email-open/[token]/route.ts`, `app/api/cron/intern-deadline/route.ts`, `app/api/cron/cleanup-counters/route.ts`, `lib/intern-task-emails.ts`, `lib/intern-email-kinds.ts`, `lib/intern-email-stats.ts`, `lib/mail-sender.ts`, `lib/admin-toast.ts`, `lib/mail-inbox.ts`, `prisma/schema.prisma` (`InternEmailSend`, `Settings`), `components/dashboard/sidebar.tsx`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 7/10 | Ana akış (düzenle → kaydet → test → gönder → açılma izle) uçtan uca gerçek ve çalışıyor; ancak "Test gönder"/"Yenile" kaydedilmemiş düzenlemeleri siliyor ve boş liste kaydı varsayılan şablonları geri diriltiyor. |
| UX | 6/10 | Onay modalı, dirty kilidi ve durum rozetleri düşünülmüş; fakat değişken ekleme imlece değil sona yazıyor, önizleme yeni sekmede, toplu gönderim "zaten gönderilmiş" alıcıları ayırt etmiyor, son teslim alanı serbest metin. |
| Görsel | 6/10 | shadcn kart + gradient modal tutarlı; ancak sağ panel uzun tek sütun form, hiyerarşi zayıf, mail önizlemesi sayfanın içinde hiç görünmüyor (yazdığını görmeden yazıyorsun). |
| Mimari | 5/10 | Tüm şablonlar tek bir `Settings` JSON satırında, tüm liste her kayıtta toptan PUT (son yazan kazanır), doğrulama şeması yok, gerçek kişi verileri kaynak kodda sabit; gönderim senkron HTTP isteği içinde döngüyle yapılıyor. |
| Performans | 6/10 | Sayfa hafif (framer/3B yok); ama GET her açılışta `InternEmailSend` tablosunun TAMAMINI limitsiz çekiyor ve toplu gönderim 60 sn `maxDuration` içinde sıralı + 800 ms bekleme ile çalışıyor. |
| Erişilebilirlik + mobil | 4/10 | `Label`'lar `Input`'lara bağlı değil, "Yeni" menüsü klavyeyle kullanılamıyor, seçim durumları `aria-*` ile bildirilmiyor; mobilde liste → editör geçişi kaydırma gerektiriyor ve önizleme pop-up'a bağlı. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa hero'su (başlık + açıklama) | ÇALIŞIYOR | `page.tsx:269-273` | Başlık "Stajyer Görev Mailleri"; artık genel/hoş geldin türleri de var, başlık kapsamı dar kalıyor. |
| 2 | Mail yapılandırması eksik uyarı bandı | ÇALIŞIYOR | `page.tsx:275-281`, `route.ts:68` (`isMailConfigured()`) | Gerçek env kontrolüne bağlı. |
| 3 | Şablon + istatistik yükleme (GET) | ÇALIŞIYOR | `page.tsx:75-94`, `route.ts:50-71` | Gerçek DB (`Settings` + `InternEmailSend`). |
| 4 | Yükleniyor iskeleti | ÇALIŞIYOR | `page.tsx:334-335` | Yalnız sol listede; sağ panelde iskelet yok, "Bir şablon seç" boş kartı yüklenirken de görünüyor (`page.tsx:587-589`). |
| 5 | Yükleme hata durumu | KISMİ | `page.tsx:86-88` | Yalnız toast; satır içi hata kartı / "tekrar dene" yok, liste boş kalıyor ve "Eşleşen şablon yok" yazıyor (yanıltıcı). |
| 6 | Departmana göre gruplama + departman emojisi | ÇALIŞIYOR | `page.tsx:98-107`, `49-58`, `342` | Emoji eşlemesi `lib/intern-task-emails.ts:497-507` ile kopya mantık. |
| 7 | Arama filtresi | ÇALIŞIYOR | `page.tsx:98-103`, `323-326` | Konu alanında da arıyor ama placeholder yalnız "isim, e-posta, departman" diyor. |
| 8 | Boş arama sonucu durumu | ÇALIŞIYOR | `page.tsx:336-337` | |
| 9 | Aynı isimli şablonlarda e-postayı gösterme | ÇALIŞIYOR | `page.tsx:109-113`, `349`, `361` | |
| 10 | Liste satırı durum ikonları (e-posta boş / hata / açıldı / bekliyor) | ÇALIŞIYOR | `page.tsx:363-373` | Yalnız `title` ile açıklanıyor; ekran okuyucuya ulaşmıyor. |
| 11 | Şablon türü emojisi satırda | ÇALIŞIYOR | `page.tsx:356-358` | `task` türünde gösterilmiyor (bilinçli). |
| 12 | "Yeni" tür seçim menüsü | KISMİ | `page.tsx:287-311` | Elle yazılmış açılır menü: Escape ile kapanmıyor, odak yönetimi yok, `role="menu"` yok; dış tıklama katmanı `aria-hidden` ama odaklanabilir `<button>` (`page.tsx:292`). shadcn `DropdownMenu` kullanılmalı. |
| 13 | Türe göre başlangıç içeriği | ÇALIŞIYOR | `page.tsx:214-232` | |
| 14 | "Toplu (N)" gönderim butonu | KISMİ | `page.tsx:312-319`, `114-118` | N = şablon sayısı, alıcı sayısı değil (bir şablonda 3 alıcı var: `lib/intern-task-emails.ts:222`); daha önce gönderilmiş alıcılar da yeniden gönderilir. |
| 15 | Değişiklikleri kaydet | KISMİ | `page.tsx:126-151`, `route.ts:74-96` | Boş e-posta/konu ön kontrolü iyi; ancak tüm şablonlar silinip kaydedilirse sunucu varsayılan 13 şablonu geri yazar (Bulgu 2); eşzamanlı düzenlemede son yazan kazanır. |
| 16 | Kaydedilmemiş değişiklik uyarısı | KISMİ | `page.tsx:572-577` | Yalnız sayfa içi uyarı; `beforeunload` / rota değişimi koruması yok, sekme kapanınca düzenleme kaybolur. |
| 17 | Gerçek gönderim özet paneli (gitti / açıldı / hata / son gönderim) | ÇALIŞIYOR | `page.tsx:388-409`, `lib/intern-email-stats.ts:43-82` | Tekrar gönderim açılma kanıtını silmiyor (iyi tasarım). |
| 18 | Alıcı bazlı durum satırları | ÇALIŞIYOR | `page.tsx:411-439` | Hata mesajı `title` + kesilmiş metin. Bu panelde "Yenile" yok. |
| 19 | Şablon türü chip seçici | ÇALIŞIYOR | `page.tsx:447-464` | `aria-pressed` yok. |
| 20 | Departman / Alıcı adı / E-posta / Konu alanları | KISMİ | `page.tsx:465-475` | E-posta formatı istemcide de sunucuda da doğrulanmıyor (`lib/intern-task-emails.ts:446`); `Label` → `Input` bağı (`htmlFor`/`id`) yok. |
| 21 | Son teslim tarihi alanı | KISMİ | `page.tsx:476-486`, `lib/intern-task-emails.ts:17`, `739-761` | Serbest metin; varsayılan "14 Ağustos 17.00" sabit ve artık geçmiş tarih; yardım metni "boşsa varsayılan kullanılır" diyor ama boşsa hatırlatma cron'u HİÇ çalışmıyor (Bulgu 6). |
| 22 | `{{değişken}}` ekleme düğmeleri | KISMİ | `page.tsx:493-503` | Token imlecin olduğu yere değil, gövdenin SONUNA ekleniyor. |
| 23 | Gövde editörü (textarea) | ÇALIŞIYOR | `page.tsx:506` | Sunucu "1." başlık ve "•/-" madde biçimini anlıyor (`lib/intern-task-emails.ts:517-543`) ama bu sözdizimi UI'da hiç anlatılmıyor. |
| 24 | Şablon silme | KISMİ | `page.tsx:234-243` | Yerel `confirm()` (sayfanın kendi modal diliyle tutarsız); `setTemplates` updater içinde `setSelectedId` yan etkisi; tümü silinirse Bulgu 2. Silinen şablonun gönderim geçmişi sahipsiz kalır. |
| 25 | Canlı önizleme (kaydedilmemiş taslak) | ÇALIŞIYOR | `page.tsx:247-262`, `preview/route.ts:36-54` | Yeni sekmede `document.write`; `{{email}}` boş görünür (`lib/intern-task-emails.ts:574`); sayfa içinde önizleme yok. |
| 26 | Test gönderimi | BOZUK | `page.tsx:154-171`, `route.ts:198-213` | Dirty iken engellenmiyor; kaydedilmiş sürümü gönderiyor, ardından `load()` yerel taslakları siliyor; kaydedilmemiş yeni şablonda 404 (Bulgu 1). `testTo` doğrulanmıyor. |
| 27 | Test denemeleri durum paneli | ÇALIŞIYOR | `page.tsx:530-569`, `route.ts:65` | 90 günden eski test kayıtları cron ile temizleniyor (`cleanup-counters/route.ts:48-50`). |
| 28 | "Yenile" düğmesi | KISMİ | `page.tsx:541-543` | Yalnız test panelinde; ikon olarak `Loader2` (spinner) kullanıyor; kaydedilmemiş düzenlemeleri siliyor (Bulgu 1). |
| 29 | Tekli gerçek gönderim + dirty kilidi | ÇALIŞIYOR | `page.tsx:578-583`, `174-193` | Buton etiketi her türde "Görevi gönder" (genel/hoş geldin türünde yanlış). |
| 30 | Tekli gönderim onay modalı | ÇALIŞIYOR | `page.tsx:593-656` | Alıcı + departman gösteriliyor. |
| 31 | Toplu gönderim onay modalı | KISMİ | `page.tsx:616-631` | "Tüm stajyerlere" deniyor ama gerçek alıcı sayısı/listesi, daha önce gönderilmiş olanlar, tahmini süre gösterilmiyor; "yazarak onayla" gibi ikinci güvenlik adımı yok. |
| 32 | Toplu gönderim sunucu akışı (throttle) | KISMİ | `route.ts:19-22`, `166-195` | Senkron döngü, 800 ms bekleme, `maxDuration = 60`; idempotency yok; zaman aşımında kısmi gönderim + tekrar denemede çift mail (Bulgu 4). |
| 33 | Gönderim rate limit (admin başına 20/dk) | ÇALIŞIYOR | `route.ts:150-154` | PUT ve önizleme uçlarında limit yok. |
| 34 | Açılma takip pikseli | KISMİ | `track/email-open/[token]/route.ts:15-44`, `lib/intern-task-emails.ts:599-601` | Gerçek ve token tahmin edilemez; ancak Apple Mail Privacy Protection / güvenlik tarayıcıları sahte "açıldı" üretir, bot ayrımı yok. İki ayrı `updateMany` (atomik değil, zararsız). |
| 35 | Yetki (yalnız ADMIN) | ÇALIŞIYOR | `route.ts:51`, `76`, `146`; `preview/route.ts:17`, `37` | Tüm admin uçları `requireAuth(['ADMIN'])`; IDOR yüzeyi yok. Piksel ucu bilinçli olarak public. |
| 36 | Denetim kaydı (audit log) | KISMİ | `route.ts:84-93` | Yalnız PUT ve yalnız `{ count }`; ne değiştiği (diff) tutulmuyor. Gönderimler `InternEmailSend.sentByUserId` ile izleniyor ama toplu gönderim için audit satırı yok. |
| 37 | Mobil yerleşim | KISMİ | `page.tsx:283-285`, `339` | Tek sütuna düşüyor; listeden seçince editöre kaydırma yok; liste `max-h-[calc(100vh-15rem)]` mobilde ekranın çoğunu kaplıyor; önizleme pop-up'a bağlı. |
| 38 | Erişilebilirlik | KISMİ | `page.tsx:466-475`, `351-374`, `453-460` | Etiket bağı yok, `aria-current`/`aria-pressed` yok, durum ikonları yalnız `title`. |
| 39 | Toast metinleri | KISMİ | `lib/admin-toast.ts` (`'Basarili: '`, `'Dikkat: '`) | Global önek Türkçe karaktersiz ("Basarili"); üstüne sayfa "✓" ekliyor → "Basarili: Şablonlar kaydedildi ✓". |
| 40 | Son teslim hatırlatma cron'unun görünürlüğü | EKSİK | `app/api/cron/intern-deadline/route.ts:31-110` | Cron var ama sayfada hangi şablona ne zaman hatırlatma gideceği / gittiği hiç görünmüyor, kapatılamıyor. |
| 41 | Gönderim geçmişi / zaman çizelgesi | EKSİK | `lib/intern-email-stats.ts:47-57` | Alıcı başına yalnız EN SON kayıt gösteriliyor; kim, ne zaman, kaç kez gönderdi görülemiyor. |
| 42 | Zamanlanmış gönderim | EKSİK | — | "Pazartesi 09:00'da gönder" yok. |
| 43 | Alıcı içe aktarma (CSV) + e-posta doğrulama | EKSİK | `page.tsx:471-472` | Virgüllü serbest metin tek giriş yolu. |
| 44 | Sayfa içi (yan yana) önizleme, mobil/masaüstü görünüm | EKSİK | `page.tsx:247-262` | Yalnız yeni sekme. |
| 45 | Eşzamanlı düzenleme / sürüm koruması | EKSİK | `route.ts:80-82` | Son yazan kazanır, uyarı yok. |

**Sayım:** 21 ÇALIŞIYOR · 17 KISMİ · 1 BOZUK · 0 SAHTE · 6 EKSİK (toplam 45).

---

## Bulgular

### 1. "Test gönder" ve "Yenile" kaydedilmemiş düzenlemeleri sessizce siliyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / hata · **Efor:** S
- **Kanıt:** `page.tsx:524` (Test butonu yalnız `busy==='test' || !testTo` ile kilitli, `dirty` kontrolü yok), `page.tsx:167` (`load()`), `page.tsx:541` (Yenile → `load`), `page.tsx:81` (`setTemplates(data.templates)` yerel listeyi sunucununkiyle eziyor), `page.tsx:69` (`dirty` sıfırlanmıyor).
- **Sorun:** Kullanıcı içeriği düzenleyip kaydetmeden "Test gönder"e basınca (a) sunucu KAYITLI eski sürümü gönderir (kullanıcı yeni metni test ettiğini sanır), (b) ardından `load()` tüm yerel düzenlemeleri sunucu verisiyle ezer — düzenlemeler kaybolur ama `dirty` hâlâ `true` kalır, "Değişiklikleri kaydet" görünür ve kaydetmek artık eski hâli kaydeder. Kaydedilmemiş yeni şablonda (`ozel-…`) test 404 "Şablon bulunamadı" döner, `load()` sonrası şablon listeden de kaybolur ve `selected` `null` olur. "Yenile" düğmesi aynı yolu izler.
- **Öneri:** Veri yükleme ile istatistik yenilemeyi ayır: gönderimden sonra yalnız `stats/testStats` çeken hafif bir uç (`GET /api/admin/intern-emails/stats`) veya `load({ statsOnly: true })` kullan; `templates` state'ine dokunma. Test akışını taslak dostu yap: test isteğine `template` taslağını gövdede gönder (önizleme ucu zaten bunu yapıyor, `preview/route.ts:36-54`) ve sunucu taslağı gönderir; kayıt `templateId` ile tutulur. Alternatif: dirty iken test butonunu "Kaydet ve test et" birleşik eylemine dönüştür. Ayrıca `useBeforeUnload` + Next router çıkış uyarısı ekle.

### 2. Boş/bozuk liste kaydı varsayılan 13 gerçek alıcılı şablonu geri yazıyor
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / güvenlik (yanlış alıcıya gerçek mail) · **Efor:** S
- **Kanıt:** `lib/intern-task-emails.ts:438-460` (`if (!Array.isArray(value)) return DEFAULT…` ve `return out.length ? out : DEFAULT_INTERN_TASK_EMAILS`), `route.ts:80-82` (PUT gövdesi ne olursa olsun normalize edilip KAYDEDİLİYOR), `page.tsx:129-136` (ön kontrol boş diziyi yakalamıyor).
- **Sorun:** Admin tüm şablonları silip kaydederse `PUT { templates: [] }` → sunucu varsayılan 13 şablonu (gerçek kişi adları ve Gmail adresleriyle) DB'ye yazar ve UI'ya geri döner. Aynı şekilde gövdesi bozuk bir PUT (`{}`, yanlış alan adı, istemci hatası) admin'in tüm özel şablonlarının üzerine varsayılanları yazar. Bunun hemen ardından "Toplu" basılırsa eski dönem stajyerlerine gerçek mail gider. Ayrıca alanlardan biri geçersiz olan şablonlar sessizce düşürülür (yalnız istemci ön kontrolü koruyor; API'yi doğrudan çağıran için koruma yok).
- **Öneri:** "Varsayılana düş" mantığını OKUMA yoluna sınırla (`getInternTaskEmails` ayar hiç yokken), YAZMA yolunda asla uygulama. PUT için zod şeması (`z.array(templateSchema).max(200)`, `email` için virgülle ayrılmış `z.string().email()` listesi, `subject` 1–200, `body` ≤ 20 000) kullan; geçersiz öğe varsa 400 dön ve hangi öğenin neden reddedildiğini döndür — sessiz düşürme yok. Boş dizi meşru bir durum olarak kaydedilsin.

### 3. Gerçek kişilerin ad ve e-posta adresleri kaynak kodda sabit (KVKK)
- **Önem:** yüksek · **Kategori:** gizlilik / güvenlik · **Efor:** S
- **Kanıt:** `lib/intern-task-emails.ts:73-430` — 13 varsayılan şablon, 14 `email:` satırı (ör. `:79`, `:222` üç kişilik liste), hepsi kişisel Gmail adresleri ve ad-soyad.
- **Sorun:** Kişisel veriler git geçmişine, derleme çıktısına ve (sunucu modülü olsa da) her ortama gömülü. Kişiler ayrıldığında veri hâlâ repoda; ayrıca Bulgu 2 ile birleşince bu adreslere istenmeden gerçek mail gidebiliyor. Platform KVKK/VERBİS konusunda iddialı olduğundan (şablonlardan biri bizzat KVKK incelemesi) bu çelişki itibar riski taşır.
- **Öneri:** Varsayılan listeyi kişisel veriden arındır (yer tutucu alıcılı 1–2 örnek şablon, `email: ''`); gerçek veriyi yalnız DB'de tut. Tek seferlik bir taşıma ile mevcut DB satırı korunur. Git geçmişinden temizleme ayrı bir karar (filter-repo) olarak sahibine bırakılmalı.

### 4. Toplu gönderim senkron, idempotent değil ve zaman aşımına açık
- **Önem:** yüksek · **Kategori:** güvenilirlik / mimari · **Efor:** M
- **Kanıt:** `route.ts:19` (`maxDuration = 60`), `route.ts:22` (`BULK_THROTTLE_MS = 800`), `route.ts:184-189` (şablonlar ve alıcılar arasında sıralı `sleep`), `route.ts:121` (her mail için SMTP gidiş-dönüşü), `page.tsx:197-209`.
- **Sorun:** Her mail ≈ SMTP süresi + 800 ms; 14 alıcıda ~20–35 sn, ~40+ alıcıda 60 sn sınırı aşılır. Fonksiyon kesilirse bir kısmı gitmiş, bir kısmı gitmemiş olur; istemci "Toplu gönderilemedi" görür, admin tekrar basar → ilk gidenlere ikinci kez mail gider. Ayrıca toplu gönderim her seferinde TÜM alıcılara gider; "yalnız henüz gönderilmemiş olanlar" seçeneği yok. İstemci bu süre boyunca yalnız spinner görür, ilerleme yok.
- **Öneri:** Toplu gönderimi bir "kampanya/iş" kaydına çevir: `InternEmailBatch { id, createdBy, status, total, sent, failed }` + her alıcı için `pending` satırı; POST yalnız işi oluşturup 202 döner. İşleme `after()` / Vercel Queues (veya mevcut harici cron-job.org altyapısı) ile parça parça yapılır; her alıcı satırı `(batchId, templateId, email)` benzersiz anahtarıyla idempotent. UI ilerleme çubuğu (SWR polling) gösterir, "durdur" ve "yalnız başarısızları yeniden dene" sunar. Onay modalında "yalnız henüz gönderilmemiş N alıcı" seçeneği varsayılan olmalı.

### 5. Mail altbilgisi "lütfen yanıtlamayın" diyor, ama iş akışı yanıt bekliyor
- **Önem:** orta · **Kategori:** içerik / ürün tutarlılığı · **Efor:** S
- **Kanıt:** `lib/intern-task-emails.ts:660` ve `:714` ("Bu otomatik bir bildirimdir, lütfen yanıtlamayın."), buna karşın `:640` ("Görev sonucunu … iletmeni bekliyoruz"), `:651` ("Soruların için bize her zaman ulaşabilirsin"), `app/api/cron/intern-deadline/route.ts:85` ("bize hemen yaz"); `/admin/inbox` stajyer yanıtlarını otomatik ayırıyor (`app/admin/inbox/page.tsx:180`).
- **Sorun:** Stajyer teslimi yanıtla yapacakken altbilgi yanıtlamamasını söylüyor; bu hem teslim oranını düşürür hem de gelen kutusu eşleştirme özelliğini boşa çıkarır.
- **Öneri:** Türe göre altbilgi: `task`/`reminder`/`general` için "Bu maili yanıtlayarak bize ulaşabilirsin" + `EMAIL_REPLY_TO` adresinin açıkça yazılması; "yanıtlamayın" yalnız gerçekten tek yönlü sistem bildirimlerinde. Şablon başına "yanıt adresi" alanı da eklenebilir.

### 6. Son teslim tarihi: sabit, geçmiş varsayılan ve yanıltıcı hatırlatma davranışı
- **Önem:** orta · **Kategori:** işlevsellik / UX · **Efor:** M
- **Kanıt:** `lib/intern-task-emails.ts:17` (`'14 Ağustos 17.00'`), `:571` (boşsa bu tarih mailde basılıyor), `:739-741` (boş deadline → hatırlatma YOK), `page.tsx:482-484` ("Boş bırakırsan varsayılan (14 Ağustos 17.00) kullanılır"), `cron/intern-deadline/route.ts:48`.
- **Sorun:** Bugün (Ekim) boş deadline'lı bir görev maili alıcıya "Son teslim: 14 Ağustos 17.00" — geçmiş bir tarih — basıyor. Yardım metni varsayılanın "kullanıldığını" söylüyor ama cron boş deadline'da hatırlatma göndermiyor; kullanıcı hatırlatma gideceğini sanıyor. Serbest metin olduğu için yıl yok, geçmiş tarih uyarısı yok, saat dilimi yok; "14.08" ile "14 Ağustos" farklı yollarla ayrıştırılıyor.
- **Öneri:** Alanı tarih-saat seçicisine (`<input type="datetime-local">` veya shadcn Calendar + saat) çevir, ISO olarak sakla, mailde `Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul' })` ile biçimlendir. `task` türünde deadline zorunlu olsun ya da boşsa kart hiç basılmasın. Geçmiş tarihte satır içi uyarı. Altına "Hatırlatma: teslim günü 09:00'da otomatik gönderilecek [aç/kapat]" anahtarı ekle; cron bayrağını (`intern_deadline_reminder_sent`) okuyarak "gönderildi" durumunu göster.

### 7. GET her açılışta tüm gönderim geçmişini limitsiz çekiyor
- **Önem:** orta · **Kategori:** performans / ölçeklenebilirlik · **Efor:** S
- **Kanıt:** `route.ts:58-62` (`findMany` — `take`, tarih filtresi veya `distinct` yok), `cleanup-counters/route.ts:48-50` (yalnız test kayıtları temizleniyor, `send` kayıtları sonsuza kadar kalıyor).
- **Sorun:** Toplama Node tarafında `groupSends` ile yapılıyor; her dönem yeni stajyer + tekrar gönderimlerle tablo büyüdükçe her sayfa açılışı ve her test/gönderim sonrası `load()` tüm tabloyu taşıyor. Silinmiş şablonların kayıtları da çekiliyor.
- **Öneri:** Toplamayı DB'ye taşı: `DISTINCT ON (templateId, email) … ORDER BY createdAt DESC` + `bool_or(firstOpenedAt IS NOT NULL)` içeren tek bir `$queryRaw`, yalnız mevcut şablon id'leriyle (`WHERE templateId = ANY($ids)`). Ayrıntılı geçmiş, şablon seçildiğinde ayrı ve sayfalı uçtan gelsin.

### 8. Tek JSON satırı + toptan PUT: eşzamanlılık ve denetim zayıf
- **Önem:** orta · **Kategori:** mimari · **Efor:** L
- **Kanıt:** `lib/intern-task-emails.ts:470-476` (tüm liste tek `Settings.value`), `route.ts:80-82` (tüm diziyi değiştir), `route.ts:84-93` (audit yalnız `count`).
- **Sorun:** İki admin aynı anda düzenlerse sonra kaydeden diğerinin işini siler ve kimse fark etmez. Audit kaydı neyin değiştiğini söylemiyor; bir şablonun içeriği kim tarafından ne zaman değişti sorusunun cevabı yok. Şablon id'leri istemcide `ozel-${Date.now()}` ile üretiliyor (`page.tsx:226`).
- **Öneri:** `InternEmailTemplate` Prisma modeline taşı (id cuid, kind, department, recipients, subject, body, deadlineAt, updatedAt, updatedBy, archivedAt). Şablon başına `PATCH /api/admin/intern-emails/templates/:id` + `If-Match: updatedAt` iyimser kilit (çakışmada 409 + "başkası değiştirdi, yeniden yükle"). Silme yumuşak (arşiv) olsun ki gönderim geçmişi sahipsiz kalmasın. Audit'e alan bazlı diff yaz.

### 9. Erişilebilirlik: etiket bağı, menü, seçim durumu
- **Önem:** orta · **Kategori:** erişilebilirlik · **Efor:** S
- **Kanıt:** `page.tsx:466-475` (`<Label>` için `htmlFor`, `<Input>` için `id` yok), `page.tsx:287-311` (özel açılır menü, Escape/ok tuşu/odak tuzağı yok), `page.tsx:292` (`aria-hidden` ama odaklanabilir buton), `page.tsx:351-354` (aktif şablonda `aria-current` yok), `page.tsx:453-458` (chip'lerde `aria-pressed` yok), `page.tsx:363-373` (durum yalnız `title` ile).
- **Sorun:** Ekran okuyucu alanların adını okuyamaz; klavye kullanıcısı "Yeni" menüsünden çıkamaz; listede hangi şablonun seçili, hangisinin hatalı olduğu sesli bildirilmez.
- **Öneri:** shadcn `DropdownMenu` (Radix) ile menüyü değiştir; tüm alanlarda `useId` ile `htmlFor/id`; liste `role="listbox"` + `aria-selected` ya da butonlarda `aria-current="true"`; durum ikonlarına `sr-only` metin; chip'lerde `aria-pressed`. Silme onayını `confirm()` yerine sayfanın mevcut `Dialog` diline taşı.

### 10. Mobil deneyim liste-detay kalıbını desteklemiyor
- **Önem:** orta · **Kategori:** mobil / UX · **Efor:** M
- **Kanıt:** `page.tsx:283` (`lg:` altında tek sütun), `page.tsx:339` (liste `max-h-[calc(100vh-15rem)]`), `page.tsx:353` (seçince kaydırma yok), `page.tsx:256-258` (önizleme `window.open`).
- **Sorun:** Telefonda şablon seçildiğinde editör listenin altında kalıyor, kullanıcı değiştiğini görmüyor; önizleme yeni sekme/pop-up gerektiriyor.
- **Öneri:** Mobilde liste → detay "drill-in" (seçince detay görünümü + geri butonu, URL'de `?t=<id>` ile derin bağlantı); önizlemeyi `Sheet` içinde `iframe srcDoc` ile göster (masaüstünde sağda yan panel).

### 11. Değişken ekleme imlece değil sona yazıyor; biçim sözdizimi belgelenmemiş
- **Önem:** düşük · **Kategori:** UX · **Efor:** S
- **Kanıt:** `page.tsx:497` (`body + v.token`), sunucu biçimleri `lib/intern-task-emails.ts:517-543`.
- **Öneri:** `textarea` ref'i ile `selectionStart/End` konumuna ekle ve imleci token sonrasına taşı. Editörün altına "1. Başlık · • madde · boş satır = paragraf" hızlı kılavuzu ekle; tanınmayan `{{değişken}}` (sunucu olduğu gibi bırakıyor, `:488-494`) için satır içi uyarı ver.

### 12. Etiket/dil tutarsızlıkları
- **Önem:** düşük · **Kategori:** içerik / i18n · **Efor:** S
- **Kanıt:** `page.tsx:581` ("Görevi gönder" tüm türlerde), `page.tsx:271` (başlık yalnız "Görev"), `page.tsx:608` ("tüm stajyerlere"), `lib/admin-toast.ts` (`'Basarili: '`), `page.tsx:147` ("✓" ile çift onay), sidebar i18n anahtarı var (`messages/tr.json:2516`) ama sayfa metinleri sabit Türkçe; sayfanın `metadata` başlığı yok (istemci bileşeni, sekmede yalnız "Admin").
- **Öneri:** Buton metnini türe bağla ("Gönder", "Görevi gönder", "Hatırlatmayı gönder"); sayfa başlığını "Mail Şablonları"; `admin-toast` öneklerini Türkçe karakterle düzelt (global etkili); sayfayı ince bir sunucu `page.tsx` (metadata) + istemci bileşenine böl.

### 13. Açılma metriği güvenilirliği belirtilmiyor
- **Önem:** düşük · **Kategori:** veri doğruluğu · **Efor:** M
- **Kanıt:** `track/email-open/[token]/route.ts:22-29` (her istek açılma sayılıyor, User-Agent/IP bakılmıyor), `page.tsx:566` (yalnız "engellenebilir" uyarısı).
- **Sorun:** Apple Mail Privacy Protection ve kurumsal güvenlik tarayıcıları maili açılmadan pikseli çeker → "Açıldı" yanlış pozitif; gönderimden saniyeler sonraki açılmalar şüpheli.
- **Öneri:** İlk isteğin UA'sını ve gönderim→açılma süresini kaydet; `< 10 sn` veya bilinen proxy UA'larında "otomatik ön yükleme olabilir" etiketi. Daha güvenilir sinyal olarak gelen kutusundaki yanıtı (`InboxMessage.matchedTemplateId`) "Yanıtladı" durumu olarak bu panele bağla.

---

## Eksik özellikler (kıyas ürünlerle)

Kıyas: Resend/Postmark yayın paneli, Customer.io / Loops, Linear'ın tek-kayıt düzenleme deseni, Retool iç araçları.

1. **Kampanya / gönderim işi kavramı:** ilerleme çubuğu, durdur, yalnız başarısızları yeniden dene, "yalnız henüz gönderilmemişlere gönder" (Postmark Broadcasts, Loops).
2. **Gönderim geçmişi ve alıcı zaman çizelgesi:** gönderildi → teslim edildi → açıldı → yanıtladı (inbox bağlantısı) → bounce; kim gönderdi (Customer.io "Deliveries").
3. **Zamanlanmış gönderim ve otomatik hatırlatma yönetimi:** tarih-saat seçici, saat dilimi, hatırlatma anahtarı, cron'un yapacaklarının UI'da önizlemesi.
4. **Sayfa içi canlı önizleme:** masaüstü/mobil genişlik geçişi, örnek alıcıyla değişken doldurma, karanlık mod istemci simülasyonu (Resend/React Email preview).
5. **Şablon sürüm geçmişi ve geri alma + eşzamanlı düzenleme koruması** (Linear/Notion tarzı "X düzenliyor" veya en az iyimser kilit).
6. **Alıcı yönetimi:** CSV içe aktarma, e-posta doğrulama, alıcıyı şablondan ayırma (şablon = içerik, alıcı listesi = ayrı; şu an bir şablon tek alıcıya kilitli) — böylece aynı görev şablonu birden çok stajyere tekrar kullanılabilir.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Yaz → gör → güvenle gönder → sonucu izle" döngüsünü tek ekranda, kayıpsız ve geri alınabilir kılmak. Admin, yazdığı mailin alıcıda nasıl görüneceğini yazarken görmeli; gerçek gönderim her zaman ne olacağını (kaç kişi, kimler, kimler zaten almış) açıkça söylemeli; gönderim sonrası her alıcının yolculuğu (gitti → açtı → yanıtladı) tek bakışta okunmalı.

**Yerleşim (masaüstü, üç bölge):**
- **Sol (280 px):** şablon listesi — üstte segment filtre (Tümü / Taslak / Gönderildi / Hatalı / Süresi yaklaşan), arama, departman grupları; her satırda küçük ilerleme halkası (açılma oranı) ve son teslim çipi. "Yeni" Radix DropdownMenu.
- **Orta (esnek):** sekmeli düzenleyici — *İçerik* (tür, konu, gövde; araç çubuğunda değişken ekle / başlık / madde), *Alıcılar* (çip girişli e-posta alanı, doğrulama, CSV içe aktarma), *Zamanlama* (deadline tarih-saat, hatırlatma anahtarı, planlı gönderim). Üstte yapışkan eylem çubuğu: kayıt durumu ("Kaydedildi · 2 dk önce" / "Kaydedilmemiş"), Test, Gönder.
- **Sağ (420 px, daraltılabilir):** `iframe srcDoc` canlı önizleme, 300 ms debounce ile POST `/preview`; masaüstü/mobil genişlik anahtarı; "örnek alıcı" seçici.
- **Alt çekmece / "Sonuçlar" sekmesi:** alıcı tablosu (durum, gönderim, ilk açılma, açılma sayısı, yanıt, hata) + zaman çizelgesi.
- **Mobil:** liste → detay drill-in, önizleme `Sheet`, eylem çubuğu ekranın altında `env(safe-area-inset-bottom)` ile sabit.

**Gönderim onayı:** modal alıcı listesini üç gruba ayırır (yeni / daha önce almış / hatalı), varsayılan "yalnız yeni + hatalı"; toplu gönderimde alıcı sayısını yazarak onaylama; tahmini süre.

**Motion / 3B:** Bu bir iş aracı; 3B veya dekoratif animasyon gerekmez. Ölçülü öneriler: önizleme güncellenirken 150 ms çapraz geçiş; toplu gönderim ilerleme çubuğunda `m.div` ile yumuşak genişlik; alıcı satırı durum değiştiğinde (bekliyor → açıldı) tek seferlik renk vurgusu. Tümü `useReducedMotion()` ile kapatılabilir olmalı; mevcut `animate-in fade-in` ve `animate-pulse` sınıfları için `motion-reduce:animate-none` eklenmeli.

**Veri / API değişiklikleri:**
- Prisma: `InternEmailTemplate` (Settings JSON yerine), `InternEmailBatch` (toplu iş), `InternEmailSend`'e `batchId`, `openUserAgent`, `repliedAt` (InboxMessage eşleşmesinden).
- API: `GET/POST /api/admin/intern-emails/templates`, `PATCH/DELETE …/templates/:id` (zod + `If-Match`), `POST …/templates/:id/test` (taslak gövdesiyle), `POST …/batches` (202 + iş id), `GET …/batches/:id` (ilerleme), `GET …/templates/:id/sends?cursor=` (sayfalı geçmiş), `GET …/stats` (DB'de toplanmış özet).
- İşleme: `after()` veya Vercel Queues ile parça parça gönderim, alıcı satırı başına idempotent anahtar.
- İstemci: SWR ile `templates` ve `stats` ayrı anahtarlar; stats yenilemesi asla taslağa dokunmaz.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/inbox`** (`app/admin/inbox/page.tsx`): gelen kutusu, stajyer yanıtlarını bu sayfanın şablon alıcılarıyla eşleştiriyor (`lib/mail-inbox.ts:50`). İki sayfa aynı iş akışının iki ucu (giden görev ↔ gelen teslim) ama birbirine bağlantı vermiyor: buradan "bu stajyerin yanıtları" görülemiyor, oradan "bu yanıt hangi gönderime ait" sayfasına gidilemiyor.
- **`/api/admin/compose-mail`**: gelen kutusundan serbest mail/yanıt göndermek için ayrı bir gönderim yolu, farklı HTML şablonu (`buildAdminComposeEmail`) ve zod doğrulaması var; bu sayfanın "Genel / Serbest" türü ile amaç olarak örtüşüyor ama farklı görsel kimlik ve farklı takip (piksel yok) kullanıyor.
- **`/api/admin/email-test`**: genel mail testi ayrı bir uçta.

**Öneri:** Bu sayfa kaldırılmamalı, birleştirilmeli: `/admin/mail` altında "Şablonlar & Gönderim" (bu sayfa), "Gelen Kutusu" (inbox) ve "Ayarlar/Test" (email-test, yapılandırma durumu) sekmelerinden oluşan tek bir **Mail Merkezi**. Tek bir gönderim katmanı (`sendTrackedEmail`: render + piksel + `InternEmailSend` kaydı) compose-mail ve bu sayfa tarafından ortak kullanılsın; böylece serbest yanıtlar da takip edilir ve görsel kimlik tek olur. Kısa vadede en az iki sayfa arasında çapraz bağlantı (alıcı satırında "Yanıtları gör", gelen mesajda "Gönderilen görevi aç") eklenmeli.

---

## Doğrulama (şüpheci inceleme)

Salt okunur inceleme yapıldı; kod çalıştırılmadı, veritabanına dokunulmadı. Okunan dosyalar: `app/admin/intern-emails/page.tsx`, `app/api/admin/intern-emails/route.ts`, `lib/intern-task-emails.ts`, `lib/mail-sender.ts`, `app/api/cron/intern-deadline/route.ts`, `__tests__/lib/intern-task-emails.test.ts`.

### 1. Test gönder / Yenile kaydedilmemiş düzenlemeleri siliyor — **DOĞRULANDI (kısmen; bir alt iddia çürük)**

- Ana iddia doğru. "Test gönder" butonu `dirty` kontrolü yapmıyor (`page.tsx:524`). Karşılaştırma için "Görevi gönder" (`:580`) ve "Toplu" (`:314`) `dirty` iken kapalı. Sunucu şablonu veritabanından okuyor (`route.ts:163`, `:201`), yani test her zaman KAYITLI sürümü gönderiyor. Başarılı ya da 207 yanıtından sonra `load()` çağrılıyor (`page.tsx:167`), `setTemplates(data.templates)` (`:81`) de yerel taslağı koşulsuz eziyor. `load` içinde `setDirty` olmadığı için `dirty` sıfırlanmıyor (`:69`). "Yenile" bağlantısı (`:541`) da aynı `load()`'u çağırıyor.
- Yeniden üretim: Kayıtlı bir şablonun gövdesini düzenle, test adresi gir, "Test gönder"e bas. Gelen mail eski içeriği taşır ve panelde düzenleme kaybolur. "Değişiklikleri kaydet" butonu hâlâ görünür ama artık sunucudan gelen veriyi kaydeder. Kullanıcı yazdığı metni sessizce kaybeder. Sayfadaki sarı uyarı (`:572-577`) "gönderilen içerik KAYITLI hâldir" diyor ama taslağın silineceğini söylemiyor; üstelik Test butonunun altında duruyor.
- Çürük alt iddia: "Kaydedilmemiş yeni şablonda test 404 döner ve şablon listeden kaybolur." 404 yanıtında `data.success` false olur ve `data.results` gelmez, bu yüzden `:163` hata fırlatır ve akış `catch`'e düşer. `load()` çağrılmaz. Şablon listede kalır, yalnızca "Şablon bulunamadı" bildirimi çıkar. Ancak aynı yeni şablon dururken başka bir kayıtlı şablon için başarılı test yapılır ya da "Yenile"ye basılırsa yeni şablon da silinir. O durumda `selectedId` yerinde kalır ama `selected` null olur ve "Bir şablon seç" boş ekranı görünür.
- Önem: Yüksek değil, **Orta**. Kaybolan kalıcı veri değil, oturumdaki yazım emeği. Düzeltme yönü: Test isteği taslak gövdeyi taşımalı. Önizleme uç noktası gibi `template` POST edilmeli; sunucu yine ADMIN yetkisi istemeli ve alıcı yalnızca `testTo` olmalı. İstatistik yenilemesi şablonlardan ayrı bir uçtan ya da anahtardan gelmeli ve `load()` hiçbir zaman `templates` state'ine dokunmamalı. Alternatif olarak `dirty` iken yalnızca `stats/testStats` güncellenmeli.

### 2. Boş veya bozuk PUT gövdesi varsayılan gerçek alıcılı şablonları veritabanına yazıyor — **DOĞRULANDI (önem düşürülerek)**

- Kod doğru okunmuş. `normalizeInternEmails`, gelen değer dizi değilse (`lib/intern-task-emails.ts:439`) ya da geçerli öğe kalmazsa (`:458`) `DEFAULT_INTERN_TASK_EMAILS` döndürüyor. PUT bunu koşulsuz olarak `saveInternTaskEmails` ile kalıcılaştırıyor (`route.ts:80-82`). Bu davranış testlerle de sabitlenmiş (`__tests__/lib/intern-task-emails.test.ts:41-43`). Yani bilinçli bir seçim ama tasarımı hatalı.
- Gerçekçi senaryo: Admin eski stajyer şablonlarının hepsini silip "Kaydet"e basar. `saveAll` boş listeyi engellemez, çünkü `page.tsx:129` yalnızca boş alanlara bakar. PUT `templates: []` gönderir ve veritabanına 13 eski şablon (16 gerçek adres) yazılır. Bu liste yanıtla arayüze geri gelir (`:145`), `dirty=false` olur ve "Toplu (13)" butonu etkinleşir. Admin ardından yeni bir şablon ekleyip kaydeder ve toplu gönderim yaparsa eski stajyerlere de gerçek görev maili gider. Onay penceresi (`page.tsx:616-628`) yalnızca şablon SAYISINI gösteriyor, alıcı listesini göstermiyor; bu yüzden durumu fark etmek zor.
- Abartılan kısım: "Bozuk PUT gövdesi" yolu yalnızca ADMIN oturumuyla açılıyor (`route.ts:76`), dışarıdan bir saldırgan tetikleyemez. "Hemen ardından gerçek mail atar" da otomatik değil; admin'in toplu gönderimi ayrıca onaylaması gerekir. Cron (`app/api/cron/intern-deadline/route.ts:46`) aynı varsayılana düşüşü kullanıyor ama varsayılan şablonlarda `deadline` alanı olmadığı için `deadlineIsToday` (`lib/intern-task-emails.ts:740`) false döner. Cron yolu bu yüzden tetiklenmez.
- Ek gözlem (aynı kök neden): `getInternTaskEmails`, veritabanı okuma hatasını `.catch(() => null)` ile yutup varsayılana düşüyor (`lib/intern-task-emails.ts:463-466`). Toplu gönderim POST'u sırasında Neon'da anlık bir hata olursa `send-bulk` + `all:true`, gerçek şablonlar yerine varsayılan 16 adrese gönderir (`route.ts:163`, `:176`). Yani hata durumunda sistem açık kalıyor (fail-open).
- Önem: **Orta-Yüksek**. Düzeltme: "Boş liste" ile "ayar yok" durumu ayrılmalı. Boş dizi geçerli bir durum olarak saklanmalı; varsayılan yalnızca `Settings` satırı hiç yoksa ve yalnızca ilk kurulumda tohumlanmalı. PUT'ta `templates` dizi değilse zod doğrulamasıyla 400 dönülmeli. Gönderim yollarında veritabanı okuma hatası 503'e dönüşmeli, yani sistem hata anında kapalı kalmalı (fail-closed). Varsayılan şablonlardaki gerçek adresler de çıkarılmalı (bkz. 3).

### 3. Gerçek kişilerin ad-soyad ve e-postaları kaynak kodda — **DOĞRULANDI (önem: Orta)**

- `lib/intern-task-emails.ts:73-430` içinde 13 şablon ve 14 `email:` satırı var (`:79, :111, :139, :168, :194, :222, :252, :275, :299, :323, :347, :382, :409`). `:222` satırında üç adres bulunduğu için toplam 16 kişisel Gmail adresi, ad-soyad ve departman bilgisi git geçmişinde duruyor.
- Sınırlar: Dosya `prisma` import ettiği için sunucu tarafında kalıyor. İstemci sayfası yalnızca `lib/intern-email-kinds` import ediyor (`page.tsx:19`), yani istemci paketine sızma yok. GET yanıtı da yalnızca ADMIN'e dönüyor. Depo `github.com/d4rkn3m3s1s/qratex` adresinde; herkese açık olup olmadığı doğrulanmadı. Herkese açıksa önem Yüksek'e çıkar.
- "Kritik/Yüksek" etiketi abartılı. Bugün doğrudan bir sızma yolu yok. Asıl risk KVKK'daki veri minimizasyonu ilkesi (amaç dışı saklama, silme talebinde git geçmişinden temizlemenin zorluğu) ve Bulgu 2 ile birleşince yanlış kişilere gönderim yapılması.
- Düzeltme: Varsayılan şablonlar `ornek@example.com` gibi yer tutucularla anonimleştirilmeli. Gerçek atamalar yalnızca veritabanında (`Settings`, ileride `InternEmailTemplate`) tutulmalı. Geçmişten temizleme (`git filter-repo`) deponun görünürlüğüne göre değerlendirilmeli. `:199-202` satırlarındaki test de buna göre güncellenmeli.

### 4. Toplu gönderim idempotent değil; zaman aşımında kısmi gönderim, tekrarda çift mail — **DOĞRULANDI (gizli risk; mevcut veri hacminde tetiklendiği doğrulanmadı)**

- Kanıtlar: `maxDuration = 60` (`route.ts:19`). Alıcılar ve şablonlar arasında 800 ms bekleme var (`:22`, `:134`, `:188`). Döngü tamamen sıralı (`:184-189`) ve her alıcı için ayrıca `prisma.internEmailSend.create` çalışıyor (`:123`). SMTP zaman aşımları 15-20 sn (`lib/mail-sender.ts:82`); SMTP hatasında Resend'e düşüş (`:216`) süreyi daha da uzatabilir. "Bu alıcıya zaten gönderildi mi" kontrolü yok, her toplu istek tüm alıcıları baştan kapsıyor.
- Senaryo: Alıcı sayısı N olsun. N × (yaklaşık 0,8 sn bekleme + 0,5-2 sn gönderim gecikmesi) 60 sn'yi aştığında fonksiyon kesilir. Bu, SMTP hızına bağlı olarak kabaca 20-45 alıcı aralığında olur. O ana kadar ilk K alıcıya mail gitmiş ve `InternEmailSend` kayıtları yazılmıştır. İstemci 504 ya da HTML gövde alır ve `res.json()` hata fırlatır (`page.tsx:201`). Ekranda "Toplu gönderilemedi" bildirimi çıkar ve `load()` çağrılmaz. Admin tekrar "Toplu"ya basınca ilk K kişi aynı görev mailini ikinci kez alır. Tek bir SMTP askısı bile (20 sn socket zaman aşımı) birkaç alıcıda bu sınırı aşmaya yetebilir.
- Varsayılan veriyle (16 alıcı) tahmini süre 25-45 sn arası. Yani bugün sınıra yakın ama aşıldığı kesin değil; bu kısım doğrulanmadı. Hız sınırı (`route.ts:151`, dakikada 20 istek) tekrar gönderimi engellemiyor.
- Önem: **Orta-Yüksek**, çünkü gerçek kişilere çift mail gider ve gönderen itibarı zarar görür. Düzeltme: Toplu gönderim bir `InternEmailBatch` işine çevrilmeli; uç nokta 202 ve iş kimliği döndürmeli, iş parça parça işlenmeli (`after()` ya da Vercel Queues). Alıcı başına idempotent bir anahtar (`batchId+templateId+email` üzerinde unique index) tanımlanmalı. Onay penceresinde "daha önce almış" alıcılar varsayılan olarak hariç tutulmalı. İstemci de iş durumunu sorgulayıp ilerleme çubuğu göstermeli.

### Özet

| # | İddia | Karar | Gerçek önem |
|---|---|---|---|
| 1 | Test/Yenile taslağı eziyor | Doğrulandı (404 alt iddiası çürük) | Orta |
| 2 | Boş PUT varsayılan gerçek alıcıları yazıyor | Doğrulandı | Orta-Yüksek (ayrıca DB okuma hatasında fail-open) |
| 3 | Kaynak kodda kişisel veri | Doğrulandı | Orta (depo herkese açıksa Yüksek) |
| 4 | Toplu gönderim idempotent değil | Doğrulandı (gizli risk) | Orta-Yüksek |


---

## Uygulama (Dalga 2)

Sayfa yeniden yazıldı: ince sunucu `page.tsx` (metadata "Mail şablonları"; şablonlar + istatistik + hatırlatma durumu sunucuda; `?t=<id>` derin bağlantı) → istemci adası `components/admin/a-iletisim/templates/*` (QDL v2, ops kaydı). İş kuralları `lib/mail-center/templates.server.ts`, tek doğrulama şeması `lib/mail-center/templates-contract.ts` (istemci formu ve PUT ucu aynı zod'u kullanır). Uçlar `defineRoute`: `GET|PUT|POST /api/admin/intern-emails`, `POST …/preview`, `GET …/sends`. Şema değişmedi: şablonlar `Settings[intern_task_emails]` = `{ version, updatedAt, updatedBy, templates }` (eski çıplak dizi okunur, ilk kayıtta yeni biçime geçer). Testler: `__tests__/lib/mail-center-templates.test.ts`, güncellenen `__tests__/lib/intern-task-emails.test.ts`, `__tests__/lib/intern-email-stats.test.ts`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Hero | ÇALIŞIYOR | "Mail şablonları"; kayıt durumu meta satırında ("Kaydedildi · x önce · kim" / "Kaydedilmemiş"). |
| 2 | Mail yapılandırma uyarısı | ÇALIŞIYOR | + piksel origin'i localhost ise ayrı uyarı (açılma takibi çalışmaz). |
| 3 | Şablon + istatistik yükleme | ÇALIŞIYOR | Sunucuda ön yükleme; istatistik yalnız mevcut şablon id'leri için, satır tavanlı. |
| 4 | Yükleniyor | ÇALIŞIYOR | `QueryState` iskeleti; boş seçim kartı yükleme sırasında görünmez. |
| 5 | Yükleme hatası | ÇALIŞIYOR | Satır içi hata + Tekrar dene (fail-closed: DB hatası artık varsayılan listeye düşmez). |
| 6 | Departman gruplama | ÇALIŞIYOR | Emoji eşlemesi UI'dan kaldırıldı (yalnız mail render'ında). |
| 7 | Arama | ÇALIŞIYOR | Placeholder konuyu da söylüyor. |
| 8 | Boş arama sonucu | ÇALIŞIYOR | |
| 9 | Aynı isimde e-posta gösterimi | ÇALIŞIYOR | Ad yoksa ilk alıcı. |
| 10 | Satır durum ikonları | ÇALIŞIYOR | Metinli `StatusBadge` ("2/3 açtı", "1 hata", "Alıcı yok", "N yanıt") — yalnız `title` değil. |
| 11 | Tür emojisi | KALDIRILDI | Tür, düzenleyici başlığında metinle; emoji ikon diliyle çelişiyordu. |
| 12 | "Yeni" tür menüsü | ÇALIŞIYOR | Radix `DropdownMenu` (Esc, ok tuşları, odak yönetimi). |
| 13 | Türe göre başlangıç içeriği | ÇALIŞIYOR | |
| 14 | Toplu gönderim | ÇALIŞIYOR | Alıcı sayısı (şablon değil), yeni/almış/hatalı ayrımı, varsayılan "yalnız yeni + hatalı". |
| 15 | Kaydet | ÇALIŞIYOR | Tek zod şeması (geçersiz öğe sessizce düşmez, hatalı şablona odaklanır), boş liste meşru (varsayılan geri yazılmaz), iyimser kilit (409 + çakışma bandı), denetime alan bazlı fark. |
| 16 | Kaydedilmemiş değişiklik uyarısı | ÇALIŞIYOR | Yapışkan kaydet çubuğu + `beforeunload`; satırda "Kaydedilmedi" rozeti. |
| 17 | Gönderim özeti | ÇALIŞIYOR | + "Yanıtladı" (gelen kutusu eşleşmesi). |
| 18 | Alıcı satırları | ÇALIŞIYOR | Hata metni görünür; "N yanıt · gelen kutusunda aç" bağlantısı. |
| 19 | Tür seçici | ÇALIŞIYOR | `ChoiceChips` (radiogroup, ok tuşları). |
| 20 | Alanlar | ÇALIŞIYOR | `useId` ile etiket bağı; çipli alıcı girişi + anında e-posta doğrulama (istemci ve sunucu). |
| 21 | Son teslim | ÇALIŞIYOR | `datetime-local` (İstanbul), ISO saklanır, mailde "15 Ekim 2026, 17:00"; boşsa kart BASILMAZ (geçmiş varsayılan tarih yok); geçmiş tarih uyarısı; eski serbest metin için güncelleme uyarısı; hatırlatma aç/kapa anahtarı (cron uyar). |
| 22 | Değişken ekleme | ÇALIŞIYOR | İmlecin olduğu yere; tanınmayan değişken uyarısı; boş kalan bilinen değişken mailde ham görünmez. |
| 23 | Gövde editörü | ÇALIŞIYOR | Biçim kılavuzu (`1. Başlık`, `• madde`, boş satır). |
| 24 | Şablon silme | ÇALIŞIYOR | Silme yerine ARŞİV (geri alınabilir, gönderim geçmişi korunur; arşivli şablon gönderilmez, hatırlatma almaz). `confirm()` kaldırıldı. |
| 25 | Canlı önizleme | ÇALIŞIYOR | Sayfa içi (geniş ekranda yan panel, dar ekranda Sheet), 400 ms debounce, masaüstü/mobil genişlik, `{{email}}` ilk alıcıyla, piksel yok, `sandbox=""`. |
| 26 | Test gönderimi | ÇALIŞIYOR | Ekrandaki TASLAK gönderilir (kaydedilmemiş yeni şablon dahil); test adresi doğrulanır; istatistik yenilemesi taslağa dokunmaz. |
| 27 | Test durum paneli | ÇALIŞIYOR | Sonuçlar sekmesinde. |
| 28 | "Yenile" | ÇALIŞIYOR | Ayrı düğme kaldırıldı; gönderim/test sonrası yalnız istatistik tazelenir, taslak korunur (Bulgu 1'in kökü). |
| 29 | Tekli gönderim + kilit | ÇALIŞIYOR | Buton metni türe göre ("Görevi gönder", "Hatırlatmayı gönder", "Karşılama mailini gönder", "Gönder"); kaydedilmemişse kapalı ve nedeni yazılı. |
| 30 | Tekli onay modalı | ÇALIŞIYOR | Alıcı listesi + grup sayıları + canlı satır durumu. |
| 31 | Toplu onay modalı | ÇALIŞIYOR | Şablon/alıcı listesi, tahmini süre, "GÖNDER" yazarak onay, ilerleme çubuğu, Durdur. |
| 32 | Toplu gönderim akışı | ÇALIŞIYOR | Şablon başına ayrı istek (60 sn sınırı aşılmaz), istek başına 40 sn bütçe + `remaining` ile yalnız kalan alıcılara devam, "yalnız yeni" ile tekrar denemede çift mail yok, Idempotency-Key, denetim kaydı. |
| 33 | Hız sınırı | ÇALIŞIYOR | Gönderim 30/dk, PUT `mutation`, önizleme 120/dk. |
| 34 | Açılma pikseli | ÇALIŞIYOR | Gönderimden < 10 sn sonraki açılma "otomatik olabilir" (MPP/tarayıcı) olarak ayrılıyor; piksel görünür 1×1 (display:none yok), origin `mailPublicOrigin()` (localhost değil), logo HTTPS. |
| 35 | Yetki | ÇALIŞIYOR | `defineRoute` ADMIN + kapı. |
| 36 | Denetim kaydı | ÇALIŞIYOR | Kayıt: eklenen/çıkarılan/değişen alanlar; gönderim: gönderilen/hata/atlanan/kalan. |
| 37 | Mobil | ÇALIŞIYOR | Liste → düzenleyici drill-in + geri; önizleme Sheet; kaydet çubuğu güvenli alanlı. |
| 38 | Erişilebilirlik | ÇALIŞIYOR | Etiket bağları, `aria-current`, radiogroup çipler, metinli durumlar, ≥44px hedefler, odak halkaları. |
| 39 | Toast metinleri | ÇALIŞIYOR | `sonner` doğrudan; "Basarili:" öneki ve "✓" bu sayfada yok (global `lib/admin-toast` sahiplik dışı, dokunulmadı). |
| 40 | Hatırlatma görünürlüğü | ÇALIŞIYOR | Sonuçlar sekmesinde bugünkü durum (gidecek / x alıcıya ulaştı / tamamlandı) + anahtar. |
| 41 | Gönderim geçmişi | ÇALIŞIYOR | Sayfalı geçmiş (kim, ne zaman, test/gerçek, açılma, hata). |
| 42 | Zamanlanmış gönderim | KALDIRILDI (yapılmadı) | Kalıcı iş kuyruğu/şema gerektiriyor; yarım "planla" düğmesi koymak yerine bırakıldı (aşağıda). |
| 43 | CSV içe aktarma + doğrulama | ÇALIŞIYOR | Alıcı alanına CSV/liste/noktalı virgül yapıştırma, tekrar ayıklama, geçersiz adres listesi. |
| 44 | Sayfa içi önizleme | ÇALIŞIYOR | #25. |
| 45 | Eşzamanlı düzenleme koruması | ÇALIŞIYOR | Sürüm + karşılaştır-ve-yaz; 409'da çakışma bandı. |

**Sayım:** 45 satır · 43 ÇALIŞIYOR · 2 KALDIRILDI (#11 bilinçli, #42 kapsam dışı).

### Kapanan bulgular
1 (Test/Yenile taslağı eziyor) · 2 (boş/bozuk PUT varsayılanları yazıyor + DB hatasında fail-open) · 3 (kaynak kodda kişisel veri: `DEFAULT_INTERN_TASK_EMAILS` boşaltıldı) · 4 (toplu gönderim idempotent değil / zaman aşımı) · 5 ("yanıtlamayın" altbilgisi: görev maili yanıta davet ediyor, cron hatırlatması da) · 6 (son teslim) · 7 (limitsiz GET) · 8 (toptan PUT eşzamanlılık/denetim — kilit + fark; ayrı model şema isteği olarak kalıyor) · 9 (erişilebilirlik) · 10 (mobil) · 11 (değişken imlece, biçim kılavuzu) · 12 (etiket/dil, metadata) · 13 (açılma güvenilirliği + yanıt sinyali).

### Kalanlar
- **Veri geçişi notu:** varsayılan şablon listesi artık boş. `Settings[intern_task_emails]` satırı hiç kaydedilmemiş bir ortamda liste boş görünür (eski 13 şablon git geçmişinde duruyor; gerekirse oradan elle girilir). Git geçmişinden kişisel verinin temizlenmesi (`filter-repo`) depo sahibinin kararı.
- **Zamanlanmış gönderim:** kuyruk/iş kaydı gerekir. **ŞEMA İSTEĞİ:** `InternEmailTemplate` (Settings JSON yerine; sürüm geçmişi ve satır bazlı kilit için) ve `InternEmailBatch { id, createdBy, status, scheduledAt, total, sent, failed }` + `InternEmailSend.batchId`.
- **Açılma User-Agent kaydı:** daha güçlü bot ayrımı için **ŞEMA İSTEĞİ:** `InternEmailSend.openUserAgent String?`. Şimdilik süre sezgisi (< 10 sn).
- **Şablon sürüm geçmişi / geri alma:** denetim kaydında alan bazlı fark var; tam içerik geri yükleme ayrı model ister (yukarıdaki şema isteği).
- **`lib/admin-toast` "Basarili:" öneki:** global modül, sahiplik dışı; bu yüzey artık onu kullanmıyor.
- **`__tests__/api/cron-reminders.test.ts`:** bu dosyadaki mock'a `formatDeadlineLabel` eklendi; ancak suite, `team-task-due → lib/team/access → define-route → lib/auth → @auth/prisma-adapter` ESM zinciri yüzünden çalıştırılamıyor (bu yüzeyden bağımsız, önceden var olan kırılma).
