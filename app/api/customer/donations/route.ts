import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';
import { assertMenuItemVisible, assertModuleEnabled } from '@/lib/module-gate';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';

// Force dynamic rendering - disable caching
export const dynamic = 'force-dynamic';

// GET - Fetch projects and user donation stats
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const menuGate = await assertMenuItemVisible('donations', 'customer', {
      request,
      userId: session.user.id,
      routeKey: '/customer/donations',
    });
    if (menuGate) return menuGate;
    const gate = await assertModuleEnabled('donations', {
      role: 'customer',
      request,
      userId: session.user.id,
      routeKey: '/customer/donations',
    });
    if (gate) return gate;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    // Fetch user's current points from database (not session - for real-time data)
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { points: true },
    });

    // Fetch active projects
    const projects = await prisma.donationProject.findMany({
      where: {
        isActive: true,
        ...(category && category !== 'all' ? { category } : {}),
      },
      orderBy: [
        { isFeatured: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 150,
    });

    // Fetch user's total donations
    const userDonations = await prisma.donation.aggregate({
      where: { userId: session.user.id },
      _sum: { points: true },
      _count: true,
    });

    // Fetch user's donations by project
    const userDonationsByProject = await prisma.donation.groupBy({
      by: ['projectId'],
      where: { userId: session.user.id },
      _sum: { points: true },
    });

    // Fetch top donors (leaderboard)
    const topDonors = await prisma.donation.groupBy({
      by: ['userId'],
      where: { isPublic: true },
      _sum: { points: true },
      orderBy: { _sum: { points: 'desc' } },
      take: 10,
    });

    // Get user details for top donors
    const donorIds = topDonors.map(d => d.userId);
    const donorUsers = await prisma.user.findMany({
      where: { id: { in: donorIds } },
      select: { id: true, name: true, image: true, level: true },
    });

    const leaderboard = topDonors.map((donor, index) => {
      const user = donorUsers.find(u => u.id === donor.userId);
      return {
        rank: index + 1,
        userId: donor.userId,
        name: user?.name || 'Anonim',
        image: user?.image,
        level: user?.level || 1,
        totalPoints: donor._sum.points || 0,
      };
    });

    // Calculate user's rank
    const userRank = leaderboard.findIndex(d => d.userId === session.user.id) + 1;

    // Total platform impact
    const totalDonations = await prisma.donation.aggregate({
      _sum: { points: true },
    });

    // Recent donations (activity feed)
    const recentDonations = await prisma.donation.findMany({
      where: { isPublic: true },
      include: {
        user: { select: { name: true, image: true } },
        project: { select: { name: true, icon: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          projects: projects.map(p => ({
            ...p,
            userDonation: userDonationsByProject.find(d => d.projectId === p.id)?._sum.points || 0,
          })),
          userStats: {
            totalDonated: userDonations._sum.points || 0,
            donationCount: userDonations._count || 0,
            rank: userRank || null,
            availablePoints: currentUser?.points || 0,
          },
          leaderboard,
          platformStats: {
            totalDonated: totalDonations._sum.points || 0,
            totalProjects: projects.length,
          },
          recentDonations: recentDonations.map(d => ({
            id: d.id,
            userName: d.user.name,
            userImage: d.user.image,
            projectName: d.project.name,
            projectIcon: d.project.icon,
            points: d.points,
            createdAt: d.createdAt,
          })),
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Donations GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}

// POST - Make a donation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const menuGate = await assertMenuItemVisible('donations', 'customer', {
      request,
      userId: session.user.id,
      routeKey: '/customer/donations',
    });
    if (menuGate) return menuGate;
    const gate = await assertModuleEnabled('donations', {
      role: 'customer',
      request,
      userId: session.user.id,
      routeKey: '/customer/donations',
    });
    if (gate) return gate;

    const body = await request.json();
    const { projectId, points, message, isPublic = true } = body;

    if (!projectId || !points || points < 1) {
      return NextResponse.json(
        { error: 'Geçersiz bağış bilgisi' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Check project exists and is active
    const project = await prisma.donationProject.findUnique({
      where: { id: projectId },
    });

    if (!project || !project.isActive) {
      return NextResponse.json(
        { error: 'Proje bulunamadı' },
        { status: 404, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }

    // Create donation and update points in a transaction
    const [donation, updatedWallet] = await prisma.$transaction(async (tx) => {
      const wallet = await debitPoints(tx, {
        userId: session.user.id,
        points,
      });

      const donation = await tx.donation.create({
        data: {
          userId: session.user.id,
          projectId,
          points,
          message,
          isPublic,
        },
      });

      await tx.donationProject.update({
        where: { id: projectId },
        data: { current: { increment: points } },
      });

      await tx.notification.create({
        data: {
          userId: session.user.id,
          title: 'Bağış Başarılı! 🎉',
          message: `${project.name} projesine ${points} puan bağışladınız. Teşekkürler!`,
          type: 'success',
        },
      });

      return [donation, wallet] as const;
    });

    // Calculate impact
    const impact = project.impact as { unit: string; perPoint: number; label: string };
    const impactValue = Math.floor(points * (impact?.perPoint || 1));

    return NextResponse.json(
      {
        success: true,
        data: {
          donation,
          impact: {
            value: impactValue,
            unit: impact?.unit || 'birim',
            label: impact?.label || 'Etki',
          },
          newBalance: updatedWallet.points,
        },
      },
      { headers: PRIVATE_NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof InsufficientPointsError) {
      return NextResponse.json(
        { error: 'Yetersiz puan' },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS }
      );
    }
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    console.error('Donations POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS }
    );
  }
}
