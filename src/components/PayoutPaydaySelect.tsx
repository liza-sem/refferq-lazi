'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DAY_OF_MONTH_OPTIONS,
  WEEKDAY_OPTIONS,
  paydayNeedsDayOfMonth,
  paydayNeedsWeekday,
  payoutTermExplanation,
  type PayoutPayday,
} from '@/lib/payout-schedule';

const INHERIT = 'INHERIT';

type Props = {
  frequency: string;
  weekday: string;
  dayOfMonth: string;
  onWeekdayChange: (value: string) => void;
  onDayOfMonthChange: (value: string) => void;
  allowInherit?: boolean;
  inheritWeekdayLabel?: string;
  inheritDayLabel?: string;
  hintPayday?: PayoutPayday | null;
};

export function PayoutPaydaySelect({
  frequency,
  weekday,
  dayOfMonth,
  onWeekdayChange,
  onDayOfMonthChange,
  allowInherit,
  inheritWeekdayLabel = 'Program default',
  inheritDayLabel = 'Program default',
  hintPayday,
}: Props) {
  if (frequency === 'INHERIT') {
    return (
      <p className="text-xs text-muted-foreground">Uses the program payday.</p>
    );
  }

  if (frequency === 'BIWEEKLY') {
    return (
      <p className="text-xs text-muted-foreground">Pays on the 1st and 15th.</p>
    );
  }

  if (paydayNeedsWeekday(frequency)) {
    return (
      <div className="grid gap-2">
        <Label>On which day</Label>
        <Select value={weekday} onValueChange={onWeekdayChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {allowInherit && <SelectItem value={INHERIT}>{inheritWeekdayLabel}</SelectItem>}
            {WEEKDAY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {payoutTermExplanation('WEEKLY', hintPayday)}
        </p>
      </div>
    );
  }

  if (paydayNeedsDayOfMonth(frequency)) {
    return (
      <div className="grid gap-2">
        <Label>On which day</Label>
        <Select value={dayOfMonth} onValueChange={onDayOfMonthChange}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {allowInherit && <SelectItem value={INHERIT}>{inheritDayLabel}</SelectItem>}
            {DAY_OF_MONTH_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {payoutTermExplanation(frequency, hintPayday)}
        </p>
      </div>
    );
  }

  return null;
}
