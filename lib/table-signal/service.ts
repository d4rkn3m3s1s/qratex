/**
 * Masa sinyali servis katmanı (sunucu) — kayıt, bayi vakası, bildirim, misafir durumu.
 *
 * Kapalı döngü (rapor bulgu 2): "Bir şey var" ve hizmet istekleri bayinin Gelen Kutusu ›
 * Vakalar kuyruğuna `Incident` olarak düşer; bayi ve aktif personeline uygulama içi bildirim
 * + web push gider; vaka "çözüldü" yapılınca bağlı `TablePulse.resolvedAt` da dolar (sağlık
 * skoru 2.0'daki kapanış bonusu artık gerçekten çalışır). Misafir aşamayı imzalı anahtarla izler.
 *
 * Puan YOK: sinyal ödüllendirilmez (sahte sinyali teşvik eder); puan yalnız köprülenen tam
 * geri bildirim akışında (`/feedback/<kod>`) ve lib/economy üzerinden kazanılır.
 */
import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendPushNotification } from '@/lib/push';
import {
  CONCERN_DUE_MS,
  DUPLICATE_WINDOW_MS,
  INCIDENT_TYPE_CONCERN,
  INCIDENT_TYPE_REQUEST,
  REQUEST_DUE_MS,
  incidentDescription,
  incidentTitle,
  stageOfIncidentStatus,
  tableLabelTr,
  type ConcernReason,
  type RequestType,
  type SignalKind,
  type SignalStage,
} from './kinds';
import { signTrackingKey, type TrackingKey } from './status-key';
import type { VenueResolution } from './venue';

type OkVenue = Extract<VenueResolution, { status: 'ok' }>;

export interface CreateSignalInput {
  venue: OkVenue;
  kind: SignalKind;
  reasons: ConcernReason[];
  requestType: RequestType | null;
  tableCode: string | null;
  note: string | null;
  /** Yalnız misafir "hesabımla ilişkilendir" dediyse dolu (varsayılan anonim). */
  customerId: string | null;
}

export interface SignalResult {
  kind: SignalKind;
  /** Aynı masadan kısa süre içinde aynı türde vaka zaten açıktı → yeni kayıt yok. */
  duplicate: boolean;
  stage: SignalStage;
  /** Durum takibi (yalnız vaka açıldıysa ve imza sırrı varsa). */
  tracking: TrackingKey | null;
  /** Ekip bildirimi gitti mi (vaka ya da doğrudan bildirim). */
  teamNotified: boolean;
}

/** Sinyal REQUEST türündeyse ve vaka kuyruğu kapalıysa gönderilemez. */
export class SignalUnavailableError extends Error {
  constructor() {
    super('REQUESTS_UNAVAILABLE');
    this.name = 'SignalUnavailableError';
  }
}

export function dedupeKeyOf(kind: SignalKind, requestType: RequestType | null, tableCode: string | null): string {
  const t = (tableCode ?? '-').toLocaleLowerCase('tr-TR');
  return kind === 'REQUEST' ? `request:${requestType ?? 'other'}|${t}` : `concern|${t}`;
}

interface Recipient {
  userId: string;
  url: string;
}

async function teamRecipients(dealerId: string): Promise<Recipient[]> {
  const staff = await prisma.dealerStaff.findMany({
    where: { dealerId, isActive: true },
    select: { userId: true },
    take: 25,
  });
  const out: Recipient[] = [{ userId: dealerId, url: '/dealer/inbox/incidents' }];
  for (const s of staff) {
    if (s.userId && s.userId !== dealerId) out.push({ userId: s.userId, url: '/staff' });
  }
  return out;
}

function runAfter(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    // İstek kapsamı dışında (test / betik): bekletmeden çalıştır.
    void task().catch(() => undefined);
  }
}

async function notifyTeam(
  dealerId: string,
  payload: { title: string; message: string; incidentId: string | null; severity: 'warning' | 'info' }
): Promise<boolean> {
  const recipients = await teamRecipients(dealerId);
  await prisma.notification.createMany({
    data: recipients.map((r) => ({
      userId: r.userId,
      title: payload.title,
      message: payload.message,
      type: payload.severity,
      data: { kind: 'table_signal', incidentId: payload.incidentId, url: r.url },
    })),
  });
  runAfter(() =>
    Promise.allSettled(recipients.map((r) => sendPushNotification(r.userId, payload.title, payload.message, r.url)))
  );
  return true;
}

function shortMessage(input: CreateSignalInput): string {
  const parts: string[] = [];
  if (input.kind === 'CONCERN') {
    parts.push(input.reasons.length ? 'Misafir bir sorun bildirdi.' : 'Misafir bir şeylerin yolunda gitmediğini bildirdi.');
  } else {
    parts.push('Misafir masaya ekip bekliyor.');
  }
  if (input.venue.venue.placeLabel) parts.push(`QR: ${input.venue.venue.placeLabel}.`);
  if (input.note) parts.push(`Not: “${input.note.slice(0, 120)}${input.note.length > 120 ? '…' : ''}”`);
  return parts.join(' ');
}

