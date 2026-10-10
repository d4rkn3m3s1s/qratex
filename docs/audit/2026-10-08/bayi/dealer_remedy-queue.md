# /dealer/remedy-queue

**Amaç:** Bayinin (işletme sahibinin), düşük puanlı QR geri bildirimi veya tüketim yorumu için oluşturulmuş — elle "önce kuyruğa al" seçilerek ya da telafi otomasyonuyla üretilmiş — `awaiting_dealer_approval` durumundaki telafi (remedy) taslaklarını müşteriye bildirilmeden önce görüp **Yayınla** veya **Reddet** kararı vermesi.

**Genel puan: 4.5 / 10** · **Karar: yeniden tasarla** (ve `/dealer/remedy-automation` + `/dealer/remedy-automation/templates` ile tek bir "Telafi Merkezi" altında birleştir)

Sayfa küçük (165 satır) ve temel akış çalışıyor: liste yükleniyor, sahiplik kontrolü sunucuda doğru yapılıyor, durum geçişi koşullu `updateMany` ile yarış koşuluna karşı korunuyor. Ancak bir **onay ekranının** en temel girdisi olan "müşteriye tam olarak ne teklif ediyorum?" bilgisi gösterilmiyor; müşteri adı boş çıkabiliyor; hata durumu "kuyruk boş" gibi görünüyor; geri alınamaz iki eylem (yayınla = müşteriye bildirim, reddet = kalıcı) onaysız ve düzenlemesiz. Sayfa, metadata'da ve diğer sayfalarda "Telafi merkezi" diye anılıyor ama yalnızca onay kuyruğunu gösteriyor — gönderilen/kabul edilen/reddedilen tekliflerin takibi bayi tarafında hiçbir yerde yok.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 5/10 | Yayınla/Reddet uçtan uca çalışıyor; ancak teklif içeriği (seçenekler) görünmüyor, düzenleme yok, müşteri adı boş kalabiliyor, hata durumu boş kuyruk gibi görünüyor. |
| UX | 4/10 | Karar için gereken bağlam (seçenekler, kaynak yorumun tamamı, şube, risk) yok; geri alınamaz eylemler onaysız; her eylemden sonra tüm liste spinner'a dönüyor. |
| Görsel | 5/10 | shadcn kart + liste, tutarlı ama jenerik; her satırda aynı "Onay bekliyor" rozeti bilgi taşımıyor, hiyerarşi düz, sayaç yok. |
| Mimari | 5/10 | Sunucu yetki/yarış korumaları doğru; ama modül kapısı (`assertModuleEnabled`) yok, publish adımları transaction dışında, `notificationSent` gerçeği yansıtmıyor, client tip arayüzü API ile uyumsuz. |
| Performans | 7/10 | Tek sorgu + `@@index([dealerId, status])`; `take: 100` sınırı var. Sorun yalnızca her eylemden sonra tam yeniden yükleme ve sayfalama olmaması. |
| Erişilebilirlik + Mobil | 6/10 | Mobilde dikey yığılıyor, `role="status"` yükleyici var; ancak her satırdaki "Yayınla/Reddet" butonları ekran okuyucuda bağlamsız, sayfa başlığı ile menü adı uyumsuz. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata (sekme başlığı/açıklama) | KISMİ | `app/dealer/remedy-queue/layout.tsx:4-6`, `messages/tr.json:51-52` | Başlık "Telafi merkezi", açıklama "Bekleyen telafi teklifleri, onaylar ve müşteri kurtarma kuyruğu" — sayfa yalnızca onay kuyruğunu içeriyor; h1 "Telafi onay kuyruğu" (`messages/tr.json:1595`). İsim tutarsız. |
| 2 | Başlık + açıklama kartı | ÇALIŞIYOR | `page.tsx:70-73` | i18n'li. |
| 3 | "Geri bildirimlere dön" linki | ÇALIŞIYOR | `page.tsx:75-80` | `/dealer/feedbacks`. |
| 4 | "Otomatik telafi ayarları" linki | ÇALIŞIYOR | `page.tsx:81-83` | `/dealer/remedy-automation`. |
| 5 | "Yorumlar" köprü linki | KISMİ | `page.tsx:85-90` | Metin sabit Türkçe ("Yorumlar"), `t()` yok; EN arayüzde Türkçe kalır. |
| 6 | Kuyruk listesini yükleme (GET) | ÇALIŞIYOR | `page.tsx:31-47`, `app/api/dealer/remedy-queue/route.ts:12-48` | `res.ok` değil `data.success` kontrol ediliyor; non-JSON yanıtta `SyntaxError` mesajı toast'a düşer. |
| 7 | Yükleniyor durumu | ÇALIŞIYOR | `page.tsx:101-102`, `components/ui/inline-loading-status.tsx` | `role="status"`, `aria-live`. |
| 8 | Boş durum | KISMİ | `page.tsx:103-104` | Düz metin; otomasyon kapalıysa onu açmaya, ya da gönderilmiş teklifleri görmeye yönlendiren CTA yok. |
| 9 | Hata durumu | BOZUK | `page.tsx:38-41, 103-104` | Hata yalnızca toast; `offers` `[]` kalır ve ekranda **"Onay bekleyen telafi yok."** yazar. Bayi bekleyen taslak olmadığını sanır. Tekrar dene butonu yok. |
| 10 | Teklif satırı listesi | ÇALIŞIYOR | `page.tsx:106-158` | `createdAt desc` sıralı (`route.ts:24`). |
| 11 | "Onay bekliyor" rozeti | ÇALIŞIYOR (gereksiz) | `page.tsx:114` | Listede yalnızca tek durum var; her satırda aynı rozet bilgi taşımaz. |
| 12 | Göreli zaman | ÇALIŞIYOR | `page.tsx:115-117`, `lib/utils.ts:33` | Render anında hesaplanır, canlı güncellenmez (kritik değil). |
| 13 | Teklif mesajı | ÇALIŞIYOR | `page.tsx:119` | Düzenlenemez. |
| 14 | Müşteri adı | BOZUK | `page.tsx:19,121` vs `route.ts:27` | Arayüz `user.email` bekliyor; API yalnızca `{ id, name }` seçiyor. `name` null ise `o.user.name || o.user.email` → `undefined` → ekranda yalnızca "Müşteri:" görünür. |
| 15 | QR geri bildirim satırı (puan + metin) | ÇALIŞIYOR | `page.tsx:123-128` | `line-clamp-2`; tam metni açma, kaynağa gitme, şube/QR bilgisi yok. `t()` değişken desteği varken `.replace('{rating}')` kullanılmış (`lib/app-locale.tsx:59`). |
| 16 | Tüketim yorumu satırı | ÇALIŞIYOR | `page.tsx:129-134` | Aynı kısıtlar. |
| 17 | Teklif seçeneklerinin (indirim %/puan/ücretsiz ürün) gösterimi | EKSİK | `route.ts:19-26` (include → `options` dahil tüm skaler alanlar döner), `page.tsx:14-22` (arayüzde `options` yok) | Veri zaten geliyor ama hiç render edilmiyor. Bayi neyi onayladığını görmüyor. |
| 18 | Mesaj/seçenek düzenleme (onay öncesi) | EKSİK | `app/api/dealer/remedy-offers/[id]/route.ts:11-13` | API yalnızca `publish|reject` kabul ediyor; düzenleme ucu yok. |
| 19 | Yayınla butonu | KISMİ | `page.tsx:137-145`, `remedy-offers/[id]/route.ts:88-139` | Çalışıyor; onay diyaloğu yok, geri alınamaz (müşteriye bildirim gider). Bildirim hatası yutulup yine "Müşteriye gönderildi" denir (bkz. B5). |
| 20 | Reddet butonu | KISMİ | `page.tsx:146-155`, `route.ts:66-86` | Onaysız, geri alınamaz, red nedeni alınmaz, timeline'a `rejected` olayı yazılmaz. |
| 21 | Eylem spinner'ı | BOZUK (küçük) | `page.tsx:143, 153` | Reddet'e basılınca da spinner **Yayınla** butonunda döner; Reddet butonu ikonu değişmez. Kullanıcı yanlış eylemin işlendiğini sanabilir. |
| 22 | Eylem sırasında tüm butonları kilitleme | ÇALIŞIYOR | `page.tsx:140, 150` | `disabled={!!actingId}` çift tıklamayı önler. |
| 23 | Eylem sonrası yenileme | KISMİ | `page.tsx:60, 31-33` | `load()` `setLoading(true)` yaptığı için tüm liste spinner'a dönüp yeniden çiziliyor; iyimser kaldırma yok. |
| 24 | Sunucu yetki (DEALER kendi, ADMIN tümü) | ÇALIŞIYOR | `route.ts:13-22`, `remedy-offers/[id]/route.ts:52-64` | IDOR yok; `awaitingWhere` dealerId ile daraltılmış. |
| 25 | Yarış koşulu koruması | ÇALIŞIYOR | `remedy-offers/[id]/route.ts:61-98` | Koşullu `updateMany` + `count === 0` kontrolü; iki sekmeden çift yayın engelli. |
| 26 | Modül kapısı (`remedy_offers`) | EKSİK | `components/dashboard/sidebar.tsx:256` (menü modüle bağlı) vs `route.ts` ve `remedy-offers/[id]/route.ts` (gate yok); kıyas `feedbacks/[id]/remedy/route.ts:36-37` | Modül kapatılsa bile URL ile kuyruk açılır ve yayın yapılabilir. |
| 27 | Sayfalama / toplam sayı | KISMİ | `route.ts:25` | 100 kayıtta sessizce kesiliyor; toplam sayı ve "daha fazla" yok. |
| 28 | Filtre / arama / sıralama (şube, kaynak, puan, otomatik/elle) | EKSİK | `page.tsx` tamamı | Hiçbiri yok. |
| 29 | Toplu onay / toplu red | EKSİK | — | Otomasyon ayda 40 taslağa kadar üretebiliyor (`lib/remedy-automation-core.ts:24-25`); tek tek işlemek zorunlu. |
| 30 | Canlı yenileme (yeni taslak düşünce) | EKSİK | `page.tsx:45-47` | Yalnızca mount'ta yükleniyor; layout'taki `RealtimeNotifications` sayfayı tetiklemiyor. |
| 31 | Kaynak geri bildirime / müşteri geçmişine link | EKSİK | `page.tsx:123-134` | `feedback.id` geliyor ama link yok. |
| 32 | Gönderilen / kabul edilen / reddedilen teklif geçmişi | EKSİK | `rg remedyOffer app/api/dealer` → yalnızca sayımlar (`business-outcomes/route.ts:58-59`, `operations-brief/route.ts:84`) | Bayi yayınladığı teklifin müşteri tarafından ne seçildiğini (`selectedType/selectedValue`) hiçbir ekranda göremiyor. |
| 33 | Otomatik/elle taslak ayrımı ve tetik nedeni | EKSİK | `lib/remedy-automation-core.ts:108-111` (timeline meta'da `trigger` var) | Yüksek churn riski mi, düşük puan mı — kuyrukta görünmüyor. |
| 34 | SLA / bekleme süresi uyarısı, teklif son kullanma | EKSİK | şema yorumu `prisma/schema.prisma:1334` "expired" diyor; kodda `expired` atayan yer yok | Taslaklar ve yayınlanmış teklifler sonsuza dek açık kalıyor. |
| 35 | Otomasyon bildiriminden kuyruğa derin link | EKSİK | `lib/remedy-automation-core.ts:124-133` (`data: { offerId, feedbackId }`, `ctaPath` yok), `lib/notification-public-dto.ts:8-41` (`offerId` beyaz listede değil) | "Otomatik telafi taslağı hazır" bildirimi bayiyi kuyruğa götürmüyor. |
| 36 | Mobil yerleşim | ÇALIŞIYOR | `page.tsx:110, 136` | `flex-col sm:flex-row`; butonlar alt satıra iner. Dokunma hedefleri `size="sm"` (~32px) — 44px önerisinin altında. |
| 37 | i18n bütünlüğü | KISMİ | `page.tsx:88`; `lib/admin-toast.ts:16-19`; `remedy-offers/[id]/route.ts:32,50,53,58,73,145` | Toast öneki "Basarili: / Dikkat: " (ASCII, Türkçe karakter yok, EN'de de Türkçe); sunucu hata mesajları sabit Türkçe. |
| 38 | Erişilebilir buton etiketleri | KISMİ | `page.tsx:137-155` | Her satırda aynı "Yayınla/Reddet"; `aria-label`'da müşteri/teklif bağlamı yok. |
| 39 | Azaltılmış hareket | ÇALIŞIYOR (n/a) | `page.tsx` | Motion kullanılmıyor; yalnızca `animate-spin`. |

**Sayım:** ÇALIŞIYOR 16 · KISMİ 10 · BOZUK 3 · SAHTE 0 · EKSİK 10 (toplam 39)

---

## Bulgular

### B1 — Onay ekranı, onaylanan şeyi göstermiyor
- **Önem:** yüksek · **Kategori:** işlevsellik / ürün
- **Kanıt:** `app/api/dealer/remedy-queue/route.ts:19-26` (`include` kullanıldığı için `options` alanı yanıtta var) · `app/dealer/remedy-queue/page.tsx:14-22` (arayüzde `options` yok), `:119` (yalnızca `message` render ediliyor).
- **Sorun:** Telafinin özü müşteriye sunulan seçenekler (ör. "%10/%15/%20 indirim", "100 puan", "1 ücretsiz içecek"). Bu seçenekler taslak oluşturulduğu anda şablondan **anlık görüntü** olarak kopyalanıyor (`feedbacks/[id]/remedy/route.ts:72-75`, `lib/remedy-automation-core.ts:95`). Bayi şablonları sonradan değiştirse bile kuyruktaki taslak eski değerlerle yayınlanır — ve bayi bunu görmeden "Yayınla"ya basar. Bu, Medallia/Qualtrics "case approval" ekranlarında asla olmayan bir kör onaydır.
- **Öneri:** Satırda seçenekleri chip olarak göster (`İndirim · 10 / 15 / 20 %`, `Puan · 50 / 100`), şablondan sapmışsa "Şablon güncellendi — güncel değerleri uygula" uyarısı ver. API'de `include` yerine açık `select` kullanıp `options` tipini `RemedyOption[]` olarak normalize et (aynı Zod şeması `remedyOptionSchema` paylaşılsın).
- **Efor:** S

### B2 — Hata durumu "kuyruk boş" olarak görünüyor
- **Önem:** yüksek · **Kategori:** hata yönetimi / UX
- **Kanıt:** `page.tsx:38-41` (catch yalnızca toast), `:103-104` (`offers.length === 0` → "Onay bekleyen telafi yok.").
- **Sorun:** Ağ hatası, 403 (token-replay), 503 (DB) gibi durumlarda kullanıcıya kısa ömürlü bir toast gösterilip ekranda kalıcı olarak "Onay bekleyen telafi yok" yazıyor. Bayi müşteri şikâyetlerinin cevapsız beklediğini fark etmez — telafi akışının bütün amacı zaman kritik kurtarma.
- **Öneri:** `error` state'i ekle; hata kartı + "Tekrar dene" butonu göster; boş durumu yalnızca başarılı yanıtta göster. `res.ok` kontrolünü `res.json()`'dan önce yap. Tercihen SWR/React Query'ye geç (`revalidateOnFocus`, `errorRetryCount`).
- **Efor:** S

### B3 — Müşteri adı boş çıkıyor (client/API sözleşmesi uyumsuz)
- **Önem:** orta · **Kategori:** veri / tip güvenliği
- **Kanıt:** `page.tsx:19` (`user: { id; name | null; email }`), `:121` (`o.user.name || o.user.email`) · `route.ts:27` (`user: { select: { id: true, name: true } }`).
- **Sorun:** E-posta (muhtemelen bilinçli olarak, PII nedeniyle) seçilmiyor ama client tipi onu varmış gibi tanımlıyor. Adı olmayan müşteride satır "Müşteri:" diye boş kalıyor. Ayrıca `user.id` gereksiz yere istemciye dönüyor.
- **Öneri:** Sunucuda gösterim adını üret (`displayName = name ?? maskEmail(email)` — `lib/pii-redact.ts` zaten var) ve DTO'yu tek tip olarak paylaş (`lib/dto/remedy-queue.ts`); client'taki elle yazılmış arayüzü kaldır. Müşteri için "kaçıncı ziyaret / toplam geri bildirim / son puan" özetini de aynı DTO'ya koy.
- **Efor:** S

### B4 — Yinelenen taslaklar: aynı şikâyete birden fazla telafi yayınlanabilir
- **Önem:** yüksek · **Kategori:** veri bütünlüğü
- **Kanıt:** Otomasyon ve tarama yolu "açık teklif var mı" kontrolü yapıyor (`lib/remedy-automation-core.ts:87-92`, `app/api/dealer/remedy-automation/apply-scan/route.ts:101-108`), ama elle oluşturma uçları yapmıyor (`app/api/dealer/feedbacks/[id]/remedy/route.ts:79-89`, `app/api/dealer/consumption-reviews/[id]/remedy/route.ts:86-96`). Publish ucu da aynı kaynak için başka bir `pending/accepted` teklif olup olmadığına bakmıyor (`remedy-offers/[id]/route.ts:88-98`).
- **Sorun:** Bayi bir yoruma "kuyruğa al" ile iki kez tıklarsa (idempotency anahtarı yalnızca aynı istek tekrarına karşı korur) ya da otomasyon taslağı varken elle de oluşturursa, kuyrukta aynı müşteri+yorum için iki satır görünür; ikisi de yayınlanabilir → müşteri aynı şikâyet için iki telafi alır. Kuyruk ekranı bu çakışmayı göstermiyor.
- **Öneri:** (1) Oluşturma uçlarına otomasyondakiyle aynı "açık teklif var" kontrolü; (2) publish anında aynı `feedbackId/consumptionReviewId` için `pending|accepted` teklif varsa 409 dön; (3) uzun vadede kısmi benzersiz indeks (`WHERE status IN ('awaiting_dealer_approval','pending','accepted')`) ile DB seviyesinde garanti. Kuyrukta yinelenenleri grupla ve "Bu müşteriye bu yorum için zaten teklif gönderildi" uyarısı ver.
- **Efor:** M

### B5 — Yayın adımları atomik değil; "Müşteriye gönderildi" yanlış olabilir
- **Önem:** orta · **Kategori:** mimari / güvenilirlik
- **Kanıt:** `remedy-offers/[id]/route.ts:89-92` (durum `pending` olur), `:100` (timeline), `:102-124` (bildirim `try/catch` ile **yutulur**), `:126-133` (analytics), `:138` (`notificationSent: !!offer.userId` — gerçek sonuç değil). Reddet yolunda da durum değiştikten sonra `analyticsEvent.create` hata verirse 500 döner (`:77-84`) ve client hata toast'ı gösterip listeyi yenilemez (`page.tsx:61-62`).
- **Sorun:** Bildirim oluşturma başarısız olursa teklif `pending` (müşteriye açık) olur ama müşteri haberdar edilmez; bayi yine "Müşteriye gönderildi" görür. Teklif kuyruktan düşer ve başka hiçbir bayi ekranında görünmediği için (bkz. B8) kaybolur.
- **Öneri:** Durum güncelleme + timeline + bildirim kaydını `prisma.$transaction` içine al; analytics'i `after()` ile yan etkiye taşı (proje zaten feedback'te bu deseni kullanıyor). `notificationSent`'ı gerçek sonuca bağla; client'ta `notificationSent === false` ise uyarı toast'ı göster.
- **Efor:** S

### B6 — Geri alınamaz eylemler onaysız, düzenlemesiz, gerekçesiz
- **Önem:** orta · **Kategori:** UX / ürün
- **Kanıt:** `page.tsx:141, 151` (doğrudan `act()`); `remedy-offers/[id]/route.ts:11-13` (yalnızca `publish|reject`); reddedilenden geri dönüş ucu yok; reddette timeline olayı yok (`:66-85`, kıyas publish `:100`).
- **Sorun:** Yanlış satıra basmak müşteriye anında bildirim gönderir veya taslağı kalıcı olarak öldürür. Bayi otomasyonun jenerik mesajını ("…(otomatik teklif)" — `lib/remedy-automation-core.ts:26-27`) kişiselleştiremez; oysa telafide kişisel ton kabul oranını belirleyen ana etkendir. Red nedeni toplanmadığı için otomasyon eşiği hiç öğrenemez.
- **Öneri:** Satırı genişletilebilir "inceleme çekmecesi"ne çevir: mesaj `Textarea` (500 karakter sınırı, `{{isim}}` değişkeni), seçenek chip'lerini aç/kapa, "Yayınla" için kısa onay ("Ayşe K.'ya bildirim gidecek"), "Reddet" için neden seçimi (yanlış pozitif / zaten çözüldü / müşteri kötüye kullanıyor) + 5 sn "Geri al" toast'ı. API: `PATCH /api/dealer/remedy-offers/[id]` (message, options — Zod ile şablon değerleriyle sınırlı), `reject` gövdesine `reason`, timeline'a `rejected` olayı.
- **Efor:** M

### B7 — Müşteri, onaylanan seçeneklerin dışında değer seçebiliyor (komşu uç)
- **Önem:** yüksek · **Kategori:** veri bütünlüğü / güvenlik
- **Kanıt:** `app/api/customer/remedy/[offerId]/route.ts:15-18` (`selectedType`, `selectedValue` yalnızca `z.string().min(1)`), `:160-167` (doğrudan yazılıyor; `offer.options` ile karşılaştırma yok).
- **Sorun:** Bu sayfadaki "Yayınla" kararının anlamı "bu seçenek kümesini müşteriye aç" demek. Ancak müşteri ucu, yayınlanan kümeyi doğrulamıyor: istek elle düzenlenerek `selectedType: "discount", selectedValue: "100"` kaydedilebilir. Puan otomatik basılmadığı için (accept yolu puan kredilemiyor) doğrudan para kaybı yok, ama kasada bu kayda güvenen bayi için kötüye kullanım riski var ve bayinin onayının anlamı ortadan kalkıyor. (Bu sayfanın dosyası değil; telafi akışının bütünlüğü için burada raporlandı.)
- **Öneri:** Accept ucunda `offer.options` yükle, `selectedType` + `selectedValue` çiftinin kümede olduğunu doğrula, değilse 400. Puan türü ileride otomatik kredilenecekse `points-economy-invariants` kurallarına (atomik tek seferlik kredi) uy.
- **Efor:** S

### B8 — Telafi yaşam döngüsünün yalnızca ilk adımı görünüyor
- **Önem:** orta · **Kategori:** bilgi mimarisi / ürün
- **Kanıt:** Bayi tarafında `remedyOffer` listeleyen tek uç bu kuyruk (`app/api/dealer/remedy-queue/route.ts`); diğerleri yalnızca sayım (`business-outcomes/route.ts:58-59`, `operations-brief/route.ts:84`, `morning-briefing/route.ts:55-60`). Menü adı ve metadata "Telafi merkezi" (`messages/tr.json:51, 2542`), `/dealer/reviews` bağlantısı "Telafi Merkezi →" (`app/dealer/reviews/page.tsx:191-196`).
- **Sorun:** Kullanıcı "merkez" vaadiyle geliyor; yayınladığı teklif müşteriye ulaştı mı, açıldı mı, hangi seçenek seçildi, kasada kullanıldı mı — hiçbir yerde göremiyor. Ayrıca `business-outcomes` kabul oranının paydası reddedilen ve hâlâ kuyrukta bekleyen taslakları da sayıyor (`:58`), yani KPI bu sayfadaki kararlarla bozuluyor.
- **Öneri:** Sayfayı sekmeli "Telafi Merkezi"ne dönüştür: **Onay bekleyen · Müşteride (pending) · Kabul edildi · Reddedildi/Süresi doldu**. Tek uç: `GET /api/dealer/remedy-offers?status=&locationId=&source=&cursor=` (cursor sayfalama, durum sayaçları `groupBy` ile). Kabul edilenlerde `selectedType/selectedValue` ve `acceptedAt`, timeline'dan (`lib/remedy-timeline.ts`) mini zaman çizelgesi. KPI paydasını `status IN ('pending','accepted','expired')` yap.
- **Efor:** L

### B9 — Modül kapısı API'de uygulanmıyor
- **Önem:** orta · **Kategori:** yetki / tutarlılık
- **Kanıt:** Menü öğesi `moduleKey: 'remedy_offers'` (`components/dashboard/sidebar.tsx:256`); oluşturma uçları `assertModuleEnabled('remedy_offers')` çağırıyor (`feedbacks/[id]/remedy/route.ts:36-37`, `consumption-reviews/[id]/remedy/route.ts:37`); kuyruk GET ve publish/reject POST çağırmıyor.
- **Sorun:** Admin modülü kapattığında menü gizlenir ama doğrudan URL ile kuyruk açılır ve bekleyen taslaklar müşteriye yayınlanabilir — modül kapatmanın beklenen anlamı ("bu özellik şu an devre dışı") delinir.
- **Öneri:** Her iki ucun başına `const gate = await assertModuleEnabled('remedy_offers'); if (gate) return gate;`; sayfada modül kapalıysa ortak "modül devre dışı" boş durumu.
- **Efor:** S

### B10 — Yanlış butonda dönen spinner ve tam-liste yeniden yükleme
- **Önem:** düşük · **Kategori:** mikro-etkileşim
- **Kanıt:** `page.tsx:143` (spinner koşulu yalnızca `actingId === o.id`, eylem türü bilinmiyor), `:153` (Reddet'te spinner yok), `:60` + `:32` (her eylemden sonra `setLoading(true)` → tüm liste kaybolur).
- **Sorun:** Reddet'e basan kullanıcı Yayınla butonunda dönen spinner görür — "yanlışlıkla yayınladım mı?" kaygısı yaratır. Ardından tüm kart spinner'a dönüp yeniden çizilir; kullanıcı listedeki yerini kaybeder.
- **Öneri:** `acting` state'ini `{ id, action }` yap; iyimser olarak satırı listeden çıkar (framer-motion `AnimatePresence` ile `height`/`opacity` çıkışı, `useReducedMotion` saygılı), hata olursa geri ekle; arka planda sessiz yeniden doğrulama (loading bayrağı olmadan).
- **Efor:** S

### B11 — Dil karışıklığı ve sabit metinler
- **Önem:** düşük · **Kategori:** i18n
- **Kanıt:** `page.tsx:88` ("Yorumlar" sabit) · `lib/admin-toast.ts:16-19` ("Basarili: ", "Dikkat: " öneki — Türkçe karakter yok, EN'de de Türkçe) · `remedy-offers/[id]/route.ts:32, 50, 53, 58, 73, 145` (sabit Türkçe hatalar, client bunları doğrudan toast'lar `page.tsx:58`) · `app/dealer/reviews/page.tsx:195` ("Telafi Merkezi →" sabit).
- **Sorun:** EN arayüzde "Basarili: Sent to customer", "Dikkat: Teklif bulunamadı" gibi karışık mesajlar.
- **Öneri:** Sunucu hata gövdesine `code` (ör. `OFFER_NOT_IN_QUEUE`) ekle, client'ta `t('dealerRemedyQueue.errors.<code>')` ile çevir; bayi panelinde `admin-toast` yerine öneksiz `sonner` ya da locale-bilinçli bir sarmalayıcı kullan.
- **Efor:** S

### B12 — Otomasyon bildirimi kuyruğa götürmüyor
- **Önem:** düşük · **Kategori:** akış bütünlüğü
- **Kanıt:** `lib/remedy-automation-core.ts:124-133` (`data: { offerId, feedbackId }`), `lib/notification-public-dto.ts:8-41` (`offerId` beyaz listede değil; `ctaPath` destekleniyor ama verilmemiş).
- **Sorun:** "Otomatik telafi taslağı hazır" bildirimi tıklanınca bayiyi onay ekranına götürmüyor; kuyruğun ana giriş kapısı kopuk.
- **Öneri:** Bildirime `ctaPath: '/dealer/remedy-queue?focus=<offerId>'` ekle; sayfada `focus` parametresiyle satırı vurgula/aç.
- **Efor:** S

### B13 — Erişilebilirlik ve dokunma hedefleri
- **Önem:** düşük · **Kategori:** erişilebilirlik
- **Kanıt:** `page.tsx:137-155` (bağlamsız "Yayınla/Reddet", `size="sm"`).
- **Sorun:** Ekran okuyucu kullanıcısı 10 adet aynı "Yayınla" butonu duyar; mobilde ~32px hedefler yanlış dokunmaya açık (B6 ile birleşince riskli).
- **Öneri:** `aria-label={t('…publishFor', { name })}`, satırı `<article aria-labelledby>` yap, mobilde butonları tam genişlik ve en az 44px yap; eylem sonrası odağı bir sonraki satıra taşı.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Vaka (case) yönetimi görünümü** — Medallia "Close the Loop" ve Qualtrics XM Tickets'ta her telafi bir vakadır: sahibi, SLA sayacı, durum hattı (açık → teklif → kabul → kapatıldı), iç notlar. Burada SLA/bekleme süresi uyarısı ve son kullanma tarihi yok (şemada `expired` var, atayan kod yok).
2. **Toplu işlem + klavye kısayolları** — Otomasyonun ürettiği hacimde (ayda 40'a kadar) `J/K` ile gezinme, `A` onayla, `R` reddet, çoklu seçim ile toplu yayın.
3. **Bağlam paneli** — Kaynak yorumun tamamı, AI duygu/churn skoru ve tetik nedeni, müşterinin geçmiş ziyaretleri ve önceki telafileri (Yelp for Business/Google Business Profile yanıt ekranlarında yorumun tamamı ve müşteri geçmişi yan yana durur).
4. **Mesaj kişiselleştirme ve AI taslak** — Qualtrics/Medallia'da AI önerili yanıt ve şablon değişkenleri; burada mesaj tamamen sabit.
5. **Sonuç takibi ve ROI** — Telafi sonrası geri dönüş ziyareti, kabul oranı, kullanılan indirim tutarı (Toast/Square'de "comp/void" raporları gibi). Bayi yayınladığı teklifin sonucunu göremiyor.
6. **Şube/rol filtresi ve atama** — Çok şubeli işletmede taslağı şube müdürüne atama, şubeye göre filtre; onaylayanın kim olduğunun denetim kaydı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** "Telafi Merkezi" — bayinin mutsuz müşteriyi 2 dakikada geri kazandığı bir gelen kutusu. Bayi sayfayı açtığında en üstte üç sayı görür: *Onay bekleyen (en eskisi 3 saat önce)*, *Müşteride bekleyen*, *Bu ay geri kazanılan*. Kuyruk satırı tek bakışta kararı mümkün kılar: kim, ne şikâyet etti, neden önerildi (düşük puan / churn riski), ne teklif ediliyor. Karar tek tıkla verilir ama geri alınabilir.

**Yerleşim:**
- Masaüstü: iki sütunlu "inbox" — solda yoğun liste (müşteri adı, puan yıldızları, kaynak ikonu QR/tüketim, şube, bekleme süresi rengi, "otomatik" etiketi), sağda seçili taslağın inceleme paneli (yorumun tamamı, AI özeti, müşteri geçmişi, düzenlenebilir mesaj, seçenek chip'leri, Yayınla/Reddet + neden).
- Mobil: liste → tam ekran sheet; altta sabit eylem çubuğu (`env(safe-area-inset-bottom)`), 44px butonlar; kaydırarak onay/red yerine açık butonlar (yanlış dokunma riskine karşı).
- Üstte sekmeler: Onay bekleyen · Müşteride · Kabul edildi · Kapalı; ikinci düzeyde filtreler (şube, kaynak, otomatik/elle, puan). Otomasyon ve şablon ayarları aynı merkezde "Ayarlar" sekmesi/çekmecesi.

**Motion (ölçülü):** Satır onaylanınca `AnimatePresence` ile yükseklik daralarak çıkış (150–200 ms), sekme sayacında küçük sayı geçişi; `useReducedMotion` açıkken yalnızca opaklık. 3B veya dekoratif animasyon **yersiz** — bu operasyonel bir iş ekranı.

**Veri / API değişiklikleri:**
- `GET /api/dealer/remedy-offers?status=&locationId=&source=&cursor=` — açık `select`, sunucuda `displayName`, normalize `options`, tetik nedeni (`timelineEvents` içinden `created.meta.trigger`), şube adı, durum sayaçları (`groupBy`), cursor sayfalama. Mevcut `/api/dealer/remedy-queue` bu ucun `status=awaiting_dealer_approval` takma adı olarak kalabilir.
- `PATCH /api/dealer/remedy-offers/[id]` — mesaj ve seçenek düzenleme (yalnız `awaiting_dealer_approval` iken; seçenekler bayinin aktif şablon değerleriyle sınırlı).
- `POST /api/dealer/remedy-offers/[id]` — `reject` için `reason`; `publish` için mükerrer açık teklif kontrolü (409); tüm adımlar `$transaction`; analytics `after()`; timeline'a `rejected` ve `published_by` (onaylayan kullanıcı).
- `POST /api/dealer/remedy-offers/bulk` — `{ ids[], action }`, her biri koşullu `updateMany`, sonuç özetini döndür.
- Her uçta `assertModuleEnabled('remedy_offers')`.
- Cron (mevcut db-cleanup cron'una ek): X gün kabul edilmeyen `pending` teklifleri `expired` yap; Y saatten uzun bekleyen taslaklar için bayiye hatırlatma bildirimi (`ctaPath` ile).
- Müşteri accept ucunda seçenek doğrulaması (B7).

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/remedy-automation`** ve **`/dealer/remedy-automation/templates`**: Aynı `remedy_offers` modülünün parçaları, menüde ayrı öğeler (`components/dashboard/sidebar.tsx:256-257`), birbirine karşılıklı link veriyorlar (`page.tsx:81-83`, `app/dealer/remedy-automation/page.tsx:182`). Üçü tek "Telafi Merkezi" altında sekmeler (Kuyruk · Geçmiş · Otomasyon · Şablonlar) olarak birleştirilmeli; menüde tek öğe kalmalı. Sayfa adı tutarsızlığı (menü/metadata "Telafi merkezi", h1 "Telafi onay kuyruğu", reviews sayfasında sabit "Telafi Merkezi →") bu birleşmeyle kendiliğinden çözülür.
- **`/dealer/feedbacks`** ve **`/dealer/reviews`**: Telafi başlatma noktaları (`app/dealer/feedbacks/page.tsx:188-228, 972-984`). Kalmalılar, ancak her yorum kartında o yorumun telafi durumunu (taslak/gönderildi/kabul) gösteren rozet ve merkezdeki ilgili satıra derin link olmalı; böylece aynı yoruma ikinci telafi açılması UI'da da engellenir.
- **`/dealer/operations-brief`**, **dashboard sabah brifingi**, **`/dealer/business-outcomes`**: Yalnızca sayaç/KPI gösteriyorlar; birleştirme gerekmez, ama KPI tanımları (kabul oranı paydası, `business-outcomes/route.ts:58`) merkezdeki sekme sayaçlarıyla aynı kaynaktan (`lib/remedy-stats.ts` gibi tek yardımcı) beslenmeli.

---

## Doğrulama (şüpheci inceleme)

Her iddia çağıran/çağrılan kod, `prisma/schema.prisma` ve müşteri tarafı uçlarıyla birlikte yeniden okundu. Kod değiştirilmedi, veritabanına dokunulmadı.

### 1. Yinelenen telafi taslakları — **DOĞRULANDI** (önem: orta; bayi maliyeti)
- `app/api/dealer/feedbacks/[id]/remedy/route.ts:79-89` ve `app/api/dealer/consumption-reviews/[id]/remedy/route.ts:86-96` doğrudan `remedyOffer.create` yapıyor; açık teklif (`pending`/`awaiting_dealer_approval`/`accepted`) kontrolü yok. Kontrol yalnızca otomasyon yolunda var (`lib/remedy-automation-core.ts:87-92`), o da yalnız `feedbackId` için.
- Şemada da engel yok: `RemedyOffer` üzerinde `feedbackId`/`consumptionReviewId` için yalnızca `@@index`, unique/partial-unique kısıt yok (`prisma/schema.prisma:1348-1349`).
- Idempotency koruması fiilen devre dışı: `checkIdempotency` başlık yoksa `{cached:false,key:''}` döner (`lib/idempotency.ts:32-33`), istemci ise `Idempotency-Key` göndermiyor (`app/dealer/feedbacks/page.tsx:216-224`).
- UI da engellemiyor: "Telafi gönder" butonu kartlarda koşulsuz render ediliyor (`app/dealer/feedbacks/page.tsx:693-701`, `822-830`); kartta mevcut teklif durumu gösterilmiyor.
- Publish ucunda da kontrol yok (`app/api/dealer/remedy-offers/[id]/route.ts:88-98`).
- **Yeniden üretim:** Otomasyon açık bayi için 1 yıldızlı QR geri bildirimi gelir → otomasyon taslağı kuyruğa düşer. Bayi `/dealer/feedbacks` üzerinden aynı yoruma "Telafi gönder → önce kuyruğa al" yapar → kuyrukta aynı müşteri+yorum için iki satır. Bayi ikisini de "Yayınla"r → müşterinin `/customer/remedy` listesinde iki `pending` teklif; ikisini de ayrı ayrı kabul edebilir (`app/api/customer/remedy/[offerId]/route.ts:160-168` teklif başına koşullu). Aynı şey kuyruk hiç kullanılmadan, "Telafi gönder"e iki kez basarak da olur.
- Not: Bayinin kendi eylemiyle oluşur ve puan basımı yok; dolayısıyla "kritik" değil, ama tek şikâyete çift telafi gerçek bir ticari kayıp ve kuyruğun "onay" anlamını zayıflatıyor.

### 2. Müşteri kabulünde tür/değer doğrulanmıyor — **DOĞRULANDI** (önem: orta; veri bütünlüğü)
- `patchSchema` yalnızca `z.string().min(1)` (`app/api/customer/remedy/[offerId]/route.ts:15-18`); PATCH'te `options` bile seçilmiyor (`:126-129`) ve değerler doğrudan yazılıyor (`:160-167`) ve timeline'a da işleniyor (`:187-190`).
- İstemci tarafında doğrulama var (`app/customer/remedy/[offerId]/page.tsx:95-102`) ama bu yalnızca UI; `fetch` gövdesi elle değiştirilerek atlanabilir.
- **Yeniden üretim:** Müşteri, bayinin yayınladığı ve seçenekleri `discount: [10,20]` olan teklif için `PATCH /api/customer/remedy/<id>` gövdesine `{"selectedType":"discount","selectedValue":"100"}` gönderir → 200, kayıt `accepted`, müşteri ekranında "Seçim: discount / 100" (`app/customer/remedy/[offerId]/page.tsx:203`, `app/customer/remedy/page.tsx:221`).
- Etki sınırı: Kabulde otomatik puan/kupon kredisi YOK; `selectedType/selectedValue` hiçbir bayi/admin ekranında ve `lib/` içinde tüketilmiyor (grep: yalnızca müşteri sayfaları ve iki müşteri API'si). Yani doğrudan para/puan basımı yok; risk, kasada müşterinin telefonundaki "resmi" uygulama ekranına güvenilmesi ve ileride bu alanı tüketecek bir otomasyonun sahte değeri kredilendirmesidir. Sunucuda `offer.options` ile eşleşme kontrolü (tür var mı, değer `values.map(String)` içinde mi) şart.

### 3. Hata durumu boş kuyruk gibi görünüyor — **DOĞRULANDI** (önem: orta; operasyonel)
- `load()` hata halinde yalnız toast atıyor, `offers` önceki/ilk değerinde (`[]`) kalıyor (`app/dealer/remedy-queue/page.tsx:31-43`); render `offers.length === 0` → "Onay bekleyen telafi yok." (`:103-104`). Ayrı bir hata durumu/yeniden dene yok.
- Sunucu ucu `app/api/dealer/remedy-queue/route.ts:12-48` try/catch ve `responseIfDatabaseUnavailable` içermiyor; Neon kesintisinde yakalanmamış hata → Next'in 500 yanıtı → `res.json()` ya da `data.success` kontrolü atar → toast + boş kuyruk metni.
- **Yeniden üretim:** DB geçici erişilemezken (veya oturum süresi dolup 401 döndüğünde) bayi sayfayı açar → birkaç saniyelik toast kaybolduktan sonra kalıcı olarak "Onay bekleyen telafi yok." görür; otomasyonun ürettiği taslaklar müşteriye hiç yayınlanmaz.
- Ek bulgu (iddiada yok, doğrulandı): Uç `user: { select: { id, name } }` döndürüyor (`route.ts:27`), sayfa ise `o.user.name || o.user.email` kullanıyor (`page.tsx:121`). Adı boş müşterilerde ekranda "Müşteri: undefined" yazar; tip arayüzü (`page.tsx:19`) `email: string` dese de API bunu göndermiyor.

### 4. Publish'te bildirim hatası yutuluyor, `notificationSent=true` — **ÇÜRÜTÜLDÜ** (iddia edilen önemde değil; düşük önemli kalıntı var)
- Kod gözlemi doğru: bildirim `try/catch` ile yutuluyor (`app/api/dealer/remedy-offers/[id]/route.ts:102-124`) ve `notificationSent: !!offer.userId` döndürülüyor (`:138`); `userId` şemada zorunlu `String` olduğundan (`prisma/schema.prisma:1332`) bu alan her zaman `true`.
- Ancak iddia edilen etki gerçekleşmiyor:
  - Bu sayfa `notificationSent` alanını hiç okumuyor; publish sonrası yalnızca `res.ok` bakıp sabit `toastPublishSuccess` gösteriyor (`app/dealer/remedy-queue/page.tsx:57-59`). Yani yanıltıcı alan bu sayfada kullanıcıya ulaşmıyor.
  - Teklif "kaybolmuyor": `pending` teklif müşterinin kenar çubuğundaki "Telafi" menüsünden (`components/dashboard/sidebar.tsx:294`) erişilen `/api/customer/remedy` listesinde görünüyor (`app/api/customer/remedy/route.ts:25-36`, yalnız `awaiting_dealer_approval` ve `rejected` gizli) ve `/customer/feedbacks` da bu ucu çağırıyor (`app/customer/feedbacks/page.tsx:115`).
  - `notification.create` yalnızca DB hatasında başarısız olur; bu durumda hemen ardından gelen `analyticsEvent.create` (`:126-133`) de büyük olasılıkla atar ve istemci 500 alır — "bayi başarı görür ama bildirim gitmez" senaryosu ancak tek bir insert'in seçici olarak düştüğü dar bir pencerede oluşur.
- Kalıntı (düşük): Yayınla adımları atomik değil (status güncelleme, timeline, bildirim, analytics ayrı sorgular); bildirim düşerse yeniden deneme yok ve `notificationSent` yanlış bilgi veriyor. Öneri: status güncellemesi + bildirim + timeline'ı `$transaction` içine almak, analytics'i `after()`'a taşımak ve `notificationSent`'i gerçek sonuçtan türetmek.

---

## Uygulama (Dalga 2)

**Yeni yüzey:** `/dealer/inbox/remedy` (Gelen Kutusu → Telafi onayı). `/dealer/remedy-queue` sorgu parametrelerini koruyarak `permanentRedirect` ile buraya yönlenir; eski `layout.tsx` kaldırıldı. Sunucu bileşeni ilk sayfa + sayaçları paralel çeker (`lib/dealer-queues/remedy-server.ts`), istemci adası `components/dealer/b-gelen-kuyruklar/remedy/**`. BFF: `/api/dealer/queues/remedy` (liste, imleçli), `/remedy/[id]` (detay · düzenle · yayınla/reddet/geri al), `/remedy/bulk`. Eski `/api/dealer/remedy-queue` ve `/api/dealer/remedy-offers/[id]` aynı servise bağlanan geriye uyumlu takma adlardır (defineRoute + modül kapısı).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum |
|---|---|---|
| 1 | Metadata | ÇALIŞIYOR — "Telafi onayı · Gelen Kutusu" (TR/EN), menü adıyla aynı |
| 2 | Başlık + açıklama | ÇALIŞIYOR — kabuğun tek h1'i + bölüm h2 |
| 3 | "Geri bildirimlere dön" | KALDIRILDI — Gelen Kutusu sekmeleri aynı işi görür; boş durumda "Gelen Kutusu'na git" |
| 4 | Otomatik telafi ayarları linki | ÇALIŞIYOR — `/dealer/automation/remedy` |
| 5 | "Yorumlar" köprüsü | KALDIRILDI — sekme çubuğu; sabit metin kalmadı |
| 6 | Liste yükleme | ÇALIŞIYOR — zarf v2, `!ok` kodlu hata fırlatır |
| 7 | Yükleniyor | ÇALIŞIYOR — `loading.tsx` + QueryState iskeleti |
| 8 | Boş durum | ÇALIŞIYOR — görünüme özel metin + CTA (otomasyon ayarı / Gelen Kutusu) |
| 9 | Hata durumu | ÇALIŞIYOR — QueryState hata + "Tekrar dene"; boş kuyruk sanılmaz |
| 10 | Satır listesi | ÇALIŞIYOR |
| 11 | Tekrarlı "Onay bekliyor" rozeti | KALDIRILDI — yerine kaynak / otomatik-elle / bekleme süresi bilgisi |
| 12 | Göreli zaman | ÇALIŞIYOR |
| 13 | Teklif mesajı | ÇALIŞIYOR — düzenlenebilir |
| 14 | Müşteri adı | ÇALIŞIYOR — ad sunucuda üretilir; e-posta ve ham kimlik dönmez |
| 15–16 | Kaynak yorum (QR / tüketim) | ÇALIŞIYOR — detayda tam metin + Gelen Kutusu derin bağlantısı |
| 17 | Seçeneklerin gösterimi | ÇALIŞIYOR |
| 18 | Mesaj/seçenek düzenleme | ÇALIŞIYOR — `PATCH /api/dealer/queues/remedy/[id]`, zaman çizelgesine `edited` |
| 19 | Yayınla | ÇALIŞIYOR — onay diyaloğu, tek transaction + kaynak kilidi, gerçek `notificationSent` |
| 20 | Reddet | ÇALIŞIYOR — neden zorunlu, zaman çizelgesine yazılır, 10 dk içinde geri alınabilir |
| 21 | Spinner | ÇALIŞIYOR — eylem/düğme bazında |
| 22 | Çift tık koruması | ÇALIŞIYOR |
| 23 | Eylem sonrası yenileme | ÇALIŞIYOR — iyimser kaldırma + arka planda geçersiz kılma |
| 24–25 | Sunucu yetki / yarış | ÇALIŞIYOR — kiracı kapsamı (`resolveDealerScope`; admin salt okunur) |
| 26 | Modül kapısı | ÇALIŞIYOR — sayfa + tüm uçlar `remedy_offers` |
| 27 | Sayfalama / toplam | ÇALIŞIYOR — imleçli "Daha fazla" + sekme sayaçları |
| 28 | Filtre / arama | ÇALIŞIYOR — görünüm (bekleyen/gönderilen/kabul/kapanan) + kaynak + arama, URL'de |
| 29 | Toplu onay/red | ÇALIŞIYOR — seçim çubuğu, her taslak kendi transaction'ında |
| 30 | Canlı yenileme | ÇALIŞIYOR — odakta yeniden çekme (30 sn bayatlık) |
| 31 | Kaynak bağlantısı | ÇALIŞIYOR |
| 32 | Teklif geçmişi | ÇALIŞIYOR — Gönderilen / Kabul / Kapanan sekmeleri |
| 33 | Otomatik/elle + tetik nedeni | ÇALIŞIYOR — `origin.trigger` |
| 34 | SLA / süre dolumu | ÇALIŞIYOR — uzun bekleyen taslak uyarı metriği + günlük işte 30 gün sonra `expired` + onay hatırlatması |
| 35 | Bildirimden derin link | ÇALIŞIYOR — `ctaPath: /dealer/inbox/remedy?id=…` |
| 36 | Mobil + dokunma hedefi | ÇALIŞIYOR — ≥44px |
| 37 | i18n | ÇALIŞIYOR — TR/EN kopya; "Basarili:" ön eki yok (sonner) |
| 38 | Erişilebilir etiketler | ÇALIŞIYOR — `aria-label` müşteri bağlamlı |
| 39 | Azaltılmış hareket | ÇALIŞIYOR — `useMotionPolicy` |

### Kapanan bulgular (13/13)
B1 (seçenekler görünür), B2 (hata görünür), B3 (müşteri adı), B4 (yinelenen taslak: kaynak kilidi + kabul edilmiş telafi varsa 409), B5 (atomik yayın), B6 (onay + düzenleme + gerekçe + geri al), B7 (müşteri kabulü allowlist — `lib/remedy-offer-service.ts`), B8 (yaşam döngüsü sekmeleri), B9 (modül kapısı), B10 (spinner/iyimser güncelleme), B11 (dil), B12 (derin link), B13 (a11y/44px).

### Kalanlar
- Şube bazlı filtre: liste DTO'sunda şube yok; düşük değer, eklenmedi.
- Müşteriler 360'a doğrudan bağlantı: 360 çekmecesi müşteri yüzeyinin sözleşmesi; kaynak yorum bağlantısı yeterli görüldü.
