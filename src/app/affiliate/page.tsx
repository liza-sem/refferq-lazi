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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Copy,
  Check,
  Users,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { nextPayoutAmountLabel, nextPayoutHint } from '@/lib/payout-copy';

interface AffiliateStats {
  unpaidBalanceCents: number;
  nextPayoutCents: number;
  nextPayoutAt: string | null;
  referredCount: number;
  totalClicks: number;
  referralLink: string;
  referralCode: string;
  currencySymbol: string;
  commissionRate: number;
  announcement: string;
}

interface Referral {
  id: string;
  publicId: string;
  label: string;
  maskedEmail: string;
  country?: string | null;
  amountCents: number;
  status: string;
  createdAt: string;
}

export default function AffiliateDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<AffiliateStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      loadDashboardData();
    }
  }, [authLoading, user]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/affiliate/profile');
      const data = await response.json();

      if (data.success) {
        setStats({
          unpaidBalanceCents: data.stats?.unpaidBalanceCents ?? 0,
          nextPayoutCents: data.stats?.nextPayoutCents ?? 0,
          nextPayoutAt: data.stats?.nextPayoutAt || null,
          referredCount: data.stats?.referredCount ?? 0,
          totalClicks: data.stats?.totalClicks || 0,
          referralLink: data.referralLink || data.stats?.referralLink || '',
          referralCode: data.affiliate?.referralCode || '',
          currencySymbol: data.currencySymbol || '$',
          commissionRate: data.stats?.commissionRate ?? 20,
          announcement: data.announcement || '',
        });
        setReferrals(data.referrals || []);
        setCurrencySymbol(data.currencySymbol || '$');
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCode = async () => {
    try {
      const response = await fetch('/api/affiliate/generate-code', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        window.location.reload();
      } else {
        showNotification('error', 'Failed to generate code: ' + data.error);
      }
    } catch (_e) {
      showNotification('error', 'Failed to generate code. Please try again.');
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const copyToClipboard = (text: string, type: 'link' | 'code') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'success' | 'pending' | 'destructive' | 'warning' | 'info'; label: string }> = {
      APPROVED: { variant: 'success', label: 'Approved' },
      COMPLETED: { variant: 'success', label: 'Completed' },
      PAID: { variant: 'success', label: 'Paid' },
      PENDING: { variant: 'pending', label: 'Pending' },
      PROCESSING: { variant: 'info', label: 'Processing' },
      REJECTED: { variant: 'destructive', label: 'Rejected' },
      FAILED: { variant: 'destructive', label: 'Failed' },
    };
    const { variant, label } = map[status] || { variant: 'pending' as const, label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  if (authLoading || loading) {
    return <DashboardSkeleton />;
  }

  const unpaid = stats?.unpaidBalanceCents || 0;
  const nextCents = stats?.nextPayoutCents || 0;
  const nextAt = stats?.nextPayoutAt || null;
  const referred = stats?.referredCount || 0;
  const clicks = stats?.totalClicks || 0;
  const nextValue = nextPayoutAmountLabel(nextCents, nextAt, currencySymbol);
  const nextHint = nextPayoutHint(nextCents, nextAt);

  const metrics: Array<{ title: string; value: string; hint?: string }> = [
    {
      title: 'Unpaid',
      value: formatMoney(unpaid, currencySymbol),
    },
    {
      title: 'Next payout',
      value: nextCents > 0 ? formatMoney(nextCents, currencySymbol) : nextValue,
      hint: nextHint,
    },
    {
      title: 'Referred',
      value: String(referred),
      hint: clicks > 0 ? `${clicks} click${clicks === 1 ? '' : 's'}` : undefined,
    },
  ];

  return (
    <div className="space-y-12">
      {notification && (
        <Alert variant={notification.type === 'error' ? 'destructive' : 'default'} className="border-0 bg-secondary">
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{notification.message}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg bg-status-sage-bg px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-status-sage">
          {stats?.announcement || `Earn ${stats?.commissionRate ?? 20}% on paid customers`}
        </p>
        <p className="mt-1 text-base">Share your link. Stripe confirms the sale.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Email hello@lazi.studio if something looks wrong.
        </p>
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
          <CardTitle className="text-base">Your referral link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!stats?.referralCode ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm">No referral code yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate a code to start earning commissions
              </p>
              <Button className="mt-4" onClick={handleGenerateCode}>
                Generate referral code
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Referral link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={stats?.referralLink || ''} className="font-mono text-sm" />
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => copyToClipboard(stats?.referralLink || '', 'link')}
                  >
                    {copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Referral code</Label>
                <div className="flex gap-2">
                  <Input readOnly value={stats?.referralCode || ''} className="font-mono text-sm" />
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => copyToClipboard(stats?.referralCode || '', 'code')}
                  >
                    {copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base">Recent referrals</CardTitle>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <a href="/affiliate/referrals" className="hover:text-foreground">All referrals</a>
            <a href="/affiliate/reports" className="hover:text-foreground">Reports</a>
            <a href="/affiliate/resources" className="hover:text-foreground">Resources</a>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {referrals.length === 0 ? (
            <EmptyState icon={Users} message="No referrals yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Sale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.slice(0, 5).map((ref) => (
                  <TableRow key={ref.id}>
                    <TableCell className="font-mono text-sm">{ref.publicId}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ref.label}
                      {ref.maskedEmail ? ` · ${ref.maskedEmail}` : ''}
                    </TableCell>
                    <TableCell>{getStatusBadge(ref.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(ref.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(ref.amountCents, currencySymbol)}
                    </TableCell>
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

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="mb-3 h-5 w-5 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-12">
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="grid gap-10 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-8 w-28" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        ))}
      </div>
      <Card>
        <CardContent className="space-y-4 p-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
