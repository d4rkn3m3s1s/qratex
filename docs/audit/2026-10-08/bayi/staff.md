# /staff

**Amaç:** İşletmeye (bayiye) bağlı personelin (garson, kasiyer, vardiya çalışanı) kendi günlük iş ekranı: bugünkü vardiyaya giriş/çıkış (puantaj), atanmış görevler, vardiya planı, eğitim modülleri, açılış/kapanış checklist'leri ve izin talepleri. Yönetici tarafındaki karşılığı `/dealer/team`'dir.

**Genel puan: 4.2 / 10** · **Karar: yeniden tasarla** (kabuk ve API iskeleti kullanılabilir; ama veri sorguları hatalı, puantaj uçları korumasız, iki modül sahte/eksik ve yönetici tarafında içerik üretecek hiçbir arayüz yok — sayfa üretimde pratikte boş bir kabuk.)

Dosyalar: `app/staff/page.tsx`, `app/staff/layout.tsx`, `app/staff/loading.tsx`, `app/staff/error.tsx`, `app/staff/staff-dashboard-client.tsx`, `components/dashboard/staff-route-loading.tsx`, `components/ui/inline-loading-status.tsx`; API: `app/api/staff/me`, `app/api/staff/tasks`, `app/api/staff/shifts`, `app/api/staff/training/complete` (sayfadan çağrılanlar), `app/api/staff/leave`, `app/api/staff/checklists/complete` (UI'ı olmayanlar); modeller: `DealerStaff`, `StaffTask`, `StaffShift`, `StaffLeaveRequest`, `TrainingModule`, `StaffTrainingCompletion`, `ChecklistTemplate` (`prisma/schema.prisma:2432-2559`).

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 3/10 | Görev listesi 20 tamamlanmış görevden sonra açık görevleri gizliyor, bugünkü vardiya 14 kayıt sınırında kayboluyor, checklist ve eğitim sahte, izin talebi oluşturulamıyor, çıkış butonu doğrudan çıkış yapmıyor. |
| UX | 4/10 | Personelin "şimdi ne yapmalıyım?" sorusuna cevap veren bir bugün görünümü yok; hata durumu boş durumla karışıyor, geciken görev vurgusu ve geri alma yok. |
| Görsel | 5/10 | shadcn kartlarıyla temiz ama jenerik; hiyerarşi düz, vardiya kartı ile görevler arasında öncelik ayrımı yok, yükleme sırasında çift header oluşuyor. |
| Mimari | 4/10 | Tek "her şeyi getir" ucu + her aksiyondan sonra tam yeniden yükleme; durum makinesi sunucuda yok (puantaj ve görev geçişleri serbest), `isActive` hiçbir yerde uygulanmıyor, iki API öksüz. |
| Performans | 7/10 | Tek istek, `Promise.all` ile 7 paralel sorgu, `take` sınırları var; N+1 yok. Eksik: istemci önbelleği/SWR, aksiyon sonrası tam refetch. |
| Erişilebilirlik + Mobil | 6/10 | Skip link, Radix sekmeleri, `min-h-11` dokunma hedefleri, safe-area iyi; ama sekme durumu URL'de değil, dil karışık (layout/error sabit TR), ikonlar `aria-hidden` değil (lucide 0.303 varsayılan eklemiyor). |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Layout rol koruması (yalnız STAFF) | KISMİ | `app/staff/layout.tsx:31-33` | Rol kontrolü var ama `DealerStaff.isActive` hiç kontrol edilmiyor; pasifleştirilen personel panele ve tüm `/api/staff/*` uçlarına erişmeye devam ediyor (Bulgu B2). |
| 2 | Proxy rol yönlendirmesi (`/staff` → STAFF, `/` → `/staff`) | ÇALIŞIYOR | `proxy.ts:54,68,90` | |
| 3 | "İçeriğe atla" bağlantısı | ÇALIŞIYOR | `app/staff/layout.tsx:37` | |
| 4 | Header marka linki "{site} · Personel" | KISMİ | `app/staff/layout.tsx:40-42` | "Personel" sabit Türkçe; EN locale'de karışık dil. |
| 5 | Kullanıcı adı/e-posta (sm+) | ÇALIŞIYOR | `app/staff/layout.tsx:44-46` | Mobilde gizli; kimlik bilgisi mobilde hiç görünmüyor. |
| 6 | Çıkış butonu | BOZUK | `app/staff/layout.tsx:47-51` | CSRF token'sız `POST /api/auth/signout` → next-auth 4.24 `signout?csrf=true` adresine yönlendirir (`node_modules/next-auth/core/index.js:258`); `pages.signOut` tanımlı değil (`lib/auth.ts:64-68`) → markasız, İngilizce varsayılan "Are you sure?" sayfası. "Çıkış" sabit TR. |
| 7 | Web Vitals raporlama | ÇALIŞIYOR | `app/staff/layout.tsx:62` | |
| 8 | Sayfa metadata (başlık/açıklama) | ÇALIŞIYOR | `app/staff/page.tsx:5-7`, `layout.tsx:13-23` | |
| 9 | Rota yükleme iskeleti | KISMİ | `app/staff/loading.tsx:1`, `components/dashboard/staff-route-loading.tsx:14-23` | İskelet kendi header'ını da çiziyor ama layout'un `<main>`'i içinde render ediliyor → yükleme anında üst üste iki header. |
| 10 | Hata sınırı (error.tsx) + Sentry | ÇALIŞIYOR | `app/staff/error.tsx:15-18` | Metinler sabit TR; `role="alert"` + yeniden dene var. |
| 11 | İlk yükleme spinner'ı | ÇALIŞIYOR | `staff-dashboard-client.tsx:159-163` | |
| 12 | Veri yükleme hata durumu | KISMİ | `staff-dashboard-client.tsx:79-86` | Yalnız toast; `data=null` kalır ve sayfa "İşletme" + "Atanmış görev yok" boş durumlarıyla çizilir → hata, boş veri gibi görünür; tekrar dene yok. |
| 13 | Karşılama başlığı + işletme adı | KISMİ | `staff-dashboard-client.tsx:165,196-199` | Kişisel değil ("Hoş geldiniz"); `jobTitle` çekiliyor ama hiç gösterilmiyor (`me/route.ts:21`). |
| 14 | "Saha modu" bağlantısı | ÇALIŞIYOR | `staff-dashboard-client.tsx:201-206` | `/staff/field` alt sayfasına gider. |
| 15 | Bugünkü vardiya kartı | KISMİ | `staff-dashboard-client.tsx:166-167,209-253` | `today` UTC'den hesaplanıyor (TR'de 00:00-03:00 arası dünün vardiyası); vardiya listesi `date desc take 14` olduğundan ileri tarihli 14+ vardiya planlanırsa bugün listede yok → kart kaybolur (Bulgu B3). |
| 16 | Vardiya girişi (clock-in) | KISMİ | UI `:221-233`, API `shifts/route.ts:62-71` | UI tek doğru yolu gösteriyor ama API durum makinesi yok: tekrar giriş üzerine yazar, geçmiş/gelecek vardiyaya giriş yapılabilir (Bulgu B4). |
| 17 | Vardiya çıkışı (clock-out) | KISMİ | UI `:234-247`, API `shifts/route.ts:62-71` | Giriş yapılmadan çıkış, çıkış zamanının girişten önce olması, defalarca çıkış mümkün. Unutulan dünkü vardiya için çıkış yolu yok. |
| 18 | Vardiya "Tamamlandı" rozeti | ÇALIŞIYOR | `:248-250` | Toplam çalışma süresi gösterilmiyor. |
| 19 | 4 sekme (Görevler/Vardiyalar/Eğitim/Checklist) | ÇALIŞIYOR | `:255-275` | Sekme URL'de değil (yenilemede sıfırlanır, link paylaşılamaz). |
| 20 | Açık görev sayacı (sekme rozetinde) | KISMİ | `:168,260` | Yalnız sunucudan gelen 20 kayıt üzerinden sayılıyor; Bulgu B1 nedeniyle 0 gösterebilir. |
| 21 | Görev listesi | BOZUK | `me/route.ts:23-27` | `orderBy status asc` alfabetik: `completed` < `in_progress` < `pending` → tamamlananlar ÖNCE, `take: 20`. 20 tamamlanmış görevden sonra açık görevler hiç dönmez (Bulgu B1). |
| 22 | Görev durum rozeti | ÇALIŞIYOR | `:290-292,170-176` | |
| 23 | Görev son tarihi | KISMİ | `:293-297` | Yalnız tarih (saat yok); geciken görev vurgusu yok. |
| 24 | "Başla" (pending → in_progress) | KISMİ | `:302-311` | Çalışıyor ama spinner "Tamamla" butonunda dönüyor (`:317` `actioning === task.id`), "Başla"da geri bildirim yok. |
| 25 | "Tamamla" | ÇALIŞIYOR | `:312-323`, `tasks/route.ts:56-63` | Geri alma, not/fotoğraf kanıtı yok; yöneticiye bildirim yok. |
| 26 | Görev durum API'si sınırı | KISMİ | `tasks/route.ts:10-12,57-63` | Personel API ile kendi görevini `cancelled` yapabilir (iptal edilen görev personel listesinden düşer) veya `completed`'ı `pending`'e çevirip `completedAt`'i silebilir (Bulgu B5). |
| 27 | Görev boş durumu | ÇALIŞIYOR | `:278-279` | Düz metin; yönlendirme yok. |
| 28 | Vardiya listesi (son 14) | KISMİ | `:332-359`, `me/route.ts:28-32` | En uzak gelecek tarih en üstte; bugün vurgusu yok; hafta görünümü yok; `StaffShift.note` (`schema:2481`) gösterilmiyor; satırlarda giriş/çıkış aksiyonu yok. |
| 29 | Vardiya giriş/çıkış saat rozetleri | ÇALIŞIYOR | `:343-354` | |
| 30 | Vardiya boş durumu | ÇALIŞIYOR | `:333-334` | |
| 31 | Eğitim modülleri listesi | KISMİ | `:361-395`, `me/route.ts:38-43` | `TrainingModule.content` (markdown/HTML, `schema:2517`) hiç çekilmiyor/gösterilmiyor; personel eğitimi okuyamıyor. |
| 32 | Eğitim "Tamamla" | SAHTE | `:377-390`, `training/complete/route.ts:38-44` | İçerik görülmeden tek tıkla "tamamlandı" beyanı; okuma süresi/quiz/onay yok. Tamamlanma kaydı uyum (compliance) açısından anlamsız. |
| 33 | Eğitim tamamlandı rozeti | ÇALIŞIYOR | `:373-375` | Tamamlanma tarihi gösterilmiyor. |
| 34 | Checklist şablon listesi | SAHTE | `:397-411`, `messages/tr.json` `staffDashboard.checklistNote` | Yalnız başlık + tip + kullanıcıya görünen "Checklist tamamlama bu sayfadan sonra eklenebilir (şablon görüntüleme)." geliştirici notu. Maddeler (`items`) bile gösterilmiyor. |
| 35 | Checklist tamamlama | EKSİK | API var: `app/api/staff/checklists/complete/route.ts:16-58`; hiçbir UI çağırmıyor (grep: tek tüketiciler `staff-dashboard-client.tsx` ve `staff-field-client.tsx`, ikisi de çağırmıyor) | Öksüz API. |
| 36 | İzin taleplerim listesi | KISMİ | `:414-443` | Yalnız kayıt varsa görünür; boş durum/CTA yok; `me` 10 kayıtla sınırlı. |
| 37 | İzin talebi oluşturma | EKSİK | API var: `app/api/staff/leave/route.ts:40-84`; UI yok | Öksüz API; personel izin isteyemiyor. |
| 38 | Kullanılmayan importlar | ÖLÜ KOD | `staff-dashboard-client.tsx:13,16` (`Send`, `User`) | |
| 39 | PIN kodu yanıtta | KISMİ | `me/route.ts:21` | `pinCode` açık metin dönüyor; istemci kullanmıyor. Yönetici API'sinde maskeleniyor (`dealer/staff/route.ts:48`) → tutarsız. |
| 40 | Canlı güncelleme / yeni görev bildirimi | EKSİK | `:89-91` yalnız mount'ta fetch | Yönetici görev atasa da sayfa yenilenmeden görünmez; push yok. |
| 41 | Kendi geri bildirimlerim / performans | EKSİK | `Feedback.dealerStaffId` mevcut (`schema:836`, `api/feedbacks/route.ts:198,256`) | Qratex'in çekirdek verisi (personele atfedilen müşteri yorumu/puanı) personel panelinde hiç yok. |
| 42 | Dil (i18n) | KISMİ | Sayfa gövdesi `useAppT` ile çevrili; `layout.tsx:41,49`, `error.tsx:30-46`, `field/staff-field-client.tsx:56-120` sabit TR | EN kullanıcı karışık dil görür; "Checklist" TR arayüzde İngilizce terim. |
| 43 | Yönetici tarafında içerik üretme UI'ı | EKSİK (sistemik) | `app/dealer/team/page.tsx` yalnız `POST /api/dealer/staff` ve `PATCH /api/dealer/staff/[id]` çağırıyor (`:115,145`); görev/vardiya/eğitim/checklist listeleri salt okunur (`:255-400`); `POST /api/dealer/staff/{tasks,shifts,training,checklists}` ve `PATCH /api/dealer/staff/leave` hiçbir UI'dan çağrılmıyor | Görev, vardiya, eğitim, checklist hiçbir ekrandan oluşturulamıyor, izin talepleri onaylanamıyor → `/staff` panelinin dört sekmesi de üretimde boş kalır. |
| 44 | Azaltılmış hareket | ÇALIŞIYOR (önemsiz) | Yalnız `animate-spin` | Motion yok; sorun değil. |

