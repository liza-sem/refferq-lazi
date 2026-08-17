'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { AuthBrandHeader, useAuthBrand } from '@/components/auth/AuthBrandHeader';

function InviteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const { brand, title, subtitle, buttonColor } = useAuthBrand();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'loading' | 'ready' | 'otp' | 'error'>('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invite token');
      setStep('error');
      return;
    }
    fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || 'This invite link is invalid or expired');
          setStep('error');
          return;
        }
        setEmail(data.email);
        setName(data.name);
        if (data.alreadyActive) {
          router.replace('/login');
          return;
        }
        setStep('ready');
      })
      .catch(() => {
        setError('Could not open this invite');
        setStep('error');
      });
  }, [token, router]);

  const sendCode = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Failed to send login code');
        return;
      }
      setMessage(data.message || 'A login code was sent to your email.');
      setStep('otp');
    } catch {
      setError('Failed to send login code');
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Please enter the full 6-digit code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Invalid code');
        return;
      }
      router.replace(data.user?.onboardingComplete ? '/affiliate' : '/affiliate/onboarding');
    } catch {
      setError('Could not verify the code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <AuthBrandHeader title={title} subtitle={subtitle} logo={brand.companyLogo} />
          <CardTitle>Join as a partner</CardTitle>
          <CardDescription>
            {step === 'otp' ? `Enter the code we sent to ${email}` : 'Accept your invite to the partner program'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

          {step === 'loading' ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}

          {step === 'ready' ? (
            <div className="space-y-4">
              <p className="text-sm">
                {name ? `${name} · ` : ''}{email}
              </p>
              <Button onClick={sendCode} disabled={loading} style={{ backgroundColor: buttonColor }} className="w-full">
                {loading ? 'Sending…' : 'Email me a login code'}
              </Button>
            </div>
          ) : null}

          {step === 'otp' ? (
            <form onSubmit={verify} className="space-y-4">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              <Button type="submit" disabled={loading} className="w-full" style={{ backgroundColor: buttonColor }}>
                {loading ? 'Joining…' : 'Join'}
              </Button>
            </form>
          ) : null}

          {step === 'error' ? (
            <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
              Go to login
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading invite…</div>}>
      <InviteInner />
    </Suspense>
  );
}
