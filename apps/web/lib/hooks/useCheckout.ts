'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ApiError } from '@/lib/api/client';
import { cartKeys, placeOrder, sendOtp, verifyOtp } from '@/lib/api/fetchers';

export function useSendOtp() {
  return useMutation({
    mutationFn: (phone: string) => sendOtp({ phone }),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not send OTP.');
    },
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) => verifyOtp({ phone, code }),
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Invalid OTP.');
    },
  });
}

export function usePlaceOrder(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { customerName: string; customerPhone: string; otpToken: string }) => {
      if (!sessionId) throw new Error('No active session');
      return placeOrder(sessionId, vars);
    },
    onSuccess: () => {
      if (sessionId) queryClient.invalidateQueries({ queryKey: cartKeys.forSession(sessionId) });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not place order.');
    },
  });
}
