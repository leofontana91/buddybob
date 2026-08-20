import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminShell } from "@/components/AdminShell";

export default async function MeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "USER") {
    if (session.role === "SUPER_ADMIN") redirect("/super");
    redirect("/admin");
  }

  return (
    <AdminShell
      operatorName={session.name}
      roleLabel="Utente"
      withRobotSelect={false}
      links={[{ href: "/me", label: "I miei appuntamenti" }]}
    >
      {children}
    </AdminShell>
  );
}
