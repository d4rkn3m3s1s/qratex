# /admin/agent-council/history

**Amaç:** Grok Konseyi'nin (Harper · Benjamin · Lucas · Grok çoklu ajan tartışması) geçmiş koşularını listelemek ve bir kayda tıklayınca ana konsey sayfasında (`/admin/agent-council?runId=…`) tam transkripti ve kararı yeniden açmak.

**Genel puan: 2.5/10** · **Karar: birleştir** (ana konsey sayfasına "Geçmiş" paneli/çekmecesi olarak taşınmalı; önce kalıcılık katmanı yeniden inşa edilmeli)

> Özet teşhis: Sayfa teknik olarak hatasız render oluyor, ama **beslendiği veri kaynağı ölü**. Ana konsey sayfasının kullandığı iki akış (`/api/admin/agents/conversation` ve `/conversation/stream`) hiçbir şeyi veritabanına yazmıyor. `AgentRun` satırı oluşturan TEK uç (`POST /api/admin/agents/run`) uygulamanın hiçbir yerinden çağrılmıyor, git geçmişinde de hiç çağrılmamış. Sonuç: bu sayfa pratikte her zaman "Kayıt yok." gösterir. Üstelik uygulama içinden bu sayfaya giden bir link de yok (sidebar'da ve ana konsey sayfasında yok); sayfa yetim.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 1/10 | Liste mantığı doğru ama hiçbir UI akışı `AgentRun` yazmadığı için sayfa yapısal olarak boş; hata durumu "Kayıt yok" ile maskeleniyor. |
| UX | 3/10 | Boş durum CTA'sız, arama/filtre/sayfalama yok, durum etiketi ham İngilizce (`completed`), sayfaya navigasyondan ulaşılamıyor. |
| Görsel | 4/10 | Hero tutarlı, ama altındaki `rounded-none border-4 border-black` brutalist kart ana konsey sayfasının `rounded-xl` diliyle ve admin genelindeki tasarımla çelişiyor; satırlar yoğunluksuz ve hiyerarşisiz. |
| Mimari | 3/10 | Ayrı rota + `?runId` ile ana sayfaya geri sıçrama, `prisma as any` ile tip kaçağı, kullanılmayan `proposals/decisions` include'u, sunucu tarafında `take` doğrulaması zayıf, sayfa metinleri i18n dışında. |
| Performans | 6/10 | Tek istek, 50 satır, hafif; ancak API her satır için kullanılmayan 2 proposal + 1 decision çekiyor (gereksiz join/payload), SWR/önbellek/yeniden doğrulama yok. |
| Erişilebilirlik + Mobil | 5/10 | `aria-busy`, `role="status"`, `aria-labelledby` iyi; ama satır `aria-label`'ı görünür içeriği ezip kazanan/güven bilgisini düşürüyor, odak stili zayıf, uzun hedef metinleri kırpılmıyor. Mobilde `flex-wrap` sayesinde taşma yok. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Sayfa metadata'sı (noindex, i18n başlık/açıklama) | ÇALIŞIYOR | `app/admin/agent-council/history/layout.tsx:4-6`, `messages/tr.json:171-172` | Metadata i18n'li ama sayfa gövdesi değil (bkz. #24). |
| 2 | Hero başlık + açıklama ("Kayıtlı çoklu ajan koşuları…") | KISMİ | `history/page.tsx:39-42` | Açıklama "tam transkript ve karar açılır" vaat ediyor; yeni koşular hiç kaydedilmediği için vaat gerçekte karşılanmıyor. |
| 3 | "Yeni konsey oturumu" butonu | ÇALIŞIYOR | `history/page.tsx:43-50` | `/admin/agent-council`'a Link. |
| 4 | Koşu listesini çekme (`GET /api/admin/agents/runs?take=50`) | BOZUK | `history/page.tsx:27`; `app/api/admin/agents/runs/route.ts:23-30`; yazıcı yok: `app/api/admin/agents/conversation/route.ts:1-6`, `conversation/stream/route.ts:1-5` (prisma importu yok); `POST /api/admin/agents/run` çağıranı yok (repo genelinde grep + `git log -S`) | Kod çalışıyor, veri kaynağı beslenmiyor → liste kalıcı olarak boş. Üretim DB'sinde eski/elle eklenmiş satır olup olmadığı **doğrulanmadı** (DB'ye dokunulmadı). |
| 5 | Yükleniyor durumu | ÇALIŞIYOR | `history/page.tsx:61-65` | Sadece metin; iskelet (skeleton) yok. |
| 6 | Boş durum ("Kayıt yok.") | KISMİ | `history/page.tsx:66-68` | CTA yok, neden boş olduğu anlatılmıyor; hata durumu da buraya düşüyor. |
| 7 | Hata durumu | BOZUK | `history/page.tsx:26-32` | `catch` yok: `res.ok=false` veya `success=false` olunca sessizce "Kayıt yok."; ağ/JSON hatasında yakalanmamış promise reddi (`load()` sonucu da beklenmiyor, `page.tsx:34`). Tekrar dene butonu yok. |
| 8 | Satır → `/admin/agent-council?runId=` detay linki | KISMİ | `history/page.tsx:70-73`; hedef: `app/admin/agent-council/page.tsx:131-150` | Mekanizma çalışıyor ama yalnızca eski `POST /run` formatındaki kayıtlar için; ana sayfa 404/`success:false` durumunda kullanıcıya hiçbir şey söylemiyor (`page.tsx:138` erken `return`). |
| 9 | Hedef (goal) metni | ÇALIŞIYOR | `history/page.tsx:76` | 500 karaktere kadar olabilir (`run/route.ts:14`); `line-clamp` yok, satır şişer. |
| 10 | Durum rozeti | KISMİ | `history/page.tsx:78` | Ham değer basılıyor: `completed` / `running` / `failed` (`prisma/schema.prisma` `AgentRun.status`) → TR arayüzde İngilizce; renk/semantik varyant yok. |
| 11 | Kazanan ajan | ÇALIŞIYOR | `history/page.tsx:79-81` | Ham isim (`Harper` vb.); ana sayfadaki persona etiketi/ikon/renk (`agent-council/page.tsx:58-63`) kullanılmıyor. |
| 12 | Güven yüzdesi | ÇALIŞIYOR | `history/page.tsx:82`; `run/route.ts:46` (0–1 ölçekte saklanıyor) | Ölçek tutarlı. |
| 13 | Tarih | KISMİ | `history/page.tsx:83` | `toLocaleString('tr-TR')` sabit kodlu (EN locale'de de TR); göreli zaman ("2 saat önce") ve tarih gruplaması yok. |
| 14 | Erişilebilirlik öznitelikleri (`aria-busy`, `role=status`, `aria-labelledby`, satır `aria-label`) | KISMİ | `history/page.tsx:53,62,56,74` | Satır `aria-label`'ı görünür metni ezer, kazanan ve güven bilgisini ekran okuyucudan gizler; ham `completed` okunur. |
| 15 | Navigasyondan erişim | EKSİK | `components/dashboard/sidebar.tsx:188` yalnızca `/admin/agent-council`; ana sayfada history linki yok (`agent-council/page.tsx` içinde `href` yok) | Sayfa yetim: sadece URL bilenler, `e2e/smoke.spec.ts` ve `scripts/admin-responsive-scan.mjs` ulaşıyor. |
| 16 | Kayıtlı koşunun ana sayfada görüntülenmesi (eski format eşleme) | KISMİ | `lib/council-run-mapper.ts:23-38,52-91` | Eski rol modeli (proposal/critique/consensus, 3 tur) yeni 4 ajan/5 stance modeline yaklaşık eşleniyor; `critique` → `captain` eşlemesi semantik olarak yanlış etiket üretir. |
| 17 | Sayfalama / "daha fazla yükle" | EKSİK | `history/page.tsx:27` (`take=50` sabit), API'de cursor yok (`runs/route.ts:17-30`) | 51. kayıttan sonrası erişilemez. |
| 18 | Arama, filtre (durum/kazanan/tarih), sıralama | EKSİK | — | — |
| 19 | Yeni konsey oturumlarının kalıcı kaydı | EKSİK | `conversation/route.ts:33-37` ve `conversation/stream/route.ts:25-74` yalnızca state döndürüyor | Sayfanın varlık sebebi olan kök özellik. |
| 20 | Silme / arşivleme / sabitleme | EKSİK | API'de DELETE/PATCH yok (`app/api/admin/agents/run/[id]/route.ts` yalnız GET) | — |
| 21 | Koşuyu başlatan admin bilgisi | EKSİK | `createdById` şemada ve indeksli (`schema.prisma` `AgentRun`) ama listede gösterilmiyor/join edilmiyor | Çok adminli ortamda denetim izi yok. |
| 22 | Karar/aksiyon önizlemesi (satır içinde) | EKSİK | API `decisions` + `proposals` döndürüyor (`runs/route.ts:26-29`), sayfa kullanmıyor (`page.tsx:11-18` arayüzünde yok) | Veri zaten geliyor, boşa gidiyor. |
| 23 | "Aksiyona dönüştürüldü mü / hangi bayiye" ve sonuç (outcome) takibi | EKSİK | `council-to-actions` sonucu run'a bağlanmıyor; `AgentOutcome` modeli ve `/api/admin/agents/outcomes` UI'den çağrılmıyor | Karar → aksiyon → sonuç döngüsü görünmez. |
| 24 | Sayfa metinlerinin i18n'i | KISMİ | `history/page.tsx:40-41,47,57,63,67,82` sabit TR | Metadata EN/TR, gövde yalnız TR. |
| 25 | Kalıcılık modu göstergesi (`persistence: 'memory'`) | EKSİK | `runs/route.ts:21` döndürüyor, sayfa yok sayıyor | Memory modunda kayıtlar sunucusuz instance'lar arasında kaybolur; kullanıcı bilmez. |
| 26 | Yetki: sayfa (proxy rol + gizli kapı) ve API (`requireAuth(['ADMIN'])`) | ÇALIŞIYOR | `proxy.ts:60-89`; `runs/route.ts:13-14`; `run/[id]/route.ts:15-16` | API'ler gizli kapı cookie'si istemiyor (bkz. Bulgu 8, sistem geneli). |
| 27 | Mobil yerleşim | ÇALIŞIYOR | `history/page.tsx:77` `flex-wrap` | 400px'te taşma beklenmez; satırlar dokunma hedefi olarak yeterli (`p-3`). |
| 28 | Yenile / tekrar dene | EKSİK | — | Sayfa yalnız mount'ta bir kez yükler. |

**Sayım:** ÇALIŞIYOR 8 · KISMİ 8 · BOZUK 2 · SAHTE 0 · EKSİK 10 (toplam 28)

---

## Bulgular

### 1. [KRİTİK · Veri bütünlüğü / İşlevsellik] Konsey oturumları hiç kaydedilmiyor; geçmiş sayfası yapısal olarak boş
- **Kanıt:** Ana konsey sayfası yalnızca `POST /api/admin/agents/conversation` (`app/admin/agent-council/page.tsx:215`) ve `EventSource /api/admin/agents/conversation/stream` (`page.tsx:249`) kullanıyor. Bu iki route prisma import etmiyor (`app/api/admin/agents/conversation/route.ts:1-6`, `conversation/stream/route.ts:1-5`). `agentRun.create` repo genelinde tek yerde: `app/api/admin/agents/run/route.ts:101`; bu uca istek atan hiçbir istemci kodu yok (grep: `agents/run` yalnızca `history/page.tsx:27` [runs] ve `agent-council/page.tsx:135` [GET run/:id]); `git log -S "agents/run"` ilk ekleniş commit'i `77a7126`'dan beri de çağıran göstermiyor.
- **Sorun:** Sayfanın vaadi ("Kayıtlı çoklu ajan koşuları") hiç gerçekleşmiyor. Admin pahalı LLM tartışmalarını (4 ajan × çok tur) koşturuyor, sayfayı yenilediği an hepsi kayboluyor. `AgentRun/AgentMessage/AgentProposal/AgentDecision/AgentOutcome` şeması (`schema.prisma:2268-2341`) ölü tablo.
- **Profesyonel öneri:** Kalıcılığı akışın kendisine taşı. (a) `conversation/stream` başında `AgentRun { status: 'running', goal, createdById }` oluştur, `meta` event'inde `runId` döndür; (b) her `round` event'inde `AgentMessage` satırlarını `createMany` ile yaz (stance alanını da ekleyerek; şu an şemada `role` var, `stance` yok → migration); (c) `done`'da `AgentDecision` + `winnerAgent`/`confidence`/`finalDecision` ile `status: 'completed'`; hata/abort'ta `status: 'failed'`. Non-stream `conversation` POST'u da aynı `runId`'yi alıp devam turlarını aynı koşuya eklemeli. Ölü `POST /api/admin/agents/run` (eski `computeCouncil` modeli) ve `lib/agent-run-store.ts` memory fallback'i kaldırılmalı veya yeni modele uyarlanmalı. LLM maliyeti için `tokensIn/tokensOut/model/durationMs` alanları eklenmeli.
- **Efor:** L

### 2. [YÜKSEK · UX / Bilgi mimarisi] Sayfa yetim: uygulama içinden erişim yok
- **Kanıt:** `components/dashboard/sidebar.tsx:188` yalnızca `/admin/agent-council`; ana konsey sayfasında `history` linki yok (`agent-council/page.tsx` `href` içermiyor). Referanslar yalnız `e2e/smoke.spec.ts`, `scripts/admin-responsive-scan.mjs`, `public/sw.js`.
- **Sorun:** Bulgu 1 düzeltilse bile kullanıcı geçmişi bulamaz. Tersine bağlantı tek yönlü: history → ana sayfa var, ana sayfa → history yok.
- **Öneri:** Ayrı rota yerine ana konsey ekranına sol/sağ "Geçmiş" rayı (masaüstünde sabit kolon, mobilde `Sheet` çekmece) koy — ChatGPT/Linear tarzı oturum listesi. Ayrı rota korunacaksa en azından konsey hero'suna "Geçmiş" sekmesi ve sidebar'da alt öğe.
- **Efor:** M

### 3. [YÜKSEK · Hata yönetimi] Hatalar "Kayıt yok." olarak maskeleniyor, ağ hatası yakalanmıyor
- **Kanıt:** `history/page.tsx:26-32` — `try { … } finally { setLoading(false) }`, `catch` yok; `res.ok` false ise state değişmez ve boş durum gösterilir. `load()` dönüşü (`page.tsx:34`) beklenmiyor → `fetch`/`res.json()` hatası yakalanmamış promise reddi. Ayrıca unmount iptali yok.
- **Sorun:** 401/500/oturum düşmesi ile "gerçekten kayıt yok" ayırt edilemiyor; operatör yanlış sonuca varır.
- **Öneri:** Proje genelindeki veri katmanına uygun bir `useSWR`/`useQuery` hook'u (`error`, `isLoading`, `mutate`) ile üç durumlu UI: iskelet → hata kartı (mesaj + "Tekrar dene") → boş durum. API hata gövdesini (`{ error }`) göster.
- **Efor:** S

### 4. [ORTA · Mimari / API] `runs` API'si gereksiz veri çekiyor, `take` doğrulaması zayıf, tip kaçağı
- **Kanıt:** `app/api/admin/agents/runs/route.ts:17` `Math.min(parseInt(…),100)` — `take=abc` → `NaN` → Prisma hatası → 500; `take=-5` negatif take'e (ters sayfalama) izin verir. `route.ts:19` `prisma as any` (model şemada var, `any`'e gerek yok). `route.ts:26-29` her satır için 2 proposal + 1 decision include ediliyor, istemci kullanmıyor (`history/page.tsx:11-18`).
- **Sorun:** Gereksiz join ve payload; tip güvenliği kaybı (şema değişince derleme uyarmaz); kötü girdide 500.
- **Öneri:** `zod` ile `take` (1–100, varsayılan 20) + `cursor` (`createdAt,id`) + `status`/`winner`/`q`/`from`/`to` filtreleri; `select` ile yalnızca liste alanları + `decisions: { take:1, select: { rationale, suggestedActions } }` önizleme için; `prisma.agentRun` tipli kullanım, memory fallback dalı kaldırılsın.
- **Efor:** S

