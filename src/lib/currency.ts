import { formatMoney } from './money';
import { prisma } from './prisma';

export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_CURRENCY_SYMBOL = '$';

const CURRENCY_SYMBOLS: Record<string, string> = {
    'USD': '$',
    'EUR': '€',
    'INR': '₹',
    'GBP': '£',
    'BGN': 'лв.',
    'CAD': 'CA$',
    'AUD': 'A$',
};

export function symbolForCurrency(currency?: string | null): string {
    const code = (currency || DEFAULT_CURRENCY).toUpperCase();
    return CURRENCY_SYMBOLS[code] || DEFAULT_CURRENCY_SYMBOL;
}

export async function getCurrencySymbol(): Promise<string> {
    try {
        const settings = await prisma.programSettings.findFirst();
        return symbolForCurrency(settings?.currency);
    } catch (error) {
        console.error('Failed to fetch currency symbol:', error);
        return DEFAULT_CURRENCY_SYMBOL;
    }
}

export function formatCurrency(cents: number, symbol: string = DEFAULT_CURRENCY_SYMBOL): string {
    return formatMoney(cents, symbol);
}

export async function formatAmount(cents: number): Promise<string> {
    const symbol = await getCurrencySymbol();
    return formatCurrency(cents, symbol);
}
