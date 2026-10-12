# Tasarım iyileştirme turu: özet (2026-10-12, feat/platform-overhaul)

Kapsam: mevcut QDL v2 dili korunarak cila. Yeni marka, palet ya da yön yok.
Kalite kapıları (tur sonu): `tsc` filtresiz **0 hata**, `npx jest` **359/359 suite, 5089/5089 test** geçti.

## Alan başına değişiklikler

| Alan | Commit | Ne değişti |
|---|---|---|
| Müşteri | 7b244966 (+ çerez bandı b15ab118 içinde) | İlk açılış tek sıra (çerez bandı video/tanıtım bitince çıkıyor), Oyna durum şeridi tek panel ve sayı tipografisi, Ben bölümleri gruplu liste, Seslerim istatistikleri 2 sütun, alt sekmede hap gösterge ve TARA basma geri bildirimi |
| Günlük çark | a422c6a0 | Kart düz yüzey ve kenardan taşan çark, kullanılmış hakta geri sayım ve merak metni; tam ekran rAF fiziği (geri çekme, hızlanma, sürtünme, geri sekme), çivi-ibre, hız bulanıklığı |
| Bayi | 5ae5487b | KPI ızgaralarında mobilde yetim boş hücre yok (son kutu satırı dolduruyor); anket grafiği ortak `CHART_THEME`'e bağlandı |
| Admin | e9226b97 | "ops" kayıtlı sayfalarda sakin KPI (renkli ikon kutusu yok, 0 değer alarm rengi almıyor, mobilde 2 sütun), tek başlık ritmi, ⌘K paleti rafine, kullanıcı tablosu araç çubuğu |
| Public landing | 30b22d1a | "Dört adımda kazan": glow/gradient ikon kartları yerine bağlı adım akışı, numara hiyerarşisi |
| Tema/animasyon | 65b436ae | 4 operasyon yükleme iskeletinde `animate-pulse` kaldırıldı (statik) |
| Perf-2 | b15ab118 | Ortak JS 255.9 → 228.9 KB gz (tercih merkezi, native köprü, efektler, tema kataloğu ilk yükten çıkarıldı) |
| Mobil uygulama | 7d933a32 | Android/iOS bulut derleme iş akışları, ikon ve açılış seti, izin metinleri, gizlilik manifesti (derlenmedi; ilk Actions koşusunda sınanacak) |

## Gözden geçirme turunda yapılan düzeltmeler

- `components/ds/command-palette.tsx`: ⌘K klavye ipucu `text-[11px]` → `text-xs`. Admin turu 12px altı metin sayısını tasarım sapma eşiğinin üstüne çıkarmıştı (121 > 120, `design-guards` testi kırıktı).
- `lib/pii-registry.ts`: şema göçünün (b884625c) eklediği `UserSurpriseBox.withdrawnById`, `TeamInvitation.invitedById` ve `TeamInvitation.acceptedUserId` ilişkileri PII envanterine aktör olarak eklendi (`pii-registry` testi kırıktı).
- `musteri/sonra-C`: Git Bash yol dönüşümünden kalan boş dosya silindi.
- Örneklenen sonra görüntülerinde (müşteri Ben/Oyna, admin Komuta, landing, çark kartı, bayi Gelen Kutusu) görsel regresyon görülmedi.

## Önce/sonra görselleri

Hepsi `docs/design/iyilestirme/` altında, `{390,1440}-{light,dark}` dörtlüleri:

- `musteri/`: `once-*` / `sonra-*` → discover, feedbacks, games, home, me, wallet
- `admin/`: `once-*` / `sonra-*` → ai, badges, economy, games, komuta, navigation, palet, privacy, settings, trust, users
- `cark/`: `kart-once-*`; `sonra-kart-hazir-*`, `sonra-kart-kullanildi-*`, `sonra-cark-hazir-*`, `sonra-cark-donerken-*`, `sonra-cark-sonuc-*`; azaltılmış hareket: `sonra-rm-*`; video: `cark-cevirme-*.webm`
- `bayi/`: önce yalnız 390 açık (analytics, campaigns, consumptions, customers, inbox); sonra customers ve inbox dörtlüsü
- `public-landing/`: `once-landing-*` / `sonra-landing-*`
- `perf-2/`: ölçüm çıktısı
- Tema/animasyon ve mobil uygulama için görsel yok.

## Kalan işler