export async function createTableSignal(input: CreateSignalInput, now: Date = new Date()): Promise<SignalResult> {
  const { venue, kind } = input;

  if (kind === 'OK') {
    await prisma.tablePulse.create({
      data: {
        dealerId: venue.dealerId,
        qrCodeId: venue.qrCodeId,
        tableCode: input.tableCode,
        mood: 'OK',
        note: input.note,
        customerId: input.customerId,
      },
    });
    return { kind, duplicate: false, stage: 'sent', tracking: null, teamNotified: false };
  }

  if (kind === 'REQUEST' && !venue.casesEnabled) throw new SignalUnavailableError();

  const title =
    kind === 'REQUEST'
      ? incidentTitle({ kind: 'REQUEST', requestType: input.requestType ?? 'other', tableCode: input.tableCode })
      : incidentTitle({ kind: 'CONCERN', reasons: input.reasons, tableCode: input.tableCode });

  // Vaka kuyruğu kapalıysa: CONCERN yine kaydedilir ve ekibe doğrudan bildirim gider; takip yok.
  if (!venue.casesEnabled) {
    await prisma.tablePulse.create({
      data: {
        dealerId: venue.dealerId,
        qrCodeId: venue.qrCodeId,
        tableCode: input.tableCode,
        mood: 'CONCERN',
        note: input.note,
        customerId: input.customerId,
      },
    });
    const notified = await notifyTeam(venue.dealerId, { title, message: shortMessage(input), incidentId: null, severity: 'warning' });
    return { kind, duplicate: false, stage: 'sent', tracking: null, teamNotified: notified };
  }

  const incidentType = kind === 'REQUEST' ? INCIDENT_TYPE_REQUEST : INCIDENT_TYPE_CONCERN;
  const dedupeKey = dedupeKeyOf(kind, input.requestType, input.tableCode);

  const existing = await prisma.incident.findFirst({
    where: {
      dealerId: venue.dealerId,
      type: incidentType,
      status: { not: 'resolved' },
      createdAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
      metadata: { path: ['dedupeKey'], equals: dedupeKey },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
  });
  if (existing) {
    return {
      kind,
      duplicate: true,
      stage: stageOfIncidentStatus(existing.status),
      tracking: signTrackingKey(existing.id, now.getTime()),
      teamNotified: true,
    };
  }

  const incident = await prisma.$transaction(async (tx) => {
    const pulse =
      kind === 'CONCERN'
        ? await tx.tablePulse.create({
            data: {
              dealerId: venue.dealerId,
              qrCodeId: venue.qrCodeId,
              tableCode: input.tableCode,
              mood: 'CONCERN',
              note: input.note,
              customerId: input.customerId,
            },
            select: { id: true },
          })
        : null;
    return tx.incident.create({
      data: {
        dealerId: venue.dealerId,
        type: incidentType,
        severity: kind === 'CONCERN' ? 'medium' : 'low',
        status: 'open',
        title,
        description: incidentDescription({
          note: input.note,
          placeLabel: venue.venue.placeLabel,
          linkedAccount: !!input.customerId,
        }),
        dueAt: new Date(now.getTime() + (kind === 'CONCERN' ? CONCERN_DUE_MS : REQUEST_DUE_MS)),
        metadata: {
          source: 'table_signal',
          dedupeKey,
          tablePulseId: pulse?.id ?? null,
          tableCode: input.tableCode,
          tableLabel: tableLabelTr(input.tableCode),
          reasons: input.reasons,
          requestType: input.requestType,
          qrCodeId: venue.qrCodeId,
        },
      },
      select: { id: true, status: true },
    });
  });

  const notified = await notifyTeam(venue.dealerId, {
    title,
    message: shortMessage(input),
    incidentId: incident.id,
    severity: kind === 'CONCERN' ? 'warning' : 'info',
  }).catch((err) => {
    // Vaka açıldı; bildirim hatası misafiri etkilemez ama görünür kalsın.
    console.error('[table-signal] ekip bildirimi yazılamadı', err);
    return false;
  });

  return {
    kind,
    duplicate: false,
    stage: stageOfIncidentStatus(incident.status),
    tracking: signTrackingKey(incident.id, now.getTime()),
    teamNotified: notified,
  };
}

type IncidentForSync = {
  id: string;
  type: string;
  status: string;
  resolvedAt: Date | null;
  updatedAt?: Date | null;
  metadata: unknown;
};

function linkedPulseId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, unknown>).tablePulseId;
  return typeof v === 'string' && v ? v : null;
}

/**
 * Vaka çözüldüyse bağlı masa sinyalini de kapatır (yalnız henüz kapanmamışsa). Bayi vaka
 * ucu (PATCH /api/dealer/incidents/[id]) ve misafir durum ucu çağırır; idempotent.
 */
export async function syncPulseFromIncident(incident: IncidentForSync, now: Date = new Date()): Promise<boolean> {
  if (incident.type !== INCIDENT_TYPE_CONCERN || incident.status !== 'resolved') return false;
  const pulseId = linkedPulseId(incident.metadata);
  if (!pulseId) return false;
  const res = await prisma.tablePulse.updateMany({
    where: { id: pulseId, resolvedAt: null },
    data: { resolvedAt: incident.resolvedAt ?? incident.updatedAt ?? now },
  });
  return res.count > 0;
}

export interface SignalStatus {
  stage: SignalStage;
  updatedAt: string;
}

/** Misafir durum sorgusu: yalnız aşama + zaman. Vaka masa sinyali değilse null. */
export async function readSignalStatus(ref: string, now: Date = new Date()): Promise<SignalStatus | null> {
  const incident = await prisma.incident.findUnique({
    where: { id: ref },
    select: { id: true, type: true, status: true, resolvedAt: true, updatedAt: true, metadata: true },
  });
  if (!incident || (incident.type !== INCIDENT_TYPE_CONCERN && incident.type !== INCIDENT_TYPE_REQUEST)) return null;
  if (incident.status === 'resolved') {
    await syncPulseFromIncident(incident, now).catch(() => false);
  }
  return { stage: stageOfIncidentStatus(incident.status), updatedAt: incident.updatedAt.toISOString() };
}
