# /customer/remedy/[offerId]

**Amaç:** Kötü bir deneyim (QR geri bildirimi veya tüketim yorumu) sonrası işletmenin gönderdiği telafi teklifini müşteriye göstermek; müşterinin telafi türünü (indirim / puan / ücretsiz ürün) ve miktarını seçip kabul etmesini sağlamak; teklifin süreç zaman çizelgesini göstermek.

**Genel puan:** 4/10 · **Karar:** yeniden tasarla

Sayfa küçük ve temiz yazılmış. Yarış koşulu koruması (atomik `updateMany`) ve yetki kontrolü doğru. Ama ürün açısından döngü kapanmıyor: müşteri "Seçiminiz kaydedildi — teklif kullanıma hazır" mesajını görüyor, sonra hiçbir şey olmuyor. Puan yüklenmiyor, kupon/kod üretilmiyor, işletme tarafında seçimi gören ya da kullanan bir ekran yok. Bunun üstüne hata durumunda sonsuz spinner, sunucuda seçim doğrulamasının olmaması ve iç süreç etiketlerinin müşteriye sızması var.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Seçim kaydediliyor, ama telafinin teslimi yok (puan/kupon/bayi kullanımı); hata ve "bulunamadı" ekranı bozuk. |
| UX | 4/10 | İki ardışık dropdown, geri alınamaz seçim için onay yok, hangi deneyime ait olduğu gösterilmiyor; kabul sonrası ham `discount / 20` görünüyor. |
| Görsel | 4/10 | Standart shadcn kart; liste sayfasındaki `DashboardPageHero` ve `max-w-3xl` yok, ödül hissi veren bir an yok. |
| Mimari | 4/10 | Sunucuda `options`'a karşı doğrulama yok, durum makinesi yarım (`expired`/`completed` hiç yazılmıyor), react-query önbelleği geçersiz kılınmıyor. |
| Performans | 6/10 | Hafif sayfa; ama zaman çizelgesi her yüklemede 2 kez, kabulde 2 kez daha çekiliyor. |
| Erişilebilirlik + mobil | 5/10 | Yükleniyor durumu `role="status"` ile doğru; `Label` öğeleri `Select`'e bağlı değil, mobilde geri butonu tam genişlik, masaüstünde içerik genişliği sınırsız. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Oturum/rol koruması (sayfa + API) | ÇALIŞIYOR | `proxy.ts:53`, `app/api/customer/remedy/[offerId]/route.ts:25-57` | Sahiplik kontrolü `offer.userId !== session.user.id`; IDOR yok. |
| 2 | Teklif yükleme (GET) | ÇALIŞIYOR | `page.tsx:50-73`, `route.ts:37-97` | İptal bayrağı (`cancelled`) ile unmount güvenli. |
| 3 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:150-154`, `components/ui/inline-loading-status.tsx:28-32` | `role="status"`, `aria-live`. İskelet yok, sadece spinner. |
| 4 | Hata durumu (403/404/500/ağ) | BOZUK | `page.tsx:58-61`, `page.tsx:150` | `data` null kalıyor, `loading` false oluyor ve `loading \|\| !data` sonsuza kadar spinner gösteriyor; tek geri bildirim toast. |
| 5 | "Teklif bulunamadı" ekranı + geri linki | BOZUK (ölü kod) | `page.tsx:156-168`, `page.tsx:62` | `setData` sadece `j.offer` varsa çağrılıyor, bu dala ulaşılamıyor. |
| 6 | Geri butonu (`/customer/remedy`) | ÇALIŞIYOR | `page.tsx:174-181` | Mobilde `w-full` ghost buton tuhaf görünüyor. |
| 7 | Başlık + işletme adı | KISMİ | `page.tsx:189-191`, `route.ts:64-78` | İşlenmiş tekliflerde API `dealer` döndürmüyor; yenilemeden sonra işletme adı yerine "İşletme" yazıyor. |
| 8 | Teklif mesajı | ÇALIŞIYOR | `page.tsx:194` | |
| 9 | Telafi türü seçimi (Select) | ÇALIŞIYOR | `page.tsx:208-222` | |
| 10 | Miktar seçimi (Select + birim) | ÇALIŞIYOR | `page.tsx:223-239` | |
| 11 | Tür değişince miktarı sıfırlama | ÇALIŞIYOR | `page.tsx:98-102` | |
| 12 | "Tercihimi kaydet" butonu | ÇALIŞIYOR | `page.tsx:240-243` | Gönderim sırasında disabled + spinner; çift tıklama korunuyor. |
| 13 | Sunucuda seçimin teklif seçeneklerine karşı doğrulanması | EKSİK | `route.ts:15-18`, `route.ts:150-168` | Sadece `z.string().min(1)`; tür/değer `offer.options` içinde mi diye bakılmıyor, uzunluk sınırı yok. |
| 14 | Eşzamanlı kabul koruması | ÇALIŞIYOR | `route.ts:160-174` | `where: { status: 'pending' }` ile atomik `updateMany`, çakışmada 409. |
| 15 | Başarı toast'ı + iyimser durum | ÇALIŞIYOR | `page.tsx:117-133` | |
| 16 | "Kabul edildi" kutusu | KISMİ | `page.tsx:196-205` | Ham kod gösteriliyor (`discount / 20`); etiket ve birim (`%`, `puan`) yok. |
| 17 | Telafinin gerçekten teslim edilmesi (puan yükleme / kupon / bayi kullanımı) | SAHTE | `route.ts:187`; repo genelinde `selectedValue` okuyan bayi kodu yok | Kullanıcıya "teklif kullanıma hazır" deniyor ama hiçbir kod puan yüklemiyor, kod üretmiyor; bayi panelinde seçim görünmüyor. |
| 18 | Süreç zaman çizelgesi kartı | KISMİ | `page.tsx:249-272`, `lib/remedy-timeline.ts:22-57` | Başlık ve açıklama sabit Türkçe; "Otomasyon ile telafi taslağı oluşturuldu" / "Onay kuyruğunda" gibi iç olaylar müşteriye gösteriliyor. |
| 19 | Zaman çizelgesi özellik bayrağı | ÇALIŞIYOR | `timeline/route.ts:14-20`, `lib/innovation-config.ts:65` | Kapalıysa 403 dönüyor, kart sessizce gizleniyor. |
| 20 | Kabul sonrası zaman çizelgesi yenileme | KISMİ | `page.tsx:91`, `page.tsx:134-139` | Hem effect bağımlılığı hem el ile fetch tetikleniyor, çift istek gidiyor. |
| 21 | Liste önbelleğini (react-query) geçersiz kılma | EKSİK | `app/customer/remedy/page.tsx:47-56` (`staleTime: 60_000`) | Kabulden sonra listeye dönülünce teklif 60 sn boyunca hâlâ "Bekleyen" görünüyor. |
| 22 | İlgili deneyim bağlamı (puan/yorum/tarih) | EKSİK | `route.ts:90-92` döndürüyor, `page.tsx` kullanmıyor | Müşteri telafinin hangi ziyarete ait olduğunu göremiyor. |
| 23 | Teklifi reddetme / "gerek yok" | EKSİK | — | Sadece kabul yolu var. |
| 24 | Son kullanma tarihi / geri sayım | EKSİK | `prisma/schema.prisma:1334` (`expired` belgelenmiş) | Repo genelinde `status: 'expired'` yazan kod yok. |
| 25 | Geri alınamaz seçim için onay adımı | EKSİK | `page.tsx:240` | Tek dokunuşta kalıcı kayıt; buton metni "Tercihimi kaydet" bunun düzenlenebilir olduğunu ima ediyor. |
| 26 | Seçenek yoksa boş durum | EKSİK | `page.tsx:215` | `options` boşsa Select boş açılıyor, buton hep disabled kalıyor, açıklama yok. |
| 27 | Çok dillilik (TR/EN) | KISMİ | `page.tsx:254,257`; `route.ts:48,54,145`; `lib/admin-toast.ts:17-19`; `messages/tr.json` `selectAmount: "Miktar secin"` | EN arayüzde Türkçe hata/zaman çizelgesi; toast'larda ASCII "Dikkat:"/"Basarili:" öneki; `toLocaleString()` uygulama dilini değil tarayıcı dilini kullanıyor. |
| 28 | Form etiketlerinin erişilebilirliği | KISMİ | `page.tsx:209-212`, `page.tsx:225-228` | `Label` öğesinde `htmlFor` yok, `SelectTrigger` öğesinde `id` yok; ekran okuyucu alanı adsız okuyor. |
| 29 | Motion / mikro-etkileşim | KISMİ (ölü import) | `page.tsx:6` (`Motion`), `page.tsx:41` (`router`) | İkisi de import ediliyor ama hiç kullanılmıyor; kabul anında kutlama/geçiş yok. |
| 30 | Sayfa metadata | ÇALIŞIYOR | `app/customer/remedy/layout.tsx:4-6` | |
| 31 | Bildirim merkezinden derin link | ÇALIŞIYOR | `components/dashboard/notification-center.tsx:506-518` | |
| 32 | `expired` durumunda doğru gösterim | BOZUK (gizli) | `page.tsx:170`, `route.ts:64-78` | `alreadyProcessed` olan her durum "Kabul edildi" gösteriyor, `expired` de dahil; şu an `expired` yazılmadığı için gizli bir hata. |
| 33 | Yerleşim genişliği / tutarlılık | KISMİ | `page.tsx:173` ve liste `page.tsx:82` (`max-w-3xl`) | Detayda maksimum genişlik ve hero yok; masaüstünde kart ekranı boydan boya kaplıyor. |

**Durum sayıları:** ÇALIŞIYOR 14 · KISMİ 8 · BOZUK 3 · SAHTE 1 · EKSİK 7 (toplam 33)

---

## Bulgular

### 1. Telafi seçimi kaydediliyor ama müşteriye hiçbir şey teslim edilmiyor
- **Önem:** kritik · **Kategori:** ürün / işlevsellik · **Efor:** L
- **Kanıt:** `app/api/customer/remedy/[offerId]/route.ts:159-190`. Sadece `status`, `selectedType`, `selectedValue` ve `acceptedAt` yazılıyor, ardından "Seçiminiz kaydedildi — teklif kullanıma hazır" etiketli bir zaman çizelgesi olayı ekleniyor. Repo genelinde `selectedType`/`selectedValue` alanlarını okuyan tek bayi/admin kodu yok (grep: sadece müşteri sayfaları ve bu route). `points` türü için puan yükleyen bir yol da yok (`lib/` altında remedy içerip puan yazan dosya yok). `completed` ve `expired` olay türleri şemada belgelenmiş (`prisma/schema.prisma:2753`) ama hiçbir yerde yazılmıyor.
- **Sorun:** Telafi akışının amacı kırgın müşteriyi geri kazanmak. Müşteri "200 puan" seçiyor, bakiyesi değişmiyor. "%20 indirim" seçiyor, kasada gösterebileceği bir kod ya da QR yok, işletme de bu seçimi hiçbir ekranda görmüyor. Sonuçta güven ikinci kez kırılıyor. `business-outcomes` (`app/api/dealer/business-outcomes/route.ts:59`) ise `accepted` sayısını başarı metriği gibi raporluyor; metrik de yanıltıcı.
- **Profesyonel öneri:** Telafiyi bir **talimat** olarak değil, **teslim edilen değer** olarak modelleyin.
  - `points`: Kabul işlemi tek bir `prisma.$transaction` içinde yapılmalı. Önce offer `pending` iken `accepted` durumuna atomik geçmeli, sonra puan defterine bir `remedy_credit` kaydı düşülmeli (tek seferlik benzersiz anahtar: `remedyOfferId`). Bu, proje içindeki puan ekonomisi kurallarına uyar: atomik tek seferlik kredi, `points_credited` görünürlüğü. Değer yalnızca sunucudaki `options` listesinden alınmalı (bkz. Bulgu 2).
  - `discount` / `free_item`: Kabulde benzersiz bir telafi kodu/QR üretilmeli (`RemedyOffer.redeemCode @unique` + `expiresAt` + `redeemedAt`, ya da mevcut `UserReward.code` deseni). Müşteri bunu cüzdanında görmeli. Bayi tarafında bir "Telafi kodu okut/kullan" aksiyonu `accepted → redeemed` geçişini atomik yapmalı.
  - Durum makinesi `pending → accepted → redeemed | expired` olarak tamamlanmalı. Süresi dolanları işaretlemek için mevcut harici cron altyapısına (db-cleanup) bir adım eklenebilir.
  - Kabul başarı mesajını teslim türüne göre ayırın: "200 puan hesabına eklendi" ya da "Kodun hazır: kasada göster".

### 2. Sunucu, müşterinin seçtiği tür/değeri teklif seçeneklerine karşı doğrulamıyor
- **Önem:** yüksek · **Kategori:** güvenlik / veri bütünlüğü · **Efor:** S
- **Kanıt:** `app/api/customer/remedy/[offerId]/route.ts:15-18` (`selectedType: z.string().min(1)`, `selectedValue: z.string().min(1)`), `route.ts:126-129` (`options` alanı seçilmiyor bile), `route.ts:160-168`.
- **Sorun:** Oturumu açık bir müşteri, PATCH isteğini elle göndererek `{"selectedType":"points","selectedValue":"999999"}` ya da teklifte hiç olmayan bir tür kaydedebilir. Uzunluk sınırı da yok; çok büyük string'ler DB'ye yazılabilir. Bugün kimse bu alanı tüketmediği için zarar sınırlı. Ama Bulgu 1 düzeltilip puan/kupon teslimi bu alanlara bağlandığı anda doğrudan **puan basma açığına** dönüşür. Bayi, kaydedilmiş seçimi "müşterinin hakkı" diye görür.
- **Profesyonel öneri:** PATCH içinde `options` alanını da çekip normalize edin (`lib/remedy-options.ts` içindeki `templateToOption` mantığını yeniden kullanarak). `selectedType` mevcut bir `opt.type` olmalı, `selectedValue` da `opt.values.map(String)` içinde bulunmalı; aksi halde 400 dönün. Zod şemasına `.max(32)` / `.max(16)` ekleyin. Kalıcı olarak `selectedType` yerine seçilen seçeneğin tam anlık görüntüsünü saklayın (`{type,label,unit,value}`); böylece şablon değişse de geçmiş doğru kalır ve Bulgu 5'teki ham kod sorunu da çözülür.

### 3. Hata durumunda sonsuz spinner; "bulunamadı" ekranı ölü kod
- **Önem:** yüksek · **Kategori:** hata yönetimi / UX · **Efor:** S
- **Kanıt:** `page.tsx:58-61` (hata durumunda `setData` çağrılmıyor), `page.tsx:67` (`setLoading(false)`), `page.tsx:150` (`if (loading || !data)` spinner), `page.tsx:156-168` (ulaşılamayan dal). API, onay bekleyen ya da reddedilmiş teklifler için 404 döndürüyor (`route.ts:58-63`).
- **Sorun:** Bildirimden ya da eski bir linkten gelen, başkasına ait, reddedilmiş veya silinmiş bir teklif için kullanıcı "Teklif yükleniyor" spinner'ında takılı kalıyor. Bir toast çıkıp kayboluyor, ekranda geri dönmek için buton yok (sadece sidebar).
- **Profesyonel öneri:** `loading | ready | error(kind)` ayrımlı açık bir durum modeli kurun ve veri çekimini liste sayfasıyla tutarlı olarak `useQuery(['customer','remedy',offerId])` ile yapın. 404/403 için "Bu teklif artık geçerli değil" boş durumu gösterin (illüstrasyon + "Tekliflerime dön" + "Geri bildirimlerim"). 5xx ve ağ hatası için "Tekrar dene" butonu ekleyin. Spinner yerine kart şeklinde bir iskelet kullanın.

### 4. Müşteriye iç süreç olayları sızıyor ("Otomasyon ile telafi taslağı", "Onay kuyruğunda")
- **Önem:** orta · **Kategori:** ürün / gizlilik / güven · **Efor:** S
- **Kanıt:** `lib/remedy-automation-core.ts:108,112`, `app/api/dealer/feedbacks/[id]/remedy/route.ts:92-98` iç olay yazıyor. `app/api/customer/remedy/[offerId]/timeline/route.ts:52-58` bunların hepsini filtresiz ve `meta` dahil döndürüyor. `page.tsx:262-268` hepsini listeliyor. Timeline uç noktası, ana GET'in gizlediği `awaiting_dealer_approval`/`rejected` teklifleri için de veri döndürüyor (ana GET'teki `route.ts:58` kontrolü timeline route'ta yok).
- **Sorun:** Müşteri, özrün "otomasyonla taslak olarak" üretilip "onay kuyruğunda" beklediğini okuyor; samimi telafi mesajının değeri düşüyor. Ayrıca reddedilmiş bir taslağın mesaj önizlemesi (`meta.preview`) API üzerinden okunabiliyor. Özellik bayrağı kontrolü de auth'tan önce yapıldığı için bayrak durumu anonim isteklere açık (`timeline/route.ts:14-20`).
- **Profesyonel öneri:** Olaylara `audience: 'customer' | 'internal'` ayrımı getirin ya da müşteri uç noktasında `kind` için bir izin listesi uygulayın (`published`, `notified`, `accepted`, `redeemed`, `expired`). `created`/`queued` olaylarını müşteri için tek bir "İşletme sana özel telafi hazırladı" satırına indirgeyin. `meta` alanını müşteriye döndürmeyin. Ana GET'teki durum filtresini ve auth'u, bayrak kontrolünden önce timeline route'una da uygulayın.

### 5. Kabul edilmiş teklifte ham tür kodu ve kaybolan işletme adı
- **Önem:** orta · **Kategori:** veri gösterimi / UX · **Efor:** S
- **Kanıt:** `page.tsx:203` (`offer.selectedType` = `discount`), `route.ts:64-78` (işlenmiş teklif için `dealer` ve `options` döndürülmüyor), `page.tsx:190` (geri dönüş değeri `customerRemedy.business` = "İşletme"). Liste sayfasında da aynı sorun var: `app/customer/remedy/page.tsx:221`.
- **Sorun:** Kabulden sonra ya da sayfa yenilenince "İşletme size bir telafi fırsatı sunuyor" ve "Seçiminiz: discount / 20" görünüyor. Kullanıcı ne kazandığını anlamıyor (yüzde mi, puan mı?).
- **Profesyonel öneri:** API her durumda `dealer` ve seçilen seçeneğin anlık görüntüsünü (`label`, `unit`) döndürsün. UI'da "%20 indirim · Kahve Dünyası Moda" gibi okunur biçimde gösterin. Biçimlendirmeyi tek bir `formatRemedyChoice(option, value, locale)` yardımcısında toplayıp liste ve detay sayfası birlikte kullansın.

### 6. Geri alınamaz seçim, onaysız ve bağlamsız; seçim deneyimi zayıf
- **Önem:** orta · **Kategori:** UX · **Efor:** M
- **Kanıt:** `page.tsx:208-243` (iki ardışık Select + tek buton), `route.ts:143-148` (ikinci deneme "zaten işlendi" ile reddediliyor), `route.ts:90-92` (`feedback`/`consumptionReview` dönüyor ama `page.tsx` kullanmıyor).
- **Sorun:** Toplam 3 tür × en fazla 5 değerlik küçük bir seçim uzayı iki dropdown'a gömülmüş. Mobilde 4 dokunuş ve iki popover gerekiyor, değerler yan yana karşılaştırılamıyor. "Tercihimi kaydet" metni düzenlenebilir bir ayar izlenimi veriyor, oysa işlem kalıcı. Müşteri telafinin hangi ziyarete/yoruma ait olduğunu da göremiyor.
- **Profesyonel öneri:** Seçimi **dokunulabilir telafi kartları** olarak yeniden kurun: her tür için bir kart (ikon + "%10–30 indirim"), seçilince değer chip'leri (`ToggleGroup`). Altta canlı özet ("Seçimin: %20 indirim, 30 gün geçerli") ve birincil CTA "Telafimi al" olsun. Gönderim öncesi kısa bir onay sheet'i gösterin ("Bu seçim kesinleşir"). Üstte "Bu teklif şu deneyimin için: ★2 · 3 Ekim · 'Kahve soğuktu…'" bağlam şeridi ekleyin.

### 7. Kabul sonrası liste önbelleği bayat; zaman çizelgesi çift çekiliyor
- **Önem:** orta · **Kategori:** mimari / performans · **Efor:** S
- **Kanıt:** Liste `useQuery(['customer','remedy'], staleTime: 60_000)` (`app/customer/remedy/page.tsx:47-56`); detay sayfası `queryClient` kullanmıyor. Zaman çizelgesi effect'i `[offerId, data?.offer?.status]` bağımlılığıyla ilk render'da bir kez, durum `undefined → 'pending'` olunca bir kez daha çalışıyor (`page.tsx:75-91`). Kabulde `page.tsx:134` el ile fetch yapıyor, ayrıca durum `accepted` olunca effect de tekrar tetikleniyor.
- **Sorun:** Her sayfa açılışında 2, her kabulde 2 timeline isteği gidiyor. Her istek config + auth + 2 sorgu demek. Kabulden sonra "Geri"ye basan kullanıcı teklifi hâlâ "Bekleyen" sekmesinde görüyor ve tekrar tıklayınca "zaten işlendi" hatası alabiliyor.
- **Profesyonel öneri:** Detay verisini ve timeline'ı `useQuery` ile çekin. Timeline'ı tek bir detay yanıtına gömün (`GET /api/customer/remedy/[id]` → `{ offer, timeline }`). PATCH'i `useMutation` ile yapıp `onSuccess` içinde `queryClient.invalidateQueries({ queryKey: ['customer','remedy'] })` ve detay anahtarını güncelleyin. Gereksiz el ile fetch ve effect bağımlılığını kaldırın.

### 8. PATCH sonrası zaman çizelgesi yazımı başarısız olursa yanlış hata
- **Önem:** düşük · **Kategori:** hata yönetimi · **Efor:** S
- **Kanıt:** `route.ts:160-190`. Güncelleme ve `appendRemedyTimelineEvent` ayrı işlemler; ikincisi hata verirse `catch` 500 "Teklif güncellenemedi" dönüyor (`route.ts:199-206`).
- **Sorun:** Teklif aslında kabul edilmişken kullanıcı hata görüyor. Tekrar denediğinde de "zaten işlendi" alıyor.
- **Profesyonel öneri:** Durum geçişi ve olay yazımını tek bir `$transaction` içine alın; ya da olay yazımını try/catch ile kritik olmayan yan etki yapın (bayi publish route'unda olduğu gibi, `app/api/dealer/remedy-offers/[id]/route.ts:121`).

### 9. Çok dillilik ve metin tutarsızlıkları
- **Önem:** düşük · **Kategori:** i18n · **Efor:** S
- **Kanıt:** `page.tsx:254,257` sabit Türkçe; API hata mesajları Türkçe ve toast ile doğrudan gösteriliyor (`page.tsx:59,141`); `lib/remedy-timeline.ts:34,52` sunucuda Türkçe etiketler; `lib/admin-toast.ts:17-19` müşteri panelinde admin toast'ı kullanılıyor ve "Dikkat: "/"Basarili: " (ş eksik) öneki ekleniyor; `messages/tr.json` `customerRemedyOffer.selectAmount = "Miktar secin"` (ç eksik); `page.tsx:265` `toLocaleString()` uygulama dilini almıyor.
- **Profesyonel öneri:** Timeline olaylarını `kind` + parametre olarak döndürüp istemcide `t('remedyTimeline.<kind>')` ile çevirin. API'lerden hata **kodu** döndürüp (`OFFER_NOT_ACTIVE`, `ALREADY_PROCESSED`) istemcide çevirin. Müşteri paneli için öneksiz bir toast sarmalayıcısı kullanın. Tarihleri uygulama diline bağlı `Intl.DateTimeFormat(locale)` ile ve göreli zamanla gösterin.

### 10. Erişilebilirlik ve yerleşim kusurları
- **Önem:** düşük · **Kategori:** erişilebilirlik / mobil · **Efor:** S
- **Kanıt:** `page.tsx:209-212,225-228` (`Label` öğesinde `htmlFor` yok, `SelectTrigger` öğesinde `id`/`aria-labelledby` yok); `page.tsx:175` (`w-full sm:w-fit` ghost geri butonu); `page.tsx:173` (maksimum genişlik yok; liste sayfasında `max-w-3xl mx-auto` var, `app/customer/remedy/page.tsx:82`).
- **Profesyonel öneri:** Etiketleri bağlayın (`<Label htmlFor="remedy-type">` + `<SelectTrigger id="remedy-type">`). Kart tabanlı seçime geçildiğinde `role="radiogroup"` / `aria-checked` kullanın. Geri butonunu sol üstte ikon+metin olarak kompakt tutun. İçeriği `max-w-xl mx-auto` ile sınırlayın; mobilde birincil CTA'yı safe-area'ya duyarlı sabit bir alt çubuğa taşıyın.

### 11. Ölü kod ve gizli durum hataları
- **Önem:** düşük · **Kategori:** kod kalitesi · **Efor:** S
- **Kanıt:** `page.tsx:6` (`Motion` kullanılmıyor), `page.tsx:41` (`router` kullanılmıyor), `page.tsx:156-168` (ulaşılamayan dal), `page.tsx:170` (`alreadyProcessed` her durumda "Kabul edildi" anlamına geliyor; `expired` gelirse yanlış gösterir), `page.tsx:94` (`options` bir dizi değilse `options.find`/`map` çöker; bu, projede daha önce yaşanan JSON-forEach 500 hatasıyla aynı sınıftan bir hata). Canlı veride dizi olmayan `options` olup olmadığı doğrulanmadı.
- **Profesyonel öneri:** Kullanılmayan import'ları kaldırın. Durumu açık bir `switch(offer.status)` ile ele alın (`accepted` / `redeemed` / `expired` için ayrı ekranlar). `options` alanını API'de `Array.isArray` + şema ile normalize edin.

---

## Eksik özellikler (kıyas ürünlerle)

- **Anında teslim ve cüzdan entegrasyonu (Starbucks "We're sorry" yıldızları):** Puan telafisi seçildiği anda bakiyeye eklenmeli; kupon telafisi "Ödüllerim/Kartım" cüzdanında kod veya QR olarak görünmeli.
- **Geçerlilik süresi ve geri sayım (Starbucks/Revolut teklifleri):** "7 gün içinde seç", "Kod 30 gün geçerli" bilgisi; süre dolunca otomatik `expired` ve hatırlatma push bildirimi.
- **Bağlam kartı:** Telafinin hangi ziyarete/yoruma ait olduğu, işletmenin yanıtı ve logosu.
- **Kutlama anı (Duolingo/Monzo):** Kabul anında kısa ve ölçülü bir ödül animasyonu, bakiye sayacının artması, haptik his.
- **"İstemiyorum / başka bir şey isterim" seçeneği:** Reddetme ya da serbest metinle karşı öneri; bu, bayiye değerli bir sinyal olur.
- **Kullanım takibi:** "Kasada kullanıldı · 12 Ekim" durumu ve sonrasında "Telafiden memnun kaldın mı?" mikro anketi; bu, geri kazanım metriğini ölçülebilir kılar.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Müşteri bildirime dokunuyor ve 3 saniyede şunu anlıyor: "X işletmesi, 3 Ekim'deki kötü deneyimin için özür diliyor ve sana seçme hakkı veriyor." Tek dokunuşla telafiyi seçiyor, onaylıyor; puan anında hesaba geçiyor ya da kasada okutulacak kodu cebinde oluyor. Sonrasında aynı sayfa, telafinin kullanılıp kullanılmadığını gösteren canlı bir takip kartına dönüşüyor.

**Yerleşim (mobil öncelikli, `max-w-xl`):**
1. **Üst şerit:** İşletme logosu + adı, "Sana özel telafi" rozeti, geçerlilik geri sayımı.
2. **Bağlam kartı:** Orijinal deneyim (yıldız, tarih, yorumun ilk satırı) + işletmenin özür mesajı (alıntı stili).
3. **Seçim alanı:** Tür kartları (indirim / puan / ücretsiz ürün) ve altında değer chip'leri. Kartlarda gerçek değer önizlemesi gösterilir ("200 puan ≈ 1 ücretsiz kahve" gibi, mevcut ödül kataloğundan hesaplanır).
4. **Sabit alt CTA:** "Telafimi al", ardından onay sheet'i.
5. **Sonuç durumu:** Puan için "+200 puan eklendi" ve bakiyeye link; kupon için büyük QR/kod kartı (parlaklık ipucu, "Kasada göster"), geçerlilik ve kullanım durumu.
6. **Zaman çizelgesi:** Sadece müşteriye uygun olaylar, kompakt ve katlanabilir.

**Motion/3D (yerinde ve ölçülü):** 3D'ye gerek yok; bu bir "özür ve güven" anı, gösteri değil. Kart seçiminde `layoutId` ile yumuşak bir vurgu geçişi; kabulde tek seferlik kısa bir onay animasyonu (check çizimi + puan sayacı tween'i, ≤600 ms). `useReducedMotion` ile tamamen statik bir alternatif. Global `LazyMotion` altındaki `m as Motion` deseni kullanılmalı.

**Veri/API değişiklikleri:**
- `RemedyOffer`: `expiresAt`, `redeemCode @unique`, `redeemedAt`, `selectedOption Json` (anlık görüntü), `declinedAt`.
- `GET /api/customer/remedy/[id]`: her durumda `dealer`, bağlam, seçilen seçenek ve müşteri-güvenli `timeline` döndürsün; hata kodları makine tarafından okunabilir olsun.
- `PATCH`: `options` doğrulaması + tek `$transaction` (durum geçişi + puan defteri kaydı ya da kod üretimi + olay yazımı); tekil anahtar `remedyOfferId`.
- Yeni `POST /api/customer/remedy/[id]/decline` ve bayi tarafında `POST /api/dealer/remedy-offers/[id]/redeem` (kod okutma, atomik `accepted → redeemed`).
- Cron: süresi dolanları `expired` yapsın ve son 24 saat için hatırlatma göndersin.
- `business-outcomes` metriği `accepted` yerine `redeemed` saysın.

---

## Çakışmalar / birleştirme önerisi

- **`/customer/remedy` (liste) ile `/customer/remedy/[offerId]`:** Aynı veriyi farklı istemci desenleriyle çekiyorlar (liste react-query, detay elle `fetch`), türleri iki kez tanımlıyorlar (`RemedyOption`/`Offer` iki dosyada) ve ham `selectedType / selectedValue` gösterimini ikisi de tekrarlıyor. Detay route'u bildirim derin linki için kalmalı. Ama ortak bir `components/customer/remedy/` modülü (tür tanımları, `formatRemedyChoice`, `RemedyOfferCard`, `useRemedyOffer` hook'u) çıkarılmalı. Masaüstünde detay, listeden açılan bir sheet olarak da sunulabilir.
- **`/customer/feedbacks`:** Kendi içinde ayrı bir telafi listesi bloğu tutuyor ve `/api/customer/remedy` adresini ayrıca çağırıyor (`app/customer/feedbacks/page.tsx:112-166,296-309,342,462,564`). Burası sadece ilgili geri bildirimin yanında "Telafi teklifi var" rozeti/linki göstermeli; tam liste tek yerde (`/customer/remedy`) kalmalı.
- **`/customer/rewards` / `/customer/my-card`:** Kabul edilmiş kupon telafileri ayrı bir silo yerine buradaki ödül cüzdanında görünmeli (mevcut `UserReward.code` deseniyle uyumlu). Uzun vadede "Telafilerim", cüzdanın bir sekmesi olarak birleştirilebilir.
- Sayfa **kaldırılmamalı**: bildirim akışının (`components/dashboard/notification-center.tsx:506-518`) hedefi ve kriz anında güveni geri kazanma noktası olduğu için ürün açısından değerli. Ama yukarıdaki teslim döngüsü olmadan şu haliyle müşteriye boş bir vaat veriyor.

---

## Doğrulama (şüpheci inceleme)

İnceleme salt okunur yapıldı; kod, veritabanı ve sunucu çalıştırılmadı. Okunan dosyalar: `app/customer/remedy/[offerId]/page.tsx`, `app/api/customer/remedy/[offerId]/route.ts`, `app/api/dealer/feedbacks/[id]/remedy/route.ts`, `app/api/dealer/remedy-queue/route.ts`, `app/api/dealer/business-outcomes/route.ts`, `lib/remedy-options.ts`, `lib/remedy-timeline.ts`, `prisma/schema.prisma` (RemedyOffer modeli) ve repo genelinde `selectedType|selectedValue|remedyOffer.` taraması.

### 1. Müşteri PATCH ile teklifte olmayan tür/değer kaydedebiliyor — **DOĞRULANDI (önem: orta; "bayi görür" kısmı yanlış)**

- Kanıt: `app/api/customer/remedy/[offerId]/route.ts:15-18` şema yalnızca `z.string().min(1)`; üst sınır yok. `:126-129` teklif yalnızca `{ id, userId, status }` ile çekiliyor, `options` hiç okunmuyor. `:160-168` gelen değer doğrudan `selectedType/selectedValue` olarak yazılıyor. İstemcideki kısıt (`page.tsx:95-102`, yalnızca listedeki değerler seçilebilir) sunucuda tekrar edilmiyor.
- Yeniden üretim: `pending` durumundaki kendi teklifiyle oturum açmış müşteri, tarayıcı konsolundan `fetch('/api/customer/remedy/<id>', {method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({selectedType:'discount', selectedValue:'100'})})` çağırır → 200 döner, kayıt `accepted` olur; `page.tsx:196-204` ve liste sayfası (`app/customer/remedy/page.tsx:221`) "Kabul edildi — Seçiminiz: discount / 100" gösterir, zaman çizelgesine de "teklif kullanıma hazır" olayı (`route.ts:187-190`) bu meta ile yazılır.
- Somut etki: Repo genelinde bu alanları okuyan bayi/admin kodu **yok** (yalnızca müşteri tarafı: `app/api/customer/remedy/route.ts:56-57`, iki müşteri sayfası). Dolayısıyla iddiadaki "bayi de bu değeri müşterinin hakkı olarak görür" ifadesi kod tarafından **desteklenmiyor**; bayi panelinde seçimi gösteren ekran yok. Bugün puan basma da yok. Ancak telafinin kullanılmasının tek fiilî yolu müşterinin bu ekranı kasada göstermesi olduğundan, uygulama içinden gerçek görünen "Kabul edildi: %100 indirim" ekranı üretilebiliyor; bu bayiye karşı somut bir sosyal mühendislik zemini. Ayrıca sınırsız uzunlukta metin `Text` olmayan `String` sütununa ve timeline `meta` JSON'una yazılabiliyor (yalnızca kendi kaydını şişirir).
- Not: Önem derecesi KRİTİK değil, ORTA. Teslim/puan yükleme bağlandığı gün doğrudan puan basma açığına dönüşeceği için, düzeltme teslim işinden **önce** yapılmalı.
- Öneri: PATCH'te `options` alanını da seç, `selectedType` için `options.some(o => o.type === t)`, `selectedValue` için `String(v)` eşleşmesi zorunlu kılınsın; şema `max(32)` ile sınırlansın; seçilen seçeneğin tam anlık görüntüsü (`{type,label,unit,value}`) sunucu tarafında `options`'tan türetilerek yazılsın (istemciden gelen etiket/değer asla güvenilmesin). Durum geçişi + olay yazımı tek `$transaction` içinde olsun.

### 2. Kabul edilen telafi hiçbir yerde teslim edilmiyor — **DOĞRULANDI**

- Kanıt: PATCH yalnızca `status/selectedType/selectedValue/acceptedAt` günceller (`route.ts:160-168`), ardından "Seçiminiz kaydedildi — teklif kullanıma hazır" olayını yazar (`route.ts:187`). `selectedType|selectedValue` için repo taraması yalnızca müşteri tarafı dosyaları ve şemayı (`prisma/schema.prisma:1337-1338`) döndürüyor: puan defterine kayıt, kupon/kod üretimi ya da bayi tarafında görüntüleme yok. Bayi kuyruğu yalnızca `awaiting_dealer_approval` kayıtlarını listeliyor (`app/api/dealer/remedy-queue/route.ts:19-23`). Şema yorumu `expired` durumunu tanımlasa da (`schema.prisma:1333`) bu değeri yazan kod bulunmadı. `business-outcomes` `accepted` sayısını kabul oranı olarak raporluyor (`app/api/dealer/business-outcomes/route.ts:59,67,73`).
- Yeniden üretim: Varsayılan seçeneklerden (`lib/remedy-options.ts:18-22`) "Puan / 200" seçilip kaydedilir → müşteri bakiyesi değişmez, kod/QR üretilmez, bayi panelinde bu seçimi gösteren bir ekran yoktur; buna karşın bayinin kabul oranı metriği artar.
- Not: Bu bir güvenlik açığı değil, ürün bütünlüğü hatası; ama müşteriye somut bir vaat ("kullanıma hazır") verip yerine getirmediği için güven kaybı yaratır ve bayinin başarı metriğini şişirir. İddia "completed" durumundan bahsediyor; şemada böyle bir durum tanımlı değil, bu ayrıntı önemsiz.

### 3. Hata/404/403 durumunda sayfa sonsuz spinner'da kalıyor — **DOĞRULANDI**

- Kanıt: `page.tsx:58-61` `!r.ok` iken yalnızca toast atıp `return` ediyor, `data` `null` kalıyor; `:67` `finally` ile `loading=false`. `:150` `if (loading || !data)` koşulu `data===null` olduğu için spinner'ı kalıcı gösteriyor. `:156-168`'deki `notFound` dalı yalnızca `data` dolu ama `offer` boşken çalışır; API 200 yanıtlarında `offer` her zaman dolu olduğundan (`route.ts:66-79, 81-97`) bu dal pratikte ölü.
- Yeniden üretim: (a) Bayinin onay kuyruğundaki ya da reddettiği bir teklifin linki açılır → API 404 "Bu teklif henüz aktif değil" (`route.ts:58-63`) → kısa bir toast, ardından ekranda sonsuza kadar "Teklif yükleniyor" ve geri dönüş butonu yok. (b) Başka bir hesaba ait teklif linki → 403 (`route.ts:52-57`), aynı sonuç. (c) Veritabanı geçici erişilemezse (`responseIfDatabaseUnavailable`) ya da ağ hatasında aynı sonuç; toast kaybolduktan sonra kullanıcı neyin olduğunu bilemez.
- Öneri: `loadState` (`loading | ready | not_found | forbidden | inactive | error`) tutulsun; API makine-okunur bir `code` döndürsün; her durum için açıklayıcı boş durum + "Telafi tekliflerime dön" ve (hata durumunda) "Tekrar dene" aksiyonu gösterilsin.


---

## Uygulama (Dalga 2)

**İş bölümü (m-seslerim ile tutarlı):** teklifi görüntüleme, seçim ve KABUL akışı Seslerim'e taşındı (`/customer/me/voices?offer=<id>` — m-seslerim yüzeyi; eski `/customer/remedy/[offerId]` oraya kalıcı yönlenir). Kabul edilmiş **kupon türü** telafilerin (indirim, ücretsiz ürün) cüzdan görünümü Cüzdan → Ödüllerim → Kodlarım → "Telafi kuponların" bölümündedir (`/customer/wallet/owned?pass=remedy:<id>`, m-cuzdan-oduller). Kabul mantığı (seçim allowlist'i, anlık görüntü, tek tx) `lib/remedy-offer-service.ts`'te (P0-22) — bu yüzey yalnız okur (`listRemedyPasses`).

| # | Özellik | Yeni durum | Not / gerekçe |
|---|---|---|---|
| 1 | Oturum/rol koruması | ÇALIŞIYOR | Ödüllerim sayfası CUSTOMER; telafi sorgusu `userId` kapsamlı. |
| 2 | Teklif yükleme (GET) | TAŞINDI → Seslerim | Kabul öncesi görünüm Seslerim çekmecesinde. |
| 3 | Yükleniyor durumu | ÇALIŞIYOR | Ödüllerim sunucu render + kabuk iskeleti. |
| 4 | Hata durumu | ÇALIŞIYOR | Ödüllerim yüklenemezse `ErrorState` + tekrar dene (sonsuz spinner yok). |
| 5 | "Teklif bulunamadı" ekranı | ÇALIŞIYOR | Pass detayında `?pass=remedy:<id>` bulunamazsa açıklamalı boş durum. |
| 6 | Geri butonu | KALDIRILDI | Detay artık çekmece; Esc/kapat ile listeye döner. |
| 7 | Başlık + işletme adı | ÇALIŞIYOR | Kuponda her durumda işletme adı (`businessName` → `name`). |
| 8 | Teklif mesajı | ÇALIŞIYOR | Kupon detayında "İşletmenin mesajı" alıntısı. |
| 9 | Tür seçimi | TAŞINDI → Seslerim | Kabul akışı. |
| 10 | Miktar seçimi | TAŞINDI → Seslerim | Kabul akışı. |
| 11 | Tür değişince sıfırlama | TAŞINDI → Seslerim | |
| 12 | "Tercihimi kaydet" | TAŞINDI → Seslerim | |
| 13 | Sunucu seçim doğrulaması | ÇALIŞIYOR | P0-22 (`acceptRemedyOffer` allowlist + anlık görüntü). |
| 14 | Eşzamanlı kabul koruması | ÇALIŞIYOR | P0-22 (atomik `updateMany`). |
| 15 | Başarı toast'ı | TAŞINDI → Seslerim | |
| 16 | "Kabul edildi" kutusu | ÇALIŞIYOR | Okunur etiket ("%20 İndirim", "1 adet Ücretsiz ürün") — ham `discount / 20` yok. |
| 17 | Telafinin teslimi | ÇALIŞIYOR (kupon türü) | İndirim/ücretsiz ürün kabulü Ödüllerim'de kasada gösterilecek kupon olur: işletme + etiket + başvuru no (`TLF-…`) + "Kasada göster" tam ekranı (Wake Lock). İşletme seçimi bildirimle alır (P0-22). Puan türü kabulde Seslerim'de `mintPoints` ile tek seferlik kredilenir (m-seslerim). Bayinin "kullanıldı" işaretlemesi kalan. |
| 18 | Süreç zaman çizelgesi | TAŞINDI → Seslerim | |
| 19 | Zaman çizelgesi bayrağı | TAŞINDI → Seslerim | |
| 20 | Kabul sonrası yenileme | TAŞINDI → Seslerim | |
| 21 | Liste önbelleği | ÇALIŞIYOR | Ödüllerim sunucu bileşeni; bayat react-query önbelleği yok. |
| 22 | İlgili deneyim bağlamı | TAŞINDI → Seslerim | Kupon detayından "Telafi geçmişini Seslerim'de gör" bağlantısı. |
| 23 | Reddetme | TAŞINDI → Seslerim | |
| 24 | Son kullanma | UYGULANMADI | `RemedyOffer.expiresAt` yok → ŞEMA İSTEĞİ. |
| 25 | Onay adımı | TAŞINDI → Seslerim | |
| 26 | Seçenek yoksa boş durum | TAŞINDI → Seslerim | |
| 27 | Çok dillilik | ÇALIŞIYOR | Kupon görünümü TR/EN. |
| 28 | Form etiketleri | TAŞINDI → Seslerim | |
| 29 | Motion | ÇALIŞIYOR | Kupon çekmecesi/tam ekran CSS geçişleri; azaltılmış harekete saygılı. |
| 30 | Sayfa metadata | ÇALIŞIYOR | Ödüllerim meta. |
| 31 | Bildirimden derin link | ÇALIŞIYOR | `/customer/remedy/<id>` → Seslerim çekmecesi (m-seslerim koçanı). |
| 32 | `expired` gösterimi | ÇALIŞIYOR | Ödüllerim yalnız `accepted` + kupon türünü listeler; `expired` "kabul edildi" gibi görünmez. |
| 33 | Yerleşim genişliği | ÇALIŞIYOR | Cüzdan kabuğu `max-w-3xl`. |

**Kapanan bulgular (m-cuzdan-oduller payı):** B5 (okunur seçim + işletme adı), B1 kısmen (kupon türü telafi artık cüzdanda kasada gösterilebilir değer); B2 ve kabul akışı bulguları (B3, B4, B6–B11) P0-22 ve m-seslerim kapsamında.
**Kalanlar:** Seslerim teklif çekmecesi kabul edilmiş kupon türü telafide `/customer/wallet/owned?pass=remedy:<id>` bağlantısını göstermeli (m-seslerim'e iletilmek üzere dönüş raporunda); bayi tarafında telafi kuponunu "kullanıldı" işaretleme (şema).
**ŞEMA İSTEKLERİ:** `RemedyOffer.redeemCode @unique`, `redeemedAt`, `expiresAt`, `selectedOption Json`, `declinedAt`.