Durum sayımı: ÇALIŞIYOR 21 · KISMİ 16 · BOZUK 2 · SAHTE 2 · EKSİK 5 (ölü kod satırı hariç; toplam 44 satır).

---

## Bulgular

### B1 — Görev listesi açık görevleri gizliyor (alfabetik durum sıralaması + limit)
- **Önem:** Kritik · **Kategori:** Hata / veri doğruluğu · **Efor:** S
- **Kanıt:** `app/api/staff/me/route.ts:23-27` (`orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 20`), `StaffTask.status` düz `String` (`prisma/schema.prisma:2457`). Aynı desen yönetici tarafında da: `app/api/dealer/staff/tasks/route.ts:33`.
- **Sorun:** Postgres metin sıralamasında `completed` < `in_progress` < `pending`. Tamamlananlar hiç arşivlenmediği için birikir; 20. tamamlanmış görevden sonra personel yeni atanan hiçbir görevi göremez, sekme sayacı `(0)` gösterir. Ürünün tam tersini yapan sessiz bir hata.
- **Öneri:** Sunucuda açık ve kapalı görevleri ayrı sorgula: `status in (pending,in_progress)` → `dueAt asc nulls last` (sınırsız veya yüksek limit), tamamlananlar ise ayrı, `completedAt desc take 10` "Son tamamlananlar" listesi. Uzun vadede `status`'u Prisma `enum TaskStatus`'a çevir ve öncelik sırasını açık bir `CASE`/sıra alanıyla ver. Aynı düzeltmeyi `dealer/staff/tasks` GET'e de uygula. Sayaç, ayrı bir `count` sorgusundan gelsin.

