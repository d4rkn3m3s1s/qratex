/**
 * Promptlar: kodda sabit TEMEL promptlar (salt okunur, sürüm etiketli) + yönetici NOTLARI
 * (sürümlü: taslak → yayınla → geçmiş/geri yükle).
 *
 * Depolama (şema değişikliği yok):
 *  - Sürüm deposu: `Settings['ai.prompt-notes'] = { versions: NoteVersion[] }` (iyimser kilit = satır sürümü).
 *  - Yürürlükteki metin: `AISystemLearningProfile.systemPrompt | chatSystemPrompt` + `profile.adminPromptsEditedAt`
 *    damgası (lib/ai-engine `buildLearnedSystemContext` yalnız damgalı metni okur).
 * Yayınlama ikisini TEK transaction'da yazar ve denetim satırı (önce/sonra metin) ekler.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http/define-route';
import type { AuditActor } from '@/lib/data-safety/audit';
import { PROMPT_VERSIONS } from '@/lib/ai-prompt-safety';
import { lockResource, versionFromDate, writeVersionedSetting } from '@/lib/settings-version';
import { CHAT_SYSTEM_PROMPT_BASE, buildAnalysisSystemPrompt, buildAutoReplySystemPrompt, buildLearnedSystemContext } from '@/lib/ai-engine';
import {
  NOTE_KEYS,
  NOTE_LIMITS,
  type BasePromptView,
  type NoteKey,
  type NotePreviewResult,
  type NoteState,
  type NoteVersion,
  type PromptsState,
  noteDraftSchema,
} from './contract';
import { actorRef, auditData, mapVersionConflict, newId, type RequestLike } from './shared.server';
import type { z } from 'zod';

export const PROMPT_NOTES_KEY = 'ai.prompt-notes';
const MAX_VERSIONS_PER_KEY = 30;

const COLUMN: Record<NoteKey, 'systemPrompt' | 'chatSystemPrompt'> = { system: 'systemPrompt', chat: 'chatSystemPrompt' };

export function basePrompts(): BasePromptView[] {
  return [
    {
      key: 'analysis',
      title: 'Geri bildirim analizi',
      version: PROMPT_VERSIONS.analysis,
      text: buildAnalysisSystemPrompt(),
      usedBy: ['Anlık analiz (/api/feedbacks)', 'Arka plan analiz hattı ve ai-retry cron', 'Toplu analiz'],
    },
    {
      key: 'chat',
      title: 'AI sohbet (veriye sor)',
      version: PROMPT_VERSIONS.chat,
      text: CHAT_SYSTEM_PROMPT_BASE,
      usedBy: ['Bayi AI sohbeti', 'Müşteri AI sohbeti', 'Müşteri önerileri'],
    },
    {
      key: 'autoReply',
      title: 'Otomatik yanıt (örnek: Profesyonel üslup)',
      version: PROMPT_VERSIONS.autoReply,
      text: buildAutoReplySystemPrompt('professional'),
      usedBy: ['Bayi otomatik yanıt kuralları (AI üsluplu)'],
    },
  ];
}

/** Settings değerinden sürüm listesi — bozuk öğe düşer. */
export function parseNoteVersions(value: unknown): NoteVersion[] {
  const v = (value && typeof value === 'object' ? value : {}) as { versions?: unknown };
  if (!Array.isArray(v.versions)) return [];
  const out: NoteVersion[] = [];
  for (const raw of v.versions) {
    const r = raw as Partial<NoteVersion> | null;
    if (!r || typeof r.id !== 'string' || !NOTE_KEYS.includes(r.key as NoteKey)) continue;
    if (!['draft', 'published', 'superseded', 'discarded'].includes(String(r.status))) continue;
    out.push({
      id: r.id,
      key: r.key as NoteKey,
      body: typeof r.body === 'string' ? r.body : null,
      note: typeof r.note === 'string' ? r.note : '',
      status: r.status as NoteVersion['status'],
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date(0).toISOString(),
      createdBy: r.createdBy ?? { id: null, name: null, email: null },
      publishedAt: typeof r.publishedAt === 'string' ? r.publishedAt : null,
      publishedBy: r.publishedBy ?? null,
      basedOn: typeof r.basedOn === 'string' ? r.basedOn : null,
    });
  }
  return out;
}

