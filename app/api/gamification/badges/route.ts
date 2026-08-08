import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PRIVATE_NO_STORE_HEADERS, responseIfDatabaseUnavailable } from '@/lib/api-http';
import { Prisma } from '@prisma/client';
import { getAuditRequestMeta } from '@/lib/request-metadata';
import { sanitizeHexColor } from '@/lib/badge-colors';
import { trackabilityOf } from '@/lib/badge-trackability';


export const dynamic = 'force-dynamic';

const CATEGORY_ALIASES: Record<string, string> = {
  dizi: 'dizi',
  series: 'dizi',
  diger: 'diger',
  other: 'diger',
  etkinlik: 'etkinlik',
  event: 'etkinlik',
  sadakat: 'sadakat',
  loyalty: 'sadakat',
  feedback: 'feedback',
  engagement: 'engagement',
  streak: 'streak',
  speed: 'speed',
  exploration: 'exploration',
  expertise: 'expertise',
  rating: 'rating',
  special: 'special',
  custom: 'custom',
  general: 'general',
};

const CATEGORY_LABELS: Record<string, string> = {
  dizi: 'Dizi',
  diger: 'Diğer',
  etkinlik: 'Etkinlik',
  sadakat: 'Sadakat',
  feedback: 'Geri Bildirim',
  engagement: 'Etkileşim',
  streak: 'Seri',
  speed: 'Hız',
  exploration: 'Keşif',
  expertise: 'Uzmanlık',
  rating: 'Puanlama',
  special: 'Özel',
  custom: 'Özel',
  general: 'Genel',
};

function normalizeBadgeCategory(category?: string): string {
  if (!category) return 'general';
  return CATEGORY_ALIASES[category.trim().toLowerCase()] || 'general';
}

