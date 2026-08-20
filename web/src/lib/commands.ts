export type CommandType = "goto" | "speak" | "stop";

export function parseCommandPayload(raw: string): {
  placeName?: string;
  text?: string;
} {
  try {
    const o = JSON.parse(raw || "{}") as {
      placeName?: string;
      text?: string;
    };
    return {
      placeName: o.placeName?.trim() || undefined,
      text: o.text?.trim() || undefined,
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
  };
}
