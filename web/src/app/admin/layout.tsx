import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminShell } from "@/components/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "SUPER_ADMIN" && !session.actingAdminId) {
    redirect("/super");
  }
  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/me");
  }

  let companyLabel = session.name;
  if (session.role === "SUPER_ADMIN" && session.actingAdminId) {
    const admin = await prisma.account.findUnique({
      where: { id: session.actingAdminId },
    });
    companyLabel = admin
      ? `${admin.companyName ?? admin.name}`
      : session.name;
  }

  return (
    <AdminShell
      operatorName={
        session.role === "SUPER_ADMIN"
          ? `${companyLabel} · ${session.name}`
          : session.name
      }
      roleLabel={
        session.role === "SUPER_ADMIN" ? companyLabel : "Admin"
      }
      backToSuper={session.role === "SUPER_ADMIN"}
      links={[
        { href: "/admin", label: "Oggi" },
        { href: "/admin/agenda", label: "Agenda" },
        { href: "/admin/rubrica", label: "Rubrica" },
        { href: "/admin/impostazioni", label: "Impostazioni" },
        { href: "/admin/inbox", label: "Inbox", badgeKey: "inbox" },
      ]}
    >
      {children}
    </AdminShell>
  );
}
