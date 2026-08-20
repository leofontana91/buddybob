import { NextResponse } from "next/server";
import { authenticateRobotRequest } from "@/lib/auth";
import { buildRobotConfig, modulesForRobot } from "@/lib/appointments";

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
  const since = Number(url.searchParams.get("since") ?? "0");
  const modules = await modulesForRobot(id);
  const config = buildRobotConfig(robot, modules);

  if (since > 0 && config.configVersion <= since) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(config);
}
