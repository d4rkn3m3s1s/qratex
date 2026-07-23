import crypto from 'crypto';
import type * as forge from 'node-forge';
import { BRAND_PRIMARY_HEX } from '@/lib/brand-colors';

// ─────────────────────────────────────────────────────────────
// APPLE WALLET PASS GENERATION
// ─────────────────────────────────────────────────────────────
//
// Canlıda gerekli env (hepsi zorunlu, aksi halde route 503 döner):
//  - APPLE_PASS_TYPE_IDENTIFIER : pass type id (pass.com.qratex.card)
//  - APPLE_TEAM_IDENTIFIER      : Apple Developer Team ID (yoksa 'XXXXXXXXXX')
//  - APPLE_PASS_CERT_P12_BASE64 : Pass Type sertifikası + key (.p12, base64)
//  - APPLE_PASS_CERT_PASSWORD   : .p12 parolası
//  - APPLE_WWDR_CERT_BASE64     : Apple WWDR ara sertifikası (PEM/DER base64)
// İmza node-forge ile gerçek detached PKCS#7/CMS olarak üretilir (signManifest).
//

interface PassData {
  serialNumber: string;
  customerName: string;
  customerId: string;
  cardToken: string;
  cardId: string;
  points: number;
  level: number;
  activatedAt?: Date;
}

/**
 * Generate pass.json content for Apple Wallet
 */
export function generatePassJson(data: PassData): object {
  const passTypeId = process.env.APPLE_PASS_TYPE_IDENTIFIER || 'pass.com.qratex.card';
  const teamId = process.env.APPLE_TEAM_IDENTIFIER || 'XXXXXXXXXX';
  const webServiceURL = process.env.NEXT_PUBLIC_APP_URL || 'https://qratex.com';
  
  return {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: data.serialNumber,
    teamIdentifier: teamId,
    organizationName: 'QRateX',
    description: 'QRateX Müşteri Kartı',
    logoText: 'QRateX',
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(99, 102, 241)', // Indigo-500
    labelColor: 'rgb(199, 210, 254)', // Indigo-200
    
    // Barcode configuration
    barcode: {
      message: `${webServiceURL}/c/${data.cardToken}`,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText: data.cardToken.slice(-8).toUpperCase(),
    },
    
    // Also include barcodes array for iOS 9+
    barcodes: [
      {
        message: `${webServiceURL}/c/${data.cardToken}`,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1',
        altText: data.cardToken.slice(-8).toUpperCase(),
      },
    ],
    
    // Generic pass type for membership cards
    generic: {
      primaryFields: [
        {
          key: 'member',
          label: 'ÜYE',
          value: data.customerName,
        },
      ],
      secondaryFields: [
        {
          key: 'points',
          label: 'PUAN',
          value: data.points.toString(),
        },
        {
          key: 'level',
          label: 'SEVİYE',
          value: data.level.toString(),
        },
      ],
      auxiliaryFields: [
        {
          key: 'cardId',
          label: 'KART ID',
          value: `•••• ${data.cardToken.slice(-8)}`,
        },
      ],
      backFields: [
        {
          key: 'info',
          label: 'Kart Bilgisi',
          value: 'Bu kart QRateX sisteminde tüketim kaydı oluşturmak için kullanılır. Bayilere göstererek puanlarınızı kullanabilirsiniz.',
        },
        {
          key: 'website',
          label: 'Web Sitesi',
          value: webServiceURL,
        },
        {
          key: 'activated',
          label: 'Aktivasyon Tarihi',
          value: data.activatedAt?.toLocaleDateString('tr-TR') || '-',
        },
      ],
    },
    
    // Web service for updates (optional)
    // webServiceURL: webServiceURL,
    // authenticationToken: generateAuthToken(data.serialNumber),
  };
}

/**
 * Generate manifest.json with SHA1 hashes of all files
 */
export function generateManifest(files: Map<string, Buffer>): object {
  const manifest: Record<string, string> = {};
  
  files.forEach((content, filename) => {
    const hash = crypto.createHash('sha1').update(content).digest('hex');
    manifest[filename] = hash;
  });
  
  return manifest;
}

