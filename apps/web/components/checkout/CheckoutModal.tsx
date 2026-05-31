'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { OrderDto } from '@smart-dining/shared';

import { ApiError } from '@/lib/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { sessionKeys } from '@/lib/api/fetchers';
import { tableOrdersKey } from '@/lib/api/orders';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSendOtp, useVerifyOtp, usePlaceOrder } from '@/lib/hooks/useCheckout';
import { useIdentityStore } from '@/lib/stores/identity';

import { OrderConfirmation } from './OrderConfirmation';
import { OtpInput } from './OtpInput';

const ContactSchema = z.object({
  customerName: z.string().min(1, 'Required').max(100),
  customerPhone: z
    .string()
    .regex(/^\+?[1-9]\d{6,14}$/, 'Use international format e.g. +919876543210'),
});

type ContactForm = z.infer<typeof ContactSchema>;

type Step = 'contact' | 'otp' | 'placing' | 'failed' | 'done';

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CheckoutModal({ open, onOpenChange }: CheckoutModalProps) {
  const sessionId = useIdentityStore((s) => s.sessionId);
  const tableId = useIdentityStore((s) => s.tableId);
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('contact');
  const [phone, setPhone] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [otpToken, setOtpToken] = useState<string | null>(null);
  const [debugOtp, setDebugOtp] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDto | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();
  const placeOrder = usePlaceOrder(sessionId);

  const contactForm = useForm<ContactForm>({
    resolver: zodResolver(ContactSchema),
    defaultValues: { customerName: '', customerPhone: '+91' },
  });

  const resetAll = () => {
    setStep('contact');
    setPhone('');
    setName('');
    setOtp('');
    setOtpToken(null);
    setDebugOtp(null);
    setOrder(null);
    contactForm.reset();
  };

  /**
   * When the confirmation closes, the placed session is `ordered` and
   * unusable for further mutations. Invalidate the session query so the
   * next request creates a fresh active session — the diner can keep
   * adding items (drinks, dessert) without a full page refresh.
   * Also surface the new order in the per-table orders list.
   */
  const recycleSessionAndShowOrders = () => {
    if (tableId) {
      queryClient.invalidateQueries({ queryKey: sessionKeys.forTable(tableId) });
      queryClient.invalidateQueries({ queryKey: tableOrdersKey(tableId) });
    }
  };

  const handleClose = (next: boolean) => {
    if (!next && step === 'done') {
      resetAll();
      recycleSessionAndShowOrders();
    }
    if (!next && step !== 'placing') {
      onOpenChange(next);
    }
  };

  const onSubmitContact = contactForm.handleSubmit(async (values) => {
    const result = await sendOtp.mutateAsync(values.customerPhone);
    setPhone(values.customerPhone);
    setName(values.customerName);
    if (result.debugCode) setDebugOtp(result.debugCode);
    setStep('otp');
  });

  const onSubmitOtp = async () => {
    if (otp.length !== 6) {
      toast.error('Enter all 6 digits.');
      return;
    }
    try {
      const verified = await verifyOtp.mutateAsync({ phone, code: otp });
      setOtpToken(verified.token);
      setStep('placing');
      const placed = await placeOrder.mutateAsync({
        customerName: name,
        customerPhone: phone,
        otpToken: verified.token,
      });
      setOrder(placed.order);
      setStep('done');
    } catch (err) {
      // OrderValidationAgent rejected: stock issue, empty cart, business rule.
      // Surface the structured message instead of dead-ending the spinner.
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong placing your order.';
      setFailureReason(message);
      setStep('failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        {step === 'contact' && (
          <>
            <DialogHeader>
              <DialogTitle>Almost there</DialogTitle>
              <DialogDescription>
                We need a name and a phone number for the kitchen to call out your order.
              </DialogDescription>
            </DialogHeader>
            <form className="space-y-4" onSubmit={onSubmitContact}>
              <div className="space-y-2">
                <Label htmlFor="customer-name">Name</Label>
                <Input
                  id="customer-name"
                  placeholder="Priya"
                  {...contactForm.register('customerName')}
                />
                {contactForm.formState.errors.customerName && (
                  <p className="text-xs text-destructive">
                    {contactForm.formState.errors.customerName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-phone">Phone</Label>
                <Input
                  id="customer-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+919876543210"
                  {...contactForm.register('customerPhone')}
                />
                {contactForm.formState.errors.customerPhone && (
                  <p className="text-xs text-destructive">
                    {contactForm.formState.errors.customerPhone.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full tap-target"
                disabled={sendOtp.isPending}
              >
                {sendOtp.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Send OTP
              </Button>
            </form>
          </>
        )}

        {step === 'otp' && (
          <>
            <DialogHeader>
              <DialogTitle>Enter the OTP</DialogTitle>
              <DialogDescription>
                Sent to <span className="font-medium">{phone}</span>. Expires in 5 minutes.
              </DialogDescription>
            </DialogHeader>
            <OtpInput value={otp} onChange={setOtp} autoFocus />
            {debugOtp && (
              <p className="rounded-md bg-amber-100 px-3 py-2 text-center text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Demo OTP: <span className="font-mono font-semibold">{debugOtp}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 tap-target"
                onClick={() => setStep('contact')}
                disabled={verifyOtp.isPending || placeOrder.isPending}
              >
                Back
              </Button>
              <Button
                type="button"
                className="flex-1 tap-target"
                onClick={() => void onSubmitOtp()}
                disabled={verifyOtp.isPending || placeOrder.isPending || otp.length !== 6}
              >
                {(verifyOtp.isPending || placeOrder.isPending) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Verify
              </Button>
            </div>
          </>
        )}

        {step === 'placing' && (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="relative">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <ShieldCheck className="absolute -bottom-1 -right-2 h-4 w-4 text-emerald-600" />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium">Zara is double-checking your order</p>
              <p className="text-xs text-muted-foreground">
                Confirming stock, totals, and kitchen availability…
              </p>
            </div>
          </div>
        )}

        {step === 'failed' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">We couldn&apos;t place the order</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {failureReason ?? 'Please check your cart and try again.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 tap-target"
                onClick={() => {
                  // Reset OTP — they'll need a fresh code anyway since the token was consumed.
                  setStep('contact');
                  setOtp('');
                  setOtpToken(null);
                  setFailureReason(null);
                }}
              >
                Try again
              </Button>
              <Button
                type="button"
                className="flex-1 tap-target"
                onClick={() => {
                  resetAll();
                  onOpenChange(false);
                }}
              >
                Back to cart
              </Button>
            </div>
          </div>
        )}

        {step === 'done' && order && (
          <OrderConfirmation
            order={order}
            onClose={() => {
              resetAll();
              recycleSessionAndShowOrders();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
