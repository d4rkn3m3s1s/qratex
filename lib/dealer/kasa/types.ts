/** Kasa + İşlem Defteri DTO'ları (sunucu ↔ istemci, JSON'a serileşir). */
import type { LedgerFilters, LedgerSummaryNumbers } from './core';

export interface KasaProduct {
  id: string;
  name: string;
  price: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
}

export interface KasaQuickKey {
  id: string;
  name: string;
  productId: string | null;
  productName: string | null;
  amount: number | null;
  note: string | null;
}

export interface CardLookupDto {
  token: string;
  last4: string;
  customer: {
    /** Maskeli ad ("Ayşe K."); e-posta/telefon kasaya GİTMEZ. */
    displayName: string | null;
    initials: string;
    avatar: string | null;
    level: number;
  };
  visits: {
    countHere: number;
    lastAt: string | null;
    totalSpentHere: number;
    reviewedHere: number;
  };
  recent: Array<{
    id: string;
    productName: string | null;
    amount: number | null;
    createdAt: string;
    rating: number | null;
  }>;
}

export interface LedgerRow {
  id: string;
  createdAt: string;
  amount: number | null;
  note: string | null;
  cardLast4: string;
  customer: { displayName: string | null; initials: string; avatar: string | null };
  product: { id: string; name: string; categoryName: string | null; categoryIcon: string | null } | null;
  review: {
    id: string;
    rating: number;
    text: string | null;
    dimensions: Record<string, number> | null;
    dealerReply: string | null;
    createdAt: string;
  } | null;
  /** Bu satır geri alınabilir mi (sunucu saatine göre; istemci süreyi kendisi de sayar). */
  voidable: boolean;
  passivePoints: number | null;
}

export interface LedgerSummary {
  current: LedgerSummaryNumbers;
  previous: LedgerSummaryNumbers | null;
}

export interface LedgerPage {
  filters: LedgerFilters;
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: LedgerSummary;
  generatedAt: string;
}

export interface KasaBootstrap {
  products: KasaProduct[];
  quickKeys: KasaQuickKey[];
  today: LedgerPage;
  role: 'DEALER' | 'STAFF';
  /** Cihaz kuyruğu ad alanı (`dealerId:actorId`). */
  queueOwner: string;
}

export interface CreateConsumptionResponse {
  duplicate: boolean;
  consumptionId: string;
  passivePoints: number;
  passiveCapped: boolean;
  multiplier: number;
  visitCountHere: number;
}

export const ledgerQueryKey = (search: string) => ['dealer', 'kasa', 'ledger', search] as const;
export const KASA_TODAY_KEY = ['dealer', 'kasa', 'today'] as const;
