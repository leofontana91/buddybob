import { NextResponse } from "next/server";
import { authenticateRobotRequest } from "@/lib/auth";
import { getFreeSlots } from "@/lib/appointments";
import { format, addDays } from "date-fns";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const from =
    url.searchParams.get("from") ?? format(new Date(), "yyyy-MM-dd");
  const to =
    url.searchParams.get("to") ??
    format(addDays(new Date(), 7), "yyyy-MM-dd");

  const slots = await getFreeSlots(id, from, to);
  return NextResponse.json({ from, to, slots });
}
