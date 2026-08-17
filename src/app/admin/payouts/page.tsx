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
  Ban,
  Download,
} from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { humanPayoutStatus } from '@/lib/payout-status';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

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
  CANCELED: { label: 'Cancelled', variant: 'outline', icon: Ban },
};

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [autoStatus, setAutoStatus] = useState<{
    autoPayoutEnabled: boolean;
    autoPayoutDripSize: number;
    lastAutoPayoutAt: string | null;
    paypalConfigured: boolean;
    paypalMode: 'sandbox' | 'live';
    refundHoldDays: number;
    payoutFrequencyLabel: string;
    paydayLabel?: string;
    minPayoutCents: number;
    eligibleAffiliates: number;
    payableThisRun: number;
  } | null>(null);
  const [eligible, setEligible] = useState<Array<{
    affiliateId: string;
    name: string;
    email: string;
    paypalEmail: string;
    amountCents: number;
    commissionCount: number;
    belowThreshold: boolean;
  }>>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [skipThreshold, setSkipThreshold] = useState(false);
  const [paying, setPaying] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [runAt, setRunAt] = useState('');
  const [scheduledJobs, setScheduledJobs] = useState<Array<{
    id: string;
    runAt: string;
    affiliateIds: unknown;
    skipThreshold: boolean;
    status: string;
  }>>([]);

  useEffect(() => {
    fetchPayouts();
    fetchAutoStatus();
    fetchEligible();
    fetchScheduled();
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
          refundHoldDays: data.config.refundHoldDays ?? data.config.commissionHoldDays ?? 30,
          payoutFrequencyLabel: data.config.payoutFrequencyLabel || 'Monthly',
          paydayLabel: data.config.paydayLabel,
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

  const handleCancel = async (payoutId: string) => {
    if (!confirm('Cancel this payout? It will stop retrying. Unpaid commissions go back to the partner.')) return;
    setCancellingId(payoutId);
    try {
      const res = await fetch('/api/admin/payouts/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Could not cancel payout');
        return;
      }
      await fetchPayouts();
    } catch (error) {
      console.error('Failed to cancel payout:', error);
    } finally {
      setCancellingId(null);
    }
  };

  const fetchEligible = async () => {
    try {
      const res = await fetch('/api/admin/payouts/eligible');
      const data = await res.json();
      if (data.success) {
        setEligible(data.partners || []);
        setSelectedIds([]);
      }
    } catch (error) {
      console.error('Failed to fetch eligible partners:', error);
    }
  };

  const fetchScheduled = async () => {
    try {
      const res = await fetch('/api/admin/payouts/schedule');
      const data = await res.json();
      if (data.success) setScheduledJobs(data.jobs || []);
    } catch (error) {
      console.error('Failed to fetch scheduled payouts:', error);
    }
  };

  const visibleEligible = skipThreshold ? eligible : eligible.filter((p) => !p.belowThreshold);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleManualPay = async () => {
    if (selectedIds.length === 0) {
      alert('Select at least one partner');
      return;
    }
    if (!confirm(`Pay ${selectedIds.length} selected partner(s) via PayPal now?`)) return;
    setPaying(true);
    try {
      const res = await fetch('/api/admin/payouts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ affiliateIds: selectedIds, skipThreshold }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Payout failed');
        return;
      }
      alert(data.message);
      await Promise.all([fetchPayouts(), fetchEligible(), fetchAutoStatus()]);
    } catch (error) {
      console.error('Manual payout failed:', error);
      alert('Payout failed');
    } finally {
      setPaying(false);
    }
  };

  const tomorrowAt = (hour = 10) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleSchedule = async () => {
    if (!runAt) {
      alert('Pick a date and time');
      return;
    }
    setScheduling(true);
    try {
      const res = await fetch('/api/admin/payouts/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runAt: new Date(runAt).toISOString(),
          affiliateIds: selectedIds,
          skipThreshold,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || 'Could not schedule payout');
        return;
      }
      alert(data.message);
      setRunAt('');
      await fetchScheduled();
    } catch (error) {
      console.error('Schedule failed:', error);
      alert('Could not schedule payout');
    } finally {
      setScheduling(false);
    }
  };

  const handleCancelSchedule = async (id: string) => {
    if (!confirm('Cancel this scheduled payout? Automatic payday will run as usual.')) return;
    await fetch(`/api/admin/payouts/schedule?id=${id}`, { method: 'DELETE' });
    await fetchScheduled();
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedIds.length > 0) params.set('affiliateIds', selectedIds.join(','));
      if (skipThreshold) params.set('skipThreshold', '1');
      const res = await fetch(`/api/admin/payouts/paypal-csv?${params.toString()}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `paypal-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
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
                ? `On — cron pays up to ${autoStatus.autoPayoutDripSize} affiliate${autoStatus.autoPayoutDripSize === 1 ? '' : 's'} per run using the payout type on Program Settings. ${autoStatus.paydayLabel || autoStatus.payoutFrequencyLabel}.`
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
                Hold is {autoStatus.refundHoldDays} day{autoStatus.refundHoldDays === 1 ? '' : 's'} after a confirmed sale. Cancel an in-flight payout to stop retries.
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pay partners</CardTitle>
          <CardDescription>
            Select partners with matured unpaid commissions. Pay now, schedule an override of the automatic payday, or download a PayPal Payouts CSV.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="skipThreshold" checked={skipThreshold} onCheckedChange={setSkipThreshold} />
              <Label htmlFor="skipThreshold">Ignore min payout threshold</Label>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(visibleEligible.map((p) => p.affiliateId))}>
              Select all eligible
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
          </div>

          {visibleEligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No eligible partners right now.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>PayPal</TableHead>
                  <TableHead>Eligible</TableHead>
                  <TableHead>Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleEligible.map((partner) => (
                  <TableRow key={partner.affiliateId}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(partner.affiliateId)}
                        onCheckedChange={() => toggleSelected(partner.affiliateId)}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{partner.name}</p>
                      <p className="text-xs text-muted-foreground">{partner.email}</p>
                    </TableCell>
                    <TableCell className="text-sm">{partner.paypalEmail}</TableCell>
                    <TableCell className="font-medium">
                      {formatMoney(partner.amountCents, currencySymbol)}
                      {partner.belowThreshold ? (
                        <span className="ml-2 text-xs text-muted-foreground">below min</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{partner.commissionCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <Button onClick={handleManualPay} disabled={paying || selectedIds.length === 0}>
              {paying ? 'Paying…' : `Pay selected (${selectedIds.length})`}
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              PayPal CSV
            </Button>
          </div>

          <div className="grid gap-3 rounded-md border p-4 md:grid-cols-3">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="runAt">Schedule override (replaces automatic payday for this cycle)</Label>
              <Input id="runAt" type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRunAt(tomorrowAt(10))}>
                Tomorrow 10:00
              </Button>
              <Button onClick={handleSchedule} disabled={scheduling || !runAt}>
                {scheduling ? 'Saving…' : selectedIds.length > 0 ? 'Schedule selected' : 'Schedule all eligible'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground md:col-span-3">
              Cron runs this at the chosen time instead of the automatic 15th (or whatever payday is set). Leave partners unselected to pay everyone eligible.
            </p>
          </div>

          {scheduledJobs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Upcoming scheduled payouts</p>
              {scheduledJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    {new Date(job.runAt).toLocaleString()} · {job.status}
                    {Array.isArray(job.affiliateIds) && job.affiliateIds.length > 0
                      ? ` · ${job.affiliateIds.length} partner(s)`
                      : ' · all eligible'}
                    {job.skipThreshold ? ' · ignore threshold' : ''}
                  </span>
                  {job.status === 'PENDING' ? (
                    <Button variant="ghost" size="sm" onClick={() => handleCancelSchedule(job.id)}>Cancel</Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

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
                PayPal CSV
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
                  <SelectItem value="CANCELED">Cancelled</SelectItem>
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
                  <TableHead className="text-right"> </TableHead>
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
                      <TableCell className="text-right">
                        {['PENDING', 'PROCESSING', 'FAILED'].includes(payout.status) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(payout.id)}
                            disabled={cancellingId === payout.id}
                          >
                            {cancellingId === payout.id ? 'Cancelling…' : 'Cancel'}
                          </Button>
                        ) : null}
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