### 5. [ORTA · Dil / i18n] Ham İngilizce durum ve sabit `tr-TR` tarih; gövde metinleri i18n dışında
- **Kanıt:** `history/page.tsx:78` `{run.status}` → "completed"; `page.tsx:74,83` `toLocaleString('tr-TR')`; `page.tsx:40-41,47,57,63,67,82` sabit TR metinler, oysa metadata `messages/en.json:171-172` ile çift dilli.
- **Öneri:** `STATUS_LABEL` haritası (Tamamlandı / Sürüyor / Başarısız) + semantik rozet varyantları; `useLocale` ile `Intl.DateTimeFormat`/`RelativeTimeFormat`; metinleri `messages/*.json` altına `adminAgentCouncilHistory.*` anahtarlarıyla taşı.
- **Efor:** S

### 6. [ORTA · Görsel tutarlılık] Brutalist kart dili ana konsey ve admin genelinden kopuk
- **Kanıt:** `history/page.tsx:54` `rounded-none border-4 border-black`, `page.tsx:73` `rounded-none`; aynı desen yalnız `app/admin/agent-council/agents/page.tsx`'te var. Ana konsey sayfası `rounded-xl` + yumuşak yüzeyler kullanıyor (`agent-council/page.tsx:343,351,365,371`).
- **Sorun:** Aynı modülün üç sayfası iki ayrı görsel dil konuşuyor; satırlarda hiyerarşi yok (hedef, meta ve sonuç aynı ağırlıkta).
- **Öneri:** Admin tablo/liste primitive'ine geç (Linear "issue list" yoğunluğu): sol tarafta kazanan ajanın persona avatarı/renk noktası (`agent-council/page.tsx:58-63` haritası paylaşılan bir `lib/council-personas-ui.ts`'e taşınsın), ortada `line-clamp-2` hedef + karar özeti, sağda durum rozeti, güven mini-barı ve göreli zaman.
- **Efor:** M

