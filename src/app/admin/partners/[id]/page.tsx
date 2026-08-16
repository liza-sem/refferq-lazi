'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft,
  Users,
  Wallet,
  DollarSign,
  CreditCard,
  Copy,
  ExternalLink,
  Loader2,
  MousePointerClick,
  Target,
  TrendingUp,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Ban,
  Lock,
} from 'lucide-react';
import { commissionPercent } from '@/lib/commission-rate';
import { formatMoney } from '@/lib/money';

interface Partner {
  id: string;
  name: string;
  email: string;
  referralCode: string;
  partnerGroup?: string;
  partnerGroupId?: string | null;
  partnerGroupLocked?: boolean;
  tierAssignedReason?: string | null;
  commissionRate: number;
  status: string;
  totalClicks: number;
  totalLeads: number;
  totalRevenue: number;
  createdAt: string;
}

interface Customer {
  id: string;
  publicId?: string | null;
  name: string;
  email: string;
  status: string;
  totalPaidCents: number;
  createdAt: string;
}

interface Commission {
  id: string;
  transactionId: string;
  customerName: string;
  amountCents: number;
  rate: number;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'COMPLETED' | 'REFUNDED';
  createdAt: string;
  maturesAt?: string | null;
  paidAt?: string;
}

interface PayoutPreview {
  paypalEmail: string | null;
  paypalConfigured: boolean;
  paypalMode: 'sandbox' | 'live';
  payoutFrequencyLabel: string;
  refundHoldDays: number;
  amountCents: number;
  pendingCount: number;
  approvedCount: number;
  canPay: boolean;
  canSkipHold: boolean;
  blockers: string[];
}

interface Payout {
  id: string;
  amountCents: number;
  commissionCount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  method?: string;
  createdAt: string;
  processedAt?: string;
}

