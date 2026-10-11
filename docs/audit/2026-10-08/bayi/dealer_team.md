# /dealer/team

**Amaç** · İşletme sahibinin kendi ön saha ekibini (garson, kasiyer vb.) yönetmesi: personel hesabı açma, pozisyon/PIN/aktiflik düzenleme ve personele ait görev, vardiya, izin, eğitim modülü ve checklist şablonlarını görme. Personel tarafı `/staff` panelinde (`app/staff/staff-dashboard-client.tsx`) bu verileri tüketir.

**Genel puan: 3/10** · **Karar: yeniden inşa**

Kısaca: altı sekmeden yalnızca "Personel" sekmesi gerçekten bir şey yapıyor. Diğer beş sekme salt okunur listeler ve ekranda kullanıcıya "API üzerinden ekleyin" ya da "sonraki güncellemede gelecek" deniyor. Personel ekleme uç noktası da **herhangi bir mevcut kullanıcının hesabını ele geçirmeye** izin veriyor. "Pasif" anahtarı ise erişimi kesmiyor. Sayfanın arkasındaki veri modeli (6 model, 7 uç nokta, personel tarafında mesai giriş/çıkış ve izin talebi) sağlam bir temel. Asıl eksik, yönetim arayüzünün hiç yazılmamış olması.

---

## Puan kartı

