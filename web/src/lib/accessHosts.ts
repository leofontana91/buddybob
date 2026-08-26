import { prisma } from "@/lib/db";

export type CompanyHost = {
  id: string;
  name: string;
  email: string;
};

/** Utenti (role USER) dell'azienda collegata al robot. */
export async function companyHostsForRobot(
  robotId: string
): Promise<CompanyHost[]> {
  const links = await prisma.adminRobot.findMany({
    where: { robotId },
    select: { adminId: true },
  });
  const adminIds = [...new Set(links.map((l) => l.adminId))];
  if (!adminIds.length) return [];

  const users = await prisma.account.findMany({
    where: {
      role: "USER",
      adminId: { in: adminIds },
      status: { not: "disabled" },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
  }));
}

export async function resolveHostForRobot(
  robotId: string,
  hostUserId: string | undefined | null
): Promise<{ hostUserId: string | null; hostName: string }> {
  const id = (hostUserId ?? "").trim();
  if (!id) return { hostUserId: null, hostName: "" };
  const hosts = await companyHostsForRobot(robotId);
  const hit = hosts.find((h) => h.id === id);
  if (!hit) return { hostUserId: null, hostName: "" };
  return { hostUserId: hit.id, hostName: hit.name };
}
