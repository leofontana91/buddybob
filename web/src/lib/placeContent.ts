export type PlaceContentMode = "shared" | "per_place" | "groups";

export type PlaceMedia = {
  path: string;
  url: string;
  contentType: string;
  fileName: string;
};

export type PlaceMoment = {
  speak: string;
  text: string;
  media: PlaceMedia | null;
};

export type PlaceContent = {
  depart: PlaceMoment;
  moving: PlaceMoment;
  arrive: PlaceMoment;
};

export const PLACE_CONTENT_MODES: {
  id: PlaceContentMode;
  label: string;
  hint: string;
}[] = [
  {
    id: "shared",
    label: "Tutti uguali",
    hint: "Una sola frase e un solo media per ogni momento, usati su tutti i punti. Puoi scrivere {place} per inserire il nome.",
  },
  {
    id: "per_place",
    label: "Tutti diversi",
    hint: "Ogni punto mappa ha le sue frasi e i suoi file.",
  },
  {
    id: "groups",
    label: "A gruppi",
    hint: "Crei gruppi (es. sale riunioni) e assegni i punti. Il contenuto si scrive una volta per gruppo.",
  },
];

export function emptyMoment(): PlaceMoment {
  return { speak: "", text: "", media: null };
}

export function emptyPlaceContent(): PlaceContent {
  return {
    depart: emptyMoment(),
    moving: emptyMoment(),
    arrive: emptyMoment(),
  };
}

function asMedia(raw: unknown): PlaceMedia | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url) return null;
  return {
    path: typeof o.path === "string" ? o.path : "",
    url,
    contentType: typeof o.contentType === "string" ? o.contentType : "",
    fileName: typeof o.fileName === "string" ? o.fileName : "file",
  };
}

export function parseDisplay(raw: string | null | undefined): {
  text: string;
  media: PlaceMedia | null;
} {
  if (!raw) return { text: "", media: null };
  const t = raw.trim();
  if (!t) return { text: "", media: null };
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      if (o && typeof o === "object") {
        const text = typeof o.text === "string" ? o.text : "";
        const media = asMedia(o.media);
        if (text || media || "text" in o || "media" in o) {
          return { text, media };
        }
      }
    } catch {
      /* fall through */
    }
  }
  if (/^https?:\/\//i.test(t)) {
    const fileName = t.split("?")[0].split("/").pop() || "file";
    const lower = fileName.toLowerCase();
    const contentType = lower.match(/\.(mp4|webm|mov)$/)
      ? "video/mp4"
      : lower.match(/\.(mp3|wav|m4a)$/)
        ? "audio/mpeg"
        : "image/jpeg";
    return {
      text: "",
      media: { path: "", url: t, contentType, fileName },
    };
  }
  return { text: t, media: null };
}

export function serializeDisplay(moment: PlaceMoment): string | null {
  const text = moment.text.trim();
  const media = moment.media;
  if (!text && !media) return null;
  if (!media) return text;
  return JSON.stringify({ text, media });
}

export function contentFromPlaceFields(p: {
  speakOnDepart?: string | null;
  speakWhileMoving?: string | null;
  speakOnArrive?: string | null;
  displayOnDepart?: string | null;
  displayWhileMoving?: string | null;
  displayOnArrive?: string | null;
}): PlaceContent {
  const d = parseDisplay(p.displayOnDepart);
  const m = parseDisplay(p.displayWhileMoving);
  const a = parseDisplay(p.displayOnArrive);
  return {
    depart: { speak: p.speakOnDepart ?? "", text: d.text, media: d.media },
    moving: { speak: p.speakWhileMoving ?? "", text: m.text, media: m.media },
    arrive: { speak: p.speakOnArrive ?? "", text: a.text, media: a.media },
  };
}

export function contentToPlaceFields(content: PlaceContent) {
  return {
    speakOnDepart: content.depart.speak.trim() || null,
    speakWhileMoving: content.moving.speak.trim() || null,
    speakOnArrive: content.arrive.speak.trim() || null,
    displayOnDepart: serializeDisplay(content.depart),
    displayWhileMoving: serializeDisplay(content.moving),
    displayOnArrive: serializeDisplay(content.arrive),
  };
}

export function parsePlaceContent(raw: string | null | undefined): PlaceContent {
  try {
    const o = JSON.parse(raw || "{}") as Partial<PlaceContent> & {
      speakOnDepart?: string;
    };
    if (o?.depart || o?.arrive || o?.moving) {
      return {
        depart: {
          speak: o.depart?.speak ?? "",
          text: o.depart?.text ?? "",
          media: asMedia(o.depart?.media),
        },
        moving: {
          speak: o.moving?.speak ?? "",
          text: o.moving?.text ?? "",
          media: asMedia(o.moving?.media),
        },
        arrive: {
          speak: o.arrive?.speak ?? "",
          text: o.arrive?.text ?? "",
          media: asMedia(o.arrive?.media),
        },
      };
    }
  } catch {
    /* empty */
  }
  return emptyPlaceContent();
}

function applyToken(value: string, place: string) {
  return value.split("{place}").join(place);
}

export function applyPlaceToken(
  content: PlaceContent,
  placeLabel: string
): PlaceContent {
  const mapMoment = (m: PlaceMoment): PlaceMoment => ({
    speak: applyToken(m.speak, placeLabel),
    text: applyToken(m.text, placeLabel),
    media: m.media,
  });
  return {
    depart: mapMoment(content.depart),
    moving: mapMoment(content.moving),
    arrive: mapMoment(content.arrive),
  };
}

export function resolvePlaceContent(args: {
  mode: PlaceContentMode;
  shared: PlaceContent;
  group: PlaceContent | null;
  own: PlaceContent;
  placeLabel: string;
}): PlaceContent {
  const base =
    args.mode === "shared"
      ? args.shared
      : args.mode === "groups"
        ? args.group ?? emptyPlaceContent()
        : args.own;
  return applyPlaceToken(base, args.placeLabel);
}

export function parsePlaceContentMode(
  raw: string | null | undefined
): PlaceContentMode {
  if (raw === "shared" || raw === "groups" || raw === "per_place") return raw;
  return "per_place";
}

export function flattenResolved(content: PlaceContent) {
  return {
    speakOnDepart: content.depart.speak.trim() || null,
    speakWhileMoving: content.moving.speak.trim() || null,
    speakOnArrive: content.arrive.speak.trim() || null,
    displayOnDepart: content.depart.text.trim() || null,
    displayWhileMoving: content.moving.text.trim() || null,
    displayOnArrive: content.arrive.text.trim() || null,
    mediaOnDepart: content.depart.media,
    mediaWhileMoving: content.moving.media,
    mediaOnArrive: content.arrive.media,
  };
}

export function isEmptyPlaceContent(content: PlaceContent): boolean {
  return ![content.depart, content.moving, content.arrive].some(
    (m) => m.speak.trim() || m.text.trim() || m.media
  );
}

export const PLACE_MEDIA_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/webm";

export const PLACE_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
]);

export const PLACE_MEDIA_MAX_BYTES = 50 * 1024 * 1024;
