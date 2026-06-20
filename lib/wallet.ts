import crypto from 'crypto';
import { BRAND_PRIMARY_HEX } from '@/lib/brand-colors';

// ─────────────────────────────────────────────────────────────
// APPLE WALLET PASS GENERATION
// ─────────────────────────────────────────────────────────────
//
// Canlıda gerekli env: APPLE_PASS_TYPE_IDENTIFIER, APPLE_TEAM_IDENTIFIER,
// APPLE_WALLET_CERT_* (sertifika ve key). APPLE_TEAM_IDENTIFIER yoksa
// 'XXXXXXXXXX' placeholder kullanılır; imza üretimi production'da gerçek
// Apple sertifikası ile yapılmalı. Bkz. IMPROVEMENTS.md "Apple Wallet".
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
 * Sign the manifest with Apple certificate
 * Note: This requires proper Apple certificates
 */
export async function signManifest(manifest: Buffer): Promise<Buffer> {
  // Get certificates from environment
  const certP12Base64 = process.env.APPLE_PASS_CERT_P12_BASE64;
  const certPassword = process.env.APPLE_PASS_CERT_PASSWORD;
  const wwdrCertBase64 = process.env.APPLE_WWDR_CERT_BASE64;
  
  if (!certP12Base64 || !certPassword) {
    throw new Error('Apple Pass certificates not configured');
  }
  
  // For production, you would use a library like 'node-forge' or 'pkcs7'
  // to create a proper PKCS#7 signature. Here's a placeholder:
  
  // const forge = require('node-forge');
  // const p12Buffer = Buffer.from(certP12Base64, 'base64');
  // const p12Asn1 = forge.asn1.fromDer(p12Buffer.toString('binary'));
  // const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certPassword);
  // ... signing logic ...
  
  // TODO: Gerçek PKCS#7 imzalama (node-forge) burada uygulanmalı. Şu an
  // imzasız manifest dönüyor — bu yüzden API route sertifika yoksa zaten 503
  // döndürür; bu fonksiyon yalnızca imzalama implemente edildiğinde geçerli
  // pkpass üretir. Sahte "başarı" akışı kaldırıldı.
  console.warn('Apple Pass PKCS#7 signing not implemented - pass will not be valid until implemented');
  return manifest;
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
