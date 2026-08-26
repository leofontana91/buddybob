import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AdminShell } from "@/components/AdminShell";

export default async function SuperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") {
    if (session.role === "ADMIN") redirect("/admin");
    redirect("/me");
  }

  return (
    <AdminShell
      operatorName={session.name}
      roleLabel="Super Admin"
      withRobotSelect={false}
      links={[{ href: "/super", label: "Flotta" }]}
    >
      {children}
    </AdminShell>
  );
}