export default function PartnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const partnerId = params.id as string;

  const [partner, setPartner] = useState<Partner | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [selectedCommissions, setSelectedCommissions] = useState<string[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutPreview, setPayoutPreview] = useState<PayoutPreview | null>(null);
  const [skipHold, setSkipHold] = useState(true);
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [editingPayout, setEditingPayout] = useState<Payout | null>(null);
  const [newStatus, setNewStatus] = useState<'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('PENDING');
  const [tiers, setTiers] = useState<{ id: string; name: string }[]>([]);
  const [savingTier, setSavingTier] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ADMIN')) {
      router.push('/login');
      return;
    }
    if (user && partnerId) {
      fetchPartnerData();
      fetchTiers();
      fetchCustomers();
      fetchCommissions();
      fetchPayouts();
    }
  }, [authLoading, user, partnerId]);

  const fetchPartnerData = async () => {
    try {
      const res = await fetch('/api/admin/affiliates');
      if (res.ok) {
        const data = await res.json();
        const affiliate = data.affiliates?.find((a: any) => a.id === partnerId);
        if (affiliate) {
          setPartner({
            id: affiliate.id,
            name: affiliate.name,
            email: affiliate.email,
            referralCode: affiliate.referralCode,
            partnerGroup: affiliate.partnerGroup,
            partnerGroupId: affiliate.partnerGroupId,
            partnerGroupLocked: Boolean(affiliate.partnerGroupLocked),
            tierAssignedReason: affiliate.tierAssignedReason,
            commissionRate: affiliate.commissionRate || 20,
            status: affiliate.status,
            totalClicks: affiliate.totalClicks || 0,
            totalLeads: affiliate.totalLeads || 0,
            totalRevenue: affiliate.totalRevenue || 0,
            createdAt: affiliate.createdAt,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching partner:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTiers = async () => {
    try {
      const res = await fetch('/api/admin/partner-groups');
      const data = await res.json();
      if (data.success) setTiers(data.partnerGroups || []);
    } catch (error) {
      console.error('Failed to fetch tiers:', error);
    }
  };

  const saveTier = async (patch: { partnerGroupId?: string; partnerGroupLocked?: boolean }) => {
    setSavingTier(true);
    try {
      const res = await fetch(`/api/admin/affiliates/${partnerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.success) {
        await fetchPartnerData();
      } else {
        alert(data.error || 'Failed to update tier');
      }
    } catch (error) {
      console.error('Failed to update tier:', error);
    } finally {
      setSavingTier(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/admin/referrals');
      if (res.ok) {
        const data = await res.json();
        const partnerCustomers = data.referrals
          ?.filter((r: any) => r.affiliateId === partnerId || r.affiliate?.id === partnerId)
          .map((r: any) => ({
            id: r.id,
            publicId: r.publicId,
            name: r.leadName,
            email: r.leadEmail,
            status: r.status,
            totalPaidCents: r.confirmedRevenueCents ?? Math.round((r.estimatedValue || 0) * 100),
            createdAt: r.createdAt,
          })) || [];
        setCustomers(partnerCustomers);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const fetchCommissions = async () => {
    try {
      const res = await fetch(`/api/admin/payouts/manual?affiliateId=${partnerId}`);
      if (res.ok) {
        const data = await res.json();
        const preview = data.preview;
        if (preview) {
          setPayoutPreview({
            paypalEmail: preview.paypalEmail,
            paypalConfigured: preview.paypalConfigured,
            paypalMode: preview.paypalMode === 'live' ? 'live' : 'sandbox',
            payoutFrequencyLabel: preview.payoutFrequencyLabel || 'Monthly',
            refundHoldDays: preview.refundHoldDays ?? 0,
            amountCents: preview.amountCents || 0,
            pendingCount: preview.pendingCount || 0,
            approvedCount: preview.approvedCount || 0,
            canPay: Boolean(preview.canPay),
            canSkipHold: Boolean(preview.canSkipHold),
            blockers: preview.blockers || [],
          });
          setSkipHold(preview.paypalMode !== 'live');
          const history = (preview.history || preview.commissions || []).map((c: Commission & { id: string }) => ({
            id: c.id,
            transactionId: c.id,
            customerName: c.customerName,
            amountCents: c.amountCents,
            rate: c.rate,
            status: c.status,
            createdAt: c.createdAt,
            maturesAt: c.maturesAt,
            paidAt: c.paidAt,
          }));
          setCommissions(history);
          const unpaidIds = (preview.commissions || []).map((c: { id: string }) => c.id);
          setSelectedCommissions(unpaidIds);
        }
      }
    } catch (error) {
      console.error('Error fetching commissions:', error);
    }
  };

  const fetchPayouts = async () => {
    try {
      const res = await fetch(`/api/admin/payouts?affiliateId=${partnerId}`);
      if (res.ok) {
        const data = await res.json();
        setPayouts(data.payouts || []);
      }
    } catch (error) {
      console.error('Error fetching payouts:', error);
    }
  };

  const handleCreatePayout = async () => {
    if (selectedCommissions.length === 0) {
      setPayoutMessage('Select at least one unpaid commission.');
      return;
    }
    setPayoutLoading(true);
    setPayoutMessage(null);
    try {
      const res = await fetch('/api/admin/payouts/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          affiliateId: partnerId,
          commissionIds: selectedCommissions,
          skipHold,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPayoutMessage(data.message || 'Payout sent.');
        setShowPayoutModal(false);
        setSelectedCommissions([]);
        fetchCommissions();
        fetchPayouts();
        alert(data.message || 'Payout sent.');
      } else {
        const reasons = Array.isArray(data.blockers) && data.blockers.length
          ? data.blockers.join(' ')
          : (data.error || 'Failed to create payout');
        setPayoutMessage(reasons);
      }
    } catch (error) {
      console.error('Error creating payout:', error);
      setPayoutMessage('Failed to create payout');
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleUpdatePayoutStatus = async () => {
    if (!editingPayout) return;
    setPayoutLoading(true);
    try {
      const res = await fetch('/api/admin/payouts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingPayout.id, status: newStatus }),
      });
      if (res.ok) {
        alert('Payout status updated successfully!');
        setShowStatusModal(false);
        setEditingPayout(null);
        fetchPayouts();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error || 'Failed to update payout status'}`);
      }
    } catch (error) {
      console.error('Error updating payout status:', error);
      alert('Failed to update payout status');
    } finally {
      setPayoutLoading(false);
    }
  };

  const openStatusModal = (payout: Payout) => {
    setEditingPayout(payout);
    setNewStatus(payout.status);
    setShowStatusModal(true);
  };

  const toggleCommissionSelection = (commissionId: string) => {
    setSelectedCommissions((prev) =>
      prev.includes(commissionId) ? prev.filter((id) => id !== commissionId) : [...prev, commissionId]
    );
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  const pendingCommissions = commissions.filter((c) => c.status === 'PENDING' || c.status === 'APPROVED');
  const pendingAmount = pendingCommissions.reduce((sum, c) => sum + c.amountCents, 0);
  const paidCommissions = commissions.filter((c) => c.status === 'PAID');
  const paidAmount = paidCommissions.reduce((sum, c) => sum + c.amountCents, 0);
  const payoutBlockers = payoutPreview?.blockers || [];

  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
      COMPLETED: { variant: 'default', icon: CheckCircle2 },
      PAID: { variant: 'default', icon: CheckCircle2 },
      ACTIVE: { variant: 'default', icon: CheckCircle2 },
      APPROVED: { variant: 'default', icon: CheckCircle2 },
      PENDING: { variant: 'secondary', icon: Clock },
      PROCESSING: { variant: 'secondary', icon: Loader2 },
      FAILED: { variant: 'destructive', icon: AlertCircle },
      REFUNDED: { variant: 'destructive', icon: Ban },
      REJECTED: { variant: 'destructive', icon: Ban },
    };
    const { variant, icon: Icon } = map[status] || { variant: 'outline' as const, icon: Clock };
    return (
      <Badge variant={variant} className="gap-1 text-xs">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  if (authLoading || loading) {
    return <DetailSkeleton />;
  }

  if (!partner) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Users className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Partner not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">This partner may have been removed</p>
        <Button className="mt-6" onClick={() => router.push('/admin/partners')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Partners
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.push('/admin/partners')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Partners
          </Button>
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                {(partner.name || 'P').charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{partner.name}</h1>
              <p className="text-sm text-muted-foreground">{partner.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs gap-1">
                  <Copy className="h-3 w-3" />
                  {partner.referralCode}
                </Badge>
                {partner.partnerGroup && (
                  <Badge variant="secondary" className="text-xs">
                    {partner.partnerGroup}
                  </Badge>
                )}
                {partner.partnerGroupLocked && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Lock className="h-3 w-3" />
                    Locked
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  {commissionPercent(partner.commissionRate)}% commission
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <Button
            onClick={() => setShowPayoutModal(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Create Payout
          </Button>
          {payoutBlockers.length > 0 && (
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">{payoutBlockers[0]}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{customers.length}</p>
                <p className="text-xs text-muted-foreground">Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{formatMoney(pendingAmount)}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600">{formatMoney(paidAmount)}</p>
                <p className="text-xs text-muted-foreground">Paid Out</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                <CreditCard className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{payouts.length}</p>
                <p className="text-xs text-muted-foreground">Payouts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="customers">Customers ({customers.length})</TabsTrigger>
          <TabsTrigger value="commissions">Commissions ({commissions.length})</TabsTrigger>
          <TabsTrigger value="payouts">Payouts ({payouts.length})</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Partner Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Name', value: partner.name },
                  { label: 'Email', value: partner.email },
                  { label: 'Referral Code', value: partner.referralCode, mono: true },
                  { label: 'Commission Rate', value: `${commissionPercent(partner.commissionRate)}%` },
                  { label: 'Partner Since', value: formatDate(partner.createdAt) },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className={`text-sm font-medium ${item.mono ? 'font-mono' : ''}`}>{item.value}</span>
                  </div>
                ))}
                <div className="space-y-2 border-t pt-4">
                  <Label className="text-sm text-muted-foreground">Partner tier</Label>
                  <Select
                    value={partner.partnerGroupId || ''}
                    onValueChange={(value) => saveTier({ partnerGroupId: value, partnerGroupLocked: true })}
                    disabled={savingTier}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiers.map((tier) => (
                        <SelectItem key={tier.id} value={tier.id}>{tier.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      checked={Boolean(partner.partnerGroupLocked)}
                      onCheckedChange={(checked) => saveTier({ partnerGroupLocked: checked })}
                      disabled={savingTier}
                    />
                    <Label className="text-sm">Lock tier (skip auto-assignment)</Label>
                  </div>
                  {partner.tierAssignedReason && (
                    <p className="text-xs text-muted-foreground">{partner.tierAssignedReason}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-muted">
                      <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-xl font-bold">{partner.totalClicks}</p>
                    <p className="text-xs text-muted-foreground">Clicks</p>
                  </div>
                  <div className="text-center">
                    <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-muted">
                      <Target className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-xl font-bold">{partner.totalLeads}</p>
                    <p className="text-xs text-muted-foreground">Leads</p>
                  </div>
                  <div className="text-center">
                    <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-muted">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                    </div>
                    <p className="mt-2 text-xl font-bold text-emerald-600">
                      {formatMoney(partner.totalRevenue)}
                    </p>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Commissions</span>
                    <span className="text-sm font-bold">{commissions.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Pending Amount</span>
                    <span className="text-sm font-bold text-amber-600">{formatMoney(pendingAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Paid Amount</span>
                    <span className="text-sm font-bold text-emerald-600">{formatMoney(paidAmount)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Customers */}
        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Referred Customers</CardTitle>
              <CardDescription>{customers.length} customer{customers.length !== 1 ? 's' : ''} referred</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {customers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total Paid</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-20">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{customer.publicId || '—'}</code>
                        </TableCell>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell className="text-muted-foreground">{customer.email}</TableCell>
                        <TableCell>{getStatusBadge(customer.status)}</TableCell>
                        <TableCell className="text-right font-medium">{formatMoney(customer.totalPaidCents)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDate(customer.createdAt)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/customers/${customer.id}`)}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No customers yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commissions */}
        <TabsContent value="commissions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Commission History</CardTitle>
                <CardDescription>
                  Pending: {formatMoney(pendingAmount)} · Paid: {formatMoney(paidAmount)}
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setShowPayoutModal(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Create Payout
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {commissions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.map((comm) => (
                      <TableRow key={comm.id}>
                        <TableCell className="text-muted-foreground text-sm">{formatDate(comm.createdAt)}</TableCell>
                        <TableCell className="font-medium">{comm.customerName}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">{formatMoney(comm.amountCents)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{commissionPercent(comm.rate)}%</TableCell>
                        <TableCell>{getStatusBadge(comm.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <DollarSign className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No commissions yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payouts */}
        <TabsContent value="payouts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Payout History</CardTitle>
                <CardDescription>{payouts.length} payout{payouts.length !== 1 ? 's' : ''}</CardDescription>
              </div>
              <Button size="sm" onClick={() => setShowPayoutModal(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Create Payout
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {payouts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Commissions</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Processed</TableHead>
                      <TableHead className="w-24">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell className="text-muted-foreground text-sm">{formatDate(payout.createdAt)}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-600">{formatMoney(payout.amountCents)}</TableCell>
                        <TableCell className="text-right">{payout.commissionCount}</TableCell>
                        <TableCell>{getStatusBadge(payout.status)}</TableCell>
                        <TableCell className="text-muted-foreground">{payout.method || '\u2014'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {payout.processedAt ? formatDate(payout.processedAt) : '\u2014'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openStatusModal(payout)}>
                            Update
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Wallet className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No payouts yet</p>
                  {payouts.length === 0 && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowPayoutModal(true)}>
                      Create First Payout
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Payout Dialog */}
      <Dialog open={showPayoutModal} onOpenChange={(open) => {
        setShowPayoutModal(open);
        if (!open) {
          setPayoutMessage(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create payout</DialogTitle>
            <DialogDescription>
              Sends PayPal now and skips the wait after each approved sale.
              {payoutPreview?.paypalMode === 'live' ? ' Live mode sends real money.' : ' Sandbox does not send real money.'}
            </DialogDescription>
          </DialogHeader>

          {payoutPreview && (
            <div className="space-y-1 rounded-md border px-3 py-2 text-xs text-muted-foreground">
              <p>PayPal: {payoutPreview.paypalEmail || 'not set'} · {payoutPreview.paypalConfigured ? 'keys connected' : 'keys missing'} · {payoutPreview.paypalMode}</p>
              <p>
                Tier payout term: {payoutPreview.payoutFrequencyLabel}.{' '}
                {payoutPreview.refundHoldDays > 0
                  ? `Refund hold: ${payoutPreview.refundHoldDays} day${payoutPreview.refundHoldDays === 1 ? '' : 's'}.`
                  : 'No refund hold.'}
              </p>
            </div>
          )}

          {payoutBlockers.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              {payoutBlockers.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Selected total</p>
            <p className="text-2xl font-bold text-primary">
              {formatMoney(
                selectedCommissions.reduce((sum, id) => {
                  const comm = pendingCommissions.find((c) => c.id === id);
                  return sum + (comm?.amountCents || 0);
                }, 0)
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedCommissions.length} of {pendingCommissions.length} unpaid commissions
            </p>
          </div>

          {pendingCommissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unpaid commissions on this partner.</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {pendingCommissions.map((comm) => (
                <div
                  key={comm.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                    selectedCommissions.includes(comm.id)
                      ? 'border-primary/50 bg-primary/5'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => toggleCommissionSelection(comm.id)}
                >
                  <Checkbox
                    checked={selectedCommissions.includes(comm.id)}
                    onCheckedChange={() => toggleCommissionSelection(comm.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{comm.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(comm.createdAt)} · {comm.status === 'PENDING' ? (payoutPreview?.refundHoldDays ? 'in refund hold' : 'pending') : 'approved'}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-primary shrink-0">
                    {formatMoney(comm.amountCents)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {payoutPreview?.canSkipHold && (
            <div className="flex items-start gap-2">
              <Checkbox
                checked={skipHold}
                onCheckedChange={(checked) => setSkipHold(Boolean(checked))}
                id="skip-hold"
              />
              <Label htmlFor="skip-hold" className="text-sm font-normal leading-snug">
                Pay now, skip the term wait
                {payoutPreview.paypalMode === 'live' ? ' (live PayPal)' : ' — sandbox'}
              </Label>
            </div>
          )}

          {payoutMessage && <p className="text-sm text-destructive">{payoutMessage}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPayoutModal(false); setPayoutMessage(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePayout}
              disabled={payoutLoading || selectedCommissions.length === 0 || payoutBlockers.length > 0}
            >
              {payoutLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {selectedCommissions.length === 0
                ? 'Pay now'
                : payoutBlockers.length > 0
                  ? 'Cannot pay yet'
                  : `Pay now (${selectedCommissions.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Status Dialog */}
      <Dialog open={showStatusModal} onOpenChange={(open) => {
        setShowStatusModal(open);
        if (!open) setEditingPayout(null);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Payout Status</DialogTitle>
            <DialogDescription>Change the processing status of this payout</DialogDescription>
          </DialogHeader>

          {editingPayout && (
            <>
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">Payout Amount</p>
                <p className="text-2xl font-bold text-emerald-600">{formatMoney(editingPayout.amountCents)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {editingPayout.commissionCount} commissions · Created {formatDate(editingPayout.createdAt)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>New Status</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as typeof newStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending \u2014 Awaiting processing</SelectItem>
                    <SelectItem value="PROCESSING">Processing \u2014 Payment in progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed \u2014 Payment successful</SelectItem>
                    <SelectItem value="FAILED">Failed \u2014 Payment failed</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {newStatus === 'COMPLETED' && 'Affiliate will be notified of payment completion'}
                  {newStatus === 'PROCESSING' && 'Payout is being processed'}
                  {newStatus === 'FAILED' && 'Payment failed, may need manual intervention'}
                  {newStatus === 'PENDING' && 'Payout is waiting to be processed'}
                </p>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowStatusModal(false); setEditingPayout(null); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePayoutStatus} disabled={payoutLoading}>
              {payoutLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div>
          <Skeleton className="h-7 w-48 mb-1" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div>
                  <Skeleton className="h-7 w-20 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-10 w-96" />
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
