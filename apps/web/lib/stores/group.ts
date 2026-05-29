/**
 * Group store — who's currently at the table.
 * Driven entirely by socket events (session:user_joined, session:user_left).
 */

'use client';

import { create } from 'zustand';

interface GroupMember {
  displayName: string;
  joinedAt: number;
}

interface GroupState {
  members: GroupMember[];
  participantCount: number;
  upsertMember: (displayName: string, joinedAt: number, count: number) => void;
  removeMember: (displayName: string, count: number) => void;
  reset: () => void;
}

export const useGroupStore = create<GroupState>((set) => ({
  members: [],
  participantCount: 0,
  upsertMember: (displayName, joinedAt, count) =>
    set((state) => {
      const others = state.members.filter((m) => m.displayName !== displayName);
      return { members: [...others, { displayName, joinedAt }], participantCount: count };
    }),
  removeMember: (displayName, count) =>
    set((state) => ({
      members: state.members.filter((m) => m.displayName !== displayName),
      participantCount: count,
    })),
  reset: () => set({ members: [], participantCount: 0 }),
}));
