export type CommandType = "goto" | "speak" | "stop" | "task";

export type TaskStep =
  | { type: "speak"; text: string }
  | { type: "button"; label: string; speakOnPress?: string }
  | { type: "goto"; placeName: string }
  | { type: "return" }
  | { type: "wait"; seconds: number };

export function parseCommandPayload(raw: string): {
  placeName?: string;
  text?: string;
  after?: "stay" | "return";
  returnAfterSec?: number;
  steps?: TaskStep[];
  taskName?: string;
} {
  try {
    const o = JSON.parse(raw || "{}") as {
      placeName?: string;
      text?: string;
      after?: "stay" | "return";
      returnAfterSec?: number;
      steps?: TaskStep[];
      taskName?: string;
    };
    return {
      placeName: o.placeName?.trim() || undefined,
      text: o.text?.trim() || undefined,
      after: o.after === "return" ? "return" : o.after === "stay" ? "stay" : undefined,
      returnAfterSec:
        typeof o.returnAfterSec === "number" ? o.returnAfterSec : undefined,
      steps: Array.isArray(o.steps) ? o.steps : undefined,
      taskName: o.taskName?.trim() || undefined,
    };
  } catch {
    return {};
  }
}

export function flattenCommand(cmd: {
  id: string;
  type: string;
  payload: string;
  status: string;
  error: string | null;
  createdAt: Date;
  ackedAt: Date | null;
}) {
  const extra = parseCommandPayload(cmd.payload);
  return {
    id: cmd.id,
    type: cmd.type,
    status: cmd.status,
    error: cmd.error,
    createdAt: cmd.createdAt.toISOString(),
    ackedAt: cmd.ackedAt?.toISOString() ?? null,
    placeName: extra.placeName ?? null,
    text: extra.text ?? null,
    after: extra.after ?? null,
    returnAfterSec: extra.returnAfterSec ?? null,
    steps: extra.steps ?? null,
    taskName: extra.taskName ?? null,
  };
}
