import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { assertModuleEnabled } from '@/lib/module-gate';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { leaveSquad, SquadLifecycleError } from '@/lib/squad-battle-service';


export const dynamic = 'force-dynamic';

/**
 * POST — klandan ayrıl (P0-20).
 * Kurucu ayrılırsa klan SİLİNMEZ: sahiplik en eski üyeye devredilir. Klan yalnız son üye
 * ayrıldığında kapanır; açık savaşları önce iadeli iptal edilir (escrow kaybolmaz).
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const gate = await assertModuleEnabled('squads');
        if (gate) return gate;
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'CUSTOMER') {
            return NextResponse.json(
                { error: 'Oturum açmanız gerekiyor' },
                { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const { id: squadId } = await context.params;
        if (!squadId || squadId.length > 64) {
            return NextResponse.json(
                { error: 'Geçersiz klan' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const result = await leaveSquad({ squadId, userId: session.user.id });

        if (result.kind === 'not_member') {
            return NextResponse.json(
                { error: 'Bu klanın üyesi değilsiniz' },
                { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }

        const message =
            result.kind === 'ownership_transferred'
                ? 'Klandan ayrıldınız; klan liderliği en eski üyeye devredildi.'
                : result.kind === 'dissolved'
                  ? result.refunded > 0
                      ? `Son üye olarak ayrıldınız; klan kapatıldı ve açık savaşlar iptal edilerek ${result.refunded.toLocaleString('tr-TR')} puan iade edildi.`
                      : 'Son üye olarak ayrıldınız; klan kapatıldı.'
                  : 'Klandan ayrıldınız.';

        return NextResponse.json(
            { success: true, result: result.kind, message },
            { headers: PRIVATE_NO_STORE_HEADERS }
        );

    } catch (error) {
        if (error instanceof SquadLifecycleError) {
            return NextResponse.json(
                { error: error.message },
                { status: 409, headers: PRIVATE_NO_STORE_HEADERS }
            );
        }
        const db = responseIfDatabaseUnavailable(error);
        if (db) return db;
        console.error('[SQUAD_LEAVE_ERROR]', error);
        return NextResponse.json(
            { error: 'Klandan ayrılırken bir hata oluştu' },
            { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
        );
    }
}
