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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Settings2,
  Save,
  Plus,
  Pencil,
  Trash2,
  Percent,
  DollarSign,
  CheckCircle2,
  Globe,
  Code2,
  Copy,
  ExternalLink,
  Zap,
  Clock,
  Wallet,
  Image,
  Megaphone,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { PayoutPaydaySelect } from '@/components/PayoutPaydaySelect';

interface ProgramSettings {
  id: string;
  programId: string;
  productName: string;
  programName: string;
  websiteUrl: string;
  currency: string;
  portalSubdomain: string;
  minimumPayoutThreshold: number;
  payoutTerm: string;
  payoutFrequency: string;
  payoutWeekday: number;
  payoutDayOfMonth: number;
  cookieDuration: number;
  commissionHoldDays: number;
  autoPayoutEnabled: boolean;
  autoPayoutDripSize: number;
  lastAutoPayoutAt: string | null;
  companyName: string;
  companyLogo: string;
  favicon: string;
  portalAnnouncement: string;
  brandButtonColor: string;
  brandBackgroundColor: string;
  brandTextColor: string;
  commissionRules: CommissionRule[];
}

interface CommissionRule {
  id: string;
  name: string;
  type: string;
  value: number;
  conditions: Record<string, unknown>;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

export default function ProgramSettingsPage() {
  const [settings, setSettings] = useState<ProgramSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Commission rule dialog
  const [ruleDialog, setRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [ruleForm, setRuleForm] = useState({
    name: '',
    type: 'PERCENTAGE',
    value: '',
    isDefault: false,
  });
  const [savingRule, setSavingRule] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [paypalStatus, setPaypalStatus] = useState<{
    paypalConfigured: boolean;
    paypalMode: 'sandbox' | 'live';
  } | null>(null);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const trackingSnippet = `<script src="${appUrl}/scripts/refferq-tracker.js" data-api-url="${appUrl}"${publicKey ? ` data-api-key="${publicKey}"` : ''} data-cookie-days="${settings?.cookieDuration || 30}"></script>`;

  const handleCopySnippet = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  useEffect(() => {
    fetchSettings();
    fetchPublicKey();
    fetchPaypalStatus();
  }, []);

  const fetchPaypalStatus = async () => {
    try {
      const res = await fetch('/api/admin/payouts/auto');
      const data = await res.json();
      if (data.success && data.config) {
        setPaypalStatus({
          paypalConfigured: Boolean(data.config.paypalConfigured),
          paypalMode: data.config.paypalMode === 'live' ? 'live' : 'sandbox',
        });
      }
    } catch (error) {
      console.error('Failed to fetch PayPal status:', error);
    }
  };

  const fetchPublicKey = async () => {
    try {
      const res = await fetch('/api/admin/settings/integration');
      const data = await res.json();
      if (data.integration?.publicKey) {
        setPublicKey(data.integration.publicKey);
        return;
      }
      const gen = await fetch('/api/admin/integration/generate-key', { method: 'POST' });
      const generated = await gen.json();
      if (generated.success && generated.keys?.publicKey) {
        setPublicKey(generated.keys.publicKey);
      }
    } catch (error) {
      console.error('Failed to load tracking public key:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success) {
        setSettings({
          ...data.settings,
          autoPayoutEnabled: data.settings.autoPayoutEnabled !== false,
          autoPayoutDripSize: data.settings.autoPayoutDripSize ?? 2,
          lastAutoPayoutAt: data.settings.lastAutoPayoutAt ?? null,
          payoutFrequency: data.settings.payoutFrequency || 'MONTHLY',
          payoutWeekday: data.settings.payoutWeekday ?? 1,
          payoutDayOfMonth: data.settings.payoutDayOfMonth ?? 1,
          cookieDuration: data.settings.cookieDuration ?? 30,
          commissionHoldDays: data.settings.commissionHoldDays ?? 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: settings.productName,
          programName: settings.programName,
          websiteUrl: settings.websiteUrl,
          currency: settings.currency,
          portalSubdomain: settings.portalSubdomain,
          minimumPayoutThreshold: settings.minimumPayoutThreshold,
          payoutTerm: settings.payoutTerm,
          payoutFrequency: settings.payoutFrequency,
          payoutWeekday: settings.payoutWeekday,
          payoutDayOfMonth: settings.payoutDayOfMonth,
          cookieDuration: settings.cookieDuration,
          commissionHoldDays: settings.commissionHoldDays,
          autoPayoutEnabled: settings.autoPayoutEnabled !== false,
          autoPayoutDripSize: settings.autoPayoutDripSize || 2,
          companyName: settings.companyName,
          companyLogo: settings.companyLogo,
          favicon: settings.favicon,
          portalAnnouncement: settings.portalAnnouncement,
          brandButtonColor: settings.brandButtonColor,
          brandBackgroundColor: settings.brandBackgroundColor,
          brandTextColor: settings.brandTextColor,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRule = async () => {
    setSavingRule(true);
    try {
      const action = editingRule ? 'update' : 'create';
      const ruleData = editingRule
        ? { id: editingRule.id, name: ruleForm.name, type: ruleForm.type, value: parseFloat(ruleForm.value), isDefault: ruleForm.isDefault }
        : { name: ruleForm.name, type: ruleForm.type, value: parseFloat(ruleForm.value), isDefault: ruleForm.isDefault };

      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ruleData }),
      });
      if (res.ok) {
        await fetchSettings();
        setRuleDialog(false);
        setEditingRule(null);
        setRuleForm({ name: '', type: 'PERCENTAGE', value: '', isDefault: false });
      }
    } catch (error) {
      console.error('Failed to save rule:', error);
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Delete this commission rule?')) return;
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ruleData: { id } }),
      });
      await fetchSettings();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const openCreateRule = () => {
    setEditingRule(null);
    setRuleForm({ name: '', type: 'PERCENTAGE', value: '', isDefault: false });
    setRuleDialog(true);
  };

  const openEditRule = (rule: CommissionRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      type: rule.type,
      value: String(rule.value),
      isDefault: rule.isDefault,
    });
    setRuleDialog(true);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Failed to load settings</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Program Settings</h1>
        <p className="text-muted-foreground">Configure your affiliate program</p>
      </div>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>Basic program configuration</CardDescription>
            </div>
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saved ? (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="productName">Product Name</Label>
              <Input
                id="productName"
                value={settings.productName}
                onChange={(e) => setSettings({ ...settings, productName: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="programName">Program Name</Label>
              <Input
                id="programName"
                value={settings.programName}
                onChange={(e) => setSettings({ ...settings, programName: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="websiteUrl">Website URL</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="websiteUrl"
                  className="pl-9"
                  value={settings.websiteUrl}
                  onChange={(e) => setSettings({ ...settings, websiteUrl: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="portalSubdomain">Portal Subdomain</Label>
              <Input
                id="portalSubdomain"
                value={settings.portalSubdomain}
                onChange={(e) => setSettings({ ...settings, portalSubdomain: e.target.value })}
              />
            </div>
          </div>
          <Separator />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={settings.currency}
                onValueChange={(v) => setSettings({ ...settings, currency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="INR">INR (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="minimumPayoutThreshold">Min Payout Threshold (cents)</Label>
              <Input
                id="minimumPayoutThreshold"
                type="number"
                value={settings.minimumPayoutThreshold}
                onChange={(e) =>
                  setSettings({ ...settings, minimumPayoutThreshold: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payoutTerm">Invoice terms</Label>
              <Select
                value={settings.payoutTerm}
                onValueChange={(v) => setSettings({ ...settings, payoutTerm: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NET-15">NET-15</SelectItem>
                  <SelectItem value="NET-30">NET-30</SelectItem>
                  <SelectItem value="NET-60">NET-60</SelectItem>
                  <SelectItem value="NET-90">NET-90</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Accounting terms on invoices — not how often PayPal is sent.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payoutFrequency">Payout term</Label>
              <Select
                value={settings.payoutFrequency || 'MONTHLY'}
                onValueChange={(v) => setSettings({ ...settings, payoutFrequency: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEKLY">Weekly</SelectItem>
                  <SelectItem value="BIWEEKLY">Bi-weekly</SelectItem>
                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                  <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">How often PayPal is sent. Tiers and partners can pick a different payday.</p>
              <PayoutPaydaySelect
                frequency={settings.payoutFrequency || 'MONTHLY'}
                weekday={String(settings.payoutWeekday ?? 1)}
                dayOfMonth={String(settings.payoutDayOfMonth ?? 1)}
                onWeekdayChange={(v) => setSettings({ ...settings, payoutWeekday: parseInt(v, 10) })}
                onDayOfMonthChange={(v) => setSettings({ ...settings, payoutDayOfMonth: parseInt(v, 10) })}
                hintPayday={{
                  weekday: settings.payoutWeekday ?? 1,
                  dayOfMonth: settings.payoutDayOfMonth ?? 1,
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commissionHoldDays">Refund hold (days)</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="commissionHoldDays"
                  type="number"
                  className="pl-9"
                  value={settings.commissionHoldDays}
                  onChange={(e) =>
                    setSettings({ ...settings, commissionHoldDays: parseInt(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {settings.commissionHoldDays > 0
                  ? 'Days after a sale before commission can pay, so refunds can claw back. This is not the referral cookie and not the payout term.'
                  : '0 means no refund hold — each commission pays after its term from the approval date. Cookie duration (attribution) is separate.'}
              </p>
            </div>
          </div>
          <div className="rounded-md bg-muted p-3">
            <p className="text-xs text-muted-foreground">
              Program ID: <span className="font-mono">{settings.programId}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Automatic PayPal payouts
            {paypalStatus && (
              <Badge variant={paypalStatus.paypalMode === 'live' ? 'destructive' : 'secondary'}>
                {paypalStatus.paypalMode === 'live' ? 'Live' : 'Sandbox'}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Cron pays commissions once each sale’s term has elapsed (7 / 14 days or 1 / 3 months after approval), a few affiliates per run, so a mass pay does not hit your PayPal balance.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {paypalStatus && paypalStatus.paypalMode !== 'live' && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              Sandbox must stay on until you are ready to send real money. Test payouts use PayPal’s sandbox API, not live balances.
              {paypalStatus && !paypalStatus.paypalConfigured
                ? ' Add sandbox Client ID and Secret in Dokploy to run a test.'
                : ''}
            </div>
          )}
          {paypalStatus?.paypalMode === 'live' && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
              Live mode is on. Automatic payouts send real PayPal transfers. Set <span className="font-mono">PAYPAL_MODE=sandbox</span> in Dokploy to go back to testing.
            </div>
          )}
          <div className="flex items-center justify-between gap-4 rounded-md border p-4">
            <div>
              <p className="text-sm font-medium">Auto-payout is {settings.autoPayoutEnabled !== false ? 'on' : 'off'}</p>
              <p className="text-xs text-muted-foreground">
                Last run:{' '}
                {settings.lastAutoPayoutAt
                  ? new Date(settings.lastAutoPayoutAt).toLocaleString()
                  : 'not yet — add a cron to /api/cron/payouts'}
              </p>
            </div>
            <Switch
              checked={settings.autoPayoutEnabled !== false}
              onCheckedChange={(checked) => setSettings({ ...settings, autoPayoutEnabled: checked })}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="autoPayoutDripSize">Drip size (affiliates per cron run)</Label>
              <Input
                id="autoPayoutDripSize"
                type="number"
                min={1}
                max={10}
                value={settings.autoPayoutDripSize ?? 2}
                onChange={(e) =>
                  setSettings({ ...settings, autoPayoutDripSize: parseInt(e.target.value) || 2 })
                }
              />
              <p className="text-[10px] text-muted-foreground">
                Default 2. Keep this small so payouts trickle instead of one large batch.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>
                {settings.commissionHoldDays > 0
                  ? 'Refund hold still applies to automatic payouts'
                  : 'No refund hold — payouts wait the term after each approval'}
              </Label>
              <p className="text-sm text-muted-foreground">
                {settings.commissionHoldDays > 0
                  ? `Commissions stay PENDING for ${settings.commissionHoldDays} day${settings.commissionHoldDays === 1 ? '' : 's'} after a sale so refunds can claw back. Cookie duration is separate (tracking). After approval, weekly waits 7 days, bi-weekly 14, monthly 1 month. Use Create payout on a partner to skip hold and the term wait for a sandbox test.`
                  : 'Refund hold is 0 days. Each commission pays 7 days / 14 days / 1 month / 3 months after it was approved, depending on the partner’s term. Cookie duration is separate (tracking). Use Create payout on a partner to send now instead of waiting out the term.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            Portal branding
          </CardTitle>
          <CardDescription>
            Title, favicon, colors, and the announcement on the marketer dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="companyName">Portal title</Label>
              <Input
                id="companyName"
                value={settings.companyName || ''}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                placeholder="LAZI"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="favicon">Favicon URL</Label>
              <Input
                id="favicon"
                value={settings.favicon || ''}
                onChange={(e) => setSettings({ ...settings, favicon: e.target.value })}
                placeholder="https://lazi.studio/favicon.ico"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="companyLogo">Logo URL</Label>
            <Input
              id="companyLogo"
              value={settings.companyLogo || ''}
              onChange={(e) => setSettings({ ...settings, companyLogo: e.target.value })}
              placeholder="https://lazi.studio/logo.png"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="portalAnnouncement" className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Dashboard announcement
            </Label>
            <Textarea
              id="portalAnnouncement"
              value={settings.portalAnnouncement || ''}
              onChange={(e) => setSettings({ ...settings, portalAnnouncement: e.target.value })}
              placeholder="Earn 20% commission on all paid customers"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Shown on the marketer dashboard banner. Leave blank to use the default commission line.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="brandButtonColor">Accent color</Label>
              <Input
                id="brandButtonColor"
                type="color"
                value={settings.brandButtonColor || '#111111'}
                onChange={(e) => setSettings({ ...settings, brandButtonColor: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="brandBackgroundColor">Background color</Label>
              <Input
                id="brandBackgroundColor"
                type="color"
                value={settings.brandBackgroundColor || '#111111'}
                onChange={(e) => setSettings({ ...settings, brandBackgroundColor: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="brandTextColor">Text color</Label>
              <Input
                id="brandTextColor"
                type="color"
                value={settings.brandTextColor || '#ffffff'}
                onChange={(e) => setSettings({ ...settings, brandTextColor: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commission Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Percent className="h-5 w-5" />
                Commission Rules
              </CardTitle>
              <CardDescription>Define how commissions are calculated</CardDescription>
            </div>
            <Dialog open={ruleDialog} onOpenChange={setRuleDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={openCreateRule}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Rule
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingRule ? 'Edit Rule' : 'New Commission Rule'}</DialogTitle>
                  <DialogDescription>
                    {editingRule ? 'Update commission rule details' : 'Create a new commission calculation rule'}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Rule Name</Label>
                    <Input
                      value={ruleForm.name}
                      onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                      placeholder="e.g., Standard Commission"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Type</Label>
                      <Select value={ruleForm.type} onValueChange={(v) => setRuleForm({ ...ruleForm, type: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                          <SelectItem value="FLAT">Flat Amount</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Value</Label>
                      <div className="relative">
                        {ruleForm.type === 'PERCENTAGE' ? (
                          <Percent className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        ) : (
                          <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        )}
                        <Input
                          type="number"
                          className={ruleForm.type === 'FLAT' ? 'pl-9' : ''}
                          value={ruleForm.value}
                          onChange={(e) => setRuleForm({ ...ruleForm, value: e.target.value })}
                          placeholder={ruleForm.type === 'PERCENTAGE' ? '10' : '500'}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={ruleForm.isDefault}
                      onCheckedChange={(v) => setRuleForm({ ...ruleForm, isDefault: v })}
                    />
                    <Label>Set as default rule</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setRuleDialog(false)}>Cancel</Button>
                  <Button onClick={handleSaveRule} disabled={savingRule || !ruleForm.name || !ruleForm.value}>
                    {savingRule ? 'Saving...' : editingRule ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {settings.commissionRules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Percent className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No commission rules</h3>
              <p className="text-sm text-muted-foreground">Create your first commission rule to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.commissionRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{rule.type}</Badge>
                    </TableCell>
                    <TableCell>
                      {rule.type === 'PERCENTAGE' ? `${rule.value}%` : `$${rule.value}`}
                    </TableCell>
                    <TableCell>
                      {rule.isDefault && <Badge variant="default">Default</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditRule(rule)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(rule.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tracking Widget / Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            Referral Tracking Widget
          </CardTitle>
          <CardDescription>
            Embed this script on <strong>{settings.websiteUrl || 'your website'}</strong> to automatically track referral visits and conversions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1 — website URL reminder */}
          {!settings.websiteUrl && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 dark:border-yellow-700 dark:bg-yellow-950">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Set your <strong>Website URL</strong> in General Settings above first so the snippet is pre-configured.
              </p>
            </div>
          )}

          <Tabs defaultValue="script" className="space-y-4">
            <TabsList>
              <TabsTrigger value="script">Tracking Script</TabsTrigger>
              <TabsTrigger value="conversion">Conversion Tracking</TabsTrigger>
              <TabsTrigger value="referral">Referral Links</TabsTrigger>
            </TabsList>

            {/* ── Tab: Tracking Script ── */}
            <TabsContent value="script" className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">1. Add this script before <code className="rounded bg-muted px-1.5 py-0.5 text-xs">&lt;/body&gt;</code> on every page</Label>
                  <Button variant="ghost" size="sm" onClick={() => handleCopySnippet('script', trackingSnippet)}>
                    {copiedSnippet === 'script' ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-600" />Copied</> : <><Copy className="mr-1 h-3.5 w-3.5" />Copy</>}
                  </Button>
                </div>
                <div className="rounded-md bg-muted p-4 font-mono text-sm overflow-x-auto">
                  <span className="text-blue-600">&lt;script</span>
                  {' '}<span className="text-purple-600">src</span>=<span className="text-green-600">&quot;{appUrl}/scripts/refferq-tracker.js&quot;</span><br />
                  {'  '}<span className="text-purple-600">data-api-url</span>=<span className="text-green-600">&quot;{appUrl}&quot;</span><br />
                  {'  '}<span className="text-purple-600">data-api-key</span>=<span className="text-green-600">&quot;{publicKey || 'generating…'}&quot;</span><br />
                  {'  '}<span className="text-purple-600">data-cookie-days</span>=<span className="text-green-600">&quot;{settings.cookieDuration || 30}&quot;</span>
                  <span className="text-blue-600">&gt;&lt;/script&gt;</span>
                </div>
                {publicKey && (
                  <div className="flex items-center gap-2 pt-2">
                    <Input value={publicKey} readOnly className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                    <Button variant="outline" size="sm" onClick={() => handleCopySnippet('publicKey', publicKey)}>
                      {copiedSnippet === 'publicKey' ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-600" />Copied</> : <><Copy className="mr-1 h-3.5 w-3.5" />Copy key</>}
                    </Button>
                  </div>
                )}
              </div>

              <Separator />

              <div className="grid gap-2">
                <Label htmlFor="cookieDuration">Cookie duration (days)</Label>
                <Input
                  id="cookieDuration"
                  type="number"
                  min={1}
                  value={settings.cookieDuration || 30}
                  onChange={(e) =>
                    setSettings({ ...settings, cookieDuration: parseInt(e.target.value) || 30 })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Attribution window — how long a ?ref= click still counts toward a sale. This is not when you pay partners.
                </p>
              </div>
              <div className="rounded-md border p-4 space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2"><Zap className="h-4 w-4" />How it works</h4>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                  <li>A visitor arrives on <strong>{settings.websiteUrl || 'your site'}</strong> via a referral link (e.g. <code className="rounded bg-muted px-1 py-0.5 text-xs">?ref=CODE</code>)</li>
                  <li>The script stores a {settings.cookieDuration || 30}-day attribution cookie</li>
                  <li>When the visitor converts (signup, purchase, etc.), you call <code className="rounded bg-muted px-1 py-0.5 text-xs">Refferq.trackConversion()</code></li>
                  <li>The referral and commission are recorded in your dashboard automatically</li>
                </ol>
              </div>
            </TabsContent>

            {/* ── Tab: Conversion Tracking ── */}
            <TabsContent value="conversion" className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Call this when a visitor completes a conversion event</Label>
                  <Button variant="ghost" size="sm" onClick={() => handleCopySnippet('conversion', `// Track a conversion (e.g. after signup or purchase)\nRefferq.trackConversion({\n  email: customer.email,\n  name: customer.name,\n  amount: 4999,        // amount in cents\n  currency: '${settings.currency || 'USD'}',\n  orderId: 'ORD-12345' // optional\n});`)}>
                    {copiedSnippet === 'conversion' ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-600" />Copied</> : <><Copy className="mr-1 h-3.5 w-3.5" />Copy</>}
                  </Button>
                </div>
                <div className="rounded-md bg-muted p-4 font-mono text-sm overflow-x-auto whitespace-pre">
                  {`// Track a conversion (e.g. after signup or purchase)
Refferq.trackConversion({
  email: customer.email,
  name: customer.name,
  amount: 4999,        // amount in cents
  currency: '${settings.currency || 'USD'}',
  orderId: 'ORD-12345' // optional
});`}
                </div>
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Other helpers</Label>
                  <Button variant="ghost" size="sm" onClick={() => handleCopySnippet('helpers', `// Get the current referral code (or null)\nconst code = Refferq.getReferralCode();\n\n// Clear the stored referral code\nRefferq.clearReferralCode();`)}>
                    {copiedSnippet === 'helpers' ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-600" />Copied</> : <><Copy className="mr-1 h-3.5 w-3.5" />Copy</>}
                  </Button>
                </div>
                <div className="rounded-md bg-muted p-4 font-mono text-sm overflow-x-auto whitespace-pre">
                  {`// Get the current referral code (or null)
const code = Refferq.getReferralCode();

// Clear the stored referral code
Refferq.clearReferralCode();`}
                </div>
              </div>
            </TabsContent>

            {/* ── Tab: Referral Links ── */}
            <TabsContent value="referral" className="space-y-4">
              <div className="rounded-md border p-4 space-y-3">
                <h4 className="text-sm font-medium">Referral link format</h4>
                <p className="text-sm text-muted-foreground">
                  Affiliates share links to your website with a <code className="rounded bg-muted px-1 py-0.5 text-xs">ref</code> query parameter.
                  The tracking script picks this up automatically.
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm break-all">
                  {settings.websiteUrl || 'https://yoursite.com'}/<span className="text-blue-600">?ref=</span><span className="text-green-600">PARTNER-CODE</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  The script also recognizes <code className="rounded bg-muted px-1 py-0.5 text-xs">?referral=</code> and <code className="rounded bg-muted px-1 py-0.5 text-xs">?affiliate=</code> parameters.
                </p>
              </div>

              <div className="rounded-md border p-4 space-y-3">
                <h4 className="text-sm font-medium">Direct referral route</h4>
                <p className="text-sm text-muted-foreground">
                  You can also use the built-in redirect route to send visitors through Refferq first:
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm break-all">
                  {appUrl}/<span className="text-blue-600">r/</span><span className="text-green-600">PARTNER-CODE</span>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
