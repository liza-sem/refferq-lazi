'use client';

import { useEffect, useState } from 'react';

export type AuthBrand = {
  programName?: string;
  companyName?: string;
  companyLogo?: string;
  brandButtonColor?: string;
};

const DEFAULT_TITLE = 'LAZI Partner program';
const DEFAULT_SUBTITLE = 'Partner program';
const DEFAULT_BUTTON = '#0033ff';

export function useAuthBrand() {
  const [brand, setBrand] = useState<AuthBrand>({});

  useEffect(() => {
    fetch('/api/affiliate/branding')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.settings) setBrand(data.settings);
      })
      .catch(() => {});
  }, []);

  const title = brand.programName?.trim() || DEFAULT_TITLE;
  return {
    brand,
    title,
    subtitle: DEFAULT_SUBTITLE,
    buttonColor: brand.brandButtonColor?.trim() || DEFAULT_BUTTON,
  };
}

export function AuthBrandHeader({
  title,
  subtitle,
  logo,
}: {
  title: string;
  subtitle: string;
  logo?: string;
}) {
  return (
    <div className="text-center space-y-2">
      {logo ? (
        <img
          src={logo}
          alt={title}
          className="mx-auto h-12 w-auto max-w-[180px] object-contain"
        />
      ) : null}
      <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