- **Bayi:** cilanın çoğu yapılmadı. Analitik, kampanya ve tüketim ekranlarının sonra görüntüleri yok. axe ve kontrast taraması yapılmadı.
- **Public/auth:** landing dışındaki ekranlara dokunulmadı.
- **Tema/animasyon:** önce/sonra görseli yok. 7 dosyada `animate-pulse` duruyor (chatbot, character-reveal, battle-card, message-bubble, signature-gift-box-lazy, avatar-frame, lab/zoom); bunların anlamlı mı olduğu tek tek değerlendirilmeli.
- **Çark:** gerçek `/api/gamification/spin` ile uçtan uca çevirme denenmedi (testlerde sahte yanıt kullanıldı).
- **Müşteri:** gerçek ilk girişte çerez/tanıtım sırası uçtan uca denenmedi.
- **Mobil:** Android ve iOS ilk kez GitHub Actions'ta derlenecek; secrets'ın girilmesi gerekiyor.
- **Genel:** tur boyunca axe/kontrast/dokunma hedefi taraması toplu çalıştırılmadı. Canlıya almadan önce bu tarama ve prod build yapılmalı.
- **Ürün kararları** (personel tüketim listesi görünümü, bayi telafi bütçesi, admin zorunlu fayda) bu turun kapsamında değildi.

## İkinci tur (paralel ajanlar)

Doğrulama: tsc 0 hata (filtresiz), `npx jest` 359 suite / 5091 test yeşil.

- **Bayi gelen kutusu** (`fcff3115`): liste satırları gölgesiz, hover'da kenar; sinyal rozetleri en fazla 2 + "+N"; kurulum kartında ikon kutusu kalktı, biten adımlar sönük.
- **Bayi asistan/içgörü** (`96aa7635`): asistan QDL tip ölçeği ve ton bantlarına bağlandı; içgörü önerileri kart-içi-kart yerine bölünmüş liste; tek bağlantılık AI öğrenme kartı kalktı.
- **Bayi kasa/ayarlar/ekip/otomasyon** (`f1d94049`): kasa birincil eylemleri 56px; parlak ikon kutuları sade ikon; küçük dokunma hedefleri 44px.
- **Landing** (`69fd40f3`): hero gerçek ürün ekranı (webp, öncelikli), kısa başlıklar, rakam şeridi başlıklı, gradyan kartlar sade listeye, SSS iki sütun.
- **Public/auth** (`32cd5202`): form kartlarında süs ikon daireleri kalktı; 404/500 düz zemin + hata referansı; neden-qratex ve güven sayfası eşit ağırlıklı kartlardan listeye.
- **Koyu tema** (`f2eb8345`): yükselti tonları ayrıştı (kart 9, yüzey-2/popover 12.5, muted 15, sınır 20); koyu grafik renkleri aydınlatıldı.
- **Animasyon** (`f8b6b597`): operasyon yüzeylerinde süre/eğri değerleri `lib/motion` token'larına; sohbet FAB'ındaki sonsuz parıltı ve dekoratif nabız kalktı.
- **Sayan sayı** (`8cf5740c`): `components/ds/data/animated-number.tsx`; cüzdan/ana bakiye, PointsChip, çark sonucu, Yılım sayacı bağlandı.
- **⌘K** (`98cd661b`): sıralı harf bulanık eşleşme; admin aramasında Kartlar ve Bayiler grupları.
- **Liste/onay hareketi** (`2f0dfbe6`): `lib/motion/collapse-list.tsx` ile silinen satırın boşluğu yumuşak kapanır; `InlineConfirm` yerinde onay.
- **Müşteri kalanlar** (`58d8eb89`): lig şeridi sıra vurgusu, mekân kartında kimlik önce, çift tonlu ikon kutuları sadeleşti, klan boş durumu.

### Görüntüler

Bu turda yeni `sonra-*.png` alınmadı; mevcut görüntüler yukarıdaki listede. Landing için `public/images/landing/musteri-ana.webp` ve `isletme-bugun.webp` eklendi.

### Kalanlar (ikinci tur)

- Bu turun hiçbir değişikliği tarayıcıda gözle doğrulanmadı; 390/1440 açık/koyu sonra görüntüleri alınmalı (özellikle koyu tema tonları, collapse animasyonu, InlineConfirm).
- Bayi: kapsamdaki ekranların hepsi elden geçmedi (analitik, kampanya, tüketim derin cila bekliyor).
- Public/auth: bazı ekranlara dokunulmadı.
- Animasyon: yalnız operasyon yüzeyleri ele alındı; kalan `animate-pulse` kullanımları değerlendirilmeli.
- Müşteri: `home-screen.tsx` ve bakiye kartları çakışma nedeniyle bu turda düzenlenmedi.
- axe/kontrast taraması ve prod build hâlâ yapılmadı.
