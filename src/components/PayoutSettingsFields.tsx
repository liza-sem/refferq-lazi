'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { PayoutPaydaySelect } from '@/components/PayoutPaydaySelect';
import { centsToDollarInput, dollarsToCents } from '@/lib/money';
import {
  PAYOUT_FREQUENCY_OPTIONS,
  PAYOUT_TYPE_OPTIONS,
  isMassPayout,
  type PayoutType,
} from '@/lib/payout-schedule';

export type PayoutSettingsValue = {
  commissionHoldDays: number;
  payoutType: string;
  payoutFrequency: string;
  payoutWeekday: number;
  payoutDayOfMonth: number;
  allowPartnerPayNow: boolean;
  minimumPayoutThreshold: number;
};

export function PayoutSettingsFields({
  value,
  onChange,
}: {
  value: PayoutSettingsValue;
  onChange: (patch: Partial<PayoutSettingsValue>) => void;
}) {
  const mass = isMassPayout(value.payoutType);
  const thresholdDollars = centsToDollarInput(value.minimumPayoutThreshold);

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        Mass payout pays every partner on the same calendar day. Per sale pays each commission on a cadence counted from when that sale became eligible.
      </p>

      <div className="grid gap-2">
        <Label htmlFor="holdDays">Hold days</Label>
        <Input
          id="holdDays"
          type="number"
          min={0}
          value={value.commissionHoldDays}
          onChange={(e) => onChange({ commissionHoldDays: Math.max(0, parseInt(e.target.value, 10) || 0) })}
        />
        <p className="text-xs text-muted-foreground">
          Days after a confirmed sale before commission is eligible (chargebacks). 0 = eligible immediately.
        </p>
      </div>

      <div className="grid gap-3">
        <Label>Payout type</Label>
        <RadioGroup
          value={isMassPayout(value.payoutType) ? 'MASS' : 'PER_SALE'}
          onValueChange={(v) => onChange({ payoutType: v as PayoutType })}
          className="grid gap-3"
        >
          {PAYOUT_TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-start gap-3 rounded-md border p-3">
              <RadioGroupItem value={option.value} id={`payoutType-${option.value}`} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.help}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="payoutFrequency">Cadence</Label>
        <Select
          value={value.payoutFrequency || 'MONTHLY'}
          onValueChange={(v) => onChange({ payoutFrequency: v })}
        >
          <SelectTrigger id="payoutFrequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYOUT_FREQUENCY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {mass
            ? 'How often the mass payday repeats.'
            : 'Counted from when the sale became eligible (after hold). Weekly is 7 days later.'}
        </p>
        {mass ? (
          <PayoutPaydaySelect
            frequency={value.payoutFrequency || 'MONTHLY'}
            weekday={String(value.payoutWeekday ?? 1)}
            dayOfMonth={String(value.payoutDayOfMonth ?? 15)}
            onWeekdayChange={(v) => onChange({ payoutWeekday: parseInt(v, 10) })}
            onDayOfMonthChange={(v) => onChange({ payoutDayOfMonth: parseInt(v, 10) })}
            hintPayday={{
              weekday: value.payoutWeekday ?? 1,
              dayOfMonth: value.payoutDayOfMonth ?? 15,
            }}
          />
        ) : null}
      </div>

      {!mass ? (
        <div className="flex items-center justify-between gap-4 rounded-md border p-4">
          <div>
            <Label htmlFor="allowPartnerPayNow">Allow partners to pay out now</Label>
            <p className="text-xs text-muted-foreground">
              If on, partners can send matured unpaid commissions immediately (still respects the threshold). Hidden in mass payout.
            </p>
          </div>
          <Switch
            id="allowPartnerPayNow"
            checked={value.allowPartnerPayNow}
            onCheckedChange={(checked) => onChange({ allowPartnerPayNow: checked })}
          />
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="payoutThreshold">Min payout threshold</Label>
        <Input
          id="payoutThreshold"
          type="number"
          min={0}
          step="0.01"
          value={thresholdDollars}
          onChange={(e) => onChange({ minimumPayoutThreshold: dollarsToCents(e.target.value) })}
        />
        <p className="text-xs text-muted-foreground">
          Minimum unpaid eligible amount before a payout is sent. $0 = no minimum.
        </p>
      </div>
    </div>
  );
}
