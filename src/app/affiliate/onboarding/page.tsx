'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Target, Mail, Loader2, Wallet, Building2, Globe } from 'lucide-react';
import { COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries';

export default function AffiliateOnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading, checkAuth } = useAuth();
  const [paypalEmail, setPaypalEmail] = useState('');
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [company, setCompany] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (user?.onboardingComplete) {
      router.replace('/affiliate');
      return;
    }
    if (user?.email && !paypalEmail) {
      setPaypalEmail(user.email);
    }
  }, [authLoading, user, paypalEmail, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetch('/api/affiliate/profile')
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) return;
        const pd = data.affiliate?.payoutDetails || {};
        if (pd.country) setCountry(pd.country);
        if (pd.company) setCompany(pd.company);
        if (pd.paymentEmail) setPaypalEmail(pd.paymentEmail);
      })
      .catch(() => {});
  }, [authLoading, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/affiliate/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          paymentEmail: paypalEmail,
          paymentMethod: 'PayPal',
          country,
          company,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save your details');
        return;
      }
      const nextUser = await checkAuth();
      if (nextUser?.onboardingComplete) {
        router.replace('/affiliate');
      }
    } catch (_e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-primary border border-foreground">
            <Target className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-medium tracking-tight">Finish setup</h1>
          <p className="text-sm text-muted-foreground">
            We pay affiliates with PayPal only
          </p>
        </div>

        <Card>
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl">Your payout details</CardTitle>
            <CardDescription>
              Commissions are sent to this PayPal account. You can change these later in settings.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="paypalEmail">PayPal email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="paypalEmail"
                    type="email"
                    placeholder="you@paypal.com"
                    value={paypalEmail}
                    onChange={(e) => setPaypalEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger id="country" className="pl-10">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company"
                    type="text"
                    placeholder="Company name"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="pl-10"
                    autoComplete="organization"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" size="lg" disabled={saving || !paypalEmail || !country}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {saving ? 'Saving...' : 'Continue to dashboard'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
