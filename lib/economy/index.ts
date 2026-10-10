/**
 * lib/economy — puan ekonomisinin tek giriş noktası.
 * Kural: puan/XP basan HER yol `mintPoints`, harcayan her yol `debitPoints`,
 * admin düzeltmesi `adjustPointsByAdmin` kullanır. Ayrıntı: lib/economy/README.md
 */
export { mintPoints, lockUserForUpdate } from './mint';
export type { MintInput, MintResult, EconomyDb, EconomyTx, LedgerStatus } from './mint';
export { adjustPointsByAdmin } from './admin-adjust';
export type { AdminAdjustInput, AdminAdjustResult } from './admin-adjust';
export { issueAdjustApproval, verifyAdjustApproval, ADJUST_APPROVAL_TTL_MS } from './admin-approval';
export type { AdjustApprovalClaims } from './admin-approval';
export {
  ECONOMY_CAPS,
  ADMIN_ADJUST_LIMITS,
  MAX_SINGLE_MINT,
  MAX_SINGLE_XP,
  applyCategoryCap,
  getCapRule,
  sumEarnedInWindow,
} from './caps';
export type { CapCategory, CapRule, CapDecision } from './caps';
export { EconomyError, isEconomyError, ECONOMY_ERROR_HTTP_STATUS } from './errors';
export type { EconomyErrorCode } from './errors';
export { debitPoints, InsufficientPointsError } from '@/lib/points-wallet';
export type { DebitPointsPayload, DebitPointsResult } from '@/lib/points-wallet';