/**
 * manifest.json'ı Apple sertifikasıyla DETACHED PKCS#7 (CMS) olarak imzalar.
 * Apple Wallet, .pkpass içindeki "signature" dosyasının manifest üzerinde bu
 * formatta bir imza olmasını şart koşar; aksi halde iOS pass'i reddeder.
 *
 * Gerekli env:
 *  - APPLE_PASS_CERT_P12_BASE64   : Pass Type ID sertifikası + private key (.p12, base64)
 *  - APPLE_PASS_CERT_PASSWORD     : .p12 parolası
 *  - APPLE_WWDR_CERT_BASE64       : Apple WWDR ara sertifikası (PEM veya DER, base64)
 *
 * node-forge ile: .p12'den signer cert + key çıkarılır, WWDR zincire eklenir,
 * manifest üzerinde detached imza DER olarak üretilir. Yapılandırma eksik veya
 * sertifika ayrıştırılamazsa NET hata fırlatır (sessizce imzasız dönmez).
 */
export async function signManifest(manifest: Buffer): Promise<Buffer> {
  const certP12Base64 = process.env.APPLE_PASS_CERT_P12_BASE64;
  const certPassword = process.env.APPLE_PASS_CERT_PASSWORD;
  const wwdrCertBase64 = process.env.APPLE_WWDR_CERT_BASE64;

  if (!certP12Base64 || !certPassword) {
    throw new Error('Apple Pass certificates not configured (APPLE_PASS_CERT_P12_BASE64 / APPLE_PASS_CERT_PASSWORD eksik)');
  }
  if (!wwdrCertBase64) {
    throw new Error('Apple WWDR ara sertifikası yapılandırılmamış (APPLE_WWDR_CERT_BASE64 eksik)');
  }

  const f = (await import('node-forge')).default;

  // 1) .p12'yi aç → signer sertifikası + private key.
  const p12Der = f.util.decode64(certP12Base64);
  const p12Asn1 = f.asn1.fromDer(p12Der);
  const p12 = f.pkcs12.pkcs12FromAsn1(p12Asn1, certPassword);

  const certBags = p12.getBags({ bagType: f.pki.oids.certBag });
  const keyBags = p12.getBags({ bagType: f.pki.oids.pkcs8ShroudedKeyBag });
  const certBag = certBags[f.pki.oids.certBag]?.[0];
  const keyBag = keyBags[f.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  if (!certBag?.cert || !keyBag?.key) {
    throw new Error('Apple .p12 içinden sertifika/anahtar çıkarılamadı (parola yanlış olabilir)');
  }

  // 2) WWDR ara sertifikasını yükle (PEM ya da DER base64).
  let wwdrCert: forge.pki.Certificate;
  const wwdrRaw = f.util.decode64(wwdrCertBase64);
  if (wwdrRaw.includes('-----BEGIN CERTIFICATE-----')) {
    wwdrCert = f.pki.certificateFromPem(wwdrRaw);
  } else {
    wwdrCert = f.pki.certificateFromAsn1(f.asn1.fromDer(wwdrRaw));
  }

  // 3) Detached PKCS#7/CMS imzası üret.
  const p7 = f.pkcs7.createSignedData();
  p7.content = f.util.createBuffer(manifest.toString('binary'));
  p7.addCertificate(certBag.cert);
  p7.addCertificate(wwdrCert);
  p7.addSigner({
    // PEM string olarak ver — forge'un iki ayrı PrivateKey tipi arasındaki
    // uyumsuzluğunu aşar ve addSigner'ın kabul ettiği biçimdir.
    key: f.pki.privateKeyToPem(keyBag.key as forge.pki.PrivateKey),
    certificate: certBag.cert,
    digestAlgorithm: f.pki.oids.sha256,
    authenticatedAttributes: [
      { type: f.pki.oids.contentType, value: f.pki.oids.data },
      { type: f.pki.oids.messageDigest },
      { type: f.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign({ detached: true });

  // 4) DER'e çevir → "signature" dosyası içeriği.
  const der = f.asn1.toDer(p7.toAsn1()).getBytes();
  return Buffer.from(der, 'binary');
}

/**
 * Create .pkpass file (ZIP archive)
 */
export async function createPkPass(data: PassData): Promise<Buffer> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  
  // Generate pass.json
  const passJson = generatePassJson(data);
  const passJsonBuffer = Buffer.from(JSON.stringify(passJson, null, 2));
  
  // Add files to the pass
  const files = new Map<string, Buffer>();
  files.set('pass.json', passJsonBuffer);
  
  // Add icon files (these should exist in public/pass/)
  // For now, we'll create placeholder entries
  // In production, you'd read actual image files
  
  // Generate manifest
  const manifest = generateManifest(files);
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
  files.set('manifest.json', manifestBuffer);
  
  // Sign the manifest (requires Apple certificates). İmza ZORUNLUDUR — imzasız
  // .pkpass iOS tarafından reddedilir; bu yüzden sessizce atlamak yerine hata fırlat.
  const signature = await signManifest(manifestBuffer);
  files.set('signature', signature);
  
  // Add all files to ZIP
  files.forEach((content, filename) => {
    zip.file(filename, content);
  });
  
  // Generate ZIP buffer
  return await zip.generateAsync({ type: 'nodebuffer' });
}


// ─────────────────────────────────────────────────────────────
// GOOGLE WALLET PASS GENERATION
// ─────────────────────────────────────────────────────────────

interface GooglePassData {
  id: string;
  classId: string;
  customerName: string;
  customerId: string;
  cardToken: string;
  points: number;
  level: number;
  email?: string;
}

/**
 * Generate Google Wallet Generic Pass Object
 */
export function generateGooglePassObject(data: GooglePassData): object {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID || '';
  const webServiceURL = process.env.NEXT_PUBLIC_APP_URL || 'https://qratex.com';
  
  return {
    id: `${issuerId}.${data.id}`,
    classId: `${issuerId}.${data.classId}`,
    genericType: 'GENERIC_TYPE_UNSPECIFIED',
    hexBackgroundColor: BRAND_PRIMARY_HEX,
    logo: {
      sourceUri: {
        uri: `${webServiceURL}/logo/logo.png`,
      },
      contentDescription: {
        defaultValue: {
          language: 'tr',
          value: 'QRateX Logo',
        },
      },
    },
    cardTitle: {
      defaultValue: {
        language: 'tr',
        value: 'QRateX Kartı',
      },
    },
    subheader: {
      defaultValue: {
        language: 'tr',
        value: 'Müşteri Kartı',
      },
    },
    header: {
      defaultValue: {
        language: 'tr',
        value: data.customerName,
      },
    },
    barcode: {
      type: 'QR_CODE',
      value: `${webServiceURL}/c/${data.cardToken}`,
      alternateText: data.cardToken.slice(-8).toUpperCase(),
    },
    textModulesData: [
      {
        id: 'points',
        header: 'PUAN',
        body: data.points.toString(),
      },
      {
        id: 'level',
        header: 'SEVİYE',
        body: data.level.toString(),
      },
    ],
    linksModuleData: {
      uris: [
        {
          uri: `${webServiceURL}/customer/my-card`,
          description: 'Kartımı Görüntüle',
          id: 'view-card',
        },
      ],
    },
  };
}

/**
 * Generate JWT for Google Wallet "Save to Google Wallet" button
 * Note: Requires Google Cloud Service Account credentials
 */
export async function generateGoogleWalletJWT(passObject: object): Promise<string> {
  const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_WALLET_PRIVATE_KEY;
  
  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Google Wallet credentials not configured');
  }
  
  const jwt = await import('jsonwebtoken');
  
  const claims = {
    iss: serviceAccountEmail,
    aud: 'google',
    origins: [process.env.NEXT_PUBLIC_APP_URL || 'https://qratex.com'],
    typ: 'savetowallet',
    payload: {
      genericObjects: [passObject],
    },
  };
  
  const token = jwt.default.sign(claims, privateKey.replace(/\\n/g, '\n'), {
    algorithm: 'RS256',
  });
  
  return token;
}

/**
 * Generate Google Wallet "Save" URL
 */
export function getGoogleWalletSaveUrl(jwt: string): string {
  return `https://pay.google.com/gp/v/save/${jwt}`;
}


// ─────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Generate unique serial number for passes
 */
export function generateSerialNumber(userId: string, cardId: string): string {
  const data = `${userId}-${cardId}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
}

/**
 * Generate auth token for pass web service
 */
export function generateAuthToken(serialNumber: string): string {
  const secret = process.env.NEXTAUTH_SECRET || 'default-secret';
  return crypto.createHmac('sha256', secret).update(serialNumber).digest('hex');
}
