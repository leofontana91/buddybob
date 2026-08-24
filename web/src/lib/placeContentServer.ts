import { prisma } from "./db";
import {
  contentFromPlaceFields,
  flattenResolved,
  parsePlaceContent,
  parsePlaceContentMode,
  resolvePlaceContent,
  type PlaceContent,
  type PlaceContentMode,
} from "./placeContent";

export async function loadPlaceContentBundle(robotId: string) {
  const [settings, groups, places] = await Promise.all([
    prisma.robotSettings.findUnique({ where: { robotId } }),
    prisma.placeContentGroup.findMany({
      where: { robotId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.mapPlace.findMany({
      where: { robotId },
      orderBy: { name: "asc" },
    }),
  ]);

  const mode = parsePlaceContentMode(settings?.placeContentMode);
  const shared = parsePlaceContent(settings?.placeSharedJson);
  const groupById = new Map(
    groups.map((g) => [g.id, parsePlaceContent(g.contentJson)])
  );

  return { settings, groups, places, mode, shared, groupById };
}

export function resolvedFieldsForPlace(args: {
  mode: PlaceContentMode;
  shared: PlaceContent;
  group: PlaceContent | null;
  own: PlaceContent;
  label: string;
}) {
  return flattenResolved(
    resolvePlaceContent({
      mode: args.mode,
      shared: args.shared,
      group: args.group,
      own: args.own,
      placeLabel: args.label,
    })
  );
}

export function ownContentFromRow(
  p: Parameters<typeof contentFromPlaceFields>[0]
) {
  return contentFromPlaceFields(p);
}
