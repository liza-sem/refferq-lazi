'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import {
  formatHoldUntil,
  holdCopy,
  nextPayoutHint,
  payoutScheduleLine,
  inPayoutHint,
  PAYPAL_CONFIRM_HINT,
} from '@/lib/payout-copy';
import { humanPayoutStatus } from '@/lib/payout-status';
import { DEFAULT_PAYOUT_DAY_OF_MONTH, DEFAULT_PAYOUT_WEEKDAY } from '@/lib/payout-schedule';

interface Payout {
  id: string;
  amount: number;
  status: string;
  displayStatus?: string;
  paypalStatus?: string | null;
  method: string;
  createdAt: string;
  paidAt?: string;
}

export default function PayoutsPage() {
  const { user, loading: authLoading } = useAuth();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingHoldCents, setPendingHoldCents] = useState(0);
  const [availableCents, setAvailableCents] = useState(0);
  const [nextPayoutCents, setNextPayoutCents] = useState(0);
  const [inPayoutCents, setInPayoutCents] = useState(0);
  const [paidSoFarCents, setPaidSoFarCents] = useState(0);
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [schedule, setSchedule] = useState({
    payoutFrequency: 'MONTHLY',
    payoutWeekday: DEFAULT_PAYOUT_WEEKDAY,
    payoutDayOfMonth: DEFAULT_PAYOUT_DAY_OF_MONTH,
    payoutType: 'MASS',
    allowPartnerPayNow: false,
    minimumPayoutCents: 0,
    commissionHoldDays: 30,
    nextPayoutAt: null as string | null,
    nextMaturesAt: null as string | null,
  });
  const [payingNow, setPayingNow] = useState(false);
  const [hasPaypalEmail, setHasPaypalEmail] = useState(false);
  const [payoutInFlight, setPayoutInFlight] = useState(false);
  const [payNowError, setPayNowError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) fetchPayouts();
  }, [authLoading, user]);

  const fetchPayouts = async () => {
    try {
      setLoading(true);
      const payRes = await fetch('/api/affiliate/payouts');
      const payData = await payRes.json();
      if (payData.success) {
        setPayouts(payData.payouts || []);
        setPendingHoldCents(payData.pendingHoldCents || 0);
        setAvailableCents(payData.availableCents || 0);
        setNextPayoutCents(payData.nextPayoutCents || 0);
        setInPayoutCents(payData.inPayoutCents || 0);
        setPaidSoFarCents(payData.paidSoFarCents || 0);
        setCurrencySymbol(payData.currencySymbol || '$');
        setHasPaypalEmail(Boolean(payData.hasPaypalEmail));
        setPayoutInFlight(Boolean(payData.payoutInFlight));
        if (payData.schedule) {
          setSchedule({
            payoutFrequency: payData.schedule.payoutFrequency || 'MONTHLY',
            payoutWeekday: payData.schedule.payoutWeekday ?? DEFAULT_PAYOUT_WEEKDAY,
            payoutDayOfMonth: payData.schedule.payoutDayOfMonth ?? DEFAULT_PAYOUT_DAY_OF_MONTH,
            payoutType: payData.schedule.payoutType || 'MASS',
            allowPartnerPayNow: Boolean(payData.schedule.allowPartnerPayNow),
            minimumPayoutCents: payData.schedule.minimumPayoutCents ?? 0,
            commissionHoldDays: payData.schedule.commissionHoldDays ?? 30,
            nextPayoutAt: payData.schedule.nextPayoutAt || null,
            nextMaturesAt: payData.schedule.nextMaturesAt || null,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePayNow = async () => {
    setPayingNow(true);
    setPayNowError(null);
    try {
      const res = await fetch('/api/affiliate/payouts', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPayNowError(data.error || 'Could not send payout');
        return;
      }
      await fetchPayouts();
    } catch (_e) {
      setPayNowError('Could not send payout');
    } finally {
      setPayingNow(false);
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  const getStatusBadge = (payout: Payout) => {
    const label = payout.displayStatus || humanPayoutStatus(payout.status, payout.paypalStatus);
    const map: Record<string, { variant: 'success' | 'pending' | 'destructive' | 'info' }> = {
      Paid: { variant: 'success' },
      'Sent to PayPal': { variant: 'info' },
      Unpaid: { variant: 'pending' },
      Failed: { variant: 'destructive' },
    };
    const variant = map[label]?.variant || 'pending';
    return <Badge variant={variant}>{label}</Badge>;
  };

  const exportCSV = () => {
    const headers = ['Date', 'Method', 'Status', 'Amount'];
    const rows = payouts.map((p) => [
      formatDate(p.paidAt || p.createdAt),
      p.method,
      p.displayStatus || humanPayoutStatus(p.status, p.paypalStatus),
      (p.amount / 100).toFixed(2),
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-12">
        <Skeleton className="h-8 w-32" />
        <div className="grid gap-10 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-8 w-28" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const holdHint = formatHoldUntil(schedule.nextMaturesAt);
  const nextHint = nextPayoutHint(nextPayoutCents, schedule.nextPayoutAt);
  const sentHint = inPayoutHint(inPayoutCents, currencySymbol);

  const metrics: Array<{ title: string; value: string; hint?: string }> = [
    {
      title: 'Pending',
      value: formatMoney(pendingHoldCents, currencySymbol),
      hint: pendingHoldCents > 0 ? holdHint || 'Chargeback hold' : undefined,
    },
    inPayoutCents > 0
      ? {
          title: 'In payout',
          value: formatMoney(inPayoutCents, currencySymbol),
          hint: sentHint,
        }
      : {
          title: 'Unpaid',
          value: formatMoney(availableCents, currencySymbol),
          hint: availableCents > 0 ? nextHint : undefined,
        },
    {
      title: 'Paid out',
      value: formatMoney(paidSoFarCents, currencySymbol),
    },
  ];

  return (
    <div className="space-y-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-tight">Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {payoutScheduleLine(schedule.payoutFrequency, {
              weekday: schedule.payoutWeekday,
              dayOfMonth: schedule.payoutDayOfMonth,
            }, schedule.payoutType)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {holdCopy(schedule.commissionHoldDays)}
          </p>
          {schedule.allowPartnerPayNow && availableCents >= schedule.minimumPayoutCents && availableCents > 0 && !payoutInFlight ? (
            <div className="mt-3">
              <Button onClick={handlePayNow} disabled={payingNow || !hasPaypalEmail} size="sm">
                {payingNow ? 'Sending…' : 'Pay out now'}
              </Button>
              {payNowError ? <p className="mt-1 text-xs text-destructive">{payNowError}</p> : null}
              {!hasPaypalEmail ? (
                <p className="mt-1 text-xs text-muted-foreground">Add a PayPal email in Settings first.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        {payouts.length > 0 && (
          <Button variant="ghost" size="sm" onClick={exportCSV} className="gap-1.5 text-muted-foreground">
            <Download className="h-4 w-4" />
            Export
          </Button>
        )}
      </div>

      <div className="grid gap-10 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.title}>
            <p className="text-sm text-muted-foreground">{metric.title}</p>
            <p className="mt-2 text-3xl font-medium tracking-tight">{metric.value}</p>
            {metric.hint ? (
              <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
            ) : null}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">History</CardTitle>
          <p className="text-xs text-muted-foreground">{PAYPAL_CONFIRM_HINT}</p>
        </CardHeader>
        <CardContent className="p-0">
          {payouts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">No payouts sent yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="text-sm">{formatDate(payout.paidAt || payout.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{payout.method || 'PayPal'}</TableCell>
                    <TableCell>{getStatusBadge(payout)}</TableCell>
                    <TableCell className="text-right">{formatMoney(payout.amount, currencySymbol)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