### B2 — Pasifleştirilen personel tam erişimini koruyor
- **Önem:** Yüksek · **Kategori:** Güvenlik / yetki · **Efor:** M
- **Kanıt:** `DealerStaff.isActive` (`schema:2438`) yalnız yöneticinin listesinde filtreleniyor (`app/api/dealer/staff/route.ts:26`). `lib/auth.ts:227,254-256` JWT'ye `dealerId`'yi `isActive`'e bakmadan yazar; `lib/api-auth.ts:158-168` `getStaffDealerId` yalnız token'a bakar; `authorize` içinde personel aktiflik kontrolü yok (`lib/auth.ts:79-200`); `app/staff/layout.tsx:31` yalnız rol kontrol eder.
- **Sorun:** İşten çıkarılan/pasifleştirilen personel, yöneticinin listesinden kaybolur ama giriş yapmaya, vardiyaya giriş-çıkış kaydetmeye, görev kapatmaya ve işletmenin checklist/eğitim şablonlarını görmeye devam eder. Yönetici, bu kişiyi artık göremediği için fark edemez.
- **Öneri:** (1) `requireStaffContext()` adında tek bir yardımcı yaz: session + `dealerStaff.findUnique({ where: { userId }, select: { dealerId, isActive } })` (Redis'te kısa TTL'li önbellek; proje zaten token-replay için Redis sıcak katman kullanıyor) → pasifse 403. Tüm `/api/staff/*` uçları bunu kullansın. (2) Layout'ta aynı kontrol + "Hesabınız işletme tarafından devre dışı bırakıldı" ekranı. (3) `isActive=false` yapıldığında ilgili kullanıcının JTI'lerini iptal et (oturumu düşür). (4) `credentials.authorize`'da STAFF için aktiflik kontrolü.

### B3 — "Bugünkü vardiya" kartı ileri tarihli planlamada ve gece yarısından sonra kayboluyor
- **Önem:** Yüksek · **Kategori:** Hata · **Efor:** S
- **Kanıt:** `me/route.ts:28-32` (`orderBy: { date: 'desc' }, take: 14`), `staff-dashboard-client.tsx:166-167` (`new Date().toISOString().slice(0, 10)`).
- **Sorun:** Yönetici iki haftadan fazla ileriyi planlarsa en uzak 14 vardiya döner, bugünkü vardiya dışarıda kalır → giriş butonu hiç çıkmaz. Ayrıca gün UTC'ye göre hesaplanıyor: Türkiye'de 00:00–03:00 arasında "bugün" dün sayılır; gece vardiyası (restoran/bar kapanışı) olan işletmelerde yanlış vardiya seçilir.
- **Öneri:** Sunucu "bugün"ü işletmenin saat dilimine göre (`Europe/Istanbul`, ileride `dealer.timezone`) hesaplayıp ayrı bir `todayShift` (ve "aktif/açık vardiya": `clockInAt != null && clockOutAt == null` olan en son kayıt) döndürsün. Liste için `date >= bugün-7 && date <= bugün+14` aralığı, `date asc`. Gece yarısını aşan vardiyalar için `startAt/endAt` tam `DateTime` alanlarına geçiş planla.

### B4 — Puantaj (clock-in/out) API'sinde durum makinesi ve zaman doğrulaması yok
- **Önem:** Yüksek · **Kategori:** Veri bütünlüğü / suistimal · **Efor:** M
- **Kanıt:** `app/api/staff/shifts/route.ts:62-71` — koşulsuz `updateMany({ where: { id, userId }, data: { clockInAt: now } | { clockOutAt: now } })`.
- **Sorun:** Personel (veya istemci hatası) geçmiş ya da gelecek herhangi bir vardiyaya giriş yapabilir, girişini defalarca yeniden yazabilir (geç gelmeyi "düzeltmek"), girişsiz çıkış atabilir. Puantaj, maaş/mesai hesabının girdisidir; denetim izi (audit log) de yok.
- **Öneri:** Koşullu atomik güncelleme: clock-in için `where: { id, userId, clockInAt: null, date: { gte: bugün-1, lte: bugün } }`, clock-out için `clockInAt: { not: null }, clockOutAt: null`; `count === 0` ise anlamlı 409 hatası. Erken giriş penceresi (ör. başlangıçtan 30 dk önce) ve geç çıkış toleransı işletme ayarı olsun. Her olay için `StaffShiftEvent` (tip, zaman, IP, opsiyonel konum) tablosu; yönetici düzeltmesi ayrı bir "manager adjustment" kaydıyla yapılsın. İsteğe bağlı: saha modundaki konum altyapısıyla geofence.

### B5 — Personel görevini API ile iptal edebilir veya tamamlanmışı geri açabilir
- **Önem:** Orta · **Kategori:** Yetki / iş kuralı · **Efor:** S
- **Kanıt:** `app/api/staff/tasks/route.ts:10-12` (`z.enum(['pending','in_progress','completed','cancelled'])`), `:56-63`.
- **Sorun:** İptal yöneticinin yetkisi olmalı; personel `cancelled` gönderirse görev kendi listesinden düşer (`me/route.ts:24`), yönetici bilgilendirilmez. `completed → pending` geçişi `completedAt`'i siler, iz kaybolur.
- **Öneri:** Personel için izinli geçişler: `pending→in_progress`, `in_progress|pending→completed`, isteğe bağlı kısa süreli (ör. 5 dk) "geri al". Geçiş tablosunu sunucuda tanımla; koşullu `updateMany` ile `status` ön koşulunu `where`'e ekle. Tamamlamada yöneticiye bildirim (mevcut push/notification altyapısı).

