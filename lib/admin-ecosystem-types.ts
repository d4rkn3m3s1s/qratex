import type { Role } from '@prisma/client';

export type EcosystemSummaryPayload = {
  generatedAt: string;
  totalUsers: number;
  usersByRole: Record<Role, number>;
  feedbacksLast7Days: number;
  consumptionsLast7Days: number;
};
