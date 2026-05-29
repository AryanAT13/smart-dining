import type { SessionStatus } from '@prisma/client';

import type { Language } from '@smart-dining/shared';
import type { UserPreferences } from '@smart-dining/shared';

export interface SessionView {
  id: string;
  tableId: string;
  status: SessionStatus;
  preferences: UserPreferences;
  conversationSummary: string | null;
  language: Language | null;
  createdAt: Date;
  expiresAt: Date;
  closedAt: Date | null;
}
