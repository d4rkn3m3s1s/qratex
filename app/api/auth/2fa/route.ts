import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS } from '@/lib/api-http';
import crypto from 'crypto';


export const dynamic = 'force-dynamic';

function generateBase32Secret(length = 20): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes).map((b) => chars[b % 32]).join('');
}

function generateTOTP(secret: string): string {
    const epoch = Math.floor(Date.now() / 1000);
    const time = Math.floor(epoch / 30);
    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(0, 0);
    buf.writeUInt32BE(time, 4);
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'ascii'));
    hmac.update(buf);
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0x0f;
    const code = ((hash[offset] & 0x7f) << 24 | hash[offset + 1] << 16 | hash[offset + 2] << 8 | hash[offset + 3]) % 1000000;
    return code.toString().padStart(6, '0');
}

function verifyTOTP(secret: string, token: string): boolean {
    // Check current and +/- 1 time step
    for (let i = -1; i <= 1; i++) {
        const epoch = Math.floor(Date.now() / 1000) + i * 30;
        const time = Math.floor(epoch / 30);
        const buf = Buffer.alloc(8);
        buf.writeUInt32BE(0, 0);
        buf.writeUInt32BE(time, 4);
        const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'ascii'));
        hmac.update(buf);
        const hash = hmac.digest();
        const offset = hash[hash.length - 1] & 0x0f;
        const code = ((hash[offset] & 0x7f) << 24 | hash[offset + 1] << 16 | hash[offset + 2] << 8 | hash[offset + 3]) % 1000000;
        if (code.toString().padStart(6, '0') === token) return true;
    }
    return false;
}

// POST — setup 2FA: generate secret and return otpauth URI
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth(['CUSTOMER', 'DEALER', 'ADMIN']);
        if ('error' in auth) return auth.error;

        const body = await request.json();

        // Setup: generate secret
        if (body.action === 'setup') {
            const secret = generateBase32Secret();
            const user = await prisma.user.findUnique({
                where: { id: auth.session.user.id },
                select: { email: true, twoFactorEnabled: true },
            });
            if (!user) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 , headers: PRIVATE_NO_STORE_HEADERS });
            if (user.twoFactorEnabled) return NextResponse.json({ error: '2FA zaten aktif' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });

            // Store secret temporarily (not enabled yet)
            await prisma.user.update({
                where: { id: auth.session.user.id },
                data: { twoFactorSecret: secret },
            });

            const otpauthUri = `otpauth://totp/QRATEX:${encodeURIComponent(user.email || '')}?secret=${secret}&issuer=QRATEX&digits=6&period=30`;
            return NextResponse.json({ success: true, secret, otpauthUri }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Verify: validate TOTP code and enable 2FA
        if (body.action === 'verify') {
            const { code } = body;
            if (!code || typeof code !== 'string' || code.length !== 6) {
                return NextResponse.json({ error: 'Geçersiz doğrulama kodu' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
            }

            const user = await prisma.user.findUnique({
                where: { id: auth.session.user.id },
                select: { twoFactorSecret: true, twoFactorEnabled: true },
            });
            if (!user?.twoFactorSecret) return NextResponse.json({ error: 'Önce kurulum yapın' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
            if (user.twoFactorEnabled) return NextResponse.json({ error: '2FA zaten aktif' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });

            if (!verifyTOTP(user.twoFactorSecret, code)) {
                return NextResponse.json({ error: 'Yanlış kod, tekrar deneyin' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
            }

            await prisma.user.update({
                where: { id: auth.session.user.id },
                data: { twoFactorEnabled: true },
            });

            return NextResponse.json({ success: true, message: '2FA başarıyla etkinleştirildi' }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        // Disable: validate code and disable 2FA
        if (body.action === 'disable') {
            const { code } = body;
            if (!code || typeof code !== 'string' || code.length !== 6) {
                return NextResponse.json({ error: 'Geçersiz doğrulama kodu' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
            }

            const user = await prisma.user.findUnique({
                where: { id: auth.session.user.id },
                select: { twoFactorSecret: true, twoFactorEnabled: true },
            });
            if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
                return NextResponse.json({ error: '2FA aktif değil' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
            }

            if (!verifyTOTP(user.twoFactorSecret, code)) {
                return NextResponse.json({ error: 'Yanlış kod' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
            }

            await prisma.user.update({
                where: { id: auth.session.user.id },
                data: { twoFactorEnabled: false, twoFactorSecret: null },
            });

            return NextResponse.json({ success: true, message: '2FA devre dışı bırakıldı' }, { headers: PRIVATE_NO_STORE_HEADERS });
        }

        return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 , headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) {
        console.error('2FA error:', error);
        return NextResponse.json({ error: '2FA işlemi başarısız' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
    }
}
