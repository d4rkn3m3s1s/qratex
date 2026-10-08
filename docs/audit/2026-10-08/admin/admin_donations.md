# /admin/donations

**Amaç:** Platform operatörünün müşteri tarafındaki "Sosyal Sorumluluk" (puanla bağış) modülünü yönetmesi: bağış projelerinin metin/hedef/etki oranı ayarları, aktif/pasif durumu, toplam bağış KPI'ları ve son bağış hareketlerinin incelenmesi.

**Genel puan:** 3.5 / 10 · **Karar:** yeniden tasarla (API katmanı küçük ve kurtarılabilir; arayüz, form modeli ve veri sözleşmesi baştan ele alınmalı)

Dosyalar: `app/admin/donations/page.tsx` (444 satır, tek `'use client'` bileşen), `app/api/admin/donations/route.ts` (GET/PATCH/PUT), `prisma/schema.prisma:1677-1716` (`DonationProject`, `Donation`), tüketici taraf: `app/api/customer/donations/route.ts`, `app/customer/donations/donations-client.tsx`.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 4/10 | Temel düzenleme ve aktif/pasif çalışıyor; ancak "Soft Freeze" sahte, "Aktif proje" KPI'ı yanlış, etiket alanına virgül/boşluk yazılamıyor, proje oluşturma/silme/öne çıkarma yok. |
| UX | 3/10 | Her proje 15+ etiketsiz alanlı dev bir form; kaydetme diğer projelerdeki taslakları siliyor, "uygulandı" toast'ları kaydedilmemiş değişikliği kaydedilmiş gibi gösteriyor, onay ve kirli-durum göstergesi yok. |
| Görsel | 3/10 | Ham Card/Input yığını; ilerleme çubuğu, durum rozeti, sayı formatı, boş/yükleniyor görseli yok; diğer cilalı admin sayfalarıyla tutarsız. |
| Mimari | 3/10 | Tüm durum tek bileşende 6 paralel `Record` state'te; doğrulamasız (zod yok) PUT, try/catch'siz route'lar, audit log yok, müşteri tarafıyla veri sözleşmesi (kategori anahtarları, perPoint=0, goal=0) tutarsız. |
| Performans | 6/10 | Sorgular paralel ve sayfalı; ama her filtre değişiminde 100 satırlık log + global aggregate yeniden çekiliyor, istek iptali yok (yarış), her tuş vuruşunda tüm sayfa yeniden render. |
| Erişilebilirlik + mobil | 3/10 | Alanlarda `<label>` yok (yalnız placeholder; dolu alanların ne olduğu anlaşılmıyor), toggle'da `aria-pressed` yok, mobilde proje başına çok uzun form, aksiyon satırı sarılmıyor. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa başlığı (PageHeader + açıklama) | ÇALIŞIYOR | `page.tsx:207-216` | "Bağış ayarları" diyor ama global bağış ayarı (min/max bağış, modül açık/kapalı) bu sayfada yok. |
| 2 | CSV dışa aktarma | KISMİ | `page.tsx:187-203` | Yalnız sabit son 100 log (`route.ts:64-71`); mesaj, görünürlük, e-posta, kategori sütunu yok; UTF-8 BOM yok → Excel'de Türkçe karakterler bozulur; buton etiketi sadece "CSV". |
| 3 | Yenile butonu | KISMİ | `page.tsx:213`, `page.tsx:52-83` | `load()` try/catch'siz; ağ hatası veya JSON olmayan 500'de `setLoading(false)` hiç çağrılmaz → buton kalıcı "Yükleniyor..." ve disabled kalır. |
| 4 | Proje arama | KISMİ | `page.tsx:219-224`, `route.ts:23-30` | Yazınca tetiklenmez (`q` effect bağımlılığında yok, `page.tsx:84`), Enter ile gönderilmez (form yok); yalnız ad/kategori arar, logları filtrelemez. |
| 5 | Sıralama (en yeni / en çok puan / en yüksek hedef) | ÇALIŞIYOR | `page.tsx:225-233`, `route.ts:33-38` | Native `<select>`, etiketsiz; shadcn Select ile tutarsız. |
| 6 | "Sadece aktif" anahtarı | ÇALIŞIYOR | `page.tsx:234-240` | `aria-pressed` yok; metin "Açık/Kapalı" ile durum anlatılıyor. |
| 7 | "Filtreyi uygula" | KISMİ | `page.tsx:241-246` | `setPage(1); load()` → sayfa 1 değilse eski `page` closure'lı `load()` + effect'in tetiklediği ikinci `load()` paralel çalışır; iptal yok, son gelen kazanır (yarış). |
| 8 | KPI: Toplam bağış | ÇALIŞIYOR | `page.tsx:250`, `route.ts:60-63,77` | Global sayım; sayı formatı yok. |
| 9 | KPI: Toplam puan | ÇALIŞIYOR | `page.tsx:251`, `route.ts:78` | `toLocaleString` yok (ör. 1250000). |
| 10 | KPI: Aktif proje | BOZUK | `route.ts:79` | `projects.filter(p => p.isActive).length` — sayfalanmış + filtrelenmiş 20'lik dilimden hesaplanıyor; 20'den fazla projede veya arama yapılınca yanlış; "sadece aktif" açıkken sonuç sayısına eşitleniyor. |
| 11 | Proje listesi (sayfalı, 20'li) | ÇALIŞIYOR | `page.tsx:254-407`, `route.ts:40-59` | Boş durum mesajı yok. |
| 12 | İkon (emoji) alanı | ÇALIŞIYOR | `page.tsx:262` | Serbest metin, doğrulama/seçici yok. |
| 13 | Proje adı alanı | ÇALIŞIYOR | `page.tsx:263`, `route.ts:129` | Boş string kabul edilir (doğrulama yok). |
| 14 | Kategori alanı | KISMİ | `page.tsx:264`; müşteri: `donations-client.tsx:86-116,602-603` | Serbest metin; müşteri tarafı yalnız `water/environment/education/animals/health` anahtarlarını tanıyor. "Su" veya "çevre" yazılırsa müşteride Heart ikonu + su renkleri + filtre sekmesinde görünmeme. |
| 15 | Açıklama (Textarea) | ÇALIŞIYOR | `page.tsx:266-270` | Uzunluk sınırı/önizleme yok. |
| 16 | Hedef puan | KISMİ | `page.tsx:272-277`, `route.ts:133` | 0 kabul edilir → müşteride `current/goal` = NaN/Infinity (`donations-client.tsx:604,654,664`); `current` altına çekilirse müşteride "Hedef tamamlandı" ile bağış butonu kapanır (`:699`), uyarı yok. Etiketsiz sayı alanı. |
| 17 | "1 puan = ? etki" alanı | KISMİ | `page.tsx:278-288` | Yalnız `ratioPerPointInput` state'ini değiştirir, taslağa yazmaz; "1 Puan Değerini Uygula"ya basmadan "Ayarları Kaydet" yapılırsa değer kaydedilmez. |
| 18 | Etki birimi | ÇALIŞIYOR | `page.tsx:289-293` | |
| 19 | Etki etiketi | ÇALIŞIYOR | `page.tsx:294-298` | |
| 20 | Dönüşüm: X puan alanı | ÇALIŞIYOR | `page.tsx:303-313` | Yerel hesaplayıcı girdisi. |
| 21 | Dönüşüm: Y birim alanı | ÇALIŞIYOR | `page.tsx:314-324` | |
| 22 | "Oranı Uygula" | KISMİ | `page.tsx:131-152,325-332` | Yalnız taslağı günceller ama "Oran uygulandı" success toast'ı gösterir → kaydedildi sanılır. Y=0 → perPoint 0 kabul edilir (bkz. bulgu B4). |
| 23 | "1 Puan Değerini Uygula" | KISMİ | `page.tsx:168-185,333-340` | Aynı yanıltıcı toast; 0 kabul edilir. |
| 24 | "Aktif oran" metni | KISMİ | `page.tsx:341-343` | Kaydedilmemiş `ratioPerPointInput` değerini "Aktif oran" olarak gösteriyor; gerçek (DB'deki) oranı değil. |
| 25 | Oran doğrulama hata metni | ÇALIŞIYOR | `page.tsx:134-141,345-347` | `aria-live` yok. |
| 26 | Hazır oran preset'leri (100/50/10 puan = 1 birim) | ÇALIŞIYOR | `page.tsx:154-166,348-373` | Taslağa yazar; müşteri `Math.floor` kullandığından (`donations-client.tsx:1104`) "100 puan = 1 birim"de 99 puanlık bağış "0 birim" gösterir; admin bunu göremez. |
| 27 | Etiketler (virgülle) | BOZUK | `page.tsx:375-386` | Kontrollü değer diziden türetiliyor (`join(', ')`), onChange `split/trim/filter` yapıyor → virgül ve sondaki boşluk her tuşta silinir; "Temel İhtiyaç" gibi çok kelimeli veya ikinci etiket yazmak imkânsız (yalnız yapıştırma/ortaya ekleme ile). Ayrıca müşteri arayüzü `tags`'i hiç render etmiyor (`donations-client.tsx:62` yalnız tip) → alan etkisiz. Kod okunarak doğrulandı, tarayıcıda çalıştırılmadı. |
| 28 | Durum + ilerleme metni | ÇALIŞIYOR | `page.tsx:388-390` | Düz metin "3250/10000"; ilerleme çubuğu, yüzde, rozet yok. |
| 29 | "Ayarları Kaydet" | KISMİ | `page.tsx:105-129,392`, `route.ts:116-153` | Başarıdan sonra `load()` TÜM projelerin taslaklarını sıfırlar (`page.tsx:65-80`) → başka projelerdeki kaydedilmemiş düzenlemeler sessizce kaybolur. Loading/disabled yok (çift gönderim), zod doğrulama yok, yok olan id'de P2025 → yakalanmamış 500 → `res.json()` fırlatır, toast yok. |
| 30 | "Pasife Al" | ÇALIŞIYOR | `page.tsx:395`, `route.ts:106-111` | Müşteriden anında gizler; onay diyalogu yok; aynı şekilde diğer taslakları siler. |
| 31 | "Soft Freeze" | SAHTE | `page.tsx:396`, `route.ts:106` | `isActive = action === 'activate'` → freeze birebir deactivate; şemada dondurma alanı yok (`schema.prisma:1677-1699`). Toast da "Proje pasifleştirildi" diyor (`page.tsx:97`). Destructive kırmızı buton, farklı bir şey yapıyormuş izlenimi veriyor. |
| 32 | "Aktifleştir" | ÇALIŞIYOR | `page.tsx:399` | |
| 33 | Son bağış logları | KISMİ | `page.tsx:408-420`, `route.ts:64-71` | Sabit 100 kayıt; arama/filtre/proje/kullanıcı/tarih aralığı yok; kendi sayfalaması yok; kullanıcı profiline link yok. Proje filtreleri loglara uygulanmıyor ama aynı ekranda olduğu için uygulanıyormuş gibi algılanıyor. |
| 34 | Log satırı: mesaj, görünürlük, tarih | ÇALIŞIYOR | `page.tsx:413-416` | |
| 35 | Sayfalama (Önceki/Sonraki) | KISMİ | `page.tsx:421-441` | Proje listesini sayfalıyor ama loglar kartının ALTINDA duruyor → loglar için sanılıyor; sayfa değişince taslaklar sıfırlanır. |
| 36 | Yükleniyor durumu | KISMİ | `page.tsx:40,213` | Yalnız buton metni; ilk yüklemede KPI'lar "0" ve liste boş görünür (yanlış "sıfır veri" izlenimi), skeleton yok. |
| 37 | Hata durumu | EKSİK | `page.tsx:63-82` | `!res.ok` sessizce yutulur; ekranda hata/yeniden dene yok. |
| 38 | Boş durum | EKSİK | `page.tsx:257,411` | Proje veya log yoksa boş kart. |
| 39 | Yetki kontrolü | KISMİ | `route.ts:11,96,117`; `proxy.ts:79-89,102-117` | Sayfa: ADMIN rolü + gizli kapı cookie'si. API: yalnız `requireAuth(['ADMIN'])`; `/api/*` proxy'de gate cookie kontrolünden muaf → gate'i geçmemiş ADMIN rollü oturum API'yi doğrudan çağırabilir (sistem geneli, bu sayfaya özgü değil). |
| 40 | Denetim kaydı (audit log) | EKSİK | `route.ts:95-153` | Diğer admin uçları `prisma.auditLog.create` kullanıyor (ör. `app/api/admin/cosmetics/route.ts:61`); burada ekonomi parametresi (perPoint, goal) değişiklikleri izsiz. |
| 41 | Proje oluşturma / silme / arşivleme | EKSİK | `route.ts` (POST/DELETE yok) | Projeler yalnız `prisma/seed.ts:879+` ile oluşuyor; operatör yeni kampanya açamıyor. |
| 42 | Öne çıkarma (`isFeatured`), başlangıç/bitiş tarihi | EKSİK | `schema.prisma:1688-1690`; müşteri `donations-client.tsx:252-253` | Müşteri ekranı öne çıkanları ayrı gösteriyor ama admin bunu değiştiremiyor; `endDate` hiçbir yerde uygulanmıyor. |
| 43 | Kaydedilmemiş değişiklik (dirty) göstergesi / sayfadan çıkış uyarısı | EKSİK | `page.tsx:46,101-103` | |
| 44 | Yıkıcı aksiyon onayı | EKSİK | `page.tsx:395-396` | |
| 45 | Mobil yerleşim | KISMİ | `page.tsx:218-246,261,271,302,391` | Grid'ler tek sütuna iniyor; ancak proje başına ~15 alan + 7 buton çok uzun kaydırma; aksiyon satırı `flex gap-1` sarılmıyor (dar ekranda taşma riski, doğrulanmadı). |
| 46 | Erişilebilir form etiketleri | EKSİK | `page.tsx:262-386` | Tüm alanlar yalnız placeholder; doldurulmuş 4 sayısal alanın hangisinin "hedef", hangisinin "oran" olduğu görsel olarak anlaşılmıyor. |

**Durum sayımı:** ÇALIŞIYOR 19 · KISMİ 16 · BOZUK 2 · SAHTE 1 · EKSİK 8 (toplam 46)

---

## Bulgular

### B1 — Yüksek · Veri kaybı/UX · Bir projeyi kaydetmek diğer tüm projelerdeki kaydedilmemiş düzenlemeleri siliyor
- **Kanıt:** `page.tsx:127-128` (`await load()`), `page.tsx:65-80` (`setDrafts(nextDrafts)` tüm taslakları sunucu verisiyle değiştirir); aynı durum `updateProjectStatus` (`page.tsx:98`), sayfa/sıralama değişimi (`page.tsx:84`).
- **Sorun:** Sayfa 20 projeyi aynı anda düzenlenebilir form olarak açıyor ama tek tek kaydettiriyor. A projesinde değişiklik yapıp B'yi kaydeden ya da B'yi pasife alan operatör A'daki emeğini sessizce kaybeder.
- **Öneri:** Form modelini "liste + detay" yapısına çevir: liste satırları salt okunur; düzenleme bir Sheet/Drawer içinde tek proje için `react-hook-form` + zod ile yapılır. Kaydetme sonrası yalnız ilgili proje `PUT` yanıtındaki `project` ile yerelde güncellenir (yanıt zaten dönüyor, `route.ts:152`), tüm listeyi yeniden çekmeye gerek yok. Kirli durum varken Drawer kapatma/sayfa değiştirme onayı iste.
- **Efor:** M

### B2 — Yüksek · Sahte özellik · "Soft Freeze" pasife almaktan farksız
- **Kanıt:** `route.ts:106` `const isActive = action === 'activate';` → `freeze` ve `deactivate` aynı yazımı yapar; `page.tsx:97` freeze için de "Proje pasifleştirildi" toast'ı; şemada dondurma alanı yok (`schema.prisma:1677-1699`).
- **Sorun:** Kırmızı destructive buton operatöre ayrı bir mod (ör. "görünür kalsın ama bağış alınmasın") vaat ediyor; gerçekte proje müşteriden tamamen kalkıyor.
- **Öneri:** Ya butonu kaldır ya da gerçek bir yaşam döngüsü tanımla: `status` enum'u (`DRAFT | ACTIVE | PAUSED | COMPLETED | ARCHIVED`). `PAUSED`: müşteride görünür, ilerleme ve "geçici olarak durduruldu" rozeti ile, ama `POST /api/customer/donations` reddeder (`route.ts:211` kontrolü `status === 'ACTIVE'` olmalı). Geçişleri tek bir `PATCH /status` ucu üzerinden, izinli geçiş tablosu ile yap.
- **Efor:** M

### B3 — Yüksek · Hata · Etiket alanına virgül ve boşluk yazılamıyor; ayrıca müşteri tarafında hiç gösterilmiyor
- **Kanıt:** `page.tsx:376` `value={draft.tags.join(', ')}` ve `page.tsx:378-383` her tuşta `split(',').map(trim).filter(Boolean)` → "Çevre," → `["Çevre"]` → "Çevre"; "Temel " → "Temel". Müşteri istemcisinde `tags` yalnız tip tanımında (`donations-client.tsx:62`), render edilmiyor.
- **Sorun:** Kontrollü girdinin değeri normalize edilmiş diziden türetildiği için ayırıcı karakter anında yutuluyor; yeni etiket yazmak pratikte imkânsız. Yazılabilse bile son kullanıcıya etkisi yok — ölü alan.
- **Öneri:** Etiketleri chip/token girişine çevir (ham metni ayrı state'te tut, Enter/virgül ile chip'e dönüştür, Backspace ile sil). Ardından ürün kararı ver: etiketler müşteri kartında gösterilecek ve filtrelenecekse müşteri istemcisine ekle; değilse alanı kaldır.
- **Efor:** S

### B4 — Yüksek · Veri bütünlüğü (çapraz modül) · Admin'in kabul ettiği değerler müşteri tarafında bozuk/şişirilmiş veri üretiyor
- **Kanıt:**
  - perPoint = 0: admin kabul ediyor (`page.tsx:138,170` yalnız `< 0` reddediliyor); müşteri `perPoint || 1` kullanıyor (`app/api/customer/donations/route.ts:254`, `donations-client.tsx:181,605,683,726,1104`) → 0 "1 puan = 1 birim" olarak gösterilir, etki 100 kat şişebilir.
  - goal = 0: `route.ts:133` `Math.max(0, …)`; müşteride `current/goal` (`donations-client.tsx:604,725`) → NaN% / Infinity, Infinity ise bağış butonu "tamamlandı" olarak kilitlenir (`:699`).
  - goal < current: uyarısız; müşteride bağış butonu kapanır ama API (`customer/donations/route.ts:206-216`) hedef kontrolü yapmaz → istemci ile sunucu kuralı tutarsız.
  - Kategori serbest metin (`page.tsx:264`), müşteri sabit 5 anahtar bekliyor (`donations-client.tsx:86-116`).
  - Müşteri etkiyi `Math.floor` ile gösteriyor; admin'in "100 puan = 1 birim" preset'i küçük bağışlarda "0 birim" teşekkürü üretir (`donations-client.tsx:226,1104`).
- **Sorun:** Admin formu ile müşteri gösterimi arasında ortak bir sözleşme yok; operatör iyi niyetli bir değerle müşteriye anlamsız sayı gösterebilir.
- **Öneri:** `lib/donations/contract.ts` gibi paylaşılan bir zod şeması: `goal: int ≥ 1`, `impact.perPoint: number > 0`, `impact.unit/label: 1-40 karakter`, `category: z.enum(DONATION_CATEGORIES)` (enum'u müşteri istemcisi de aynı modülden alsın). Hem admin PUT hem müşteri hesapları bu modülü kullansın; `perPoint || 1` gibi sessiz düzeltmeler kaldırılsın. Admin formunda canlı "müşteri böyle görecek" önizlemesi (100/500/1000 puan bağışın etkisi, yuvarlama dahil) göster. `goal < current` girildiğinde "Proje hemen tamamlandı sayılacak" uyarısı ver.
- **Efor:** M

### B5 — Orta · Yanlış veri · "Aktif proje" KPI'ı sayfa diliminden hesaplanıyor
- **Kanıt:** `route.ts:79` `activeProjects: projects.filter((p) => p.isActive).length` — `projects` `skip/take` ve arama filtresi uygulanmış liste (`route.ts:42-46`).
- **Sorun:** 20'den fazla projede, arama yapıldığında veya "sadece aktif" açıkken KPI gerçek aktif proje sayısını değil, ekrandaki satırları sayar.
- **Öneri:** `Promise.all` içine filtresiz `prisma.donationProject.count({ where: { isActive: true } })` ekle. KPI'ları liste sorgusundan ayır (ayrı `/api/admin/donations/stats` ucu, Redis'te kısa TTL ile önbellek), böylece filtre değişimleri global aggregate'i tekrar çalıştırmaz.
- **Efor:** S

### B6 — Orta · Hata yönetimi · Ağ/500 hatasında sayfa kalıcı "Yükleniyor" durumunda kilitleniyor
- **Kanıt:** `page.tsx:52-83` try/catch/finally yok; `res.json()` JSON olmayan yanıtta fırlatır, `setLoading(false)` (`:82`) çalışmaz; `!res.ok` dalında hiçbir geri bildirim yok. Route'larda da try/catch yok (`route.ts:10-153`), müşteri ucunun kullandığı `responseIfDatabaseUnavailable` (`customer/donations/route.ts:162`) burada kullanılmıyor. `PUT/PATCH` yok olan id'de Prisma P2025 → yakalanmamış 500. `page`'e geçersiz değer `NaN` üretir (`route.ts:17`).
- **Sorun:** Neon soğuk başlangıç veya geçici hata durumunda operatör ekranın neden boş/kilitli olduğunu anlayamaz; mutasyonlarda başarısızlık sessizdir.
- **Öneri:** Veri katmanını TanStack Query/SWR'a taşı (projede `app/admin/analytics` vb. zaten kullanıyor): `isError` için hata kartı + "Tekrar dene", mutasyonlarda `onError` toast. Route'ları try/catch + `responseIfDatabaseUnavailable` + P2025 → 404 ile sar; query parametrelerini zod ile parse et.
- **Efor:** S

### B7 — Orta · UX/doğruluk · "Uygulandı" toast'ları ve "Aktif oran" metni kaydedilmemiş değeri gerçekmiş gibi gösteriyor
- **Kanıt:** `page.tsx:151,184` success toast "Oran uygulandı" ama yalnız yerel taslak değişti; `page.tsx:342` "Aktif oran" `ratioPerPointInput` (kaydedilmemiş) değerini gösteriyor; `page.tsx:278-288` "1 puan = ?" alanı taslağa hiç yazmıyor, `saveProjectDetails` (`:105-121`) yalnız `draft.impact`'i gönderiyor.
- **Sorun:** Üç ayrı giriş yolu (doğrudan perPoint, X/Y oranı, preset) ve iki ayrı "uygula" butonu aynı tek sayıyı (perPoint) değiştiriyor; operatör "uygulandı" görüp sayfadan çıkar, değer kaydedilmez.
- **Öneri:** Oran düzenleyicisini tek bileşene indir: "X puan = Y birim" iki alanı, perPoint türetilmiş ve salt okunur gösterilsin; ara "uygula" butonları kalksın, değer doğrudan form durumuna yazılsın; tek bir "Kaydet". "Yayındaki oran" ile "taslak oran" ayrı etiketlerle gösterilsin.
- **Efor:** S

### B8 — Orta · Güvenlik/izlenebilirlik · Ekonomi parametresi değişiklikleri denetim kaydına yazılmıyor
- **Kanıt:** `route.ts:95-153` hiçbir `auditLog` yazımı yok; diğer admin uçları yazıyor (`app/api/admin/cosmetics/route.ts:61`, `AuditLog` modeli `schema.prisma:1106-1118`).
- **Sorun:** perPoint, hedef, aktiflik değişiklikleri müşteriye gösterilen etki iddiasını doğrudan değiştiriyor; kim neyi ne zaman değiştirdi bilinmiyor.
- **Öneri:** PUT/PATCH'te `oldData/newData` ile `prisma.auditLog.create` (aynı transaction içinde); sayfada proje detayında "Değişiklik geçmişi" sekmesi.
- **Efor:** S

### B9 — Orta · Güvenlik (sistem geneli) · Admin API'leri gizli kapı cookie'sini zorunlu kılmıyor
- **Kanıt:** `proxy.ts:102-117` `/api/` istekleri `authMiddleware`'e girmeden geçiyor; gate kontrolü yalnız sayfa yollarında (`proxy.ts:79-89`); `requireAuth` (`lib/api-auth.ts:52-80`) gate'e bakmıyor.
- **Sorun:** Bu sayfaya özgü değil ama bu sayfanın mutasyon uçları da etkileniyor: rolü ADMIN olup gate cevabını bilmeyen bir oturum `PUT /api/admin/donations` ile proje oranlarını değiştirebilir. Gizli kapı tasarımının amacıyla çelişiyor.
- **Öneri:** `requireAuth(['ADMIN'])` içinde (veya `/api/admin/*` için proxy'de) `gateCookieBelongsTo` kontrolü ekle; merkezi tek düzeltme tüm admin uçlarını kapsar.
- **Efor:** S

### B10 — Orta · Yarış koşulu · "Filtreyi uygula" iki paralel istek başlatabiliyor
- **Kanıt:** `page.tsx:243` `setPage(1); load();` + `page.tsx:84` effect `[page, …]`. Sayfa ≠ 1 iken eski `page` değerli `load()` ve effect'in `load()`'u aynı anda çalışır; `AbortController` yok, son dönen yanıt ekranı belirler.
- **Öneri:** Filtre durumunu (q, sort, onlyActive, page) tek bir query key'e bağla (URL search params + TanStack Query); arama için 300 ms debounce, butonu kaldır.
- **Efor:** S

### B11 — Orta · Bilgi mimarisi · Sayfalama loglar için sanılıyor; loglar filtrelenemiyor/sayfalanamıyor
- **Kanıt:** Sayfalama `page.tsx:421-441` log kartının altında; aslında projeleri sayfalıyor (`route.ts:45-46`). Loglar sabit `take: 100` (`route.ts:66`).
- **Öneri:** Proje ve işlem görünümlerini sekmelere ayır ("Projeler" / "İşlemler"); işlemler için sunucu tarafı cursor sayfalama, proje/kullanıcı/tarih/puan aralığı filtreleri ve `isPublic` filtresi.
- **Efor:** M

### B12 — Düşük · Dil/tutarlılık · TR/EN karışıklığı ve Türkçe karakter eksikliği
- **Kanıt:** "Soft Freeze" (`page.tsx:396`), "CSV" (`:212`); toast önekleri "Basarili:" (`lib/admin-toast.ts:17`, ş eksik, sistem geneli). Sayfa i18n kullanmıyor; sidebar `labelKey` kullanıyor (`components/dashboard/sidebar.tsx:174`).
- **Öneri:** "Dondur" / "CSV indir"; `admin-toast` önekini "Başarılı:" yap (veya önekleri tamamen kaldır, sonner ikonları zaten anlatıyor).
- **Efor:** S

### B13 — Düşük · Erişilebilirlik · Etiketsiz alanlar, durum bildirmeyen kontroller
- **Kanıt:** `page.tsx:262-386` hiçbir `<Label htmlFor>` yok; `page.tsx:225` select etiketsiz; `page.tsx:234-240` toggle `aria-pressed` yok; hata metni `aria-live` değil (`:345-347`).
- **Öneri:** Her alana görünür `Label`; sayısal alanlarda birim soneki (input adornment: "puan", "birim/puan"); toggle'ı shadcn `Switch` + label; hata metinlerini `aria-describedby` ile alana bağla.
- **Efor:** S

### B14 — Düşük · Veri bütünlüğü (doğrulanmadı) · `current` bağış toplamıyla uzlaştırılmıyor
- **Kanıt:** Seed `current` değerlerini bağış kaydı olmadan sabit yazıyor (`prisma/seed.ts:888,904,920` → 3250, 8750, 6420). Admin `current`'ı sadece okuyor (`page.tsx:389`); `SUM(donation.points)` ile kıyas yok. Canlı veritabanında seed'in çalışıp çalışmadığı doğrulanmadı (DB'ye dokunulmadı).
- **Sorun:** Müşteriye gösterilen ilerleme gerçek bağışlardan kopuk olabilir; seed açıklamaları da oranı metne gömüyor ("Her 100 puan = 10 litre", `seed.ts:886`) → admin oranı değiştirince açıklama yalan söyler.
- **Öneri:** Proje detayında "Kayıtlı ilerleme" vs "Gerçek bağış toplamı" farkını göster, fark varsa "Uzlaştır" aksiyonu (audit log'lu). Açıklamada oranı sabit metin yerine `{{oran}}` değişkeniyle üret.
- **Efor:** S

### B15 — Düşük · CSV · Excel'de Türkçe karakterler bozuk, kapsam dar
- **Kanıt:** `page.tsx:195-196` BOM eklenmiyor; yalnız 5 sütun, yalnız son 100 kayıt.
- **Öneri:** Sunucu tarafı akışlı export ucu (`GET /api/admin/donations/export?from&to&projectId`) — tüm filtreye uyan kayıtlar, `﻿` BOM, mesaj/görünürlük/e-posta/kategori sütunları.
- **Efor:** S

---

## Eksik özellikler (kıyas: Stripe Dashboard, Linear, Retool, PostHog)

1. **Proje yaşam döngüsü:** oluştur, çoğalt, arşivle, öne çıkar (`isFeatured`), başlangıç/bitiş tarihi ile planla (şemada var, `schema.prisma:1688-1690`, arayüzde yok); bitiş tarihi geçince otomatik `COMPLETED`.
2. **İşlem gezgini (Stripe Payments benzeri):** filtrelenebilir/sıralanabilir tablo, satır tıklayınca yan panel (kullanıcı, cüzdan hareketi, mesaj, görünürlük), kullanıcı profiline ve fraud ekranına derin link; şüpheli yoğun bağış (ör. puan aklama) işareti.
3. **Zaman serisi analitiği (PostHog benzeri):** günlük bağış puanı, bağışçı sayısı, proje bazında kırılım, ortalama bağış, ekonomideki puan "sink" payı (economy-sim ile bağlantılı).
4. **Müşteri önizlemesi:** düzenlenen projenin müşteri kartının canlı önizlemesi (kategori rengi, ilerleme, etki hesabı).
5. **Değişiklik geçmişi ve geri alma:** audit log tabanlı sürüm listesi (Linear issue history benzeri).
6. **Toplu işlem ve klavye:** çoklu seçimle pasife alma/arşivleme, `/` ile arama, `Cmd+S` kaydetme.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Operatör sayfayı açtığında üç soruya 5 saniyede cevap alır: "Bağış modülü sağlıklı mı?", "Hangi proje nerede?", "Son ne oldu?". Düzenleme ayrı, odaklı ve geri alınabilir bir akış olur; yanlış değer girmek (goal 0, perPoint 0, bilinmeyen kategori) mümkün değildir.

**Yerleşim:**
- **Üst şerit (KPI):** Toplam bağış puanı (30 gün sparkline), bağış sayısı, benzersiz bağışçı, aktif proje / toplam, hedefe ulaşan proje. Sayılar `tr-TR` formatlı; KPI'lar ayrı stats ucundan, filtreden bağımsız.
- **Sekmeler:** `Projeler` · `İşlemler` · `Ayarlar` (modül açık/kapalı → `/admin/modules`'a derin link, min/max bağış). Sekme ve filtreler URL'de.
- **Projeler sekmesi:** kompakt tablo/kart ızgarası: ikon + ad, kategori rozeti (müşteriyle aynı renk anahtarı), durum rozeti, ilerleme çubuğu (%), oran ("100 puan = 10 litre"), son bağış zamanı, satır menüsü (Düzenle, Duraklat, Arşivle, Çoğalt). Sağ üstte "Yeni proje".
- **Düzenleme Sheet'i:** sol sütun form (Label'lı alanlar; kategori Select; emoji seçici; oran düzenleyici "X puan = Y birim" tek bileşen; hedef; tarih aralığı; öne çıkar Switch; etiket chip girişi), sağ sütun canlı müşteri kartı önizlemesi + "100/500/1000 puan bağışlarsa" etki tablosu. Altta kirli-durum çubuğu ("2 değişiklik kaydedilmedi · Vazgeç · Kaydet").
- **İşlemler sekmesi:** sunucu sayfalı tablo, filtre çubuğu (proje, tarih aralığı, puan aralığı, görünürlük), satır yan paneli, "CSV indir" (sunucu export).

**Motion / 3D:** 3D gerekmez; bu bir iç operasyon aracı. Ölçülü motion: ilerleme çubuklarının ilk görünüşte 300 ms dolması (`m as Motion`, `useReducedMotion` ile kapatılır), Sheet giriş/çıkışı (shadcn varsayılanı), kaydetme sonrası satırın kısa vurgu yanıp sönmesi. KPI sayılarında sayaç animasyonu yalnız ilk yüklemede.

**Veri/API değişiklikleri:**
- `DonationProject.status` enum (`DRAFT/ACTIVE/PAUSED/COMPLETED/ARCHIVED`) ve `isActive`'ten göç (müşteri ucu `status === 'ACTIVE'` + bitiş tarihi kontrolü).
- Paylaşılan zod sözleşmesi (`lib/donations/contract.ts`): kategori enum'u, `goal ≥ 1`, `perPoint > 0`, uzunluk sınırları; admin ve müşteri aynı modülü kullanır, `perPoint || 1` kaldırılır.
- Uçlar: `GET /api/admin/donations/stats` (Redis 60 sn), `GET /api/admin/donations/projects`, `POST/PUT/PATCH(status)` projeler, `GET /api/admin/donations/transactions` (cursor), `GET /api/admin/donations/export`. Hepsi try/catch + `responseIfDatabaseUnavailable` + audit log + gate cookie kontrolü.
- İstemci: TanStack Query, optimistic status değişimi, mutasyon sonrası tek kaydın cache'te güncellenmesi.

---

## Çakışmalar / birleştirme önerisi

- **`/admin/modules`** (`app/admin/modules/page.tsx:44`, `app/api/admin/modules/overview/route.ts:32,60`): bağış modülünün açık/kapalı durumu ve toplam bağış sayısı orada. Çakışma küçük; birleştirme yerine bu sayfaya "Modül durumu: Açık" rozeti + `/admin/modules` derin linki eklenmeli, modül kapalıyken üstte uyarı şeridi gösterilmeli.
- **`/admin/economy-sim`** ve puan ekonomisi ekranları: bağış bir puan "sink"idir; bağış toplamları ekonomi panelinde görünmüyor (doğrulanmadı — economy-sim içinde `donation` referansı bulunamadı). İşlemler verisi ekonomi panosuna bir metrik olarak beslenmeli; ayrı sayfa olarak korunmalı.
- Başka bir admin sayfası bağış projelerini yönetmiyor; sayfa **korunmalı ama yeniden tasarlanmalı**, kaldırma/birleştirme önerilmez.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı. Okunan dosyalar: `app/admin/donations/page.tsx`, `app/api/admin/donations/route.ts`, `app/api/customer/donations/route.ts`, `app/customer/donations/donations-client.tsx`, `proxy.ts`, `lib/api-auth.ts`, `lib/admin-gate-edge.ts`, `prisma/schema.prisma:1677-1699`. Her iddia çürütülmeye çalışıldı.

| # | İddia | Karar | Gerçek önem |
|---|---|---|---|
| 1 | Soft Freeze, deactivate ile aynı | **Doğrulandı** | Orta (yanıltıcı UI, veri kaybı yok) |
| 2 | Kaydet/durum değişimi diğer taslakları siliyor | **Doğrulandı** | Yüksek (sessiz emek kaybı) |
| 3 | Etiket input'u virgül/boşluk yutuyor | **Doğrulandı** | Düşük (müşteride etiket gösterilmiyor) |
| 4 | goal=0 / perPoint=0 / serbest kategori | **Doğrulandı** | Yüksek (müşteri ekranı bozuk/yanlış) |
| 5 | Aktif proje KPI'ı yanlış | **Doğrulandı** | Düşük-orta (yalnız admin görür) |
| 6 | load() hata yolunda kilitlenme | **Doğrulandı (kısmen abartılı)** | Orta ("kalıcı" değil) |
| 7 | Admin API'leri gate cookie'siz erişilebilir | **Doğrulandı** | Yüksek (sistem geneli) |

**1. Soft Freeze sahte — doğrulandı.** `route.ts:102` `freeze`'i geçerli aksiyon olarak kabul ediyor ama `route.ts:106` `isActive = action === 'activate'` yüzünden `freeze` ile `deactivate` aynı yazımı yapıyor (`isActive=false`). Şemada ayrı bir durum alanı yok (`schema.prisma:1687` yalnız `isActive`). Müşteri ucu `isActive: true` filtreliyor (`app/api/customer/donations/route.ts:58`) ve bağışı `!project.isActive` ile reddediyor (`:211`), yani "freeze" edilen proje müşteriden tamamen kayboluyor. İstemci toast'ı da bunu ele veriyor: `page.tsx:97` freeze için "Proje pasifleştirildi" diyor. Yeniden üretim: aktif projede kırmızı "Soft Freeze"e bas → kart "Pasif" olur, müşteri listesinden düşer; "Pasife Al" ile birebir aynı sonuç. Veri kaybı yok, "Aktifleştir" ile geri alınabilir; bu yüzden önem Orta. Öneri: ya butonu kaldır ya da gerçek bir `status` enum'u (`ACTIVE/PAUSED/...`) ile "görünür ama bağışa kapalı" modunu müşteri tarafında da uygula.

**2. Taslakların ezilmesi — doğrulandı.** `saveProjectDetails` (`page.tsx:128`) ve `updateProjectStatus` (`:98`) başarı sonrası `load()` çağırıyor; `load()` (`:65-80`) tüm sayfadaki projeler için `nextDrafts`'ı sunucu verisinden kurup `setDrafts(nextDrafts)` ile **birleştirmeden** değiştiriyor; oran girişleri (`ratioBasePoints/Units/PerPointInput`) de 100 puan varsayılanına sıfırlanıyor. Yeniden üretim: A projesinin açıklamasını değiştir (kaydetme), B projesinde "Ayarları Kaydet"e bas → A'daki değişiklik uyarısız kaybolur. Aynı şey "Yenile", sıralama/sayfa değişimi (`:84`) ve "Filtreyi uygula" ile de olur. Kirli durum göstergesi veya `beforeunload` uyarısı yok. Öneri: kaydetme sonrası yalnız ilgili projenin kaydını sunucu yanıtından (`route.ts:152` zaten güncel `project` döndürüyor) güncelle; kirli projeleri izleyip yeniden yüklemede koru veya onay iste.

**3. Etiket input'u — doğrulandı, önem düşük.** `page.tsx:376` değer `tags.join(', ')`'ten türetiliyor, `:379-382` her tuşta `split(',').map(trim).filter(Boolean)` uygulanıyor. Kontrollü input olduğu için "Temel," yazıldığında boş parça atılıp değer "Temel"e döner (virgül kaybolur); "Temel " yazıldığında sondaki boşluk `trim` ile silinir, bu yüzden çok kelimeli etiket sırayla yazılamaz. Geçici yol var (metni yapıştırmak ya da imleçle araya karakter eklemek çalışır), ama normal yazım bozuk. Müşteri istemcisi `tags`'i yalnız tipte tanımlıyor (`donations-client.tsx:62`), hiçbir yerde render etmiyor; bu yüzden kullanıcıya etkisi şu an sıfır. Öneri: ham metni ayrı state'te tut, ayrıştırmayı blur/kaydetmede yap ya da chip girişi kullan; etiketlerin bir tüketicisi yoksa alanı kaldırmayı değerlendir.

**4. goal=0 / perPoint=0 / serbest kategori — doğrulandı.**
- `goal`: Admin input'u boşaltınca `Number('' || 0) = 0` (`page.tsx:275`), PUT `Math.max(0, …)` ile 0'ı kabul ediyor (`route.ts:133`). Müşteride `progress = current/goal*100` (`donations-client.tsx:604, 725`): `current=0` → `NaN` → "%NaN" yazar (`:654` `Math.min(NaN,100).toFixed(0)`); `current>0` → `Infinity` → `progress >= 100` olur, bağış butonu "Hedef tamamlandı" ile kilitlenir (`:699`). Sunucu `goal`'u kontrol etmediğinden (`app/api/customer/donations/route.ts:211` yalnız `isActive`) API üzerinden bağış yine de kabul edilir, yani UI ile sunucu tutarsız.
- `perPoint`: `applyPerPointDirect` 0'ı kabul ediyor (`page.tsx:170` yalnız `< 0` reddediyor), `applyImpactRatio` `unitBase=0`'ı kabul ediyor (`:138`); ayrıca `toFixed(4)` 0.00005'ten küçük oranları 0'a yuvarlıyor (`:144, :148`; ör. 100.000 puan = 1 birim). Sunucu (`app/api/customer/donations/route.ts:254`) ve müşteri (`donations-client.tsx:605, 683, 1104`) `perPoint || 1` kullandığından 0 sessizce **1:1** olur; bağışçıya gerçeğin kat kat üstünde etki gösterilir. ("100x" iddiası yalnız belirli oranlar için geçerli; genel ifade "1:1'e düşer" olmalı.)
- Kategori: serbest metin (`page.tsx:264`, `route.ts:132`). Bilinmeyen değerde ikon `Heart`'a, renk `categoryColors.water`'a, etiket `categoryLabelKeys.water`'a ("Su") düşüyor (`donations-client.tsx:602-603, 637`); `categoryGradients[...]` ise `undefined` döner ve buton/başlık gradyanı boş kalır (`:617, :630, :696`), beyaz metin arka plansız görünür. Admin "Eğitim" yazarsa müşteri kartı "Su" rozetli çıkar.
- Öneri: paylaşılan zod sözleşmesi (`goal ≥ 1`, `perPoint > 0`, kategori enum'u), admin'de Select, istemcide `perPoint || 1` geri dönüşünün kaldırılması.

**5. Aktif proje KPI'ı — doğrulandı, önem düşük-orta.** `route.ts:79` `projects.filter(p => p.isActive).length`, `skip/take` ile sayfalanmış (`:45-46`) ve `q` ile filtrelenmiş (`:21-31`) listeden sayıyor. Diğer iki KPI (`:60-63`) ise filtresiz global. Yeniden üretim: 25 aktif proje varken KPI en fazla 20 gösterir; "su" araması yapınca KPI eşleşen sayfadaki aktif sayıya düşer, ama "Toplam bağış" değişmez. Yalnız admin karar verisini etkiler. Öneri: ayrı `prisma.donationProject.count({ where: { isActive: true } })`.

**6. load() hata yolu — doğrulandı, "kalıcı" kısmı abartılı.** `page.tsx:52-83`'te try/finally yok; `fetch` ağ hatasında, `res.json()` (`:62`) gövdesi boş/JSON olmayan 500'de fırlatır ve `setLoading(false)` (`:82`) çalışmaz. Route'larda (`route.ts:10-153`) try/catch ve `responseIfDatabaseUnavailable` yok (müşteri ucu bunu yapıyor, `app/api/customer/donations/route.ts:277-288`). Sonuç: "Yenile" butonu "Yükleniyor..." ile disabled kalır, hata mesajı gösterilmez. **Ancak kalıcı değil:** "Filtreyi uygula" (`:241-246`) disabled değil ve `load()`'u doğrudan çağırıyor; sıralama/sayfa/aktif filtresi değişimi de `useEffect` (`:84`) ile yeniden yükler, başarılı ilk yükleme durumu düzeltir. PUT/PATCH'te Prisma hatası (P2025, Neon kopması) 500'e dönüşür, `res.json()` (`:92, :122`) fırlatır, toast gösterilmez ve unhandled rejection olur; admin kaydın başarısız olduğunu fark etmez. P2025 bu sayfada pratikte nadir (projeyi silen bir uç yok); asıl gerçekçi tetikleyici DB kesintisi. Öneri: tüm uçlarda try/catch + standart hata zarfı; istemcide try/catch/finally ve kalıcı hata şeridi.

**7. Admin API'leri gate'siz — doğrulandı (sistem geneli).** `proxy.ts:105-119` `/api/*` isteklerini `authMiddleware`'e sokmadan `NextResponse.next()` ile geçiriyor; gate kontrolü (`proxy.ts:79-88`) yalnız `/admin` sayfa yollarında. `requireAuth` (`lib/api-auth.ts:52-80`) yalnız oturum + rol + token-replay kontrol ediyor; `app/` ve `lib/` içinde `/admin-gate` dışında hiçbir API gate cookie'sine bakmıyor (`gateCookieBelongsTo` yalnız proxy'de kullanılıyor). Yeniden üretim: rolü ADMIN olan ama gizli cevabı bilmeyen hesapla giriş yap → `/admin/donations` sayfası `/admin-gate`'e yönlendirir, ama tarayıcı konsolundan `fetch('/api/admin/donations', {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({projectId:'…', impact:{perPoint:1000}})})` 200 döner ve oran canlıda değişir. Bu tam olarak gate'in koruması amaçlanan senaryo (rolü kazara/kötü niyetle ADMIN yapılmış hesap). Denetim kaydı iddiası da doğru: `app/api/admin/donations/route.ts` hiçbir audit yazımı yapmıyor, oysa başka admin uçları yapıyor (ör. `app/api/admin/api-keys/route.ts`, `app/api/admin/badges/algorithm/route.ts`).

**Ek gözlem (iddiada yoktu, aynı tehdit modelini zayıflatıyor):** proxy'deki `gateCookieBelongsTo` (`lib/admin-gate-edge.ts:14-22`) HMAC'i **doğrulamıyor**, yalnız `userId.<64 hex>` biçimini kontrol ediyor. Yorum (`:10-12`) "cookie'yi elde etmenin tek yolu doğru cevap" diyor, ama ADMIN rollü kullanıcı kendi `userId`'sini bilir ve `admin_gate=<userId>.<herhangi 64 hex>` cookie'sini elle yazarak sayfa gate'ini de geçebilir. Gate'in API katmanına taşınması sırasında doğrulama Node tarafında (`lib/admin-gate.ts`) HMAC ile yapılmalı; proxy kontrolü yalnız hızlı ön filtre olarak kalmalı. (Doğrulanma şekli: kod okuması; canlıda denenmedi.)

**Düzeltme önceliği:** 7 (gate + audit, sistem geneli) → 4 (doğrulama sözleşmesi, müşteri ekranı) → 2 (taslak kaybı) → 6 (hata zarfı) → 1 (freeze'i ya gerçek yap ya kaldır) → 5 → 3.
