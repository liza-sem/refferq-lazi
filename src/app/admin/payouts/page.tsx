'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowUpRight,
  Ban,
  Download,
} from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { humanPayoutStatus } from '@/lib/payout-status';

interface Payout {
  id: string;
  affiliateId: string;
  affiliateName: string;
  affiliateEmail: string;
  amountCents: number;
  commissionCount: number;
  status: string;
  paypalStatus?: string | null;
  method: string;
  notes: string | null;
  createdAt: string;
  processedAt: string | null;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  PENDING: { label: 'Unpaid', variant: 'secondary', icon: Clock },
  PROCESSING: { label: 'Sent to PayPal', variant: 'outline', icon: Loader2 },
  COMPLETED: { label: 'Paid', variant: 'default', icon: CheckCircle2 },
  FAILED: { label: 'Failed', variant: 'destructive', icon: XCircle },
};

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [autoStatus, setAutoStatus] = useState<{
    autoPayoutEnabled: boolean;
    autoPayoutDripSize: number;
    lastAutoPayoutAt: string | null;
    paypalConfigured: boolean;
    paypalMode: 'sandbox' | 'live';
    refundHoldDays: number;
    payoutFrequencyLabel: string;
    minPayoutCents: number;
    eligibleAffiliates: number;
    payableThisRun: number;
  } | null>(null);

  useEffect(() => {
    fetchPayouts();
    fetchAutoStatus();
  }, []);

  const fetchAutoStatus = async () => {
    try {
      const res = await fetch('/api/admin/payouts/auto');
      const data = await res.json();
      if (data.success && data.config) {
        setAutoStatus({
          autoPayoutEnabled: data.config.autoPayoutEnabled,
          autoPayoutDripSize: data.config.autoPayoutDripSize,
          lastAutoPayoutAt: data.config.lastAutoPayoutAt,
          paypalConfigured: data.config.paypalConfigured,
          paypalMode: data.config.paypalMode === 'live' ? 'live' : 'sandbox',
          refundHoldDays: data.config.refundHoldDays ?? data.config.commissionHoldDays ?? 0,
          payoutFrequencyLabel: data.config.payoutFrequencyLabel || 'Monthly',
          minPayoutCents: data.config.minPayoutCents,
          eligibleAffiliates: data.stats?.eligibleAffiliates || 0,
          payableThisRun: data.stats?.payableThisRun || 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch auto-payout status:', error);
    }
  };

  const fetchPayouts = async () => {
    try {
      const res = await fetch('/api/admin/payouts');
      const data = await res.json();
      if (data.success) {
        setPayouts(data.payouts || []);
        setCurrencySymbol(data.currencySymbol || '$');
      }
    } catch (error) {
      console.error('Failed to fetch payouts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/admin/payouts?format=csv');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payouts-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export payouts:', error);
    }
  };

  if (loading) {
    return <PayoutsSkeleton />;
  }

  const filtered = payouts.filter((p) => statusFilter === 'all' || p.status === statusFilter);

  const stats = {
    total: payouts.length,
    pending: payouts.filter((p) => p.status === 'PENDING').length,
    completed: payouts.filter((p) => p.status === 'COMPLETED').length,
    totalPaid: payouts
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amountCents, 0),
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payouts</h1>
        <p className="text-muted-foreground">Manage partner commission payouts</p>
      </div>

      {autoStatus && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Automatic PayPal payouts</CardTitle>
              <Badge variant={autoStatus.paypalMode === 'live' ? 'destructive' : 'secondary'}>
                {autoStatus.paypalMode === 'live' ? 'Live' : 'Sandbox'}
              </Badge>
            </div>
            <CardDescription>
              {autoStatus.autoPayoutEnabled
                ? `On — cron pays up to ${autoStatus.autoPayoutDripSize} affiliate${autoStatus.autoPayoutDripSize === 1 ? '' : 's'} per run once each commission’s term is due (7 / 14 days or 1 / 3 months after approval). Default is ${autoStatus.payoutFrequencyLabel.toLowerCase()}.`
                : 'Off — turn this on in Program Settings.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Last run:{' '}
              {autoStatus.lastAutoPayoutAt
                ? new Date(autoStatus.lastAutoPayoutAt).toLocaleString()
                : 'not yet'}
              {' · '}
              PayPal {autoStatus.paypalConfigured ? 'connected' : 'keys missing'}
              {' · '}
              {autoStatus.eligibleAffiliates} waiting
              {autoStatus.payableThisRun > 0 ? ` · ${autoStatus.payableThisRun} payable this run` : ''}
              {' · '}
              min {formatMoney(autoStatus.minPayoutCents, currencySymbol)}
            </p>
            {autoStatus.refundHoldDays > 0 && (
              <p>
                Refund hold is {autoStatus.refundHoldDays} day{autoStatus.refundHoldDays === 1 ? '' : 's'} after a sale (not the cookie, not the payout term). Test a partner from their profile with Create payout — that skips the term wait.
              </p>
            )}
            {autoStatus.paypalMode !== 'live' ? (
              <p>
                Sandbox is on. Test payouts go to PayPal’s sandbox, not real money. Keep it this way until you paste Live keys and set <span className="font-mono">PAYPAL_MODE=live</span>.
              </p>
            ) : (
              <p>Live mode sends real PayPal payouts. Switch back to sandbox in Dokploy if you are still testing.</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Payouts</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <span className="text-sm font-bold text-muted-foreground">{currencySymbol}</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMoney(stats.totalPaid, currencySymbol)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Payout History</CardTitle>
              <CardDescription>All partner payout records</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="PENDING">Unpaid</SelectItem>
                  <SelectItem value="PROCESSING">Sent to PayPal</SelectItem>
                  <SelectItem value="COMPLETED">Paid</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No payouts found</h3>
              <p className="text-sm text-muted-foreground">Payouts will appear here once processed</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Commissions</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Processed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((payout) => {
                  const cfg = statusConfig[payout.status] || statusConfig.PENDING;
                  return (
                    <TableRow key={payout.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{payout.affiliateName}</p>
                          <p className="text-xs text-muted-foreground">{payout.affiliateEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">
                          {formatMoney(payout.amountCents, currencySymbol)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{payout.commissionCount}</TableCell>
                      <TableCell className="text-sm">{payout.method || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{humanPayoutStatus(payout.status, payout.paypalStatus)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(payout.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {payout.processedAt
                          ? new Date(payout.processedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                          : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayoutsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-7 w-36 mb-1" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-6 w-32 mb-1" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
