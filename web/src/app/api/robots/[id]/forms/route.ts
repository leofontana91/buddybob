import { NextResponse } from "next/server";
import { authenticateRobotRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  const forms = await prisma.formTemplate.findMany({
    where: { robotId: id, enabled: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    forms: forms.map((f) => ({
      id: f.id,
      name: f.name,
      fields: f.fields.map((field) => ({
        id: field.id,
        label: field.label,
        type: field.type,
        required: field.required,
        sortOrder: field.sortOrder,
      })),
    })),
  });
}
