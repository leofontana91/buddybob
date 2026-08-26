import { type ReactNode } from "react";

export function DataTable({
  headers,
  children,
  className = "",
}: {
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[22px] border border-[var(--bob-line)] bg-white ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[var(--bob-bg)]">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-5 py-3.5 font-[family-name:var(--font-poppins)] text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--bob-muted)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function DataTableRow({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <tr
      className="border-b border-[#f0f3f6] last:border-0 hover:bg-[var(--bob-bg)]/60"
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-5 py-4 text-[14px] align-middle ${className}`}>
      {children}
    </td>
  );
}
