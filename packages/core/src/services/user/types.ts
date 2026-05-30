import type { UserPreferences } from '@smart-dining/shared';

export interface UserView {
  id: string;
  phoneHash: string;
  displayName: string | null;
  preferences: UserPreferences;
  visitCount: number;
  lastVisitAt: Date | null;
  createdAt: Date;
}

export interface UpsertUserInput {
  phoneE164: string;
  displayName?: string;
  preferencesPatch: UserPreferences;
}