### 7. [ORTA · Erişilebilirlik] Satır `aria-label`'ı içeriği eziyor; odak stili zayıf
- **Kanıt:** `history/page.tsx:74` `aria-label` kazanan ve güven bilgisini içermiyor, ham `completed` okunuyor; `page.tsx:73` yalnızca `hover:bg-muted/40`, `focus-visible` stili yok.
- **Öneri:** `aria-label`'ı kaldırıp görünür metni erişilebilir ad olarak bırak (gerekirse `sr-only` ekler); `focus-visible:ring-2 ring-ring`; liste `role="list"`/`<ol>` semantiği; klavye ile `j/k` gezinme (Linear) ve `Enter` ile açma.
- **Efor:** S

### 8. [DÜŞÜK · Güvenlik (sistem geneli)] Admin API'leri gizli kapı cookie'si istemiyor
- **Kanıt:** `proxy.ts:104-117` `/api/*` için yalnız güvenlik/CORS başlığı ekliyor; gizli kapı kontrolü `proxy.ts:79` yalnız `/admin` sayfa yollarında. `runs/route.ts:13` ve `run/[id]/route.ts:15` yalnız `requireAuth(['ADMIN'])`; `lib/api-auth.ts` gate kontrolü içermiyor.
- **Sorun:** Gizli kapının tehdit modeli ("rolü kazara ADMIN yapılan stajyer") API düzeyinde geçerli değil: böyle biri konsey transkriptlerini doğrudan API'den okuyabilir. Bu sayfaya özgü değil, tüm `/api/admin/*` için geçerli; bu sayfadaki verinin hassasiyeti düşük-orta (iş stratejisi metinleri).
- **Öneri:** `requireAuth(['ADMIN'])` içine (veya `proxy.ts`'te `/api/admin/*` için) `gateCookieBelongsTo` doğrulaması ekle; tek noktadan, tüm admin API'lerini kapsayacak şekilde.
- **Efor:** S

### 9. [DÜŞÜK · Veri doğruluğu] Eski kayıtların ana sayfada yanlış stance ile gösterilmesi
- **Kanıt:** `lib/council-run-mapper.ts:25` `critique` → `captain`; eski modelde critique'ler tüm ajanlardan geliyor (`run/route.ts:58-65`), dolayısıyla Harper/Benjamin'in eleştirileri "Koordinasyon" etiketiyle görünür (`agent-council/page.tsx:65-71`).
- **Öneri:** Bulgu 1'deki yeni kayıt modeli `stance`'i doğrudan saklasın; eski satırlar için "Eski format" rozetiyle salt okunur görünüm.
- **Efor:** S

### 10. [DÜŞÜK · UX] Ana sayfa `runId` yüklemesinde 404'ü sessizce yutuyor
- **Kanıt:** `app/admin/agent-council/page.tsx:137-138` `if (cancelled || !data.success || !data.run) return;` — 404'te toast yok; `catch` yalnız ağ hatasını yakalıyor (`page.tsx:146`).
- **Sorun:** Geçmişten silinmiş/bulunamayan kayda tıklayan kullanıcı varsayılan hedef metniyle boş bir konsey görür ve kaydın açıldığını sanabilir.
- **Öneri:** `!res.ok` için açık hata durumu + "Geçmişe dön" aksiyonu; detay için `useSearchParams` kullan (şu an `window.location` mount'ta bir kez okunuyor, aynı sayfada `runId` değişirse güncellenmez).
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

- **Oturum geçmişi rayı + kalıcı derin link** (ChatGPT/Claude oturum listesi, Linear issue URL'leri): her konsey koşusu `/admin/agent-council/runs/[id]` gibi paylaşılabilir, yer imine eklenebilir bir adres olmalı; liste ana ekranda yan panel.
- **Arama, filtre ve kaydedilmiş görünümler** (Linear, PostHog): hedef metninde tam metin arama, durum / kazanan ajan / başlatan admin / tarih aralığı / "aksiyona dönüştürüldü" filtreleri; cursor tabanlı sonsuz kaydırma.
- **Karar → aksiyon → sonuç döngüsü** (Retool iç araçları, Stripe event zinciri): her satırda kararın özeti, kaç aksiyonun hangi bayiye itildiği (`council-to-actions`), `AgentOutcome` ile ölçülen etki ("churn %3 düştü") — şema zaten var, UI yok.
- **Maliyet ve gözlemlenebilirlik** (PostHog LLM analytics, Stripe log ayrıntısı): koşu başına model, token, süre, mod (canlı LLM / demo şablon), hata nedeni.
- **Karşılaştırma ve yeniden çalıştırma**: aynı hedefi tekrar çalıştır ("Re-run"), iki koşuyu yan yana diff'le, koşuyu çatalla (fork) ve yeni turla devam et.
- **Yönetim aksiyonları + denetim izi**: sabitle, arşivle, sil (onaylı), Markdown/PDF dışa aktarma, başlatan admin avatarı.

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Konsey bir "tek seferlik gösteri" değil, kurumsal hafıza olmalı. Admin bir konu açar, ajanlar tartışır, karar bayilere aksiyon olarak itilir, haftalar sonra sonucu aynı kayıtta görülür. Geçmiş, bu hafızanın dizini.

**Yerleşim (ana konsey ekranına birleşik):**
- **Sol ray (masaüstü 280px, mobilde `Sheet`):** üstte arama kutusu + filtre çipleri (Durum · Kazanan · Bu hafta · Aksiyona dönüşenler); altında tarihe göre gruplanmış ("Bugün", "Bu hafta", "Daha eski") koşu listesi. Her satır: kazanan persona renk noktası, `line-clamp-2` hedef, göreli zaman, durum ikonu, aksiyon sayısı rozeti. `running` koşular nabız atan nokta ile en üstte.
- **Merkez:** mevcut transkript + karar paneli; URL `/admin/agent-council/runs/[id]` (ya da `?run=`), `useSearchParams` ile reaktif.
- **Sağ (isteğe bağlı detay sekmesi):** Karar, itilen aksiyonlar (bayi + durum), ölçülen sonuçlar, maliyet/meta.
- `/admin/agent-council/history` rotası kalıcı yönlendirme (`redirect('/admin/agent-council?panel=history')`) olarak kalabilir; e2e/smoke ve `public/sw.js` güncellenmeli.

**Motion (ölçülü):** Liste satırlarında yalnızca giriş için kısa `opacity/y` stagger (global `LazyMotion`, `m as Motion`; ilk 10 satırla sınırlı), seçili satır için `layoutId` ile kayan vurgu çubuğu, `running` koşu için CSS nabız. `useReducedMotion` ile hepsi kapanmalı. 3B gereksiz — bu bir iş aracı ekranı; görsel zenginlik persona renkleriyle sağlanmalı.

**Veri/API değişiklikleri:**
1. Migration: `AgentMessage.stance`, `AgentRun.mode ('live'|'demo')`, `AgentRun.model`, `tokensIn/out`, `durationMs`, `errorReason`, `archivedAt`, `pinnedAt`; `AgentRun.goal` için tam metin araması (Postgres `tsvector` veya `ILIKE` + trigram indeksi).
2. `conversation/stream` ve `conversation` route'ları koşuyu oluşturup tur tur yazacak (Bulgu 1); `council-to-actions` çağrısı `runId` alıp `AgentDecision`'a bağlanacak.
3. `GET /api/admin/agents/runs`: zod doğrulamalı `cursor`, `limit`, `q`, `status`, `winner`, `createdById`, `from`, `to`; `select` ile hafif liste + karar özeti; `nextCursor` döner.
4. `PATCH /api/admin/agents/run/[id]` (pin/archive), `DELETE` (onaylı, denetim kaydıyla), `GET …/export?format=md`.
5. Ölü `POST /api/admin/agents/run` + `lib/agent-run-store.ts` memory fallback kaldırılsın; `prisma as any` kaldırılsın.
6. Tüm `/api/admin/*` için gizli kapı doğrulaması (Bulgu 8).

---

## Çakışmalar / birleştirme önerisi

- **`/admin/agent-council` ile birleştirilmeli.** Bu sayfanın tek işlevi ana konsey sayfasına `?runId` ile geri yönlendiren bir liste; kendi detay görünümü yok. Ayrı rota bağlam değişimine (iki sayfa arasında gidip gelme) yol açıyor ve zaten navigasyondan erişilemiyor. Doğru yer ana konsey ekranındaki "Geçmiş" rayı.
- **`/admin/agent-council/agents`** (ajan profilleri) de aynı brutalist dili kullanıyor ve sidebar'da görünmüyor; konsey modülü tek bir ekranda sekmeler (Konsey · Geçmiş · Ajanlar) altında toplanmalı.
- **Ölü backend yüzeyi:** `POST /api/admin/agents/run`, `/api/admin/agents/outcomes` (UI çağıranı yok) ve `lib/agent-run-store.ts` memory deposu, yeni kalıcılık modeline göre ya yeniden bağlanmalı ya kaldırılmalı.

---

## Doğrulama (şüpheci inceleme)

### 1. "Konsey koşuları kalıcı kaydedilmiyor; AgentRun tabloları ölü, geçmiş sayfası her zaman boş" — **DOĞRULANDI** (önem: YÜKSEK, işlevsel/veri kaybı; güvenlik değil)

Çürütme denemesi ve kanıtlar:
- Konsey UI'ı yalnızca iki üretim yolu kullanıyor: `app/admin/agent-council/page.tsx:215` (`POST /api/admin/agents/conversation`) ve `:249` (`EventSource /api/admin/agents/conversation/stream`). İkisi de `prisma` veya `memoryAddRun` import etmiyor: `app/api/admin/agents/conversation/route.ts:1-6`, `app/api/admin/agents/conversation/stream/route.ts:1-5`; sadece `generateDialogueRoundLive` çağırıp sonucu döndürüyorlar (`conversation/route.ts:33-43`, `stream/route.ts:52-61`).
- `agentRun.create` repo genelinde tek yerde: `app/api/admin/agents/run/route.ts:101` (memory yedeği `:97`). Bu POST ucunu çağıran istemci kodu yok: `agents/run` için grep yalnızca `page.tsx:135` (GET `run/[id]`), yorum satırları ve `lib/data/admin-api-catalog.json` döndürüyor. `git log -G` ile `fetch('/api/admin/agents/run')` hiçbir commit'te yok; `agentRun.create` ilk kez `77a7126`'da giriyor ve `page.tsx`'in ilk sürümü (`77a7126`) de yalnızca `run/${runId}`, `council-to-actions`, `conversation`, `conversation/stream` çağırıyor.
- `council-to-actions` (`app/api/admin/agents/council-to-actions/route.ts:38-54`) yalnızca `user.findFirst` + `actionItem.create` yapıyor; koşu yazmıyor.
- Okuma tarafı: `app/api/admin/agents/runs/route.ts:20-30` Prisma client'ta model var olduğundan (`prisma/schema.prisma:2268`) DB yoluna gidiyor ve yazılmayan tabloyu okuyor → boş dizi → `history/page.tsx:66-68` "Kayıt yok.".

Yeniden üretim: Admin `/admin/agent-council`'da bir konu başlatır, 4 tur LLM tartışması tamamlanır → `/admin/agent-council/history`'ye gider → liste boş ("Kayıt yok."). Sayfa yenilenince tartışma da kaybolur.

Çekince (doğrulanmadı): Üretim Neon'da `77a7126` öncesi dönemden veya repo dışı bir istemciden kalmış `AgentRun` satırı olup olmadığı kontrol edilmedi (DB'ye dokunulmadı). Satır varsa liste "her zaman" boş değil, ama yeni koşular yine de hiç eklenmiyor — bulgunun özü değişmiyor. Ayrıca memory fallback (`lib/agent-run-store.ts`) serverless'ta instance-yerel ve geçici; çözüm olarak sayılamaz.

### 2. "Hata durumu boş durum olarak maskeleniyor + yakalanmamış promise reddi" — **DOĞRULANDI** (önem: ORTA; KRİTİK/YÜKSEK değil — veri sızıntısı/bozulması yok, yanıltıcı UX)

Çürütme denemesi ve kanıtlar:
- `app/admin/agent-council/history/page.tsx:26-34`: `try { … } finally { setLoading(false) }`, `catch` yok; `load()` dönüşü `await`/`.catch` olmadan çağrılıyor (`:34`).
- `proxy.ts:105-118`: `/api/*` istekleri auth middleware'e girmeden `NextResponse.next()` ile geçiyor; yani oturum düşünce HTML login yönlendirmesi değil, `requireAuth`'un JSON 401/403'ü döner (`lib/api-auth.ts:23-25`, `:40-42`). Bu durumda `res.json()` başarılı olur, `res.ok=false` olduğundan `setRuns` çağrılmaz ve `loading=false` sonrası "Kayıt yok." gösterilir. Aynısı `runs/route.ts:33-35`'teki 500 için de geçerli.
- Ağ kesintisi (`fetch` reject) veya gövdesi JSON olmayan bir yanıt (ör. platform 502/504 HTML'i) durumunda istisna `finally`'den sonra yukarı taşar → işlenmemiş promise reddi (konsolda `Uncaught (in promise)`, Sentry/PostHog varsa gürültü) ve yine "Kayıt yok.".

Yeniden üretim: Admin oturumu süresi dolmuşken sayfayı aç → API 401 JSON döner → ekranda hata/yeniden giriş yönlendirmesi yerine "Kayıt yok." görünür. DevTools'ta ağı "Offline" yapıp yenile → aynı boş durum + konsolda unhandled rejection.

Not: Bulgu 1 nedeniyle şu an başarılı yanıt da boş geldiğinden, iki durum pratikte ayırt edilemez; yine de kalıcılık düzeltildiğinde bu maskeleme gerçek kayıtları "yok" gibi gösterecektir. Öneri: üç ayrı durum (`loading | error(status) | ready`) modellenmeli; 401/403'te yeniden giriş/gizli kapı CTA'sı, 5xx/ağ hatasında "Yeniden dene" düğmesi; `catch` ile hatayı state'e yazıp `AbortController` ile unmount'ta iptal; tercihen sayfa genelindeki diğer admin listeleriyle ortak bir `useAdminQuery` (veya SWR/React Query) kancasına taşınmalı.