function normalizeRequirement(input: unknown): Prisma.InputJsonObject {
  if (typeof input === 'object' && input && !Array.isArray(input)) {
    const requirement = input as Record<string, unknown>;
    const value = typeof requirement.value === 'number' ? requirement.value : 100;
    const type = typeof requirement.type === 'string' ? requirement.type : 'custom';
    const period = typeof requirement.period === 'string' ? requirement.period : null;
    const metadataRaw = typeof requirement.metadata === 'object' && requirement.metadata && !Array.isArray(requirement.metadata)
      ? (requirement.metadata as Record<string, unknown>)
      : {};
    const metadata = Object.fromEntries(
      Object.entries(metadataRaw).filter(([, val]) =>
        val === null || ['string', 'number', 'boolean'].includes(typeof val)
      )
    ) as Prisma.InputJsonObject;
    return { type, value, period, metadata };
  }

  return { type: 'custom', value: 100, period: null, metadata: {} };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const category = searchParams.get('category');

    // If userId is 'me', use session user
    const userId = userIdParam === 'me' && session?.user?.id
      ? session.user.id
      : userIdParam;

    // ADMIN yönetim modu: ?admin=1 ile YALNIZCA admin, karakter (dizi) rozetlerini de
    // ve arşivli (isActive:false) rozetleri de görür/yönetir. Müşteriye asla açılmaz.
    const isAdmin = session?.user?.role === 'ADMIN';
    const adminManage = isAdmin && searchParams.get('admin') === '1';

    const where: Record<string, unknown> = adminManage ? {} : { isActive: true };

    if (category) {
      where.category = normalizeBadgeCategory(category);
    }

    // Karakter rozetleri genel (müşteri) listesinden GİZLENİR — kullanıcı yalnızca kazandığı
    // karakterleri (CharacterCard koleksiyonunda) görür. AMA admin yönetim modunda GÖRÜNÜR
    // (Didar: dizi rozetleri admin panelinde yönetilebilmeli).
    let charBadgeIdSet = new Set<string>();
    let charCategoryByBadge = new Map<string, { key: string; name: string }>();
    if (adminManage) {
      // Dizi rozeti + alt-kategori haritası (admin sekmeleri için).
      const { CHARACTER_PROFILES } = await import('@/lib/character-badges');
      const { CATEGORY_BY_CHARACTER } = await import('@/lib/character-categories');
      charBadgeIdSet = new Set(CHARACTER_PROFILES.map((c) => c.badgeId));
      for (const bid of charBadgeIdSet) {
        const cat = CATEGORY_BY_CHARACTER[bid];
        if (cat) charCategoryByBadge.set(bid, { key: cat.key, name: cat.name });
      }
    } else {
      const { CHARACTER_PROFILES } = await import('@/lib/character-badges');
      const characterBadgeIds = CHARACTER_PROFILES.map((c) => c.badgeId);
      (where as { id?: unknown }).id = { notIn: characterBadgeIds };
    }

    const badges = await prisma.badge.findMany({
      where,
      include: {
        _count: {
          select: { users: true },
        },
      },
      orderBy: [
        { rarity: 'desc' }, // legendary first
        { createdAt: 'desc' },
      ],
      take: 500,
    });

    // Get user's progress data for calculating badge progress
    let userProgress = {
      feedbackCount: 0,
      totalPoints: 0,
      currentStreak: 0,
      longestStreak: 0,
      level: 1,
      referralCount: 0,
      questsCompleted: 0,
    };

    let userBadgeMap = new Map<string, Date>();

    if (userId) {
      // Get user's earned badges
      const userBadgesData = await prisma.userBadge.findMany({
        where: { userId },
        take: 500,
      });
      userBadgeMap = new Map(userBadgesData.map((ub) => [ub.badgeId, ub.earnedAt]));

      // Get user's progress
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          points: true,
          level: true,
          xp: true,
          _count: {
            select: {
              feedbacks: true,
              quests: true,
              badges: true,
            },
          },
        },
      });

      if (user) {
        userProgress = {
          feedbackCount: user._count.feedbacks,
          totalPoints: user.points || 0,
          currentStreak: 0, // Would need to calculate from feedbacks
          longestStreak: 0,
          level: user.level || 1,
          referralCount: 0,
          questsCompleted: user._count.quests,
        };
      }
    }

    // Transform badges with progress calculation
    const transformedBadges = badges.map((badge) => {
      const requirement = normalizeRequirement(badge.requirement);
      const requirementType = typeof requirement.type === 'string' ? requirement.type : 'custom';
      const targetValue = typeof requirement.value === 'number' ? requirement.value : 10;
      const requirementPeriod = typeof requirement.period === 'string' ? requirement.period : null;
      const requirementMetadata =
        typeof requirement.metadata === 'object' && requirement.metadata && !Array.isArray(requirement.metadata)
          ? (requirement.metadata as Prisma.JsonObject)
          : {};
      let currentValue = 0;
      let progress = 0;

      // Calculate progress based on requirement type
      switch (requirementType) {
        case 'feedback_count':
          currentValue = userProgress.feedbackCount;
          break;
        case 'points':
          currentValue = userProgress.totalPoints;
          break;
        case 'streak':
          currentValue = userProgress.currentStreak;
          break;
        case 'longest_streak':
          currentValue = userProgress.longestStreak;
          break;
        case 'level':
          currentValue = userProgress.level;
          break;
        case 'referral':
          currentValue = userProgress.referralCount;
          break;
        case 'quests':
          currentValue = userProgress.questsCompleted;
          break;
        default:
          currentValue = 0;
      }

      progress = Math.min(100, Math.floor((currentValue / targetValue) * 100));
      const isEarned = userBadgeMap.has(badge.id);

      const normalizedCategory = normalizeBadgeCategory(badge.category);
      // Dizi (karakter) rozeti mi + hangi dizi alt-kategorisinde (admin sekmeleri için).
      const seriesCat = adminManage ? charCategoryByBadge.get(badge.id) ?? null : null;
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        category: normalizedCategory,
        categoryLabel: CATEGORY_LABELS[normalizedCategory] || CATEGORY_LABELS.general,
        rarity: (badge.rarity || 'common').toUpperCase() as 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY',
        points: targetValue,
        pointCost: badge.pointCost ?? null,
        color: badge.color ?? null,
        bgColor: badge.bgColor ?? null,
        isActive: badge.isActive,
        requirement: badge.description,
        requirementType,
        requirementPeriod,
        requirementMetadata,
        targetValue,
        currentValue: isEarned ? targetValue : currentValue,
        progress: isEarned ? 100 : progress,
        earned: isEarned,
        earnedAt: userBadgeMap.get(badge.id) || null,
        earnedCount: badge._count.users,
        hiddenUntilEarned: badge.hiddenUntilEarned,
        // Admin yönetim meta: dizi rozeti mi + dizi alt-kategorisi (Normal|Dizi sekmesi).
        isCharacter: adminManage ? charBadgeIdSet.has(badge.id) : undefined,
        seriesCategoryKey: seriesCat?.key ?? null,
        seriesCategoryName: seriesCat?.name ?? null,
        // İZLENEBİLİRLİK (yalnız admin modu): rozet gerçekten kazanılabilir mi?
        // character = ayrı motor; exact = gerçek sayaç; approximate = proxy; untrackable = ölü rozet.
        trackability: adminManage
          ? (charBadgeIdSet.has(badge.id) ? 'character' : trackabilityOf(requirementType))
          : undefined,
      };
    });

    // TAM SÜRPRİZ POLİTİKASI (Didar kararı): müşteri hiçbir rozeti ÖNDEN göremez —
    // yalnızca KAZANDIĞI rozetleri görür (kilitli/ilerleme/satın alma yok, hepsi sürpriz).
    //  - adminManage: hepsi görünür (yönetim).
    //  - müşteri kendi listesi (userId + admin değil): SADECE earned.
    //  - userId yok (genel/katalog önizleme, ör. admin olmayan public): eski davranış,
    //    yalnız hiddenUntilEarned olanları gizle (geriye dönük güvenli).
    const visibleBadges = adminManage
      ? transformedBadges
      : userId
        ? transformedBadges.filter((b) => b.earned)
        : transformedBadges.filter((b) => !b.hiddenUntilEarned);

    // Sort: earned first, then by progress
    visibleBadges.sort((a, b) => {
      if (a.earned && !b.earned) return -1;
      if (!a.earned && b.earned) return 1;
      return b.progress - a.progress;
    });

    const userPoints = userId ? userProgress.totalPoints : 0;
    return NextResponse.json({
      success: true,
      data: visibleBadges,
      userProgress,
      userPoints,
    }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error fetching badges:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Rozetler getirilemedi' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auditMeta = getAuditRequestMeta(request);
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 , headers: PRIVATE_NO_STORE_HEADERS });
    }

    const body = await request.json();
    const normalizedCategory = normalizeBadgeCategory(body.category);
    const normalizedRequirement = normalizeRequirement(body.requirement || { type: 'custom', value: body.points || 100 });
    
    const badge = await prisma.badge.create({
      data: {
        name: body.name,
        description: body.description,
        icon: body.icon,
        category: normalizedCategory,
        rarity: (body.rarity || 'common').toLowerCase(),
        requirement: normalizedRequirement,
        pointCost: typeof body.pointCost === 'number' ? body.pointCost : null,
        isActive: body.isActive ?? true,
        color: sanitizeHexColor(body.color),
        bgColor: sanitizeHexColor(body.bgColor),
        hiddenUntilEarned: body.hiddenUntilEarned === true,
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE_BADGE',
        entity: 'Badge',
        entityId: badge.id,
        newData: badge as object,
        ...auditMeta,
      },
    });

    return NextResponse.json({ success: true, data: badge }, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error('Error creating badge:', error);
    const db = responseIfDatabaseUnavailable(error);
    if (db) return db;
    return NextResponse.json(
      { success: false, error: 'Rozet oluşturulamadı' }, { status: 500 , headers: PRIVATE_NO_STORE_HEADERS });
  }
}

