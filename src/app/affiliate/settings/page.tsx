'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  User,
  Building2,
  Mail,
  Globe,
  CreditCard,
  Shield,
  CheckCircle2,
  AlertCircle,
  Key,
  Copy,
  Check,
  Bell,
} from 'lucide-react';
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries';
import { Switch } from '@/components/ui/switch';
import { PayoutPaydaySelect } from '@/components/PayoutPaydaySelect';
import { weekdayLabel } from '@/lib/payout-schedule';

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [saving, setSaving] = useState(false);

  const [settingsForm, setSettingsForm] = useState({
    name: '',
    company: '',
    email: '',
    country: DEFAULT_COUNTRY,
    paymentMethod: 'PayPal',
    paymentEmail: '',
    notifySaleEarned: true,
    notifyPayouts: true,
    notifyTierUpgraded: true,
    payoutFrequency: 'MONTHLY',
    payoutWeekday: 'INHERIT',
    payoutDayOfMonth: 'INHERIT',
    defaultPayoutWeekday: 1,
    defaultPayoutDayOfMonth: 1,
  });

  useEffect(() => {
    if (!authLoading && user) loadProfile();
  }, [authLoading, user]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/affiliate/profile');
      const data = await res.json();
      if (data.success) {
        const pd = data.affiliate?.payoutDetails || {};
        setReferralCode(data.affiliate?.referralCode || '');
        setSettingsForm({
          name: data.user?.name || user?.name || '',
          company: pd.company || '',
          email: data.user?.email || user?.email || '',
          country: pd.country || DEFAULT_COUNTRY,
          paymentMethod: pd.paymentMethod || 'PayPal',
          paymentEmail: pd.paymentEmail || data.user?.email || '',
          notifySaleEarned: data.affiliate?.notifySaleEarned !== false,
          notifyPayouts: data.affiliate?.notifyPayouts !== false,
          notifyTierUpgraded: data.affiliate?.notifyTierUpgraded !== false,
          payoutFrequency: data.stats?.payoutFrequency || 'MONTHLY',
          payoutWeekday: data.affiliate?.payoutWeekday == null ? 'INHERIT' : String(data.affiliate.payoutWeekday),
          payoutDayOfMonth: data.affiliate?.payoutDayOfMonth == null ? 'INHERIT' : String(data.affiliate.payoutDayOfMonth),
          defaultPayoutWeekday: data.affiliate?.defaultPayoutWeekday ?? 1,
          defaultPayoutDayOfMonth: data.affiliate?.defaultPayoutDayOfMonth ?? 1,
        });
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/affiliate/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      if (res.ok) {
        showNotification('success', 'Settings updated successfully!');
      } else {
        const data = await res.json();
        showNotification('error', data.error || 'Failed to update settings');
      }
    } catch (_e) {
      showNotification('error', 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateCode = async () => {
    try {
      const res = await fetch('/api/affiliate/generate-code', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('success', 'Referral code generated!');
        loadProfile();
      } else {
        showNotification('error', 'Failed to generate code: ' + data.error);
      }
    } catch (_e) {
      showNotification('error', 'Failed to generate code');
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  if (authLoading || loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {notification && (
        <Alert variant={notification.type === 'error' ? 'destructive' : 'default'}>
          {notification.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{notification.message}</AlertDescription>
        </Alert>
      )}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and payment preferences</p>
      </div>

      {/* Referral Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Key className="h-4 w-4" />
            Referral Code
          </CardTitle>
          <CardDescription>Your unique referral identifier</CardDescription>
        </CardHeader>
        <CardContent>
          {referralCode ? (
            <div className="flex items-center gap-2">
              <Input readOnly value={referralCode} className="font-mono max-w-xs" />
              <Button variant="outline" size="icon" onClick={copyCode}>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No referral code generated yet.</p>
              <Button onClick={handleGenerateCode}>Generate Code</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Personal Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Personal Details
          </CardTitle>
          <CardDescription>Manage your account information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> Full Name
              </Label>
              <Input
                value={settingsForm.name}
                onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Company
              </Label>
              <Input
                value={settingsForm.company}
                onChange={(e) => setSettingsForm({ ...settingsForm, company: e.target.value })}
                placeholder="Company Name"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> Email
              </Label>
              <Input
                type="email"
                value={settingsForm.email}
                onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Country
              </Label>
              <Select
                value={settingsForm.country}
                onValueChange={(v) => setSettingsForm({ ...settingsForm, country: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Payment Details
          </CardTitle>
          <CardDescription>Configure how you receive payouts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Input value="PayPal" readOnly />
            </div>
            <div className="space-y-2">
              <Label>PayPal email</Label>
              <Input
                type="email"
                value={settingsForm.paymentEmail}
                onChange={(e) => setSettingsForm({ ...settingsForm, paymentEmail: e.target.value, paymentMethod: 'PayPal' })}
                placeholder="you@paypal.com"
                required
              />
            </div>
          </div>

          <Separator />

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              Your payment information is encrypted and stored securely. We will never share your details with third parties.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Pay me on
          </CardTitle>
          <CardDescription>
            Pick your payday. Default is the program day. The next cron uses whatever you save here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PayoutPaydaySelect
            frequency={settingsForm.payoutFrequency}
            weekday={settingsForm.payoutWeekday}
            dayOfMonth={settingsForm.payoutDayOfMonth}
            onWeekdayChange={(v) => setSettingsForm({ ...settingsForm, payoutWeekday: v })}
            onDayOfMonthChange={(v) => setSettingsForm({ ...settingsForm, payoutDayOfMonth: v })}
            allowInherit
            inheritWeekdayLabel={`Same as program (${weekdayLabel(settingsForm.defaultPayoutWeekday)})`}
            inheritDayLabel={`Same as program (${settingsForm.defaultPayoutDayOfMonth})`}
            hintPayday={{
              weekday: settingsForm.payoutWeekday === 'INHERIT'
                ? settingsForm.defaultPayoutWeekday
                : parseInt(settingsForm.payoutWeekday, 10) || 1,
              dayOfMonth: settingsForm.payoutDayOfMonth === 'INHERIT'
                ? settingsForm.defaultPayoutDayOfMonth
                : parseInt(settingsForm.payoutDayOfMonth, 10) || 1,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Email notifications
          </CardTitle>
          <CardDescription>Choose which emails we send you. All are on by default.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              key: 'notifySaleEarned' as const,
              label: 'Sale earned',
              hint: 'When a referred purchase is confirmed',
            },
            {
              key: 'notifyPayouts' as const,
              label: 'Payouts',
              hint: 'When a payout is sent',
            },
            {
              key: 'notifyTierUpgraded' as const,
              label: 'Tier upgrades',
              hint: 'When you are moved to a higher partner tier',
            },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor={item.key}>{item.label}</Label>
                <p className="text-sm text-muted-foreground">{item.hint}</p>
              </div>
              <Switch
                id={item.key}
                checked={settingsForm[item.key]}
                onCheckedChange={(checked) => setSettingsForm({ ...settingsForm, [item.key]: checked })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
