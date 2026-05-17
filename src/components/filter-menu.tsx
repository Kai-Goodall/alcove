import { useId } from "react";
import { NumericFormat } from "react-number-format";
import {
  IconBathtubFillDuo18,
  IconCurrencyDollarFillDuo18,
  IconHeartFillDuo18,
  IconUserArrowRightFillDuo18,
} from "nucleo-ui-fill-duo-18";
import { IconMinusFill18, IconPlusFill18 } from "nucleo-ui-fill-18";
import {
  ButtonGroup,
  ButtonGroupItem,
} from "@/components/ui/button-group";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type SortMode = "relevant" | "newest";

export interface FilterValues {
  sort: SortMode;
  touredOnly: boolean;
  favoritesOnly: boolean;
  costMin: string;
  costMax: string;
  bathroomsMin: number;
}

export const DEFAULT_FILTER_VALUES: FilterValues = {
  sort: "relevant",
  touredOnly: false,
  favoritesOnly: false,
  costMin: "",
  costMax: "",
  bathroomsMin: 0,
};

export interface FilterMenuProps {
  values: FilterValues;
  onChange: (next: Partial<FilterValues>) => void;
}

function FilterMenu({ values, onChange }: FilterMenuProps) {
  return (
    <div className="flex w-[278px] flex-col gap-4 p-4">
      <SortRow value={values.sort} onChange={(sort) => onChange({ sort })} />
      <Separator />
      <TouredRow
        value={values.touredOnly}
        onChange={(touredOnly) => onChange({ touredOnly })}
      />
      <FavoritesRow
        value={values.favoritesOnly}
        onChange={(favoritesOnly) => onChange({ favoritesOnly })}
      />
      <CostRow
        min={values.costMin}
        max={values.costMax}
        onChange={(patch) => onChange(patch)}
      />
      <BathroomsRow
        value={values.bathroomsMin}
        onChange={(bathroomsMin) => onChange({ bathroomsMin })}
      />
    </div>
  );
}

interface SortRowProps {
  value: SortMode;
  onChange: (next: SortMode) => void;
}

function SortRow({ value, onChange }: SortRowProps) {
  return (
    <ButtonGroup aria-label="Sort apartments">
      <ButtonGroupItem
        active={value === "relevant"}
        onClick={() => onChange("relevant")}
      >
        Relevant
      </ButtonGroupItem>
      <ButtonGroupItem
        active={value === "newest"}
        onClick={() => onChange("newest")}
      >
        Newest first
      </ButtonGroupItem>
    </ButtonGroup>
  );
}

interface RowLabelProps {
  label: string;
  glyph: React.ComponentProps<typeof Icon>["glyph"];
  htmlFor?: string;
}

function RowLabel({ label, glyph, htmlFor }: RowLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex shrink-0 items-center justify-center gap-1 text-[14px] font-medium leading-[16px] tracking-[-0.3px] text-foreground"
    >
      <Icon glyph={glyph} size={14} />
      <span>{label}</span>
    </label>
  );
}

interface FavoritesRowProps {
  value: boolean;
  onChange: (next: boolean) => void;
}

function FavoritesRow({ value, onChange }: FavoritesRowProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between">
      <RowLabel label="Favorites" glyph={IconHeartFillDuo18} htmlFor={id} />
      <Switch id={id} checked={value} onCheckedChange={onChange} />
    </div>
  );
}

interface TouredRowProps {
  value: boolean;
  onChange: (next: boolean) => void;
}

function TouredRow({ value, onChange }: TouredRowProps) {
  const id = useId();
  return (
    <div className="flex items-center justify-between">
      <RowLabel
        label="Toured"
        glyph={IconUserArrowRightFillDuo18}
        htmlFor={id}
      />
      <Switch id={id} checked={value} onCheckedChange={onChange} />
    </div>
  );
}

interface CostRowProps {
  min: string;
  max: string;
  onChange: (patch: Partial<Pick<FilterValues, "costMin" | "costMax">>) => void;
}

function CostRow({ min, max, onChange }: CostRowProps) {
  return (
    <div className="flex flex-col items-start gap-2">
      <RowLabel label="Cost" glyph={IconCurrencyDollarFillDuo18} />
      <div className="flex w-full items-center gap-2.5 pl-[18px]">
        <PriceInput
          value={min}
          onValueChange={(v) => onChange({ costMin: v })}
          placeholder="$0"
          ariaLabel="Minimum cost"
        />
        <span aria-hidden className="h-px flex-1 bg-border" />
        <PriceInput
          value={max}
          onValueChange={(v) => onChange({ costMax: v })}
          placeholder="$15,000"
          ariaLabel="Maximum cost"
        />
      </div>
    </div>
  );
}

interface PriceInputProps {
  value: string;
  onValueChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
}

/**
 * Currency input that formats with `$` + thousands separators while typing.
 * Backed by `react-number-format`, which manages cursor position correctly
 * as separators are inserted/removed. The persisted state stays as a raw
 * digits string so the upstream price parser doesn't need to change.
 */
function PriceInput({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
}: PriceInputProps) {
  return (
    <NumericFormat
      customInput={Input}
      value={value}
      valueIsNumericString
      thousandSeparator=","
      prefix="$"
      allowNegative={false}
      decimalScale={0}
      onValueChange={(values) => onValueChange(values.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      inputMode="numeric"
      className="w-[90px]"
    />
  );
}

interface BathroomsRowProps {
  value: number;
  onChange: (next: number) => void;
}

const BATHROOMS_MIN = 0;
const BATHROOMS_MAX = 5;

function BathroomsRow({ value, onChange }: BathroomsRowProps) {
  const dec = () => onChange(Math.max(BATHROOMS_MIN, value - 1));
  const inc = () => onChange(Math.min(BATHROOMS_MAX, value + 1));
  return (
    <div className="flex items-center justify-between">
      <RowLabel label="Bathrooms" glyph={IconBathtubFillDuo18} />
      <NumberStepper
        value={value}
        min={BATHROOMS_MIN}
        max={BATHROOMS_MAX}
        onDecrement={dec}
        onIncrement={inc}
      />
    </div>
  );
}

interface NumberStepperProps {
  value: number;
  min: number;
  max: number;
  onDecrement: () => void;
  onIncrement: () => void;
}

function NumberStepper({
  value,
  min,
  max,
  onDecrement,
  onIncrement,
}: NumberStepperProps) {
  return (
    <div
      className={cn(
        "squircle flex h-9 items-center justify-center gap-2.5 rounded-[24px] bg-card px-3",
        "shadow-input",
      )}
    >
      <StepperButton
        label="Decrease"
        onClick={onDecrement}
        disabled={value <= min}
      >
        <Icon glyph={IconMinusFill18} size={12} />
      </StepperButton>
      <span className="min-w-[1ch] text-center text-[14px] font-normal leading-none tracking-[-0.2px] text-primary tabular-nums">
        {value}
      </span>
      <StepperButton
        label="Increase"
        onClick={onIncrement}
        disabled={value >= max}
      >
        <Icon glyph={IconPlusFill18} size={12} />
      </StepperButton>
    </div>
  );
}

interface StepperButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function StepperButton({
  label,
  disabled,
  onClick,
  children,
}: StepperButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-3 items-center justify-center rounded-full text-secondary",
        "outline-none transition-opacity",
        "hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
      )}
    >
      {children}
    </button>
  );
}

export { FilterMenu };
