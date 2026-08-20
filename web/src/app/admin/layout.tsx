import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminShell } from "@/components/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") {
    if (session.role === "SUPER_ADMIN") redirect("/super");
    redirect("/me");
  }

  return (
    <AdminShell
      operatorName={session.name}
      roleLabel="Admin"
      links={[
        { href: "/admin", label: "Agenda" },
        { href: "/admin/actions", label: "Azioni robot" },
        { href: "/admin/places", label: "Punti mappa" },
        { href: "/admin/documents", label: "Documenti" },
        { href: "/admin/access", label: "Accessi" },
        { href: "/admin/users", label: "Utenti" },
        { href: "/admin/inbox", label: "Inbox", badgeKey: "inbox" },
        { href: "/admin/settings", label: "Impostazioni" },
      ]}
    >
      {children}
    </AdminShell>
  );
}
