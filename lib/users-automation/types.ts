export type AutomationCondition = {
  role?: 'ADMIN' | 'DEALER' | 'CUSTOMER';
  minPoints?: number;
  maxPoints?: number;
  minLevel?: number;
  maxLevel?: number;
  createdBeforeDays?: number;
  createdAfterDays?: number;
  emailIncludes?: string;
  businessNameIncludes?: string;
};

export type AutomationAction =
  | { type: 'add_points'; amount: number; reason?: string }
  | { type: 'add_xp'; amount: number }
  | { type: 'set_role'; role: 'ADMIN' | 'DEALER' | 'CUSTOMER' }
  | { type: 'send_notification'; title: string; message: string; notificationType?: 'info' | 'success' | 'warning' | 'error' };

export type AutomationRuleDraft = {
  name: string;
  description?: string;
  triggerType?: 'manual' | 'schedule' | 'event';
  triggerConfig?: Record<string, unknown>;
  condition: AutomationCondition;
  actions: AutomationAction[];
  isActive?: boolean;
  priority?: number;
  requiresApproval?: boolean;
};

export type AutomationRunResult = {
  affectedCount: number;
  successCount: number;
  failedCount: number;
  failures: Array<{ userId: string; error: string }>;
  sampleUserIds: string[];
};
