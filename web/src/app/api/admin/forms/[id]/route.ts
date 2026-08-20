import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessRobot, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const fieldSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1).max(200),
  type: z.enum(["text", "textarea", "yesno", "number"]),
  required: z.boolean().optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  fields: z.array(fieldSchema).optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const form = await prisma.formTemplate.findUnique({
    where: { id },
    include: {
      fields: { orderBy: { sortOrder: "asc" } },
      submissions: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!form) {
    return NextResponse.json({ error: "Modulo non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, form.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: form.id,
    robotId: form.robotId,
    name: form.name,
    enabled: form.enabled,
    fields: form.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      sortOrder: f.sortOrder,
    })),
    submissions: form.submissions.map((s) => ({
      id: s.id,
      guestName: s.guestName,
      answers: parseAnswers(s.answersJson),
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const form = await prisma.formTemplate.findUnique({ where: { id } });
  if (!form) {
    return NextResponse.json({ error: "Modulo non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, form.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.formTemplate.update({
      where: { id },
      data: {
        name: parsed.data.name?.trim(),
        enabled: parsed.data.enabled,
      },
    });
    if (parsed.data.fields) {
      await tx.formField.deleteMany({ where: { templateId: id } });
      if (parsed.data.fields.length) {
        await tx.formField.createMany({
          data: parsed.data.fields.map((f, i) => ({
            templateId: id,
            label: f.label.trim(),
            type: f.type,
            required: f.required ?? true,
            sortOrder: i,
          })),
        });
      }
    }
  });

  const updated = await prisma.formTemplate.findUnique({
    where: { id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json({
    id: updated!.id,
    name: updated!.name,
    enabled: updated!.enabled,
    fields: updated!.fields,
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await requireSession(["ADMIN", "SUPER_ADMIN"]);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const form = await prisma.formTemplate.findUnique({ where: { id } });
  if (!form) {
    return NextResponse.json({ error: "Modulo non trovato" }, { status: 404 });
  }
  if (!(await canAccessRobot(session, form.robotId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.formTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

function parseAnswers(
  raw: string
): { fieldId?: string; label: string; value: string }[] {
  try {
    const o = JSON.parse(raw);
    if (Array.isArray(o)) {
      return o.map((row: { fieldId?: string; label?: string; value?: string }) => ({
        fieldId: row.fieldId,
        label: row.label ?? "",
        value: String(row.value ?? ""),
      }));
    }
    if (o && typeof o === "object") {
      return Object.entries(o as Record<string, string>).map(([k, v]) => ({
        label: k,
        value: String(v),
      }));
    }
  } catch {
    /* ignore */
  }
  return [];
}
