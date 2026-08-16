'use client';

import React, { useEffect, useState } from 'react';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Layers, Plus, Edit, Trash2, RefreshCw } from 'lucide-react';
import { commissionPercent } from '@/lib/commission-rate';
import { PAYOUT_FREQUENCY_OPTIONS, payoutFrequencyLabel } from '@/lib/payout-schedule';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export interface PartnerTier {
  id: string;
  name: string;
  description: string | null;
  commissionRate: number;
  isDefault: boolean;
  sortOrder: number;
  minRevenueCents: number | null;
  minConversions: number | null;
  minApprovedCommissionCents: number | null;
  demoteIfBelow: boolean;
  payoutFrequency: string | null;
  memberCount: number;
  autoRuleLabel: string | null;
}

const emptyForm = {
  name: '',
  description: '',
  commissionRate: '20',
  sortOrder: '0',
  isDefault: false,
  payoutFrequency: 'INHERIT',
  minRevenue: '',
  minConversions: '',
  minApprovedCommission: '',
  demoteIfBelow: false,
};

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function centsToDollars(cents: number | null): string {
  if (cents == null) return '';
  return String(cents / 100);
}

export function PartnerTiersPanel() {
  const [tiers, setTiers] = useState<PartnerTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerTier | null>(null);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<PartnerTier | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchTiers = async () => {
    try {
      const res = await fetch('/api/admin/partner-groups');
      const data = await res.json();
      if (data.success) setTiers(data.partnerGroups || []);
    } catch (error) {
      console.error('Failed to fetch tiers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTiers(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (tier: PartnerTier) => {
    setEditing(tier);
    setForm({
      name: tier.name,
      description: tier.description || '',
      commissionRate: String(commissionPercent(tier.commissionRate)),
      sortOrder: String(tier.sortOrder),
      isDefault: tier.isDefault,
      payoutFrequency: tier.payoutFrequency || 'INHERIT',
      minRevenue: centsToDollars(tier.minRevenueCents),
      minConversions: tier.minConversions != null ? String(tier.minConversions) : '',
      minApprovedCommission: centsToDollars(tier.minApprovedCommissionCents),
      demoteIfBelow: tier.demoteIfBelow,
    });
    setDialogOpen(true);
  };

  const payloadFromForm = () => ({
    name: form.name.trim(),
    description: form.description.trim() || null,
    commissionRate: parseFloat(form.commissionRate),
    sortOrder: parseInt(form.sortOrder, 10) || 0,
    isDefault: form.isDefault,
    payoutFrequency: form.payoutFrequency === 'INHERIT' ? null : form.payoutFrequency,
    minRevenueCents: dollarsToCents(form.minRevenue),
    minConversions: form.minConversions.trim() === '' ? null : parseInt(form.minConversions, 10),
    minApprovedCommissionCents: dollarsToCents(form.minApprovedCommission),
    demoteIfBelow: form.demoteIfBelow,
  });

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const body = editing ? { id: editing.id, ...payloadFromForm() } : payloadFromForm();
      const res = await fetch('/api/admin/partner-groups', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        await fetchTiers();
        setDialogOpen(false);
      } else {
        setMessage(data.error || 'Failed to save tier');
      }
    } catch (error) {
      console.error('Failed to save tier:', error);
      setMessage('Failed to save tier');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/partner-groups?id=${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setMessage(data.message);
        await fetchTiers();
      } else {
        setMessage(data.error || 'Failed to delete tier');
      }
    } catch (error) {
      console.error('Failed to delete tier:', error);
      setMessage('Failed to delete tier');
    } finally {
      setDeleteTarget(null);
    }
  };

  const runEvaluation = async () => {
    setEvaluating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/partner-groups/evaluate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage(`Evaluated ${data.evaluated} partners. ${data.changed} moved. ${data.skippedLocked} locked and skipped.`);
        await fetchTiers();
      } else {
        setMessage(data.error || 'Evaluation failed');
      }
    } catch (error) {
      console.error('Failed to evaluate tiers:', error);
      setMessage('Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const stats = {
    total: tiers.length,
    partners: tiers.reduce((sum, t) => sum + t.memberCount, 0),
    automated: tiers.filter((t) => t.autoRuleLabel).length,
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-10 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Partner tiers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Commission rates and auto-promotion rules. Locked partners stay put until you move them.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runEvaluation} disabled={evaluating}>
            <RefreshCw className={`mr-2 h-4 w-4 ${evaluating ? 'animate-spin' : ''}`} />
            {evaluating ? 'Evaluating…' : 'Run auto-assignment'}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add tier
          </Button>
        </div>
      </div>

      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}

      <div className="grid gap-10 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Tiers</p>
          <p className="mt-2 text-3xl font-medium tracking-tight">{stats.total}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Partners assigned</p>
          <p className="mt-2 text-3xl font-medium tracking-tight">{stats.partners}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">With auto-rules</p>
          <p className="mt-2 text-3xl font-medium tracking-tight">{stats.automated}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All tiers</CardTitle>
          <CardDescription>
            Higher rank wins when more than one rule matches. Promote-only unless demote is enabled on the current tier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Layers className="h-5 w-5 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">No tiers yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">Create Standard, Silver, and Gold to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Payout term</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Partners</TableHead>
                  <TableHead>Auto-assignment</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.map((tier) => (
                  <TableRow key={tier.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{tier.name}</p>
                        {tier.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                      </div>
                      {tier.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{tier.description}</p>
                      )}
                    </TableCell>
                    <TableCell>{commissionPercent(tier.commissionRate)}%</TableCell>
                    <TableCell>
                      {tier.payoutFrequency
                        ? payoutFrequencyLabel(tier.payoutFrequency)
                        : <span className="text-xs text-muted-foreground">Program default</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{tier.sortOrder}</TableCell>
                    <TableCell className="tabular-nums">{tier.memberCount}</TableCell>
                    <TableCell>
                      {tier.autoRuleLabel ? (
                        <div className="max-w-xs">
                          <p className="text-sm">{tier.autoRuleLabel}</p>
                          {tier.demoteIfBelow && (
                            <Badge variant="warning" className="mt-1 text-[10px]">Demote if below</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Manual only</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(tier)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!tier.isDefault && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(tier)}>
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit tier' : 'Create tier'}</DialogTitle>
            <DialogDescription>
              Thresholds are optional. Leave them blank for a manual-only tier.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Gold" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Top-performing partners"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Commission rate (%)</Label>
                <Input type="number" min="0" max="100" step="0.1" value={form.commissionRate} onChange={(e) => setForm({ ...form, commissionRate: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Payout term</Label>
                <Select value={form.payoutFrequency} onValueChange={(v) => setForm({ ...form, payoutFrequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INHERIT">Program default</SelectItem>
                    {PAYOUT_FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Wait after each approved sale before PayPal: 7 days, 14 days, 1 month, or 3 months. Blank uses the program default.</p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Rank</Label>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              <p className="text-xs text-muted-foreground">Higher rank wins (Gold 100, Silver 50, Standard 0)</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} />
              <Label>Default for new signups</Label>
            </div>
            <div className="border-t pt-4 space-y-4">
              <div>
                <p className="text-sm font-medium">Auto-assignment thresholds</p>
                <p className="text-xs text-muted-foreground">Partners who meet every filled threshold can be moved here automatically.</p>
              </div>
              <div className="grid gap-2">
                <Label>Min confirmed revenue ($)</Label>
                <Input type="number" min="0" step="1" value={form.minRevenue} onChange={(e) => setForm({ ...form, minRevenue: e.target.value })} placeholder="5000" />
              </div>
              <div className="grid gap-2">
                <Label>Min confirmed sales</Label>
                <Input type="number" min="0" step="1" value={form.minConversions} onChange={(e) => setForm({ ...form, minConversions: e.target.value })} placeholder="10" />
              </div>
              <div className="grid gap-2">
                <Label>Min approved / paid commission ($)</Label>
                <Input type="number" min="0" step="1" value={form.minApprovedCommission} onChange={(e) => setForm({ ...form, minApprovedCommission: e.target.value })} placeholder="1000" />
              </div>
              <div className="flex items-start gap-2">
                <Switch checked={form.demoteIfBelow} onCheckedChange={(v) => setForm({ ...form, demoteIfBelow: v })} />
                <div>
                  <Label>Demote if below threshold</Label>
                  <p className="text-xs text-muted-foreground">Off by default so a temporary dip does not kick someone down.</p>
                </div>
              </div>
            </div>
          </div>
          {message && dialogOpen && <p className="text-sm text-destructive">{message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : editing ? 'Update tier' : 'Create tier'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.memberCount > 0
                ? `${deleteTarget.memberCount} partner(s) on this tier will be moved to the default tier. They will not be left without a group.`
                : 'This tier has no partners. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete tier</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
