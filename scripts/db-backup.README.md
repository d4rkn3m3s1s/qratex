# Veritabanı yedekleri: kurulum, şifreleme ve geri yükleme

Bu belge `scripts/db-backup.mjs` (pg_dump), `scripts/db-backup-json.mjs` (Prisma JSON) ve
`scripts/db-restore.mjs` (çözme/indirme) betiklerini anlatır. Ortak güvenlik katmanı
`scripts/db-backup-lib.mjs` içindedir. Denetim kaydı: P0-30 (`docs/audit/2026-10-08/00-YOL-HARITASI.md`),
K1 ve O9 (`docs/audit/2026-10-08/sistem/arka-plan-sistemleri.md`).

## Neden değişti

Eski betikler yedeği uygulamanın `R2_BUCKET` kovasına yazıyordu. Uygulama yüklemeleri bu kovadan
`R2_PUBLIC_URL` ile herkese açık sunuluyor ve R2'de herkese açık erişim önek bazında kısıtlanamıyor.
Dosya adları saniye çözünürlüklü zaman damgasıydı, içerik de şifresizdi. Yani tam veritabanı dökümü
(parola hash'leri, TOTP sırları, jetonlar, e-postalar) tahmin edilebilir bir adreste duruyordu.

Artık:

| Kural | Nasıl uygulanıyor |
|---|---|
| Ayrı, özel kova | Yalnız `BACKUP_R2_*` okunur. `R2_*`'ye geri düşüş yok; eksikse betik **fail** eder. `BACKUP_R2_BUCKET` = `R2_BUCKET` ya da aynı erişim anahtarı kullanılırsa yine fail eder. |
| İstemci tarafı şifreleme | AES-256-GCM, anahtar `BACKUP_ENCRYPTION_KEY` (32 bayt). Düz metin döküm yalnız geçici dizinde durur ve şifrelemeden hemen sonra silinir. `--local-only` çıktısı da şifrelidir. |
| Tahmin edilemez ad | `db/<tür>/<YYYY-MM-DD>/qratex-<damga>-<32 hex>.<uzantı>.enc` (128 bit rastgele sonek). |
| Doğrulama | Yüklemeden önce şifreli dosya çözülür ve özeti kaynakla karşılaştırılır. |
| Sessiz eksik yok | JSON yedeğinde okunamayan model varsa yedek başarısız sayılır (`--allow-skip` ile bilerek geçilebilir). |
| Alarm | `BACKUP_HEARTBEAT_URL` tanımlıysa başarıda URL'ye, hatada `<URL>/fail`'e ping atılır. |

## Bir kerelik kurulum (proje sahibi)

1. **Cloudflare R2 → Create bucket:** ör. `qratex-backups`.
   - Public access: **kapalı** (r2.dev alt alanı ve özel alan adı **bağlama**).
   - Mümkünse **Object Lock / bucket lock** (ör. 30 gün) ve **yaşam döngüsü kuralı** (ör. 35 günden eski
     nesneleri sil) tanımla. Budamayı betik yerine kova kuralı yapar.
2. **R2 → Manage API tokens → Create API token:**
   - *Yazma token'ı* (yedek alan makine için): yalnız `qratex-backups` kovası, **Object Write**.
     Okuma/silme yetkisi verme.
   - *Okuma token'ı* (yalnız geri yükleme sırasında, parola yöneticisinde): yalnız bu kova, **Object Read**.
   - Uygulamanın kendi token'ı bu kovaya erişememeli.
3. **Şifreleme anahtarı üret** ve parola yöneticisine kaydet (R2'ye, depoya ya da Vercel'e KOYMA):

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   Anahtar kaybolursa yedekler **açılamaz**. En az iki ayrı yerde (ör. parola yöneticisi + çevrim dışı
   not) sakla.
4. Yedek alan makinenin ortamına (ya da o makinedeki `.env`'e) şunları ekle:

   ```env
   BACKUP_R2_ACCOUNT_ID=...
   BACKUP_R2_ACCESS_KEY_ID=...          # yazma token'ı
   BACKUP_R2_SECRET_ACCESS_KEY=...
   BACKUP_R2_BUCKET=qratex-backups
   # BACKUP_R2_PREFIX=db/               # isteğe bağlı
   BACKUP_ENCRYPTION_KEY=...            # 44 karakter base64 ya da 64 hex
   # BACKUP_HEARTBEAT_URL=https://hc-ping.com/<uuid>   # isteğe bağlı, önerilir
   # BACKUP_DATABASE_URL=...            # isteğe bağlı: salt okunur rol ile pooler'sız adres
   ```

5. Eski açık yedekler: `R2_BUCKET` içindeki `backups/` öneki silinmiş olmalı (2026-10 itibarıyla
   silindi). Kova herkese açıkken orada yedek durduysa sızıntı varsayılıp sırlar döndürülmeli:
   `NEXTAUTH_SECRET`, admin kapısı HMAC anahtarı, TOTP'li kullanıcılar için yeniden kayıt, açık
   oturumların iptali.

## Yedek alma

```sh
node scripts/db-backup.mjs                 # pg_dump → gzip → şifrele → yedek kovası
node scripts/db-backup.mjs --local-only    # şifreli dosyayı bulunduğun dizine yaz
node scripts/db-backup.mjs --keep 14       # yalnız List+Delete yetkili token'la; aksi hâlde kova kuralı
node scripts/db-backup-json.mjs            # pg_dump yoksa: Prisma ile JSON veri yedeği
```

Çıkış kodları: `0` başarılı, `1` yedek alınamadı (hiçbir şey yüklenmedi), `3` yedek yüklendi ama
budama başarısız.

## Çözme ve geri yükleme

`db-restore.mjs` **veritabanına dokunmaz**. Dosyayı çözer ve sonraki komutu ekrana yazar.

```sh
# Kovadaki yedekleri listele (okuma token'ı: BACKUP_R2_READ_ACCESS_KEY_ID / _SECRET_ACCESS_KEY)
node scripts/db-restore.mjs --list --kind pg

# En yeni pg yedeğini indir, çöz ve aç (.sql)
node scripts/db-restore.mjs --latest --kind pg --gunzip

# Elindeki şifreli dosyayı yalnız doğrula / çöz
node scripts/db-restore.mjs --verify --file qratex-...sql.gz.enc
node scripts/db-restore.mjs --file qratex-...sql.gz.enc --gunzip
```

Geri yükleme her zaman önce **yeni bir Neon branch'ine** yapılır:

```sh
psql "<YENİ_BRANCH_DIRECT_URL>" -v ON_ERROR_STOP=1 -f qratex-....sql
```

Satır sayıları ve kritik tablolar (User, PointsLedger, Feedback, Dealer) doğrulandıktan sonra uygulama
o branch'e çevrilir. Çözülmüş dosya bütün veritabanıdır; iş bitince sil.

## Şifreli dosya biçimi (QRXBK1)

| Bayt | İçerik |
|---|---|
| 0–5 | `QRXBK1` |
| 6 | sürüm (1) |
| 7 | ayrılmış (0) |
| 8–15 | anahtar parmak izi: SHA-256(anahtar) ilk 8 bayt (yanlış anahtarı açık hatayla bildirmek için) |
| 16–27 | IV (12 bayt, her dosyada rastgele) |
| 28 … N−16 | şifreli metin |
| N−16 … N | GCM doğrulama etiketi |

İlk 28 bayt AAD olarak doğrulanır. Değiştirilmiş dosyada çözme başarısız olur ve yarım çıktı bırakılmaz.

## Açık kalanlar

- Zamanlama hâlâ bir makineye bağlı. Hedef: GitHub Actions `schedule` + `postgres:17` imajı +
  bu betik + heartbeat (denetim O9).
- Aylık otomatik geri yükleme tatbikatı (Neon branch → `psql` → satır sayısı karşılaştırması) henüz yok.
- JSON yedeği tabloları sayfalamadan okur ve tablolar arası tutarlı anlık görüntü vermez; yalnız acil
  durum aracıdır.
