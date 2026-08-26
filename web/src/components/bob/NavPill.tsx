import Link from "next/link";

export function NavPill({
  href,
  label,
  active,
  badge,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-full px-[17px] py-[9px] font-[family-name:var(--font-poppins)] text-[12px] font-semibold tracking-[0.1em] uppercase whitespace-nowrap shrink-0 transition-colors"
      style={{
        background: active ? "#fff" : "transparent",
        color: active ? "var(--bob-ink)" : "#9aa6b2",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#181f27";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span>{label}</span>
      {badge != null && badge > 0 ? (
        <span className="inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-[var(--bob-cyan)] text-[var(--bob-cyan-ink)] text-[11px] font-bold px-1.5">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
