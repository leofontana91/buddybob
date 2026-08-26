"use client";

import { useState } from "react";
import {
  PLACE_MEDIA_ACCEPT,
  PLACE_MEDIA_MAX_BYTES,
  PLACE_MEDIA_TYPES,
  type PlaceContent,
  type PlaceMedia,
  type PlaceMoment,
} from "@/lib/placeContent";

async function uploadPlaceMedia(
  robotId: string,
  file: File
): Promise<PlaceMedia> {
  if (!PLACE_MEDIA_TYPES.has(file.type)) {
    throw new Error("Formato non supportato. Usa foto, video o audio.");
  }
  if (file.size > PLACE_MEDIA_MAX_BYTES) {
    throw new Error("File troppo grande (max 50 MB).");
  }
  const startRes = await fetch("/api/admin/place-media/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      robotId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  const start = await startRes.json().catch(() => ({}));
  if (!startRes.ok) {
    throw new Error(start.error ?? "Impossibile preparare il caricamento");
  }
  const uploadUrl: string = start.token
    ? `${start.uploadUrl}${start.uploadUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(start.token)}`
    : start.uploadUrl;
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
  });
  if (!put.ok) {
    const t = await put.text().catch(() => "");
    throw new Error(t || "Caricamento non riuscito");
  }
  const doneRes = await fetch("/api/admin/place-media/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      robotId,
      objectPath: start.objectPath,
      contentType: file.type,
      fileName: file.name,
    }),
  });
  const done = await doneRes.json().catch(() => ({}));
  if (!doneRes.ok || !done.media) {
    throw new Error(done.error ?? "File caricato ma non confermato");
  }
  return done.media as PlaceMedia;
}

function MediaField({
  robotId,
  media,
  onChange,
}: {
  robotId: string;
  media: PlaceMedia | null;
  onChange: (media: PlaceMedia | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      onChange(await uploadPlaceMedia(robotId, file));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Caricamento non riuscito");
    } finally {
      setBusy(false);
    }
  }

  const kind = media?.contentType ?? "";
  const isImage = kind.startsWith("image/");
  const isVideo = kind.startsWith("video/");
  const isAudio = kind.startsWith("audio/");

  return (
    <div className="space-y-2">
      <p className="text-sm">File sul monitor</p>
      {media ? (
        <div className="rounded-xl border border-[var(--bob-line)] bg-[var(--bob-cream)] p-3 space-y-2">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.url}
              alt={media.fileName}
              className="max-h-40 w-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
                setErr(
                  "Anteprima non disponibile (URL media). Salva e riprova, o ricarica il file."
                );
              }}
            />
          ) : null}
          {isVideo ? (
            <video src={media.url} controls className="max-h-40 w-full" />
          ) : null}
          {isAudio ? <audio src={media.url} controls className="w-full" /> : null}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-[var(--bob-muted)]">{media.fileName}</span>
            <button
              type="button"
              className="underline"
              onClick={() => onChange(null)}
            >
              Rimuovi
            </button>
          </div>
        </div>
      ) : (
        <label className="block">
          <span className="inline-flex bob-btn-secondary px-4 py-2 text-sm cursor-pointer">
            {busy ? "Caricamento…" : "Carica foto, video o audio"}
          </span>
          <input
            type="file"
            accept={PLACE_MEDIA_ACCEPT}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {err ? <p className="text-sm text-red-700">{err}</p> : null}
    </div>
  );
}

function MomentEditor({
  title,
  moment,
  robotId,
  onChange,
}: {
  title: string;
  moment: PlaceMoment;
  robotId: string;
  onChange: (next: PlaceMoment) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      <label className="text-sm block">
        Cosa dice
        <textarea
          rows={2}
          className="mt-1 w-full bob-input"
          placeholder="Vado a {place}"
          value={moment.speak}
          onChange={(e) => onChange({ ...moment, speak: e.target.value })}
        />
      </label>
      <label className="text-sm block">
        Testo sul monitor
        <input
          className="mt-1 w-full bob-input"
          placeholder="Opzionale"
          value={moment.text}
          onChange={(e) => onChange({ ...moment, text: e.target.value })}
        />
      </label>
      <MediaField
        robotId={robotId}
        media={moment.media}
        onChange={(media) => onChange({ ...moment, media })}
      />
    </div>
  );
}

export function PlaceContentEditor({
  robotId,
  value,
  onChange,
}: {
  robotId: string;
  value: PlaceContent;
  onChange: (next: PlaceContent) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--bob-muted)]">
        Nei testi puoi usare {"{place}"} per il nome del punto. Carica foto o
        video dal computer, senza URL. Poi premi Salva.
      </p>
      <div className="grid md:grid-cols-3 gap-6">
        <MomentEditor
          title="Quando parte"
          moment={value.depart}
          robotId={robotId}
          onChange={(depart) => onChange({ ...value, depart })}
        />
        <MomentEditor
          title="Mentre si muove"
          moment={value.moving}
          robotId={robotId}
          onChange={(moving) => onChange({ ...value, moving })}
        />
        <MomentEditor
          title="Quando arriva"
          moment={value.arrive}
          robotId={robotId}
          onChange={(arrive) => onChange({ ...value, arrive })}
        />
      </div>
    </div>
  );
}
