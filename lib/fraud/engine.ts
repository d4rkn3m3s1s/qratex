import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export interface FraudCheckResult {
    isClean: boolean;
    reason?: string;
    actionTaken?: string;
}

/**
 * Checks a user for fraudulent behavior (velocity checking for scans).
 * If fraudulent, flags them in the database.
 * 
 * Rules:
 * 1. > 3 scans in under 5 minutes = FLAGGED
 * 2. > 10 scans in 1 hour = SHADOW_BAN
 */
export async function checkFraudulentActivity(userId: string, dealerId: string): Promise<FraudCheckResult> {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { fraudStatus: true, fraudScore: true }
        });

        if (!user) {
            return { isClean: true };
        }

        // If already shadow banned, do nothing further but return false
        if (user.fraudStatus === 'shadow_ban') {
            return { isClean: false, reason: 'User is already shadow banned.', actionTaken: 'none' };
        }

        const now = new Date();
        const fiveMinsAgo = new Date(now.getTime() - 5 * 60000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60000);

        // Get recent consumptions/scans for this user at ANY dealer to detect rapid movement
        const [recent5MinScans, recent1HourScans] = await Promise.all([
            prisma.consumption.count({
                where: { customerId: userId, createdAt: { gte: fiveMinsAgo } }
            }),
            prisma.consumption.count({
                where: { customerId: userId, createdAt: { gte: oneHourAgo } }
            })
        ]);

        let newStatus = user.fraudStatus;
        let newScore = user.fraudScore || 0;
        let reason = '';

        if (recent1HourScans >= 10) {
            newStatus = 'shadow_ban';
            newScore += 50;
            reason = 'Velocity: >10 scans in 1 hour';
        } else if (recent5MinScans >= 3) {
            newStatus = 'flagged';
            newScore += 20;
            reason = 'Velocity: >3 scans in 5 minutes';
        }

        if (newStatus !== user.fraudStatus || newScore !== user.fraudScore) {
            // Log the suspicious activity
            await prisma.$transaction([
                prisma.user.update({
                    where: { id: userId },
                    data: { fraudStatus: newStatus, fraudScore: newScore }
                }),
                prisma.suspiciousActivity.create({
                    data: {
                        userId: userId,
                        type: 'fraud_velocity',
                        description: reason,
                        severity: newStatus === 'shadow_ban' ? 'high' : 'medium',
                        dealerId: dealerId,
                    }
                })
            ]);

            return { isClean: false, reason, actionTaken: newStatus };
        }

        return { isClean: true };
    } catch (error) {
        console.error('[FRAUD_ENGINE_ERROR]', error);
        // Fail open: if fraud check crashes, don't block the user
        return { isClean: true };
    }
}

/**
 * Helper to determine if a reward/point should be applied.
 * Shadow banned users should think they succeeded, but the DB shouldn't apply points.
 */
export function shouldApplyReward(fraudStatus: string): boolean {
    return fraudStatus !== 'shadow_ban';
}
