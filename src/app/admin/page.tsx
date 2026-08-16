'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, UserCheck } from 'lucide-react';

interface DashboardStats {
  totalRevenue: number;
  totalEstimatedRevenue: number;
  totalEstimatedCommission: number;
  totalClicks: number;
  totalLeads: number;
  totalReferredCustomers: number;
  totalAffiliates: number;
  pendingReferrals: number;
}

interface TopAffiliate {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  totalRevenue: number;
  totalReferrals: number;
}

interface RecentCustomer {
  id: string;
  leadName: string;
  leadEmail: string;
  affiliateName: string;
  amountPaid: number;
  status: string;
  createdAt: string;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topAffiliates, setTopAffiliates] = useState<TopAffiliate[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([]);
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role === 'ADMIN') {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, analyticsRes, referralsRes] = await Promise.all([
        fetch('/api/admin/dashboard'),
        fetch('/api/admin/analytics?days=30'),
        fetch('/api/admin/referrals'),
      ]);

      const [statsData, analyticsData, referralsData] = await Promise.all([
        statsRes.json(),
        analyticsRes.json(),
        referralsRes.json(),
      ]);

      if (statsData.success) {
        setCurrencySymbol(statsData.currencySymbol || '$');
        setStats({
          totalRevenue: statsData.stats.totalRevenue || 0,
          totalEstimatedRevenue: statsData.stats.totalEstimatedRevenue || 0,
          totalEstimatedCommission: statsData.stats.totalEstimatedCommission || 0,
          totalClicks: statsData.stats.totalClicks || 0,
          totalLeads: statsData.stats.totalReferrals || 0,
          totalReferredCustomers: statsData.stats.approvedReferrals || 0,
          totalAffiliates: statsData.stats.totalAffiliates || 0,
          pendingReferrals: statsData.stats.pendingReferrals || 0,
        });
      }

      if (analyticsData.success && analyticsData.analytics.topAffiliates) {
        setTopAffiliates(analyticsData.analytics.topAffiliates.slice(0, 5));
      }

      if (referralsData.success) {
        const recent = referralsData.referrals.slice(0, 10).map((ref: any) => ({
          id: ref.id,
          leadName: ref.leadName,
          leadEmail: ref.leadEmail,
          affiliateName: ref.affiliate.name,
          amountPaid: 0,
          status: ref.status,
          createdAt: ref.createdAt,
        }));
        setRecentCustomers(recent);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const conversionRate = stats && stats.totalLeads > 0
    ? ((stats.totalReferredCustomers / stats.totalLeads) * 100).toFixed(1)
    : '0.0';

  const metrics = [
    {
      title: 'Estimated revenue',
      value: `${currencySymbol}${stats ? (stats.totalEstimatedRevenue / 100).toFixed(2) : '0.00'}`,
      hint: 'Projected value',
    },
    {
      title: 'Confirmed revenue',
      value: `${currencySymbol}${stats ? (stats.totalRevenue / 100).toFixed(2) : '0.00'}`,
      hint: 'Approved transactions',
    },
    {
      title: 'Commission owed',
      value: `${currencySymbol}${stats ? (stats.totalEstimatedCommission / 100).toFixed(2) : '0.00'}`,
      hint: 'Pending payouts',
    },
    {
      title: 'Partners',
      value: String(stats?.totalAffiliates || 0),
      hint: 'Active affiliates',
    },
  ];

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-2xl tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Program performance at a glance
        </p>
      </div>

      <div className="grid gap-10 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.title}>
            <p className="text-sm text-muted-foreground">{metric.title}</p>
            <p className="mt-2 text-3xl font-medium tracking-tight">{metric.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{metric.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
        <ActivityItem
          label="Pending"
          value={stats?.pendingReferrals || 0}
          tone="pending"
          onClick={() => router.push('/admin/customers')}
        />
        <ActivityItem label="Leads" value={stats?.totalLeads || 0} tone="info" />
        <ActivityItem
          label="Conversions"
          value={stats?.totalReferredCustomers || 0}
          tone="success"
          extra={`${conversionRate}%`}
        />
        <div className="ml-auto flex flex-wrap gap-5 text-sm text-muted-foreground">
          <button type="button" className="hover:text-foreground" onClick={() => router.push('/admin/partners')}>
            Partners
          </button>
          <button type="button" className="hover:text-foreground" onClick={() => router.push('/admin/customers')}>
            Customers
          </button>
          <button type="button" className="hover:text-foreground" onClick={() => router.push('/admin/payouts')}>
            Payouts
          </button>
          <button type="button" className="hover:text-foreground" onClick={() => router.push('/admin/reports')}>
            Reports
          </button>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base">Top partners</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => router.push('/admin/partners')}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {topAffiliates.length > 0 ? (
              <div className="divide-y divide-border">
                {topAffiliates.map((affiliate) => (
                  <button
                    key={affiliate.id}
                    type="button"
                    className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/40 -mx-2 px-2 rounded-md"
                    onClick={() => router.push(`/admin/partners/${affiliate.id}`)}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-secondary text-xs">
                        {affiliate.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{affiliate.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{affiliate.referralCode}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm">{currencySymbol}{(affiliate.totalRevenue / 100).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{affiliate.totalReferrals} referrals</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No partners yet"
                description="Partners will appear here once they join"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base">Recent customers</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => router.push('/admin/customers')}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {recentCustomers.length > 0 ? (
              <div className="divide-y divide-border">
                {recentCustomers.slice(0, 5).map((customer) => (
                  <div key={customer.id} className="flex items-center gap-3 py-3">
                    <p className="w-12 shrink-0 text-xs text-muted-foreground">
                      {new Date(customer.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{customer.leadEmail}</p>
                      <p className="text-xs text-muted-foreground">via {customer.affiliateName}</p>
                    </div>
                    <StatusBadge status={customer.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={UserCheck}
                title="No customers yet"
                description="Referred customers will appear here"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActivityItem({
  label,
  value,
  tone,
  extra,
  onClick,
}: {
  label: string;
  value: number;
  tone: 'pending' | 'success' | 'info';
  extra?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="font-medium tabular-nums">{value}</span>
      <Badge variant={tone}>{label}</Badge>
      {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="flex items-center gap-2 hover:opacity-80" onClick={onClick}>
        {inner}
      </button>
    );
  }

  return <div className="flex items-center gap-2">{inner}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: 'success' | 'pending' | 'destructive'; label: string }> = {
    APPROVED: { variant: 'success', label: 'Approved' },
    PENDING: { variant: 'pending', label: 'Pending' },
    REJECTED: { variant: 'destructive', label: 'Rejected' },
  };
  const { variant, label } = config[status] || { variant: 'pending' as const, label: status };

  return (
    <Badge variant={variant} className="text-[10px] px-2 py-0.5">
      {label}
    </Badge>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-5 w-5 text-muted-foreground/50" />
      <p className="mt-3 text-sm text-muted-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground/70">{description}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-12">
      <div>
        <Skeleton className="mb-1 h-7 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-10 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-8 w-32" />
            <Skeleton className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-10 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="mb-1 h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
