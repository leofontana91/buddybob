import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateRobotRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string; formId: string }> };

const bodySchema = z.object({
  answers: z.record(z.string(), z.string()),
  guestName: z.string().max(120).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const { id, formId } = await ctx.params;
  const robot = await authenticateRobotRequest(
    id,
    req.headers.get("authorization")
  );
  if (!robot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await prisma.formTemplate.findFirst({
    where: { id: formId, robotId: id, enabled: true },
    include: { fields: true },
  });
  if (!form) {
    return NextResponse.json({ error: "Modulo non trovato" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Risposte non valide" }, { status: 400 });
  }

  const answers = parsed.data.answers;
  const packed = form.fields.map((field) => ({
    fieldId: field.id,
    label: field.label,
    value: (answers[field.id] ?? "").trim(),
  }));
  for (const row of packed) {
    const field = form.fields.find((f) => f.id === row.fieldId);
    if (field?.required && !row.value) {
      return NextResponse.json(
        { error: `Compila: ${field.label}` },
        { status: 400 }
      );
    }
  }

  const submission = await prisma.formSubmission.create({
    data: {
      templateId: form.id,
      robotId: id,
      answersJson: JSON.stringify(packed),
      guestName: parsed.data.guestName?.trim() || null,
    },
  });

  return NextResponse.json({
    id: submission.id,
    speak: "Grazie, ho registrato il modulo.",
  });
}
