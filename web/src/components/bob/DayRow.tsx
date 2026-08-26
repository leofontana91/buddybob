import { type ReactNode } from "react";
import { Button } from "./Button";

type DayRowBase = {
  time: string;
  title: string;
  subtitle?: string;
  className?: string;
};

export function DayRowAppointment({
  time,
  title,
  subtitle,
  action,
  className = "",
  dimmed,
}: DayRowBase & {
  action?: ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-[18px] rounded-[16px] px-[18px] py-[13px] bg-white border border-[#e6eaee] ${className}`}
      style={dimmed ? { background: "var(--bob-bg-2)", opacity: 0.62, border: 0 } : undefined}
    >
      <span className="w-[52px] shrink-0 font-[family-name:var(--font-poppins)] text-[14px] font-semibold bob-tabular text-[var(--bob-ink)]">
        {time}
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15px] font-semibold">{title}</p>
        {subtitle ? (
          <p className="m-0 mt-px text-[13px] text-[var(--bob-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function DayRowFocus({
  time,
  title,
  subtitle,
  badge,
  actions,
  className = "",
}: DayRowBase & {
  badge?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-start gap-[18px] overflow-hidden rounded-[20px] border border-[var(--bob-line)] bg-white px-[22px] py-[18px] shadow-[var(--bob-shadow-card)] ${className}`}
    >
      <span className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--bob-cyan)]" />
      <span className="w-[52px] shrink-0 font-[family-name:var(--font-poppins)] text-[15px] font-semibold bob-tabular">
        {time}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="m-0 font-[family-name:var(--font-poppins)] text-[20px] font-semibold tracking-[-0.025em]">
            {title}
          </p>
          {badge ? (
            <span className="rounded-full bg-[var(--bob-warn-bg)] px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.04em] text-[var(--bob-warn-ink)]">
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="m-0 mt-1 text-[13.5px] text-[var(--bob-text-2)]">
            {subtitle}
          </p>
        ) : null}
        {actions ? (
          <div className="mt-3.5 flex flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

export function DayRowRobotEvent({
  time,
  message,
  onAction,
  actionLabel = "Ci penso io",
  className = "",
}: {
  time: string;
  message: string;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-[18px] rounded-[16px] bg-[var(--bob-ink)] px-[18px] py-[11px] text-[#e7ecf1] ${className}`}
    >
      <span className="w-[52px] shrink-0 text-[13px] bob-tabular text-[var(--bob-muted-2)]">
        {time}
      </span>
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--bob-warn)]" />
      <p className="m-0 flex-1 text-[13.5px]">{message}</p>
      {onAction ? (
        <Button
          variant="ghost-dark"
          className="!py-1.5 !px-3.5 !text-[12.5px] !normal-case !tracking-normal !font-medium"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
