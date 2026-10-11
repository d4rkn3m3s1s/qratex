/**
 * Otomasyon › Uyarı kuralları — kriz radarının vaka eşikleri (Gelen Kutusu › Vakalar).
 *
 * Kayıt: `Settings[key = dealer_alert_rules:<dealerId>]` (radar modülünün okuduğu yer).
 * Okuma yolu vaka ÜRETMEZ: durum `computeRadarStats` + `evaluateRadar` ile salt hesaplanır;
 * önizleme kaydedilmemiş eşiklerle aynı hesabı yapar (LLM yok).
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_RADAR_RULES,
  RADAR_RULES_CATEGORY,
  evaluateRadar,
  parseRadarRules,
  radarRulesSettingsKey,
  type RadarRules,
} from '@/lib/dealer-queues/radar-rules';
import { computeRadarStats, getRadarStatus } from '@/lib/dealer-queues/radar';
import type { Actor } from './replies.server';
import type { AlertsOverviewDto, AlertsStatusDto } from './types';

const LAST_RADAR_SCAN_KEY = (dealerId: string) => `incident_radar_scan:${dealerId}`;

export async function evaluateAlertRules(dealerId: string, rules: RadarRules, now: Date = new Date()): Promise<AlertsStatusDto> {
  const stats = await computeRadarStats(dealerId, rules, now);
  const ev = evaluateRadar(stats, rules);
  return { level: ev.level, rules: ev.rules, evaluatedAt: now.toISOString() };
}

export async function loadAlertsOverview(dealerId: string): Promise<AlertsOverviewDto> {
  const [row, lastScan, recent, replyRules] = await Promise.all([
    prisma.settings.findUnique({ where: { key: radarRulesSettingsKey(dealerId) }, select: { value: true, updatedAt: true } }),
    prisma.settings.findUnique({ where: { key: LAST_RADAR_SCAN_KEY(dealerId) }, select: { value: true } }),
    prisma.incident.findMany({
      where: { dealerId, metadata: { path: ['source'], equals: 'radar' } },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, title: true, type: true, severity: true, status: true, createdAt: true },
    }),
    prisma.autoReplyRule.findMany({ where: { dealerId, action: 'incident', isActive: true }, select: { id: true } }),
  ]);
  const rules = parseRadarRules(row?.value);
  let status: AlertsStatusDto | null = null;
  try {
    status = await evaluateAlertRules(dealerId, rules);
  } catch (err) {
    console.error('[automation-alerts] radar durumu hesaplanamadı:', err);
  }
  const ls = lastScan?.value as { at?: unknown } | null | undefined;
  return {
    rules,
    defaults: DEFAULT_RADAR_RULES,
    status,
    lastScanAt: ls && typeof ls.at === 'string' ? ls.at : null,
    recent: recent.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      severity: r.severity,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      href: `/dealer/inbox/incidents?id=${encodeURIComponent(r.id)}`,
    })),
    replyIncidentRules: replyRules.length,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  };
}

export async function saveAlertRules(actor: Actor, input: RadarRules): Promise<RadarRules> {
  const clean = parseRadarRules(input);
  const key = radarRulesSettingsKey(actor.dealerId);
  await prisma.$transaction(async (tx) => {
    const before = await tx.settings.findUnique({ where: { key }, select: { value: true } });
    await tx.settings.upsert({
      where: { key },
      create: { key, value: clean as unknown as Prisma.InputJsonValue, category: RADAR_RULES_CATEGORY },
      update: { value: clean as unknown as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({
      data: {
        userId: actor.actorId,
        actorType: 'user',
        action: 'alert_rules.updated',
        entity: 'Settings',
        entityId: key,
        ...(before?.value != null ? { oldData: before.value as Prisma.InputJsonValue } : {}),
        newData: clean as unknown as Prisma.InputJsonValue,
      },
    });
  });
  // Radar durum önbelleği (60 sn) yeni eşiklerle hemen yenilensin.
  await getRadarStatus(actor.dealerId, { fresh: true }).catch(() => undefined);
  return clean;
}