### B6 — Çıkış butonu doğrudan çıkış yapmıyor
- **Önem:** Orta · **Kategori:** Hata / UX · **Efor:** S
- **Kanıt:** `app/staff/layout.tsx:47-51`; next-auth 4.24.15 CSRF doğrulamasız signout'u `signout?csrf=true`'ya yönlendirir (`node_modules/next-auth/core/index.js:246-258`); özel `signOut` sayfası yok (`lib/auth.ts:64-68`). Projede bu desen başka hiçbir yerde yok; diğer paneller `signOut()` istemci fonksiyonunu kullanıyor (`components/dashboard/header.tsx`, `sidebar.tsx`).
- **Sorun:** Paylaşımlı tablet/kasada personel "Çıkış"a basar, markasız İngilizce next-auth onay sayfasına düşer; ikinci tıklamayı yapmazsa oturum açık kalır — ortak cihazda bir sonraki personel önceki kişinin adına puantaj kaydedebilir.
- **Öneri:** Küçük bir istemci bileşeni (`StaffSignOutButton`) ile `signOut({ callbackUrl: '/auth/login' })`; ortak cihaz senaryosu için X dk hareketsizlikte otomatik çıkış seçeneği.

### B7 — Eğitim ve Checklist sekmeleri sahte
- **Önem:** Yüksek (ürün) · **Kategori:** Sahte özellik · **Efor:** M
- **Kanıt:** Eğitim: `me/route.ts:41` `content` seçilmiyor; `staff-dashboard-client.tsx:377-390` tek tık tamamla. Checklist: `:401-408` yalnız başlık + `staffDashboard.checklistNote` ("…sonra eklenebilir…") kullanıcıya görünür; `POST /api/staff/checklists/complete` hiçbir UI'dan çağrılmıyor.
- **Sorun:** Kullanıcıya iş yapıyormuş gibi görünen ama değer üretmeyen iki modül. Eğitim tamamlanma verisi güvenilmez; checklist modülü personel için tamamen işlevsiz ve iç geliştirici notu üretimde görünüyor.
- **Öneri:** Eğitim: `/staff/training/[id]` okuma görünümü (sanitize edilmiş markdown, `content` ayrı uçtan), sonunda "Okudum ve anladım" onayı; isteğe bağlı 3 soruluk mini quiz; tamamlanma tarihi. Checklist: şablon `items`'ını işaretlenebilir liste olarak açan bir sheet/sayfa, zorunlu maddeler tamamlanmadan gönderilemesin, bugünkü vardiyaya (`shiftId`) otomatik bağlansın, bugün tamamlanmışsa "Bugün 08:12'de tamamlandı" durumu. Açılış checklist'i clock-in sonrası, kapanış checklist'i clock-out öncesi otomatik önerilsin.

### B8 — İzin talebi oluşturulamıyor; yönetici onaylayamıyor
- **Önem:** Yüksek (ürün) · **Kategori:** Eksik akış · **Efor:** M
- **Kanıt:** `app/api/staff/leave/route.ts:40-84` POST mevcut, çağıran UI yok; liste yalnız kayıt varsa görünüyor (`staff-dashboard-client.tsx:414`). Yönetici tarafında `PATCH /api/dealer/staff/leave` var ama `app/dealer/team/page.tsx:310-335` salt okunur.
- **Sorun:** Akışın iki ucu da arayüzsüz; "İzin taleplerim" kartı hiçbir zaman dolmayacak.
- **Öneri:** Personel: "İzin iste" birincil aksiyonu (tarih aralığı seçici + tür: yıllık/hastalık/mazeret + not), çakışan vardiyaları uyarı olarak göster, bekleyen talebi iptal edebilme. Yönetici: `/dealer/team` İzin sekmesine onay/ret + not. Karar sonrası personele bildirim. API'de: tarih sınırı (geçmiş/çok uzak gelecek), çakışan talep kontrolü, max aralık.

### B9 — Yönetici tarafında görev/vardiya/eğitim/checklist oluşturma arayüzü yok (sistemik)
- **Önem:** Yüksek (ürün) · **Kategori:** Mimari / eksik akış · **Efor:** L
- **Kanıt:** `app/dealer/team/page.tsx:90-94` yalnız GET; yazma çağrıları sadece `:115` (personel ekle) ve `:145` (personel düzenle). `POST /api/dealer/staff/tasks|shifts|training|checklists` için grep'te tek tüketici yok.
- **Sorun:** `/staff` sayfasının bütün içeriği yöneticinin üreteceği veriye bağlı; o veri hiçbir ekrandan üretilemiyor. Sayfa üretimde boş bir kabuk.
- **Öneri:** `/dealer/team`'e haftalık vardiya planlayıcı (sürükle-bırak ızgara, şablon vardiya, kopyala-yapıştır hafta), görev atama formu (tekrarlayan görev desteği; ekip modülündeki otomatik görev altyapısı yeniden kullanılabilir), eğitim editörü (markdown), checklist şablon editörü. Bu yapılmadan personel tarafına yatırım yapmanın anlamı yok — iki taraf birlikte ele alınmalı.

### B10 — Hata durumu boş durum gibi görünüyor; yenileme ve canlılık yok
- **Önem:** Orta · **Kategori:** UX / hata yönetimi · **Efor:** S
- **Kanıt:** `staff-dashboard-client.tsx:65-91,159-165,278-279`.
- **Sorun:** `/api/staff/me` 500/503 dönerse yalnız kısa bir toast çıkar, ardından "İşletme · Personel paneli" ve "Atanmış görev yok" gösterilir — personel görevi olmadığını sanar. Sayfa mount dışında hiç yenilenmez; tablet açık bırakılan kasada yeni görev görünmez.
- **Öneri:** `useSWR` (veya React Query) ile `error` durumunda kalıcı bir hata kartı + "Tekrar dene"; `revalidateOnFocus`, 60 sn `refreshInterval`; aksiyonlarda iyimser güncelleme (optimistic) + hata halinde geri alma; tüm listeyi yeniden çekmek yerine dönen `task`/`shift` nesnesini yerinde güncelle (API zaten döndürüyor: `tasks/route.ts:68-69`, `shifts/route.ts:76-77`).

### B11 — Yükleme iskeleti çift header üretiyor
- **Önem:** Düşük · **Kategori:** Görsel · **Efor:** S
- **Kanıt:** `app/staff/loading.tsx:1` → `components/dashboard/staff-route-loading.tsx:14-23` kendi `<header>`'ını çiziyor; `app/staff/layout.tsx:38-54` header'ı zaten render ediyor, loading sınırı layout'un `<main>`'i içine düşer.
- **Öneri:** İskelette yalnız içerik bölgesini (karşılama kartı + vardiya kartı + 3 liste satırı) çiz; gerçek yerleşimle birebir eşleşsin (CLS'siz geçiş).

### B12 — Dil karışıklığı ve ölü kod
- **Önem:** Düşük · **Kategori:** i18n / kod kalitesi · **Efor:** S
- **Kanıt:** Sabit TR: `layout.tsx:41` ("Personel"), `:49` ("Çıkış"), `error.tsx:30,46` vb., `field/staff-field-client.tsx:56-120`; TR arayüzde "Checklist" terimi (`messages/tr.json` `staffDashboard.checklist`). Kullanılmayan importlar `staff-dashboard-client.tsx:13,16`. `jobTitle` ve `pinCode` çekilip kullanılmıyor (`me/route.ts:21`).
- **Öneri:** Layout'u `getServerLocale` + `t()` ile çevir (zaten `generateMetadata`'da kullanılıyor); TR'de "Kontrol listesi"; `pinCode`'u select'ten çıkar (gerekirse maskele, ayrıca PIN'i düz metin yerine hash'le); `jobTitle`'ı karşılama alanında göster.

