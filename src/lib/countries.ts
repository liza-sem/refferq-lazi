export const COUNTRIES = [
  { value: 'USA', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Australia', label: 'Australia' },
  { value: 'Germany', label: 'Germany' },
  { value: 'France', label: 'France' },
  { value: 'Netherlands', label: 'Netherlands' },
  { value: 'Ireland', label: 'Ireland' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'UAE', label: 'UAE' },
  { value: 'India', label: 'India' },
] as const;

export const DEFAULT_COUNTRY = 'USA';

export function isKnownCountry(value: string): boolean {
  return COUNTRIES.some((country) => country.value === value);
}