| Boyut | Puan | Gerekçe |
|---|---|---|
| İşlevsellik | 2/10 | 7 uç noktadan 5'inin yazma (POST/PATCH) tarafının arayüzü yok. Pasifleştirme, PIN düzenleme ve vardiya listesi bozuk. |
| UX | 3/10 | Kullanıcıya "API kullanın" deniyor. Bekleyen izinler onaylanamıyor. Görevlerde kime atandığı ve ne zaman biteceği görünmüyor. |
| Görsel | 4/10 | shadcn kartlarıyla düzgün ama jenerik. Her sekme aynı düz liste, hiyerarşi ve durum renklendirmesi zayıf. |
| Mimari | 3/10 | 500 satırlık tek istemci dosyası ve 5 adet `any[]` durumu var. API'de doğrulamasız PATCH ve transaction'sız kullanıcı+bağlantı oluşturma, modül kapısı yok. |
| Performans | 6/10 | 6 paralel fetch, `take` sınırları mevcut. Gereksiz veri (500 vardiyadan 20'si gösteriliyor) ve cache yok, ama ağır bir şey de yok. |
| Erişilebilirlik + mobil | 3/10 | Mobilde "Personel ekle" butonu gizli. Etiketler input'lara bağlı değil, ikon butonda aria-label yok, aktiflik anahtarı switch rolünde değil. |

---

## Özellik envanteri

| # | Özellik | Durum | Kanıt | Not |
|---|---|---|---|---|
| 1 | Masaüstü sayfa başlığı + açıklama | ÇALIŞIYOR | `app/dealer/team/page.tsx:170-179` | `DashboardPageHeading` yalnızca `sm:` ve üstünde görünür (`components/dashboard/page-heading.tsx:21`). |
| 2 | Mobil başlık kartı | KISMİ | `page.tsx:181-186` | Başlığı tekrar ediyor ama aksiyon butonu yok. |
| 3 | Başlıktaki "Personel ekle" butonu | KISMİ | `page.tsx:174-177`, `page-heading.tsx:21` (`hidden sm:flex`) | Mobilde gizli. Personel listesi doluyken mobilde personel eklemenin hiçbir yolu yok. |
| 4 | 6 sekmeli yapı | ÇALIŞIYOR | `page.tsx:188-199` | Aktif sekme URL'ye yansımıyor (`defaultValue`), derin bağlantı verilemiyor. |
| 5 | Sekmede personel sayısı `({count})` | KISMİ | `page.tsx:192`, `app/api/dealer/staff/route.ts:26` | Yalnızca aktif personeli sayar. |
| 6 | Yükleniyor durumu | KISMİ | `page.tsx:202-203` | Yalnızca Personel sekmesinde var. Diğer sekmeler yükleme sırasında "Henüz görev yok" gibi yanlış boş durumu gösteriyor (`page.tsx:269`, `294`, `316`, `346`, `371`). |
| 7 | Personel boş durumu + CTA | ÇALIŞIYOR | `page.tsx:204-214` | Mobilde ekleme yapılabilen tek yer burası. |
| 8 | Personel kartı (isim, e-posta, pozisyon rozeti) | ÇALIŞIYOR | `page.tsx:218-233` | |
| 9 | Personel avatarı | SAHTE | `page.tsx:221-223`; `route.ts:33` `image` seçiliyor | API fotoğrafı döndürüyor ama sabit `Users` ikonu gösteriliyor. |
| 10 | "Pasif" rozeti | BOZUK (ölü kod) | `page.tsx:227`; `route.ts:26` `where: { dealerId, isActive: true }` | API pasif personeli hiç döndürmediği için rozet asla görünmüyor. |
| 11 | Kart üzerindeki düzenle butonu | ÇALIŞIYOR | `page.tsx:235-250` | İkon-only, `aria-label` yok. |
| 12 | Ekle dialog'u: İsim | ÇALIŞIYOR | `page.tsx:397-404` | İstemci 1 karakteri kabul ediyor, sunucu min 2 istiyor (`route.ts:12`). Hata İngilizce zod mesajı olarak dönüyor. |
| 13 | Ekle dialog'u: E-posta | KISMİ (GÜVENLİK) | `route.ts:78-118` | Mevcut kullanıcının e-postası girilirse o hesabın şifresi ve rolü değiştiriliyor (Bulgu 1). |
| 14 | Ekle dialog'u: Şifre | KISMİ | `page.tsx:414-422`, `route.ts:120-127` | Şifreyi işletme sahibi belirliyor ve elden iletmesi gerekiyor. Davet/aktivasyon akışı yok, `emailVerified` doğrulamasız olarak `new Date()` yapılıyor. |
| 15 | Ekle dialog'u: Pozisyon | ÇALIŞIYOR | `page.tsx:423-430`, `route.ts:15` | Serbest metin. Rol/yetki kavramı yok. |
| 16 | Ekle dialog'u: PIN kodu | SAHTE | `page.tsx:431-439`; `pinCode` yalnızca `app/api/staff/me/route.ts:21`'de okunuyor | Placeholder "Giriş/çıkış için" diyor ama PIN hiçbir giriş ya da mesai akışında kullanılmıyor. Mesai `shiftId` ile yapılıyor (`app/api/staff/shifts/route.ts:10-13`). Rakam kontrolü de yok. |
| 17 | İstemci doğrulaması | KISMİ | `page.tsx:108` | E-posta biçimi ve PIN rakam/uzunluk kontrolü yok, sunucuyla tutarsız. |
| 18 | Ekleme gönderimi + toast | KISMİ | `page.tsx:107-139` | Sunucu mesajları sabit Türkçe (`route.ts:89`, `93`), zod mesajları sabit İngilizce (`route.ts:75`). İki dilde de dil karışıyor. |
| 19 | Düzenle dialog'u: Pozisyon | ÇALIŞIYOR | `page.tsx:460-467` | PATCH tarafında uzunluk sınırı yok (`[id]/route.ts:20-23`). |
| 20 | Düzenle dialog'u: PIN | BOZUK | `route.ts:48` → `page.tsx:243` → `page.tsx:149` → `[id]/route.ts:24` | Maskeli `'****'` değeri forma doluyor ve kaydedilince gerçek PIN'in yerine `'****'` yazılıyor (Bulgu 3). |
| 21 | Aktif/Pasif anahtarı | BOZUK | `page.tsx:477-491`; `lib/auth.ts:136-207`, `lib/auth.ts:254-256` | "Sisteme giriş yapamaz" deniyor ama ne giriş ne de JWT `isActive` kontrol ediyor. Pasifleştirilen personel listeden kayboluyor ve geri alınamıyor (Bulgu 2, 4). |
| 22 | Düzenle → Kaydet | KISMİ | `page.tsx:141-166` | PIN bozulmasına yol açıyor. PATCH gövdesi doğrulanmıyor. |
| 23 | Personel silme / bağlantı kaldırma | EKSİK | `Trash2` içe aktarılmış ama kullanılmıyor (`page.tsx:18`); DELETE ucu yok | |
| 24 | Görevler listesi | KISMİ | `page.tsx:260-283`; `tasks/route.ts:33` | Atanan kişi ve son tarih gösterilmiyor. Durum ham İngilizce (`pending`, `in_progress`). Sıralama alfabetik olduğu için `cancelled`/`completed` en üstte. |
| 25 | Görev oluşturma | EKSİK | `tasks/route.ts:40-74` POST var, UI yok | Açıklama metni "Personel sekmesinden bir personel seçerek görev atayabilirsiniz" diyor ama böyle bir akış yok (`messages/tr.json` → `dealerTeam.tasksDescription`). |
| 26 | Görev durum değiştirme / iptal / düzenleme | EKSİK | Dealer tarafında PATCH/DELETE ucu yok | |
| 27 | Vardiyalar listesi | BOZUK | `shifts/route.ts:36` `orderBy: { date: 'asc' }` + `page.tsx:298` `slice(0, 20)` | En **eski** 20 vardiyayı gösteriyor. Geçmişte 20'den fazla vardiya birikince bugünkü ve gelecek vardiyalar görünmüyor. |
| 28 | Vardiya oluşturma | EKSİK | `shifts/route.ts:43-74` POST var, UI yok | Metin "API üzerinden … kullanın" diyor. `startTime`/`endTime` biçimi doğrulanmıyor (`shifts/route.ts:13-14`). |
| 29 | Mesai giriş/çıkış (puantaj) görünümü | EKSİK | `StaffShift.clockInAt/clockOutAt` şemada var; `page.tsx:299-302` göstermiyor | Personel giriş-çıkış yapıyor (`app/api/staff/shifts/route.ts:47-76`) ama yönetici bunu göremiyor. |
| 30 | İzin talepleri listesi | KISMİ | `page.tsx:310-335` | Gerekçe (`reason`) gösterilmiyor. Boş metin "Bekleyen talep yok" ama liste tüm durumları içeriyor. |
| 31 | İzin onay / red | EKSİK | `leave/route.ts:43-87` PATCH hazır, UI yok | Personelin `/api/staff/leave` ile açtığı talepler sonsuza kadar "Beklemede" kalıyor. |
| 32 | Eğitim modülleri listesi | KISMİ | `page.tsx:337-360`; `training/route.ts:23` | Global (admin) ve işletmeye özel modüller ayırt edilmiyor. Personel bazlı tamamlanma (`StaffTrainingCompletion`) gösterilmiyor. |
| 33 | Eğitim modülü oluşturma / düzenleme | EKSİK | `training/route.ts:31-60` POST var, UI yok | `content` alanında uzunluk sınırı yok (`training/route.ts:13`). |
| 34 | Checklist şablonları listesi | KISMİ | `page.tsx:362-385` | `type` ham (`open`/`close`/`custom`) yazılıyor, madde sayısı yok. |
| 35 | Checklist şablonu oluşturma / düzenleme | EKSİK | `checklists/route.ts:30-51` POST var, UI yok | `items` dizisinde üst sınır yok (`checklists/route.ts:13`). |
| 36 | Checklist tamamlama geçmişi (günlük açılış/kapanış uyumu) | EKSİK | `StaffChecklistCompletion` şemada var, dealer ucu yok | |
| 37 | Hata durumu | KISMİ | `page.tsx:96-98`; `page.tsx:79-83` | `fetchStaff` başarısız olursa hiçbir şey göstermiyor. Tek genel toast var, yeniden dene butonu yok. tasks/shifts/training/checklists GET uçlarında try/catch yok (`tasks/route.ts:17-38` vb.). |
| 38 | Modül kapısı (`staff_management`) | KISMİ | Yalnızca menü: `components/dashboard/sidebar.tsx:243`; staff API'lerinde `assertModuleEnabled` yok | Admin modülü kapatsa bile URL ve API çalışmaya devam ediyor. |
| 39 | Arama / filtre / sıralama / sayfalama | EKSİK | `page.tsx` tamamı | `take: 200` sınırına sessizce takılıyor. |
| 40 | Personel bazlı müşteri geri bildirimi performansı | EKSİK | `DealerStaff.feedbacks` ilişkisi (`prisma/schema.prisma` → `model DealerStaff`), `app/api/feedbacks/route.ts:256` `dealerStaffId` | Veri toplanıyor ama bu sayfada hiç kullanılmıyor. Ürünün asıl değerinin olduğu yer burası. |
| 41 | Sayfa metadata'sı | KISMİ | `app/dealer/team/layout.tsx:5`; `messages/tr.json` → `layoutMetadata.dealerTeamDescription` | "Rol davetleri ve bayi paneline personel erişimi" deniyor. İkisi de yok: davet yok, personel bayi paneline değil `/staff`'a giriyor. |
| 42 | Çok dillilik (UI metinleri) | KISMİ | `messages/*.json` → `dealerTeam` tam | Ham `task.status` (`page.tsx:276`), `c.type` (`page.tsx:378`) ve API hata mesajları çevrilmiyor. |
| 43 | Sekme açıklama metinleri | SAHTE | `dealerTeam.tasksDescription`, `shiftsDescription`, `trainingDescription`, `checklistsDescription` | Olmayan akışları anlatıyor ve son kullanıcıyı "API'ye" yönlendiriyor. |

**Dağılım:** ÇALIŞIYOR 8 · KISMİ 17 · BOZUK 4 · SAHTE 3 · EKSİK 11 (toplam 43)

---

## Bulgular

### 1. KRİTİK · Güvenlik · Personel ekleme ile herhangi bir hesabı ele geçirme
- **Kanıt:** `app/api/dealer/staff/route.ts:78-103`. E-posta sistemde varsa ve `DealerStaff` bağlantısı yoksa kod hiçbir rol, sahiplik ya da onay kontrolü yapmadan şunu çalıştırıyor:
  ```ts
  await prisma.user.update({ where: { id: existingUser.id },
    data: { name: parsed.data.name, password: hashedPassword, role: 'STAFF' } });
  ```
- **Sorun:** Her DEALER, rakip işletme sahibi, müşteri ya da ADMIN dahil herhangi bir kullanıcının e-postasını girip **o hesabın şifresini kendi belirlediği şifreyle değiştirebilir**. Sonra o hesapla giriş yapabilir: credentials girişi yalnızca `emailVerified` ve şifreyi kontrol ediyor (`lib/auth.ts:165-178`). Hedefin rolü de `STAFF`'a düşürülüyor. Müşteri puanlarına ve ödüllerine erişim kayboluyor, dealer kendi işletmesini kaybediyor, admin rolünü yitiriyor (DoS). Kullanıcıya hiçbir bildirim gitmiyor. Ayrıca `route.ts:89/93` cevapları "başka bir işletmeye kayıtlı" diyerek e-posta numaralandırmaya (enumeration) imkân veriyor. Dealer kendi e-postasını girerse kendini de STAFF'a düşürüyor.
- **Profesyonel öneri:** Mevcut kullanıcı dalını tamamen kaldırın ve **davet tabanlı** bir akışa geçin:
  - `StaffInvite { id, dealerId, email, jobTitle, tokenHash, expiresAt, acceptedAt }` modelini ekleyin.
  - `POST /api/dealer/staff/invites` davet maili göndersin (mevcut nodemailer altyapısı).
  - Davet edilen kişi `/staff/accept?token=` sayfasında kendi şifresini belirlesin ya da mevcut hesabıyla giriş yapıp **kendisi onaylasın**.
  - Mevcut hesap yalnızca `CUSTOMER` ise ve sahibi onaylarsa bağlansın. `DEALER`/`ADMIN` hesapları reddedilsin.
  - Hata mesajları tek ve jenerik olsun ("Davet gönderildi").
  - Rate-limit ekleyin (`checkRateLimitDb`). `AuditLog` kaydı tutun.
  - Acil yama olarak, hemen bugün `existingUser` dalında `role !== 'CUSTOMER'` ise reddedin ve şifre değişimini kaldırın.
- **Efor:** M

### 2. KRİTİK · Güvenlik/İşlev · "Pasif" yapılan personel sisteme girmeye ve çalışmaya devam ediyor
- **Kanıt:** UI metni `dealerTeam.sectionActiveHint` = "Devre dışı bırakıldığında sisteme giriş yapamaz". `lib/auth.ts:136-207` (credentials) `DealerStaff.isActive`'e bakmıyor. JWT `dealerId`'yi `isActive`'ten bağımsız basıyor (`lib/auth.ts:254-256`). `getStaffDealerId` (`lib/api-auth.ts:158-168`) ve `/api/staff/*` uçları da kontrol etmiyor.
- **Sorun:** İşten çıkarılan bir garson personel paneline girip görev, vardiya ve checklist verilerini görmeye, mesai giriş-çıkışı ve izin talebi yapmaya devam ediyor. Yöneticiye verilen güvenlik vaadi yanlış.
- **Profesyonel öneri:** `isActive=false` iki katmanda erişimi kessin:
  - Girişte: `authorize` içinde `role === 'STAFF'` ise `staffProfile.isActive` okunsun ve pasifse reddedilsin.
  - Oturum sırasında: `getStaffDealerId` yerine `requireActiveStaff()` yardımcı fonksiyonu yazılsın. Mevcut token-replay deseninde olduğu gibi Redis sıcak katman + DB kaynak doğruluğu ile `isActive` kontrol edilsin, böylece açık oturumlar da düşsün.
  - Pasifleştirme anında personelin JTI'leri iptal listesine yazılsın.
- **Efor:** M

### 3. YÜKSEK · Veri bütünlüğü · Düzenle → Kaydet gerçek PIN'i `'****'` ile eziyor; PIN audit log'a açık metin yazılıyor
- **Kanıt:** GET maskeliyor (`route.ts:48` `pinCode: s.pinCode ? '****' : null`). Edit formu bu değeri dolduruyor (`page.tsx:243`). Kaydet `'****'`'u gönderiyor (`page.tsx:149`). PATCH onu olduğu gibi yazıyor (`[id]/route.ts:24`). Aynı PATCH `newData: { jobTitle, pinCode, isActive }` ile PIN'i açık metin olarak `AuditLog`'a kaydediyor (`[id]/route.ts:59`). PIN DB'de de hash'siz duruyor (`schema.prisma` `DealerStaff.pinCode`).
- **Sorun:** PIN'i olan personelin sadece pozisyonunu değiştirmek bile PIN'i bozuyor. PATCH gövdesi hiç doğrulanmıyor: `isActive` string gelirse Prisma 500 veriyor, `jobTitle` sınırsız, PIN rakam/uzunluk kontrolsüz.
- **Profesyonel öneri:**
  - PATCH için zod şeması yazın: `jobTitle: z.string().max(50).nullable()`, `pinCode: z.string().regex(/^\d{4,6}$/).nullable().optional()`, `isActive: z.boolean()`.
  - İstemcide PIN alanı "PIN tanımlı · Değiştir / Kaldır" şeklinde ayrı bir eylem olsun. Formda değer taşınmasın, alan dokunulmadıysa gönderilmesin.
  - PIN'i bcrypt ile hash'leyin. Audit log'a yalnızca `pinChanged: true` yazın.
  - PIN'in gerçek bir amacı yoksa (bkz. Bulgu 9) alanı tamamen kaldırmak da geçerli.
- **Efor:** S

### 4. YÜKSEK · İşlev · Pasifleştirme tek yönlü: personel listeden kayboluyor, geri alınamıyor ve tekrar eklenemiyor
- **Kanıt:** GET `isActive: true` filtreliyor (`route.ts:26`), bu yüzden "Pasif" rozeti ölü kod (`page.tsx:227`). Aynı e-posta tekrar eklenmek istenince `existingLink.dealerId === dealerId` → "Bu e-posta adresi zaten ekli" (`route.ts:87-90`). DELETE ucu yok. `Trash2` import'u kullanılmıyor.
- **Sorun:** Yanlışlıkla pasifleştirilen bir çalışan UI'dan bir daha yönetilemiyor. Bu kişi `userId @unique` yüzünden başka bir işletmeye de eklenemiyor (`route.ts:91-94`), hesabı kalıcı olarak kilitleniyor.
- **Profesyonel öneri:** Listeye "Aktif / Pasif / Davet bekleyen" segment filtresi ekleyin, GET'e `?status=` parametresi verin. Pasif kartlarda "Yeniden etkinleştir" olsun. "İşletmeden çıkar" eylemi eklensin: `DELETE /api/dealer/staff/[id]` bağlantıyı silsin, kullanıcının rolü `CUSTOMER`'a dönsün, geçmiş görev/vardiya kayıtları arşivde tutulsun. İşlem onay dialog'u ve audit log ile yapılsın.
- **Efor:** M

### 5. YÜKSEK · İşlev · Beş sekme salt okunur; UI son kullanıcıyı "API'ye" yönlendiriyor
- **Kanıt:** POST/PATCH uçları var ama hiçbir UI çağırmıyor: `tasks/route.ts:40`, `shifts/route.ts:43`, `leave/route.ts:43`, `training/route.ts:31`, `checklists/route.ts:30` (yalnız `page.tsx` bu uçları kullanıyor, repo genelinde başka çağıran yok). Metinler: "Vardiya oluşturmak için API üzerinden…", "Yeni şablon API üzerinden eklenebilir", "Görev oluşturma formu sonraki güncellemede eklenecek" (`messages/tr.json` → `dealerTeam.*Description`).
- **Sorun:** Personel paneli (`app/staff/staff-dashboard-client.tsx`) görevleri tamamlıyor, vardiyaya giriş-çıkış yapıyor, eğitim bitiriyor ve checklist dolduruyor. Ancak bu verilerin hiçbiri işletme sahibi tarafından **yaratılamıyor**. Sonuçta iki taraflı ürün kurulmuş ama tek tarafı işlemez halde. Bu, ürünün en büyük işlev boşluğu.
- **Profesyonel öneri:** Her alan için bir oluşturma/düzenleme arayüzü yazın (aşağıdaki vizyona bakın). Görev için personel seçici, son tarih ve öncelik. Vardiya için haftalık takvim ızgarasında sürükle-oluştur. Eğitim için markdown editörü. Checklist için sürükle-sırala madde editörü. Metinlerdeki "API" ifadelerini kaldırın.
- **Efor:** XL

### 6. YÜKSEK · İş akışı · Personelin izin talepleri onaylanamıyor
- **Kanıt:** Personel talep açabiliyor (`app/api/staff/leave/route.ts:40-74`). Dealer PATCH'i hazır ve yarışa dayanıklı (`app/api/dealer/staff/leave/route.ts:61-64`, `status: 'pending'` koşullu `updateMany`). Ama UI'da onay/red butonu yok (`page.tsx:320-329`), gerekçe de gösterilmiyor.
- **Sorun:** İş akışı çıkmaz sokakta: talepler sonsuza kadar "Beklemede" kalıyor. Personel tarafında "talep ettim, yanıt yok" deneyimi oluşuyor.
- **Profesyonel öneri:** Bekleyen talepleri üstte gösteren bir onay kuyruğu ekleyin: gerekçe, tarih aralığı, gün sayısı ve o tarihlerde planlı vardiya çakışması gösterilsin. Onayla/Reddet (red için not) butonları olsun. İyimser güncelleme yapılsın. Sekme rozetinde bekleyen sayısı görünsün. Karar sonrası personele push/bildirim gitsin (mevcut push merkezi). Bekleyen talep sayısı dashboard'daki "aksiyon" kartına da beslensin.
- **Efor:** S

### 7. YÜKSEK · Doğru veri · Vardiya listesi en eski 20 kaydı gösteriyor; görev sıralaması tamamlanmışları öne alıyor
- **Kanıt:** `shifts/route.ts:36` `orderBy: { date: 'asc' }`, `take: 500` ve `page.tsx:298` `slice(0, 20)`. `tasks/route.ts:33` `orderBy: [{ status: 'asc' }, …]`: alfabetik sırada `cancelled < completed < in_progress < pending`.
- **Sorun:** Birkaç haftalık kullanımdan sonra bugünkü vardiyalar ekranda hiç görünmüyor. Görevlerde iptal ve tamamlanmış olanlar listenin başında, bekleyenler dipte. 500 kayıt indirilip 480'i atılıyor.
- **Profesyonel öneri:** Vardiya GET'i varsayılan olarak `from=bugün-7g`, `to=bugün+14g` ile çağrılsın ve UI haftalık gezinme ile bunu yönetsin. Görevlerde durum için açık bir öncelik eşlemesi (CASE ya da istemci tarafında sabit sıra) ve `dueAt asc nulls last` kullanılsın. Varsayılan olarak tamamlanmışlar gizlensin ("Tamamlananlar" filtresi).
- **Efor:** S

### 8. YÜKSEK · Mobil · Personel varken mobilde "Personel ekle" erişilemez
- **Kanıt:** `DashboardPageHeading` `hidden sm:flex` (`components/dashboard/page-heading.tsx:21`) ve buton `actions` içinde (`page.tsx:173-178`). Mobil başlık kartında (`page.tsx:181-186`) aksiyon yok. Diğer tek ekleme butonu boş durumda (`page.tsx:209`).
- **Sorun:** İşletme sahiplerinin büyük kısmı telefondan yönetiyor. İlk personelden sonra mobilde yeni personel eklenemiyor.
- **Profesyonel öneri:** Mobil başlık kartına birincil aksiyonu ekleyin ya da alt güvenli alan ofsetli bir FAB koyun. Daha iyisi `DashboardPageHeading`'e mobil varyant ekleyip tüm dealer sayfalarında aynı deseni kullanın, çünkü aynı hata başka sayfalarda da olabilir (bu sayfa dışı, doğrulanmadı).
- **Efor:** S

### 9. ORTA · Ürün tutarlılığı · PIN kodu hiçbir yerde kullanılmıyor ("Giriş/çıkış için" vaadi sahte)
- **Kanıt:** `pinCode` repo genelinde yalnızca dealer staff uçlarında ve `app/api/staff/me/route.ts:21`'de okunuyor. Mesai giriş-çıkışı `shiftId` ile, oturum açmış personel tarafından yapılıyor (`app/api/staff/shifts/route.ts:10-13`).
- **Sorun:** Kullanıcı bir güvenlik ya da puantaj özelliği kurduğunu sanıyor ama alan dekoratif.
- **Profesyonel öneri:** Ya gerçek bir **kiosk/ortak tablet modu** yapın (işletme tabletinde `/staff/kiosk`, personel PIN ile giriş-çıkış yapar, rate-limit ve hash'li PIN ile), ya da alanı UI'dan kaldırın. Restoran sektöründe (Toast, Square) PIN'li ortak cihaz standart beklenti olduğu için kiosk önerilir.
- **Efor:** L (kiosk) / S (kaldırma)

### 10. ORTA · Güvenlik/Mimari · Personel ekleme transaction'sız, e-posta doğrulamasız ve rate-limit'siz
- **Kanıt:** `route.ts:121-144`: `user.create` ve `dealerStaff.create` ayrı çağrılar. `emailVerified: new Date()` (`route.ts:127`). Rate-limit yok. bcrypt maliyeti 12 olduğu için her istek CPU-yoğun.
- **Sorun:** İkinci yazım başarısız olursa işletmeye bağlı olmayan, rolü STAFF olan yetim bir kullanıcı kalıyor ve giriş yapınca `getStaffDealerId` 403 veriyor. Yazım hatalı bir e-postayla başkasının adresine doğrulanmış hesap açılıyor ve adresin gerçek sahibi daha sonra kayıt olamıyor.
- **Profesyonel öneri:** `prisma.$transaction` kullanın. Bulgu 1'deki davet akışıyla e-posta doğrulaması doğal olarak gelir. `checkRateLimitDb('staff-invite:'+dealerId, 20, 1h)` ekleyin.
- **Efor:** S (davet akışıyla birlikte)

### 11. ORTA · Yetki · `staff_management` modül kapısı yalnızca menüde
- **Kanıt:** `components/dashboard/sidebar.tsx:243` `moduleKey: 'staff_management'`. `app/api/dealer/staff/**` altındaki hiçbir dosya `assertModuleEnabled` çağırmıyor (`lib/module-gate.ts:92`).
- **Sorun:** Admin modülü kapatsa da sayfa doğrudan URL ile açılıyor ve tüm uçlar çalışıyor. Ayrıca plan bazlı personel kotası yok (repo genelinde `maxStaff` benzeri bir şey bulunamadı).
- **Profesyonel öneri:** Tüm dealer staff uçlarına `assertModuleEnabled('staff_management', { role: 'dealer', … })` ekleyin. Sayfaya sunucu bileşeni sarmalayıcı ile `notFound`/yükseltme ekranı koyun. Plan katmanına `maxStaffSeats` ekleyin ve UI'da "3/5 koltuk" göstergesi bulunsun.
- **Efor:** S

### 12. ORTA · Dil karışıklığı · API mesajları ve ham enum'lar çevrilmiyor
- **Kanıt:** `page.tsx:276` `{task.status}` (pending/in_progress), `page.tsx:378` `{c.type}` (open/close/custom). Sabit TR hata metinleri (`route.ts:89`, `93`; `[id]/route.ts:32`) EN arayüzde görünüyor. zod'un varsayılan İngilizce mesajları (`route.ts:75`, ör. "Invalid email") TR arayüzde görünüyor.
- **Profesyonel öneri:** API'ler `{ code: 'STAFF_EMAIL_TAKEN' }` gibi makine kodları döndürsün, istemci bunları `t('dealerTeam.errors.<code>')` ile çevirsin. Durum ve tip için `dealerTeam.taskStatus.*`, `dealerTeam.checklistType.*` anahtarları eklensin, durum rozetleri renk + ikonla gösterilsin.
- **Efor:** S

### 13. ORTA · UX · Yükleme ve hata durumları yanıltıcı
- **Kanıt:** `loading` yalnızca Personel sekmesinde kullanılıyor (`page.tsx:202`). Diğer sekmelerde yükleme sırasında boş metin gösteriliyor. `fetchStaff` `!json.success` olduğunda sessiz kalıyor (`page.tsx:82`). tasks/shifts/training/checklists GET uçlarında try/catch yok, DB hatasında gövde JSON değil ve `r.json()` patlıyor (`page.tsx:90-94`). Ekle/düzenle sonrası yalnızca `fetchStaff` yenileniyor (`page.tsx:130`, `157`).
- **Profesyonel öneri:** SWR (ya da React Query) ile her sekme için ayrı anahtar, `isLoading`/`error` durumu, sekme bazlı skeleton ve "Tekrar dene" butonu. Uçlara `responseIfDatabaseUnavailable` + try/catch deseni eklensin, diğer uçlarla tutarlı olsun.
- **Efor:** S

### 14. ORTA · Yanlış metin · Metadata ve açıklamalar gerçeği yansıtmıyor
- **Kanıt:** `layoutMetadata.dealerTeamDescription` = "Rol davetleri ve bayi paneline personel erişimi". Davet ya da rol sistemi yok, personel `/staff` paneline giriyor. `tasksDescription` "Personel sekmesinden bir personel seçerek görev atayabilirsiniz" diyor, oysa böyle bir akış yok.
- **Profesyonel öneri:** Metinleri yeniden inşa ile birlikte gerçek akışlara göre yazın. Geçiş dönemi için "yakında" ifadelerini UI'dan çıkarın.
- **Efor:** S

### 15. DÜŞÜK · Erişilebilirlik · Etiket/ARIA eksikleri
- **Kanıt:** `<Label>` öğelerinin `htmlFor`'u yok ve `Input`'ların `id`'si yok (`page.tsx:398-436`, `461-475`). İkon-only düzenle butonunda `aria-label` yok (`page.tsx:235-250`). Aktiflik anahtarı `role="switch"`/`aria-checked` olmayan bir Button (`page.tsx:482-490`). Pasif rozeti `text-[10px]` (`page.tsx:227`).
- **Profesyonel öneri:** shadcn `Switch` kullanın. Tüm form alanlarını `id`/`htmlFor` ile eşleyin, ya da react-hook-form + `FormField` desenine geçin (zod şemasını API ile paylaşın). Düzenle butonuna `aria-label={t('dealerTeam.editStaff', { name })}` ekleyin.
- **Efor:** S

### 16. DÜŞÜK · Kod kalitesi · `any` kaçakları ve ölü import'lar
- **Kanıt:** `useState<any[]>` × 5 (`page.tsx:57-61`). Kullanılmayan import'lar: `ClipboardList, Calendar, BookOpen, ListChecks, Send, Mail, Briefcase, KeyRound, Trash2` (`page.tsx:7-18`). `useEffect` bağımlılık uyarısı (`page.tsx:103-105`). 500 satırlık tek bileşen.
- **Profesyonel öneri:** Prisma tiplerinden türetilen DTO'lar (`lib/staff/types.ts`). Her sekme `app/dealer/team/_components/*` altında ayrı bir bileşen olsun ve gerekirse `next/dynamic` ile yüklensin.
- **Efor:** S

---

## Eksik özellikler (kıyas ürünlerle)

1. **Personel bazlı müşteri deneyimi karnesi** (Medallia "Frontline", Qualtrics "Employee-attributed CX"): `Feedback.dealerStaffId` zaten toplanıyor. Personel başına ortalama puan, NPS, olumlu/olumsuz örnek yorumlar, trend ve "bu hafta övülen personel" kartı gösterilmeli. Ürünün asıl farkı bu olur ve şu an veri boşa gidiyor.
2. **Davet, rol ve izin yönetimi** (Square Team, Toast Employees): e-posta/SMS daveti, "Müdür / Şef / Garson" gibi rol şablonları, rol başına izinler (ör. vardiya müdürü izin onaylayabilir), çoklu şube ataması.
3. **Vardiya planlama + puantaj** (Square Shifts, Toast Scheduling, 7shifts): haftalık takvim, şablon vardiyayı kopyalama, çakışma uyarısı, izinle çakışma kontrolü, giriş-çıkış raporu (geç kalma / erken çıkma), CSV/bordro dışa aktarma.
4. **Görev yönetimi ve geri bildirimden göreve dönüşüm**: olumsuz bir geri bildirimden ya da AI aksiyon önerisinden tek tıkla personele görev atama, son tarih, öncelik, kanıt fotoğrafı, tamamlanma bildirimi.
5. **Eğitim ilerleme takibi + zorunlu eğitim** (Toast/7shifts eğitim modülleri): modül bazlı tamamlanma matrisi (personel × modül), yeni personele otomatik eğitim seti, hatırlatma.
6. **Operasyon uyumu (checklist compliance)** (Jolt, Zenput): günlük açılış/kapanış checklist'inin kim tarafından ne zaman tamamlandığı, kaçırılan günler, şube uyum yüzdesi.

---

## Yeniden tasarım vizyonu

### Hedef deneyim
Sayfa "Ekip" adıyla bir **ekip operasyon merkezi** olmalı. Sahip sayfayı açtığında üç soruya 5 saniyede cevap alabilmeli: *bugün kim çalışıyor, onay bekleyen ne var, müşteriler hangi personelden memnun ya da değil.*

### Yerleşim
1. **Üst şerit (Bugün)**: 4 kompakt KPI kutusu: bugün vardiyada olanlar (giriş yaptı / bekleniyor / geç kaldı), bekleyen izin talepleri, gecikmiş görevler, bu haftanın personel memnuniyet ortalaması. Her kutu ilgili sekmeyi filtreli açar.
2. **Sekmeler (URL'ye bağlı, `?tab=`)**:
   - **Ekip**: tablo/kart karışık görünüm. Avatar, rol rozeti, durum (Aktif/Pasif/Davet bekliyor), son mesai, müşteri puanı mini-sparkline. Arama ve rol/durum filtresi. Satır tıklanınca **sağdan açılan personel detay paneli** (Sheet): profil, vardiyalar, görevler, eğitim ilerlemesi, kendisine atfedilen geri bildirimler, eylemler (rolü değiştir, PIN sıfırla, pasifleştir, işletmeden çıkar).
   - **Vardiya planı**: haftalık ızgara (satır = personel, sütun = gün). Hücreye tıklayıp ya da sürükleyerek vardiya oluşturma, "geçen haftayı kopyala", izinli günler gri desenle. Mobilde gün bazlı dikey liste.
   - **Görevler**: Bekleyen / Devam eden / Tamamlanan sütunları ya da filtreli liste. Personel seçicili hızlı ekleme satırı. Geri bildirimden oluşturulmuş görevlerde kaynak bağlantısı.
   - **Onaylar**: izin talebi kuyruğu ve bekleyen sayı rozeti.
   - **Eğitim & Checklist**: modül/şablon editörleri + personel × modül tamamlanma matrisi + checklist uyum takvimi (ısı haritası).
3. **Birincil aksiyon**: "Personel davet et". Masaüstünde başlıkta, mobilde güvenli alan ofsetli FAB.

### Motion / 3D
- 3D'ye gerek yok, bu bir operasyon ekranı. Motion ölçülü olmalı: `m as Motion` ile liste öğelerinde 150–200 ms giriş/çıkış (layout animasyonu ile onaylanan iznin kuyruktan kayarak çıkması), KPI sayılarında kısa sayaç animasyonu, Sheet açılışında yay geçişi.
- `useReducedMotion` ile hepsi anlık geçişe düşmeli.
- Vardiya ızgarasında sürükle-oluştur sırasında hafif önizleme bloğu olsun. Abartılı stagger kullanılmasın.

### Veri / API değişiklikleri
- `StaffInvite` modeli + `POST /api/dealer/staff/invites`, `POST /api/staff/invites/accept`. `POST /api/dealer/staff` içindeki mevcut kullanıcıyı ele geçiren dal kaldırılır.
- `GET /api/dealer/staff?status=active|inactive|invited&q=`; `PATCH /api/dealer/staff/[id]` zod ile doğrulanır; `DELETE /api/dealer/staff/[id]` (bağlantıyı kaldır + rolü geri al, transaction'lı).
- `requireActiveStaff()` yardımcı fonksiyonu + `authorize` içinde `isActive` kontrolü + pasifleştirmede oturum iptali.
- `GET /api/dealer/staff/overview` tek çağrıda bugün özeti, bekleyen sayılar ve personel bazlı memnuniyet getirir (`Feedback` üzerinde `groupBy dealerStaffId`, son 30 gün). Upstash Redis'te 60 sn cache ve yazmalarda invalidasyon (mevcut cache deseni).
- `PATCH/DELETE` uçları görev, vardiya, eğitim ve checklist için. Vardiya için `HH:mm` regex ve `start < end` kontrolü. Checklist `items` için `max(50)`, eğitim `content` için uzunluk sınırı.
- `GET /api/dealer/staff/attendance?from&to` (clockIn/Out raporu) ve `GET /api/dealer/staff/checklists/completions`.
- Tüm uçlara `assertModuleEnabled('staff_management')`, try/catch + `responseIfDatabaseUnavailable` ve kod tabanlı hata mesajları (`{ code }`) eklenir.
- İstemcide SWR, sekme bazlı lazy bileşenler, zod şemaları `lib/staff/schemas.ts` içinde istemci ve sunucu arasında paylaşılır.

---

## Çakışmalar / birleştirme önerisi

- **`/dealer/action-items` ve AI içgörü atamaları**: `app/dealer/ai-insights/ai-insights-client.tsx:319-330` personel listesini `/api/dealer/staff`'tan çekiyor ve aksiyonları `ActionItem.assignedToId` ile personele atıyor (`prisma/schema.prisma` → `ActionItemAssignments`). Bu sayfadaki görevler ise ayrı `StaffTask` modelinde. Personel panelindeki `/api/staff/*` uçları yalnızca `StaffTask` okuyor (`app/api/staff` altında `actionItem`/`incident` referansı yok). Sonuç olarak AI'dan personele atanan aksiyonları personel **hiç göremiyor**, işletmenin de iki ayrı görev listesi var. **Öneri:** personele atanan her iş tek bir "Görevler" görünümünde birleşsin. Ya `StaffTask`'a `sourceType/sourceId` (action_item, incident, feedback) eklenip ActionItem ataması StaffTask üretsin, ya da personel paneli ActionItem'ları da listelesin. Uzun vadede tek bir görev modeli hedeflenmeli.
- **`/dealer/incidents`**: `Incident.assignedToId` ile üçüncü bir atama kanalı var. Aynı birleştirme kapsamına alınmalı (kapsam dışı, doğrulanmadı).
- **`/admin/ekip` ve `/customer/ekip`** (paylaşılan `components/team/`): bu modül Qratex'in iç ekibi içindir, işletme personeliyle karıştırılmamalı. Ancak kanban, görev detay sheet'i (`components/team/task-detail-sheet.tsx`) ve performans (`components/team/team-performance.tsx`) bileşenleri bu sayfanın yeniden inşasında görsel ve etkileşim deseni olarak yeniden kullanılabilir (doğrudan veri modeli paylaşımı önerilmez).
- **`/staff` personel paneli**: bu sayfanın doğal karşı yüzü. Yeniden inşa iki yüz birlikte tasarlanmalı: dealer'ın yarattığı her nesnenin personel tarafında bir eylemi, personelin her eyleminin de dealer tarafında görünür bir sonucu olmalı.
- Sayfa **kaldırılmamalı**. Veri modeli ve personel paneli zaten var, sorun yönetim yüzünün yarım kalması. Karar: **yeniden inşa** (önce Bulgu 1–4 acil güvenlik ve veri yamaları, ardından arayüz).

---

## Doğrulama (şüpheci inceleme)

Dört iddia çağıran ve çağrılan taraflarıyla birlikte baştan okundu: `app/api/dealer/staff/route.ts`, `app/api/dealer/staff/[id]/route.ts`, `lib/auth.ts`, `lib/api-auth.ts`, `proxy.ts`, `app/staff/layout.tsx`, `app/api/staff/*`, `prisma/schema.prisma`, `lib/validations.ts`, `app/api/auth/register/route.ts`. Kod çalıştırılmadı, DB'ye dokunulmadı.

### 1. POST /api/dealer/staff ile hesap ele geçirme / rol düşürme: **DOĞRULANDI (KRİTİK)**
- Kod, iddiada anlatıldığı gibi çalışıyor. `route.ts:78-81` e-postayla kullanıcıyı buluyor. `DealerStaff` bağlantısı yoksa (`:84-94`) hedefin rolüne, onayına ya da sahipliğine hiç bakılmıyor. Ardından `:96-103` hedefin `name` ve `password` alanlarını saldırganın seçtiği değerlerle eziyor ve `role: 'STAFF'` yazıyor.
- Saldırının ön koşulu düşük. `lib/validations.ts:39` kayıtta `role: z.enum(['CUSTOMER','DEALER'])` kabul ediyor (`app/api/auth/register/route.ts:40,62`). Yani e-postasını doğrulayan herkes kendine DEALER hesabı açabilir.
- Girişi engelleyen başka bir şey yok. `lib/auth.ts:165-177` yalnızca `emailVerified` alanına ve bcrypt kontrolüne bakıyor. Hedef zaten doğrulanmış olduğu için yeni şifreyle giriş başarılı oluyor. Hedefte 2FA açıksa (`:182-194`) giriş engelleniyor, ama rol düşürme ve şifre ezme yine de gerçekleşiyor.
- **Yeniden üretim:** Saldırgan `/auth/register` üzerinden DEALER hesabı açıp e-postasını doğrular. Ardından `POST /api/dealer/staff` isteğini `{name:"x", email:"<kurban@...>", password:"Saldirgan123"}` gövdesiyle gönderir. Kurbanın şifresi değişir, rolü STAFF olur. Saldırgan `kurban@...` / `Saldirgan123` ile giriş yapar ve `proxy.ts:54,68` onu `/staff` paneline yönlendirir. Kurban bir müşteriyse puanları ve rozetleri artık saldırganın elindedir. Kurban rakip bir bayiyse `/dealer` paneline erişimini kaybeder. Kurban admin ise admin rolü kalıcı olarak silinir (DoS). Kurbana herhangi bir bildirim gitmez.
- Numaralandırma iddiası kısmen doğru. `:89` ve `:93` mesajları yalnızca "başka bir işletmenin personeli mi?" sorusunu ayırt ettiriyor. Bağlantısız bir e-posta için iki dal da 200 döndüğü için bu dallar e-postanın var olup olmadığını sızdırmıyor. Asıl zarar ele geçirme.
- Ek yan etki: Bayi kendi e-postasını girerse kendi rolünü STAFF'a düşürür ve kendi kendine personel olur.
- **Öneri:** Mevcut kullanıcıyı değiştiren dal tamamen kaldırılmalı. Mevcut bir hesap ancak davet ve kabul akışıyla bağlanabilmeli (`StaffInvite` + token'lı e-posta + hedefin kendi onayı). Hedefin rolü yalnızca `CUSTOMER` ise ve hedef onay verirse değiştirilmeli. Şifre asla dışarıdan yazılmamalı. Bu düzeltme acil olarak ayrı bir yama halinde canlıya alınmalı. Ardından AuditLog'da `user.update role→STAFF` kayıtları taranmalı ve geçmişte istismar yapılıp yapılmadığı kontrol edilmeli.

### 2. Pasifleştirilen personelin erişimi kesilmiyor: **DOĞRULANDI (YÜKSEK)**
- `isActive` alanı yalnızca `PATCH [id]/route.ts:25` içinde yazılıyor. Bu alanı okuyan hiçbir yetki kontrolü yok:
  - `lib/auth.ts:136-207` `authorize` içinde ve `:218-256` jwt içinde `staffProfile` için yalnızca `dealerId` okunuyor.
  - `lib/api-auth.ts:158-168` `getStaffDealerId` yalnızca rolün ve dealerId'nin varlığına bakıyor.
  - `app/staff/layout.tsx:31` yalnızca role bakıyor.
  - `proxy.ts` içinde `isActive` geçmiyor.
  - `app/api/staff/*` içindeki `isActive` kullanımları (`me/route.ts:39,50`, `checklists/complete:34`, `training/complete:30`) eğitim ve checklist şablonlarına ait. `DealerStaff`'a ait değil.
- Arayüz ise tam tersini vaat ediyor: `messages/tr.json:1045` "Devre dışı bırakıldığında sisteme giriş yapamaz" diyor.
- **Yeniden üretim:** Bayi personeli pasif yapar. Personel aynı şifreyle giriş yapar ve `/staff` panelini açar. `GET /api/staff/me` görev, vardiya, izin ve checklist verilerini döndürür. `PATCH /api/staff/shifts` (`shifts/route.ts:68-71`) mesai giriş-çıkışı kaydeder. `/api/staff/leave` ile izin talebi oluşturulabilir. Personelin halihazırda açık olan oturumu da hiç kesilmez.
- **Öneri:** `authorize` içinde STAFF rolü için `staffProfile.isActive` kontrol edilmeli. `getStaffDealerId` fonksiyonu DB'ye (ya da Redis'teki sıcak katmana) dayalı bir `requireActiveStaff()` yardımcısına dönüştürülmeli. Pasifleştirme anında personelin mevcut JTI'ları iptal edilmeli (bunun için token-replay Redis katmanı kullanılabilir).

### 3. Düzenleme kaydı PIN'i '****' ile eziyor, PIN audit log'da açık metin: **DOĞRULANDI (önem: ORTA, KRİTİK değil)**
- Veri bozulması gerçek. GET PIN'i `'****'` olarak maskeliyor (`route.ts:48`). Edit formu bu değeri dolduruyor (`page.tsx:243`) ve input'a basıyor (`:471`). Kaydet `'****'` değerini gönderiyor (`:149`). PATCH bu değeri hiçbir doğrulama yapmadan yazıyor (`[id]/route.ts:20-25`). PIN'li bir personelin yalnızca pozisyonunu değiştirip kaydetmek PIN'i kalıcı olarak `****` yapar.
- PATCH gövdesi gerçekten doğrulanmıyor. Örneğin `isActive:"false"` (string) gönderilirse Prisma tip hatası verir ve istek catch bloğunda 500 ile sonuçlanır. `jobTitle` alanının uzunluk sınırı yok, PIN formatı da serbest. Audit log `newData` içine PIN'i açık metin yazıyor (`:59`).
- Önem düşürmesinin gerekçesi: `pinCode` hiçbir giriş ya da mesai akışında kullanılmıyor. Alanı okuyan tek yer `app/api/staff/me/route.ts:21`, istemci de bu değeri göstermiyor (bkz. Bulgu tablosu satır 16). Bu nedenle bozulan veya açığa çıkan PIN bugün herhangi bir yetkiye karşılık gelmiyor. Etki şunlarla sınırlı: kullanıcının girdiği verinin sessizce bozulması, hijyen sorunu ve PIN ileride bir akışa bağlanırsa doğacak gizli risk.
- **Öneri:** Maskelenmiş değer forma hiç konmamalı. PIN için ayrı bir "PIN'i değiştir / kaldır" kontrolü olmalı ve alan boş bırakılırsa `pinCode` gövdeye eklenmemeli. PATCH zod ile doğrulanmalı (`pinCode: /^\d{4,6}$/`). PIN hash'lenmeli ve audit log'a yalnızca `pinChanged: true` yazılmalı. PIN'in amacı ürün olarak tanımlanmayacaksa alan tamamen kaldırılmalı.

### 4. Pasifleştirme geri alınamıyor: **DOĞRULANDI (YÜKSEK, veri ve işletim etkisi)**
- GET `isActive: true` filtresi uyguluyor (`route.ts:26`). Pasif personel listeye hiç gelmediği için `page.tsx:227` içindeki "Pasif" rozeti ölü kod. Edit butonu yalnızca listedeki kartlarda var (`:235-250`), dolayısıyla pasif bir kayıt UI'dan tekrar aktif yapılamıyor.
- Aynı e-postayla yeniden ekleme denenirse `route.ts:87-90` "Bu e-posta adresi zaten ekli" diyerek reddediyor. Başka bir işletme eklemeye çalışırsa `:91-94` reddediyor. Şemada da `DealerStaff.userId @unique` tanımlı (`prisma/schema.prisma:2435`).
- Kodda başka bir çıkış yolu yok. `app/api` altında `dealerStaff.update/delete` yalnızca `dealer/staff/[id]/route.ts:37` içinde geçiyor. DELETE ucu da admin tarafında bir uç da yok.
- **Yeniden üretim:** Bayi bir personeli yanlışlıkla pasif yapıp kaydeder. Kart listeden kaybolur. Aynı e-postayla tekrar eklemeye çalıştığında 400 "zaten ekli" hatası alır. Personel başka bir işletmede işe başladığında o işletme de onu ekleyemez. Kayıt ancak DB'ye elle müdahaleyle kurtarılabilir. Bulgu 2 nedeniyle bu durumda bile personelin girişi açık kalır. Yani yönetim tarafında kilitli ama erişim tarafında açık, kendi içinde çelişkili bir kayıt oluşur.
- Teknik bir ayrıntı: Doğrudan `PATCH /api/dealer/staff/<id>` `{isActive:true}` isteği hâlâ çalışır, çünkü PATCH `isActive` filtresi uygulamıyor. Fakat bunun için kaydın id'si gerekiyor ve UI bu id'yi artık göstermiyor. Normal bir kullanıcı için akış geri alınamaz.
- **Öneri:** GET `?status=active|inactive|all` parametresini desteklemeli ve UI'da "Pasif" sekmesiyle yeniden aktifleştirme sunulmalı. Aynı işletmede pasif bir bağlantı varsa POST "yeniden aktifleştir" önermeli. Bağlantıyı kaldıran ve rolü önceki haline döndüren transaction'lı bir `DELETE` ucu eklenmeli. Pasifleştirme işlemi bir onay diyaloğuyla yapılmalı.

---

## Uygulama (Dalga 2)

**Sonuç:** sayfa "ekip operasyon merkezi" olarak yeniden yazıldı. Sunucu bileşeni (`app/dealer/team/page.tsx`) tek BFF verisini (`lib/staff-ops/server.ts → getTeamHub`) ön yükler; istemci adası (`components/dealer/b-ekip/team-hub.tsx`) React Query ile `/api/dealer/staff/hub`'ı 60 sn'de bir yeniler. Üstte 6 KPI (şu an vardiyada, geciken/gelmeyen, bekleyen izin, geciken görev, açık saha bildirimi, ekip müşteri puanı 30 gün), altında `?tab=` ile derin bağlanabilen 6 sekme: **Ekip · Vardiya planı · Görevler · Onaylar · Saha · Eğitim ve kontrol**. Ağır sekmeler `next/dynamic` ile yalnız açıldığında yüklenir; sekme/hafta değişimi sunucu turu yapmaz (`history.replaceState`). Modül kapısı (`staff_management`) sayfada ve TÜM bayi personel uçlarında. QDL v2 (`PanelPage`, `PageHeader`, `MetricTile`, `SectionTabs`, `DetailSheet`, `StatusBadge`, `ConfirmAction`, `QueryState`), ops kaydı; hareket yalnız liste giriş/çıkışı ve layout (150–200 ms, `useMotionPolicy` ile azaltılmış harekette anlık). Testler: `__tests__/staff-ops/core.test.ts`, `__tests__/staff-ops/routes.test.ts`.

### Özellik envanteri — yeni durum

| # | Özellik | Yeni durum | Not |
|---|---|---|---|
| 1 | Sayfa başlığı + açıklama | ÇALIŞIYOR | DS `PageHeader`, her genişlikte; "güncellendi X önce" meta. |
| 2 | Mobil başlık kartı | ÇALIŞIYOR | Tek başlık; aksiyon mobilde de görünür. |
| 3 | "Personel ekle" butonu | ÇALIŞIYOR | "Personel davet et" — mobilde görünür (+ boş durum CTA). |
| 4 | 6 sekmeli yapı | ÇALIŞIYOR | Sekme URL'de (`?tab=ekip/vardiya/gorevler/onaylar/saha/egitim`). |
| 5 | Sekmede sayı | ÇALIŞIYOR | Aktif ekip, açık görev, bekleyen izin, açık saha bildirimi; filtrede aktif/pasif/davet sayıları. |
| 6 | Yükleniyor durumu | ÇALIŞIYOR | `QueryState` + sekme iskeletleri; yükleme sırasında yanlış boş durum yok. |
| 7 | Boş durum + CTA | ÇALIŞIYOR | Davet akışını anlatan dürüst metin. |
| 8 | Personel kartı | ÇALIŞIYOR | Ad, unvan, bugünkü vardiya + katılım rozeti, 30 gün puanı, açık görev. |
| 9 | Personel avatarı | ÇALIŞIYOR | `user.image` varsa fotoğraf, yoksa baş harfler. |
| 10 | "Pasif" rozeti | ÇALIŞIYOR | Hub pasifleri de döndürür; Aktif / Pasif / Davet bekleyen filtresi. |
| 11 | Düzenle butonu | ÇALIŞIYOR | Kartın tamamı adlandırılmış buton → sağdan detay paneli (`DetailSheet`). |
| 12 | Ekle: İsim | KALDIRILDI | Davet akışında adı davetli kendisi girer (bayi başkasının kimliğini yazmaz). |
| 13 | Ekle: E-posta | ÇALIŞIYOR | `StaffInvitation` daveti (A3); hesap ele geçirme dalı P0'da kapandı, arayüz artık davet; bekleyen davetlerde "Yeniden gönder" / "İptal et". |
| 14 | Ekle: Şifre | KALDIRILDI | Bayi şifre belirlemez; davetli bağlantıdan kendi şifresini kurar. |
| 15 | Ekle: Pozisyon | ÇALIŞIYOR | Unvan + hazır rol çipleri (Garson, Kasiyer, Barista, Aşçı, Şef, Vardiya sorumlusu, Müdür). İzin matrisi → ŞEMA İSTEĞİ. |
| 16 | Ekle: PIN | KALDIRILDI | Hiçbir akışta kullanılmıyordu (sahte vaat). API maskeyi "değişmedi" sayar. |
| 17 | İstemci doğrulaması | ÇALIŞIYOR | E-posta biçimi istemcide + zod sunucuda, Türkçe mesaj. |
| 18 | Gönderim + toast | ÇALIŞIYOR | Sunucunun Türkçe mesajı; e-posta gidemezse uyarı + "Yeniden gönder". |
| 19 | Düzenle: Pozisyon | ÇALIŞIYOR | Detay panelinde, zod `max(50)`. |
| 20 | Düzenle: PIN | KALDIRILDI | Bkz. #16. |
| 21 | Aktif/Pasif | ÇALIŞIYOR | Onay diyaloğu; pasifleştirmede `bumpSessionVersion` (açık oturumlar düşer, A2) + Redis kapsam/oturum önbelleği silinir; `requireAuth` STAFF_INACTIVE; `/staff` layout'u pasif ekranı gösterir. Geri alınabilir ("Yeniden etkinleştir"). |
| 22 | Düzenle → Kaydet | ÇALIŞIYOR | Yalnız değişen alan gönderilir. |
| 23 | Personel silme | KALDIRILDI | İlke "cascade silme yok (arşiv)": pasif = arşiv; geçmiş vardiya/görev/puantaj ve geri bildirim atfı korunur. |
| 24 | Görevler listesi | ÇALIŞIYOR | Atanan, son tarih, gecikme vurgusu, Türkçe durum rozeti; açık → kapalı sıralama (`compareTasks`). Açık / Geciken / Kapanan filtresi. |
| 25 | Görev oluşturma | ÇALIŞIYOR | Hızlı görev formu (kişi, son tarih, açıklama); personele bildirim. |
| 26 | Görev düzenle/iptal/yeniden aç | ÇALIŞIYOR | `PATCH /api/dealer/staff/tasks/[id]` (koşullu geçiş, yeniden atama yalnız aktif personele, denetim kaydı). |
| 27 | Vardiyalar listesi | ÇALIŞIYOR | Haftalık kişi × gün ızgarası (masaüstü) + gün bazlı liste (mobil), hafta gezinme; eski GET'in varsayılan penceresi düzeltildi. |
| 28 | Vardiya oluşturma | ÇALIŞIYOR | Hücreden ekle; `HH:mm`, aynı saat ve 16 sa sınırı, gece vardiyası; "Geçen haftayı kopyala" (çift kayıt üretmez); düzenle/kaldır (giriş yapılmamışsa). |
| 29 | Puantaj görünümü | ÇALIŞIYOR | Katılım rozeti (bekleniyor/gecikti/vardiyada/tamamladı/gelmedi), gecikme dk, çalışılan süre; yönetici düzeltmesi denetim kaydıyla. |
| 30 | İzin talepleri listesi | ÇALIŞIYOR | Gerekçe, gün sayısı, son 30 günün kararları. |
| 31 | İzin onay/red | ÇALIŞIYOR | Onay kuyruğu, vardiya çakışma uyarısı, koşullu karar (409), personele bildirim. |
| 32 | Eğitim modülleri listesi | ÇALIŞIYOR | Platform/işletme ayrımı, "x/y kişi tamamladı" çubuğu, kişi × modül matrisi. |
| 33 | Eğitim oluştur/düzenle | ÇALIŞIYOR | Editör (≤ 20.000 karakter), arşivle (silme yok). |
| 34 | Checklist listesi | ÇALIŞIYOR | Türkçe tür rozeti, madde sayısı, son tamamlayan. |
| 35 | Checklist oluştur/düzenle | ÇALIŞIYOR | Madde editörü (ekle/sil/sırala/zorunlu, ≤ 50), arşivle. |
| 36 | Checklist uyum geçmişi | ÇALIŞIYOR | Son 7 günün günlük uyum şeridi (İstanbul günü). |
| 37 | Hata durumu | ÇALIŞIYOR | Görünür hata + "Tekrar dene"; yeni/yeniden yazılan uçlar `defineRoute` (merkezi hata zarfı, 503 ayrımı). |
| 38 | Modül kapısı | ÇALIŞIYOR | Sayfa + hub + tüm `/api/dealer/staff/**` uçları (eski uçlara da `assertModuleEnabled` eklendi). |
| 39 | Arama/filtre/sayfalama | ÇALIŞIYOR | Ekipte arama + durum filtresi; görev filtreleri; vardiyada hafta sayfalaması. Liste sınırları sunucuda. |
| 40 | Personel bazlı müşteri geri bildirimi | ÇALIŞIYOR | `Feedback.dealerStaffId` 30 gün ortalaması + adet (kart, detay paneli, KPI). |
| 41 | Metadata | ÇALIŞIYOR | Sayfaya özgü TR/EN başlık ve açıklama (gerçek akışları anlatır). |
| 42 | Çok dillilik | ÇALIŞIYOR | `components/dealer/b-ekip/copy.ts` TR/EN; ham enum yok. |
| 43 | "API kullanın" açıklamaları | KALDIRILDI | Yerine gerçek arayüzler ve dürüst boş durumlar. |

### Kapanan bulgular (16/16)
1 (davet akışı arayüze bağlandı; ele geçirme dalı P0'da kapalıydı) · 2 (pasif → istek reddi + oturum iptali + panel kapısı) · 3 (PIN arayüzü kaldırıldı, maske "değişmedi", denetimde yalnız `pinChanged`) · 4 (pasif filtre + yeniden etkinleştir; silme yerine arşiv) · 5 (beş sekmenin de yazma arayüzü) · 6 (izin onay kuyruğu + bildirim) · 7 (vardiya haftalık pencere, görev sıralaması) · 8 (mobil birincil aksiyon) · 9 (PIN kaldırıldı) · 10 (davet akışı; davet rate limit) · 11 (modül kapısı her uçta) · 12 (TR/EN sözlük, Türkçe sunucu mesajları) · 13 (QueryState, görünür hata) · 14 (metadata/açıklamalar) · 15 (etiket–kontrol bağları, `aria-label`, ≥ 44 px hedefler, onaylı eylemler) · 16 (`any` yok, sekme başına dosya, DTO'lar `lib/staff-ops/types.ts`).

Eksik özelliklerden uygulananlar: 1 (personel bazlı müşteri karnesi), 3 (haftalık plan + kopyalama + puantaj + izin çakışması), 4 (görev atama + bildirim), 5 (eğitim tamamlanma matrisi), 6 (checklist uyumu). Ayrıca "Saha" sekmesi (eski `/staff/field` birleşmesi; görüldü/çözüldü döngüsü).

### Kalanlar
- **Rol/izin matrisi** (ör. vardiya sorumlusu izin onaylasın): `DealerStaff`'ta rol alanı yok; unvan serbest metin. → ŞEMA İSTEĞİ: `DealerStaff.role` (staff/cashier/chef/manager) + davet kabulünde `StaffInvitation.role` aktarımı.
- **Koltuk kotası** (`maxStaffSeats`): plan modelinde alan yok → ŞEMA/plan isteği.
- **Kiosk / PIN ile ortak cihaz girişi**: kapsam dışı (PIN arayüzü kaldırıldı).
- **Bordro CSV dışa aktarma** ve sürükle-bırak vardiya: bu dalgada yapılmadı (hücreye dokun → ekle mevcut).
- **Tek görev modeli** (ActionItem/Incident/StaffTask): personel kendisine atanan vaka/aksiyonları artık "Bugün" ekranında görür (salt okunur); birleşik model ayrı iş.