/** Anahtar başına en çok N sürüm; yayındaki ve açık taslak asla budanmaz. */
export function pruneVersions(versions: NoteVersion[]): NoteVersion[] {
  const keep: NoteVersion[] = [];
  for (const key of NOTE_KEYS) {
    const mine = versions.filter((v) => v.key === key).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    let count = 0;
    for (const v of mine) {
      if (v.status === 'published' || v.status === 'draft' || count < MAX_VERSIONS_PER_KEY) keep.push(v);
      count++;
    }
  }
  return keep.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Taslak ekler; aynı anahtarın önceki açık taslağı "discarded" olur (tek açık taslak). */
export function applyDraft(versions: NoteVersion[], draft: NoteVersion): NoteVersion[] {
  const next = versions.map((v) => (v.key === draft.key && v.status === 'draft' ? { ...v, status: 'discarded' as const } : v));
  return pruneVersions([draft, ...next]);
}

/** Yayınla: hedef taslak published olur, aynı anahtarın önceki yayını superseded. */
export function applyPublish(versions: NoteVersion[], id: string, actor: NoteVersion['publishedBy'], at: string): { versions: NoteVersion[]; published: NoteVersion; previous: NoteVersion | null } {
  const target = versions.find((v) => v.id === id);
  if (!target) throw new ApiError('NOT_FOUND', 'Sürüm bulunamadı.');
  if (target.status !== 'draft') throw new ApiError('CONFLICT', 'Yalnız taslak sürüm yayınlanabilir.');
  const previous = versions.find((v) => v.key === target.key && v.status === 'published') ?? null;
  const published: NoteVersion = { ...target, status: 'published', publishedAt: at, publishedBy: actor };
  const next = versions.map((v) => {
    if (v.id === id) return published;
    if (v.key === target.key && v.status === 'published') return { ...v, status: 'superseded' as const };
    return v;
  });
  return { versions: next, published, previous };
}

export function applyDiscard(versions: NoteVersion[], id: string): NoteVersion[] {
  const target = versions.find((v) => v.id === id);
  if (!target) throw new ApiError('NOT_FOUND', 'Sürüm bulunamadı.');
  if (target.status !== 'draft') throw new ApiError('CONFLICT', 'Yalnız taslak silinebilir; yayınlanmış sürümler geçmişte kalır.');
  return versions.map((v) => (v.id === id ? { ...v, status: 'discarded' as const } : v));
}

function profileJson(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

export async function getPromptsState(): Promise<PromptsState> {
  const [row, profile] = await Promise.all([
    prisma.settings.findUnique({ where: { key: PROMPT_NOTES_KEY }, select: { value: true, updatedAt: true } }),
    prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' }, select: { profile: true, systemPrompt: true, chatSystemPrompt: true, updatedAt: true } }),
  ]);
  const versions = parseNoteVersions(row?.value ?? null);
  const p = profileJson(profile?.profile);
  const stamped = typeof p.adminPromptsEditedAt === 'string' && p.adminPromptsEditedAt.length > 0;

  const notes: NoteState[] = NOTE_KEYS.map((key) => {
    const live = (profile?.[COLUMN[key]] as string | null | undefined) ?? null;
    const mine = versions.filter((v) => v.key === key);
    const list = [...mine];
    // Sürümleme öncesi damgalı metin: geçmişte görünür olsun (geri yüklenebilir).
    if (live && stamped && !mine.some((v) => v.status === 'published')) {
      list.push({
        id: `legacy-${key}`,
        key,
        body: live,
        note: 'Sürümleme öncesi yayındaki metin',
        status: 'published',
        createdAt: typeof p.adminPromptsEditedAt === 'string' ? p.adminPromptsEditedAt : new Date(0).toISOString(),
        createdBy: { id: null, name: null, email: null },
        publishedAt: typeof p.adminPromptsEditedAt === 'string' ? p.adminPromptsEditedAt : null,
        publishedBy: null,
        basedOn: null,
      });
    }
    return {
      key,
      limit: NOTE_LIMITS[key],
      live: stamped ? live : null,
      liveIneffective: !!live && !stamped,
      versions: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  });

  return { base: basePrompts(), notes, version: versionFromDate(row?.updatedAt) };
}

type DraftInput = z.output<typeof noteDraftSchema>;

export async function createNoteDraft(input: DraftInput, actor: AuditActor, request?: RequestLike): Promise<PromptsState> {
  const draft: NoteVersion = {
    id: newId('pn'),
    key: input.key,
    body: input.body,
    note: input.note,
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdBy: actorRef(actor),
    publishedAt: null,
    publishedBy: null,
    basedOn: input.basedOn,
  };
  await mapVersionConflict(() =>
    prisma.$transaction(async (tx) => {
      await writeVersionedSetting(tx, {
        key: PROMPT_NOTES_KEY,
        category: 'ai',
        baseVersion: input.baseVersion,
        value: (prev) => ({ versions: applyDraft(parseNoteVersions(prev), draft) }) as unknown as Prisma.InputJsonValue,
      });
      await tx.auditLog.create({
        data: auditData(actor, { action: 'AI_PROMPT_NOTE_DRAFT', entity: 'AIPromptNote', entityId: draft.id, newData: { key: draft.key, body: draft.body, note: draft.note, basedOn: draft.basedOn } }, request),
      });
    })
  );
  return getPromptsState();
}

export async function noteVersionAction(
  id: string,
  action: 'publish' | 'discard',
  baseVersion: string,
  actor: AuditActor,
  request?: RequestLike
): Promise<PromptsState> {
  await mapVersionConflict(() =>
    prisma.$transaction(async (tx) => {
      if (action === 'discard') {
        await writeVersionedSetting(tx, {
          key: PROMPT_NOTES_KEY,
          category: 'ai',
          baseVersion,
          value: (prev) => ({ versions: applyDiscard(parseNoteVersions(prev), id) }) as unknown as Prisma.InputJsonValue,
        });
        await tx.auditLog.create({ data: auditData(actor, { action: 'AI_PROMPT_NOTE_DISCARD', entity: 'AIPromptNote', entityId: id }, request) });
        return;
      }

      let published: NoteVersion | null = null;
      const at = new Date().toISOString();
      await writeVersionedSetting(tx, {
        key: PROMPT_NOTES_KEY,
        category: 'ai',
        baseVersion,
        value: (prev) => {
          const r = applyPublish(parseNoteVersions(prev), id, actorRef(actor), at);
          published = r.published;
          return { versions: r.versions } as unknown as Prisma.InputJsonValue;
        },
      });
      const pub = published as NoteVersion | null;
      if (!pub) throw new ApiError('NOT_FOUND', 'Sürüm bulunamadı.');

      await lockResource(tx, 'ai-system-learning-profile');
      const row = await tx.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' } });
      const column = COLUMN[pub.key];
      const before = (row?.[column] as string | null | undefined) ?? null;
      if (row) {
        const p = profileJson(row.profile);
        p.adminPromptsEditedAt = at;
        await tx.aISystemLearningProfile.update({
          where: { id: row.id },
          data: { [column]: pub.body, profile: p as Prisma.InputJsonValue },
        });
      } else {
        await tx.aISystemLearningProfile.create({
          data: { [column]: pub.body, status: 'idle', version: 0, profile: { adminPromptsEditedAt: at } as Prisma.InputJsonValue },
        });
      }
      await tx.auditLog.create({
        data: auditData(
          actor,
          { action: 'AI_PROMPT_NOTE_PUBLISH', entity: 'AIPromptNote', entityId: pub.id, oldData: { key: pub.key, body: before }, newData: { key: pub.key, body: pub.body, note: pub.note } },
          request
        ),
      });
    })
  );
  return getPromptsState();
}

/** Taslak notlarla modele gidecek ek bloklar — LLM çağrısı yok, saf derleme. */
export async function previewNotes(input: { system: string | null; chat: string | null }): Promise<NotePreviewResult> {
  const row = await prisma.aISystemLearningProfile.findFirst({ orderBy: { updatedAt: 'desc' }, select: { profile: true } });
  const p = profileJson(row?.profile);
  p.adminPromptsEditedAt = new Date().toISOString();
  const draftProfile = { profile: p, systemPrompt: input.system?.trim() || null, chatSystemPrompt: input.chat?.trim() || null };
  return {
    insightBlock: buildLearnedSystemContext(draftProfile),
    chatBlock: buildLearnedSystemContext(draftProfile, { includeChatContext: true }),
  };
}