### B13 — Erişilebilirlik ayrıntıları
- **Önem:** Düşük · **Kategori:** a11y · **Efor:** S
- **Kanıt:** `lucide-react ^0.303.0` (`package.json:76`) ikonlara varsayılan `aria-hidden` eklemiyor; sekme ve buton ikonlarında (`staff-dashboard-client.tsx:213,258-273,230,244,320`) `aria-hidden` yok. Aksiyon sırasında spinner yalnız görsel; buton `aria-busy` almıyor. Sekme seçimi URL'de değil.
- **Öneri:** Dekoratif ikonlara `aria-hidden`; aksiyon butonlarına `aria-busy`; başarı/başarısızlık için `aria-live` bölgesi (toast'a ek); sekmeyi `?tab=` ile senkronize et.

---

## Eksik özellikler (kıyas: Toast, Square Team/Shifts, 7shifts, Homebase, Deputy, Medallia/Qualtrics çalışan katmanı)

1. **"Bugün" odaklı ana ekran:** Square/Toast personel uygulamalarında ilk ekran "şu an vardiyadasın / 2 saat 14 dk", sıradaki görev, geciken görev sayısı ve bugünkü checklist'tir. Burada sekmelere bölünmüş eşit ağırlıklı listeler var.
2. **Müşteri geri bildirimi ve kişisel performans:** Qratex'in farkı geri bildirim; `Feedback.dealerStaffId` var ama personel kendisine gelen puanları, övgüleri ve iyileştirme önerilerini (AI özetli) göremiyor. Medallia/Qualtrics'in "frontline employee" görünümü ve Toast'un sunucu performans raporlarının karşılığı yok.
3. **Gerçek puantaj:** mola başlat/bitir, toplam saat/haftalık mesai, unutulan çıkış için düzeltme talebi, konum/geofence veya PIN/QR ile giriş (ortak cihaz), Homebase/7shifts standardı.
4. **Vardiya değişimi ve müsaitlik:** vardiya takası/devretme talebi, müsaitlik bildirimi, takvim (ICS) aboneliği.
5. **Bildirimler:** yeni görev, vardiya değişikliği, izin kararı için push (proje push merkezi zaten var) ve uygulama içi rozet.
6. **Ekip iletişimi:** vardiya notları/duyurular (yönetici → ekip), görev yorumları ve fotoğraf kanıtı (temizlik, kasa sayımı).

---

## Yeniden tasarım vizyonu

**Hedef deneyim:** Personel kasadaki tablette ya da kendi telefonunda paneli açtığında 3 saniye içinde şu soruların cevabını görmeli: "Vardiyadayım mı, ne zamana kadar?", "Şu an ne yapmam gerekiyor?", "Müşteriler beni nasıl değerlendiriyor?". Her şey tek elle, büyük dokunma hedefleriyle.

**Yerleşim (mobil öncelikli, tek sütun; masaüstünde 2 sütun):**
1. **Vardiya şeridi (sabit üst kart):** Durum makinesine göre tek büyük birincil buton — "Vardiyaya başla" → "Molaya çık / Vardiyayı bitir". Geçen süre canlı sayaç, planlanan bitiş, varsa vardiya notu. Vardiya yoksa "Bugün vardiyan yok · Sıradaki: Cuma 09:00".
2. **Bugün yapılacaklar:** Açılış checklist'i (clock-in sonrası otomatik en üstte), açık görevler (gecikenler kırmızı kenarlı, son tarih saatiyle), kapanış checklist'i (bitişe 30 dk kala). Görev satırında kaydır-tamamla (mobil) + "Geri al" toast'u.
3. **Geri bildirimlerim:** Son 7 gün ortalama puan, son 3 yorum (kişisel veriler maskelenmiş), haftanın övgüsü; AI'dan tek cümlelik koçluk önerisi.
4. **Takvim / İzin / Eğitim:** Alt gezinme çubuğuyla (Bugün · Takvim · Eğitim · Ben) ayrı görünümler; sekme durumu URL'de. Takvimde haftalık şerit, izin isteme birincil aksiyon; eğitimde ilerleme çubuğu ve okuma görünümü.

**Motion / 3D:** 3D gereksiz ve bu bağlamda (iş aracı, düşük güçlü tabletler) yanlış olur. Ölçülü framer-motion (`m as Motion`, global LazyMotion): görev tamamlandığında satırın kısa çöküş + onay işareti çizimi (≤250 ms), vardiya butonunun durum geçişinde renk/etiket crossfade'i, canlı sayaçta tabular rakamlar. `prefers-reduced-motion`'da tümü anlık geçişe düşsün. Konfeti/rozet gibi oyunlaştırma ancak eğitim modülü bitiminde ve tek sefer.

**Veri / API değişiklikleri:**
- `GET /api/staff/today` → `{ profile, activeShift, todayShift, nextShift, openTasks (sınırsız/öncelikli), checklistsDue, feedbackSummary }`; işletme saat dilimine göre hesap. Takvim ve geçmiş için ayrı sayfalı uçlar (`/api/staff/shifts?from&to`, `/api/staff/tasks?status=done&cursor`).
- `requireStaffContext()` ortak yardımcı (isActive + dealerId doğrulaması, Redis kısa TTL).
- Puantaj: `POST /api/staff/shifts/{id}/events` (`clock_in|break_start|break_end|clock_out`) koşullu atomik geçişler + `StaffShiftEvent` tablosu + yönetici düzeltme kaydı.
- Görevler: sunucu taraflı geçiş tablosu; `StaffTask.status` → Prisma enum; tamamlamada not/fotoğraf (R2 altyapısı mevcut) ve yöneticiye bildirim.
- Eğitim: `GET /api/staff/training/{id}` içerik (sanitize), tamamlamada `readAt`/quiz skoru.
- İstemci: `useSWR` + iyimser güncelleme; `PRIVATE_NO_STORE_HEADERS` korunur.
- Yönetici tarafı (önkoşul): `/dealer/team`'e vardiya planlayıcı, görev atama, eğitim/checklist editörü, izin onayı.

---

## Çakışmalar / birleştirme önerisi

- **`/staff` ↔ `/dealer/team`:** Aynı veri modelinin iki yüzü; çakışma değil, eşleşme. Ancak yönetici yüzü salt okunur olduğu için çift şu an işlevsiz. İkisi tek bir "Personel operasyonları" iş paketi olarak birlikte yeniden tasarlanmalı; görev durum etiketleri, izin rozetleri gibi bileşenler `components/staff/` altında paylaşılmalı (şu an iki dosyada ayrı ayrı kopyalanmış: `staff-dashboard-client.tsx:170-183` ve `app/dealer/team/page.tsx:325-327`).
- **`/staff` ↔ `/staff/field`:** Saha modu ayrı bir sayfa ama içeriği tek bir "hızlı not" kartı; ham JSON gösteriyor (`field/staff-field-client.tsx:125-127`). Ayrı rota yerine yeni "Bugün" ekranına "Durum bildir" hızlı aksiyonu (sheet) olarak birleştirilmeli.
- **`/staff` görevleri ↔ İç Ekip Yönetim Modülü (`/admin/ekip`, `/customer/ekip`, `components/team/`):** İki ayrı görev sistemi var. Ekip modülünün kanban, onay akışı, otomatik görev ve şablon galerisi yetenekleri işletme personeli görevleri için de istenen şeyler. Uzun vadede `StaffTask`'ı ekip modülünün görev çekirdeğine bağlamak (işletme kapsamlı bir "workspace" olarak) yeniden icat etmekten daha ucuz; kısa vadede en azından durum/öncelik sözlüğü ve UI bileşenleri ortaklaştırılmalı.
- **Kaldırma önerisi yok:** Sayfa, personel rolünün tek giriş noktası (`proxy.ts:68,90`); kaldırılamaz, yeniden tasarlanmalı.

---

## Doğrulama (şüpheci inceleme)

> Salt okunur kod incelemesi; veritabanına, build'e, teste dokunulmadı. Önemli bağlam bulgusu: yönetici panelinde (`app/dealer/team/page.tsx:80-94,114,144`) **görev veya vardiya OLUŞTURAN hiçbir UI yok**; `StaffTask`/`StaffShift` satırları yalnızca `POST /api/dealer/staff/tasks` (`app/api/dealer/staff/tasks/route.ts:60`) ve `POST /api/dealer/staff/shifts` (`app/api/dealer/staff/shifts/route.ts:61`) doğrudan çağrılarak üretilebiliyor. Ayrıca `clockInAt/clockOutAt` alanlarını personelin kendisi dışında okuyan hiçbir tüketici yok (`grep clockInAt` → yalnız `app/staff/staff-dashboard-client.tsx`). Bu yüzden 1, 3 ve 4 numaralı bulgular kod olarak gerçek ama **bugün UI üzerinden tetiklenmiyor (gizli/latent)**; yönetici planlayıcısı eklendiği gün (raporun kendi önkoşulu) aktif hataya dönüşür.

### 1. Açık görevler 20 tamamlanmış görevden sonra görünmüyor — **DOĞRULANDI (latent, önem: Orta→Yüksek, planlayıcı gelince)**
- Kanıt: `app/api/staff/me/route.ts:23-27` `status: { not: 'cancelled' }`, `orderBy: [{status:'asc'},{dueAt:'asc'}]`, `take: 20`; `prisma/schema.prisma:2457` `status String`. `completed` < `in_progress` < `pending` her Postgres collation'ında (ilk harf c<i<p) geçerli. Tamamlanan görevler için arşiv/temizlik yok (`staffTask` başka hiçbir yerde silinmiyor).
- Yeniden üretim: Bayi aynı personele 21 görev atar (API ile), personel 20'sini tamamlar, bayi 22. görevi atar → `/api/staff/me` 20 `completed` döndürür; yeni `pending` görevler listede yok, sekme sayacı (`staff-dashboard-client.tsx:168`) 0 gösterir.
- Not: Sıralama hatası `GET /api/staff/tasks` (`take: 200`) için de aynı; orada eşik 200. Düzeltme: açık görevleri (`pending|in_progress`) ayrı ve limitsiz/öncelik sıralı sorgula, tamamlananları ayrı sayfalı uçtan getir; `status`'u Prisma enum'a çevirip sıralamayı açık `CASE`/öncelik alanıyla yap.

### 2. Pasif personel giriş yapıp tüm /api/staff uçlarını kullanabiliyor — **DOĞRULANDI (Yüksek)**
- Kanıt: Pasifleştirme UI'dan gerçekten yapılabiliyor (`app/dealer/team/page.tsx:483-489` → `PATCH /api/dealer/staff/[id]`, `app/api/dealer/staff/[id]/route.ts:25`). Ancak `lib/auth.ts:136-207` `authorize` `DealerStaff.isActive`'e bakmıyor; `lib/auth.ts:227,254-256` `dealerId`'yi koşulsuz token'a yazıyor; `lib/api-auth.ts:52-80` `requireAuth` ve `lib/api-auth.ts:158-168` `getStaffDealerId` yalnız rol ve token alanına bakıyor; `app/staff/layout.tsx:31` yalnız rol kontrolü; `proxy.ts:54` yalnız rol. `app/api/staff/**` içinde `isActive` geçen satırlar yalnızca modül/şablon aktifliği (`me/route.ts:39,50`, `training/complete/route.ts:30`, `checklists/complete/route.ts:34`), personel aktifliği değil.
- Yeniden üretim: Bayi personeli "Pasif" yapar → personel `/api/dealer/staff` listesinden kaybolur (`app/api/dealer/staff/route.ts:26` `isActive: true` filtresi; bu yüzden `page.tsx:227`'deki "Pasif" rozeti de hiç görünmez) → eski personel aynı e-posta/şifreyle giriş yapar, `/staff` açılır, checklist tamamlar, izin talebi açar (`leave/route.ts:42-45`), saha pingi yazar (`field-ping/route.ts:49-60`), görev durumunu değiştirir, işletmenin checklist/eğitim içeriğini okur. Mevcut açık oturumlar da JWT ömrü boyunca çalışmaya devam eder.
- Düzeltme: `requireStaffContext()` ortak yardımcısı — her `/api/staff` isteğinde `DealerStaff { userId, isActive:true }` doğrulaması (Upstash Redis kısa TTL, pasifleştirmede anahtar silinir); `authorize`'da STAFF için `isActive=false` ise girişi reddet; layout'ta da aynı kontrol.

### 3. Clock-in/out API koşulsuz — **DOĞRULANDI, ancak etki iddiası abartılı (önem: Orta, latent)**
- Kanıt: `app/api/staff/shifts/route.ts:62-71` `updateMany({ where: { id, userId }, data: { clockInAt|clockOutAt: now } })`: mevcut değer, vardiya tarihi, sıralama (çıkış girişten sonra mı) hiç kontrol edilmiyor. İstemci butonları gizliyor (`staff-dashboard-client.tsx:221,234`) ama API korumasız. Ayrıca `getStaffDealerId`/isActive kontrolü de yok (bkz. #2).
- Yeniden üretim: Personel 18:00'de çıkış yapar, 23:00'te DevTools'tan `PATCH /api/staff/shifts {shiftId, action:'clock_out'}` gönderir → `clockOutAt` 23:00 olur (5 saat şişirme); girişsiz `clock_out` veya geçen haftaki vardiyaya `clock_in` da kabul edilir.
- Abartı: "Maaş/mesai girdisi" ve "yönetici fark edemez" kısmı bugün geçersiz — bu alanları okuyan bordro, rapor veya yönetici görünümü YOK (yalnız personelin kendi ekranı). Ayrıca vardiya oluşturan UI yok. Yine de puantaj verisi bütünlüğü bozuk tasarlanmış: koşullu atomik geçiş (`where: { clockInAt: null }` / `clockInAt: { not: null }, clockOutAt: null`), vardiya tarih penceresi kontrolü ve `StaffShiftEvent` denetim tablosu planlayıcıdan ÖNCE eklenmeli.

### 4. Bugünkü vardiya 14 kayıtlık desc listede kayboluyor + gün UTC — **DOĞRULANDI (latent, Orta)**
- Kanıt: `app/api/staff/me/route.ts:28-32` `orderBy: { date: 'desc' }, take: 14`; `staff-dashboard-client.tsx:166-167` `new Date().toISOString().slice(0,10)` (UTC günü) ile `s.date.slice(0,10)` karşılaştırması. Vardiya tarihi `new Date('YYYY-MM-DD')` → UTC gece yarısı olarak kaydediliyor (`app/api/dealer/staff/shifts/route.ts:65`).
- Yeniden üretim (a): Bayi bugünden itibaren 15+ günlük vardiya planlar → en yeni 14 kayıt gelecekteki günler; bugünkü vardiya dönmez, "Bugünkü vardiya" kartı ve giriş butonu hiç görünmez. (b): TR'de (UTC+3) 00:00-02:59 arasında `today` bir önceki gündür; 00:00-03:00 arası başlayan (gece) vardiya bulunamaz, onun yerine dünkü vardiya gösterilir.
- Düzeltme: Sunucuda işletme saat dilimine (`Europe/Istanbul` veya bayi ayarı) göre `todayShift`/`activeShift` hesaplayan ayrı alan; liste için `date >= bugün-7` aralıklı sorgu; gece yarısını aşan vardiyalar için "aktif vardiya" mantığı (clockIn var, clockOut yok).

### 5. Çıkış butonu oturumu kapatmıyor — **DOĞRULANDI (Yüksek, ortak cihaz senaryosunda)**
- Kanıt: `app/staff/layout.tsx:47-51` CSRF token'sız düz `<form action="/api/auth/signout" method="POST">`. next-auth 4.24.15 `node_modules/next-auth/core/index.js:246-258`: `csrfTokenVerified` false ise `routes.signout` çağrılmaz, `.../signout?csrf=true`'ya yönlendirilir; `lib/auth.ts:64-68` `pages.signOut` tanımlı olmadığı için next-auth'un İngilizce varsayılan "Are you sure you want to sign out?" sayfası açılır. Kullanıcı ikinci kez onaylamadıkça cookie silinmez. Bu formun kod tabanındaki tek kullanımı burası.
- Yeniden üretim: Kasadaki ortak tablette personel "Çıkış"a basar, tanımadığı İngilizce sayfayı görüp bırakır → oturum açık; sonraki kişi geri tuşu/`/staff` ile önceki personel adına görev kapatır, giriş/çıkış ve izin kaydı yapar.
- Düzeltme: İstemci bileşeninde `signOut({ callbackUrl: '/auth/login' })` (next-auth/react) kullanan çıkış butonu; diğer panellerdeki çıkış bileşeniyle ortaklaştırılmalı. Ortak cihaz için ek olarak kısa oturum ömrü / PIN ile hızlı kullanıcı değiştirme (şemada `DealerStaff.pinCode` zaten var) düşünülmeli.

---

## Uygulama (Dalga 2)

**Sonuç:** `/staff` tek ekran **"Bugün"** olarak yeniden yazıldı. Sunucu bileşeni (`app/staff/page.tsx`) `getStaffToday` (`lib/staff-ops/server.ts`) ile vardiya, açık görevler, bugünün kontrol listeleri, atanan vaka/aksiyonlar, eğitim, izin, saha bildirimlerim ve müşteri geri bildirimimi tek seferde yükler; istemci adası (`components/staff/b-ekip/staff-today.tsx`) `/api/staff/today`'i 60 sn'de bir ve sekmeye dönünce yeniler. Yerleşim: üstte karşılama + **Saha bildirimi** düğmesi; sol sütunda vardiya kartı (durum makinesi + canlı sayaç) → kontrol listeleri → görevler → bana atananlar; sağda geri bildirimim → takvim → bildirimlerim; altta izin ve eğitim. Ops kaydı; hareket: vardiya durumu geçişi (crossfade, 200 ms), görev tamamlanınca satırın çökmesi; azaltılmış harekette anlık. Testler: `__tests__/staff-ops/core.test.ts` (16), `__tests__/staff-ops/routes.test.ts` (10).

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Layout rol koruması | ÇALIŞIYOR | Rol + `getActiveStaffDealerId` (DB kaynak-doğruluk); pasif personel "Hesabın pasif" ekranını görür, menü gizlenir. |
| 2 | Proxy rol yönlendirmesi | ÇALIŞIYOR | Değişmedi. |
| 3 | İçeriğe atla | ÇALIŞIYOR | Değişmedi. |
| 4 | Header marka linki | ÇALIŞIYOR | "Personel / Staff" dile göre. |
| 5 | Kullanıcı adı (sm+) | ÇALIŞIYOR | Mobilde ad "Merhaba, …" başlığında görünür. |
| 6 | Çıkış butonu | ÇALIŞIYOR | `signOut()` istemci bileşeni (`sign-out-button.tsx`), tek tık, TR/EN. |
| 7 | Web Vitals | ÇALIŞIYOR | Değişmedi. |
| 8 | Metadata | ÇALIŞIYOR | "Bugün" TR/EN. |
| 9 | Rota yükleme iskeleti | ÇALIŞIYOR | Yalnız içerik bölgesi (`SkeletonDetail`) → çift header yok. |
| 10 | Hata sınırı | ÇALIŞIYOR | Değişmedi (Sentry). |
| 11 | İlk yükleme | ÇALIŞIYOR | Sunucu ön yükleme; istemcide `QueryState`. |
| 12 | Veri yükleme hata durumu | ÇALIŞIYOR | Kalıcı hata kartı + "Tekrar dene"; hata boş veri gibi görünmez. |
| 13 | Karşılama + işletme | ÇALIŞIYOR | Kişisel selam, unvan · işletme, İstanbul tarihi. |
| 14 | "Saha modu" bağlantısı | KALDIRILDI | Yerine aynı ekranda "Saha bildirimi" alt sayfası; `/staff/field` → `/staff?bildir=1` kalıcı yönlendirme. |
| 15 | Bugünkü vardiya kartı | ÇALIŞIYOR | Sunucu İstanbul gününe göre `activeShift` / `todayShift` / `nextShift` hesaplar; 14 kayıt sınırı yok; gece vardiyası "aktif vardiya" olarak sürer. |
| 16 | Vardiya girişi | ÇALIŞIYOR | Sunucu durum makinesi (`decideClock`): başlangıçtan en erken 60 dk önce, bitişten sonra yok, tekrar giriş yok; koşullu atomik `updateMany` + denetim kaydı (IP/UA). İstemci nedeni gösterir ("Girişe 12 dk kaldı"). |
| 17 | Vardiya çıkışı | ÇALIŞIYOR | Girişsiz/ikinci çıkış reddedilir; bitişten 12 sa sonrası yöneticinin düzeltmesine kalır; onay diyaloğu. |
| 18 | "Tamamlandı" durumu | ÇALIŞIYOR | Giriş–çıkış saatleri + çalışılan süre. |
| 19 | 4 sekme | KALDIRILDI | Tek ekran "Bugün" (vizyon); bölümler çapa ile (`#takvim`, `#izin`, `#egitim`, `#bildirimlerim`) bildirimlerden derin bağlanır. |
| 20 | Açık görev sayacı | ÇALIŞIYOR | Açık görevler ayrı sorgu (≤ 200), tamamlananlar sayılmaz. |
| 21 | Görev listesi | ÇALIŞIYOR | Yalnız açık görevler, öncelik sırası (devam eden → bekleyen → son tarih). |
| 22 | Görev durum rozeti | ÇALIŞIYOR | Ortak `TaskStatusBadge`. |
| 23 | Görev son tarihi | ÇALIŞIYOR | Tarih + saat, gecikene kırmızı kenar + ikon. |
| 24 | "Başla" | ÇALIŞIYOR | Kendi düğmesinde spinner, `aria-busy`. |
| 25 | "Tamamla" | ÇALIŞIYOR | 8 sn'lik "Geri al" (sunucuda 10 dk penceresi); işletme sahibine bildirim. |
| 26 | Görev durum API sınırı | ÇALIŞIYOR | Personel iptal gönderemez; geçiş tablosu sunucuda, koşullu güncelleme (409). |
| 27 | Görev boş durumu | ÇALIŞIYOR | Açıklamalı boş durum. |
| 28 | Vardiya listesi | ÇALIŞIYOR | "Takvimim": bugün + 13 gün, artan sıra, bugün vurgusu, not, katılım durumu. |
| 29 | Giriş/çıkış saat rozetleri | ÇALIŞIYOR | Vardiya kartında. |
| 30 | Vardiya boş durumu | ÇALIŞIYOR | "Önümüzdeki iki haftada planlı vardiyan yok." |
| 31 | Eğitim modülleri listesi | ÇALIŞIYOR | Tamamlanma tarihi, ilerleme "x/y". |
| 32 | Eğitim "Tamamla" | ÇALIŞIYOR | Okuma görünümü (`GET /api/staff/training/[id]`, düz metin → XSS yok) + "Okudum ve anladım" onayı; sunucu `acknowledged: true` olmadan yazmaz. |
| 33 | Eğitim tamamlandı rozeti | ÇALIŞIYOR | Tarihli. |
| 34 | Checklist şablon listesi | ÇALIŞIYOR | Maddeler, tür, bugün tamamlandı mı; vardiyadayken açılış önce. Geliştirici notu kaldırıldı. |
| 35 | Checklist tamamlama | ÇALIŞIYOR | İşaretlenebilir liste; zorunlu maddeler eksikse gönderilemez (sunucu da 400 + eksikler); aktif vardiyaya bağlanır; aynı gün ikinci gönderim 409. |
| 36 | İzin taleplerim listesi | ÇALIŞIYOR | Her zaman görünür, boş durumlu, gün sayısı, durum. |
| 37 | İzin talebi oluşturma | ÇALIŞIYOR | Tarih aralığı + açıklama; sunucu: geçmiş yok, ≤ 30 gün, ≤ 1 yıl ileri, çakışan talep yok; vardiya çakışma uyarısı; bekleyen talebi geri çekme; işletme sahibine bildirim. |
| 38 | Kullanılmayan importlar | KALDIRILDI | Eski istemci dosyası silindi. |
| 39 | PIN kodu yanıtta | KALDIRILDI | `/api/staff/me` emekli (410); yeni BFF PIN döndürmez. |
| 40 | Canlı güncelleme | ÇALIŞIYOR | 60 sn yenileme + odakta yenileme; görev/izin/vardiya için uygulama içi bildirim (`ctaPath: /staff`). |
| 41 | Kendi geri bildirimlerim | ÇALIŞIYOR | Son 30 gün ortalama + adet, önceki 30 güne göre fark, son 3 yorum (müşteri adı yok, uygunsuzlar hariç). |
| 42 | Dil (i18n) | ÇALIŞIYOR | `components/staff/b-ekip/copy.ts` TR/EN; layout "Personel/Çıkış" dile göre; "Checklist" yerine "Kontrol listesi". |
| 43 | Yönetici tarafında içerik üretme | ÇALIŞIYOR | `/dealer/team` görev, vardiya, eğitim, kontrol listesi üretir; izinleri onaylar (bkz. dealer_team.md Dalga 2). |
| 44 | Azaltılmış hareket | ÇALIŞIYOR | Tüm hareket `useMotionPolicy` üzerinden. |

### Kapanan bulgular (13/13)
B1 (açık görevler ayrı sorgu, `compareTasks`) · B2 (pasif: `requireAuth` STAFF_INACTIVE, kiracı çözümü DB'den, layout pasif ekranı, pasifleştirmede `sessionVersion` artışı) · B3 (İstanbul günü sunucuda, aktif/bugün/sıradaki vardiya) · B4 (puantaj durum makinesi + pencere + koşullu güncelleme + denetim kaydı; yönetici düzeltmesi ayrı denetim eylemi) · B5 (personel iptal edemez, geri alma 10 dk) · B6 (çıkış `signOut()`) · B7 (eğitim okuma + onay, checklist doldurma) · B8 (izin iste + geri çek; bayi onay kuyruğu) · B9 (bayi üretim arayüzleri) · B10 (görünür hata, 60 sn yenileme, aksiyon sonrası hedefli yenileme) · B11 (iskelet yalnız içerik) · B12 (TR/EN, ölü kod ve PIN kaldırıldı, unvan gösteriliyor) · B13 (ikonlar `aria-hidden`, `aria-busy`, `aria-live`, ≥ 44 px).

Eksik özelliklerden uygulananlar: 1 ("Bugün" ana ekranı), 2 (müşteri geri bildirimim), 5 (bildirimler), 6'nın kısmı (saha bildirimi → yönetici). Ayrıca kendisine atanan vaka/aksiyonlar personelde görünür (önceden hiç görünmüyordu).

### Kalanlar
- **Mola başlat/bitir, `StaffShiftEvent` olay tablosu, unutulan çıkış için düzeltme talebi**: şema gerektirir → ŞEMA İSTEĞİ: `StaffShiftEvent { id, shiftId, userId, type(clock_in/break_start/break_end/clock_out/manager_adjust), at, ip?, actorId }`. Şimdilik her olay `AuditLog`'a yazılıyor ve yönetici düzeltmesi `/dealer/team`'de.
- **Vardiya takası / müsaitlik / ICS**: yapılmadı.
- **Geofence / QR ile giriş**: yapılmadı (konum yalnız saha bildiriminde, isteğe bağlı).
- **Görev fotoğraf kanıtı**: yapılmadı.
- **AI koçluk cümlesi**: GET'te LLM yasak ilkesi gereği eklenmedi.
- **Atanan vaka/aksiyonlarda personel eylemi**: salt okunur (vaka kuyruğu başka yüzeyin; tek görev modeli ayrı iş).
