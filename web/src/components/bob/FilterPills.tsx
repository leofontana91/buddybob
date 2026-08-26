import { type ReactNode } from "react";

export function FilterPills({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-[9px]">
      {items.map((item) => {
        const active = item.id === value;
        const label =
          item.count != null ? `${item.label} · ${item.count}` : item.label;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className="rounded-full px-[15px] py-2 text-[12.5px] whitespace-nowrap shrink-0 transition-colors"
            style={{
              border: active ? "0" : "1px solid var(--bob-line-2)",
              background: active ? "var(--bob-ink)" : "#fff",
              color: active
                ? "#fff"
                : item.id === "closed"
                  ? "var(--bob-muted)"
                  : "var(--bob-ink)",
              fontWeight: active ? 600 : 500,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function DarkPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[22px] bg-[var(--bob-ink)] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

export function ModuleToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border border-[var(--bob-line)] bg-white px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-[14.5px] font-semibold tracking-tight">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-[12.5px] text-[var(--bob-muted)]">{hint}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
        style={{
          background: checked ? "var(--bob-cyan)" : "var(--bob-line-2)",
        }}
      >
        <span
          className="absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}
