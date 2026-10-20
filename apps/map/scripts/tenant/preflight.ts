import { extractSvgPlotIds } from "../../src/lib/colony/svgPlotIds.ts";

export type Row = Record<string, unknown>;

export interface LoadedExport {
  orgId: string;
  // keyed by "schema.table"; values parsed from the NDJSON (ids and text only are inspected here)
  rows: Record<string, Row[]>;
}

const ZERO_INSTANCE = "00000000-0000-0000-0000-000000000000";

// Everything that can be proved from the export alone, before the target is touched
// (docs/plans/38.md §2, import step 2). Returns problem descriptions: table names, counts and ids,
// never row contents.
export function checkExportIntegrity(data: LoadedExport): string[] {
  const problems: string[] = [];
  const get = (key: string): Row[] => data.rows[key] ?? [];
  const orgs = get("public.organizations");
  const colonies = get("public.colonies");
  const plots = get("public.plots");
  const history = get("public.plot_history");
  const users = get("auth.users");
  const identities = get("auth.identities");

  if (orgs.length !== 1 || orgs[0].id !== data.orgId) {
    problems.push(`expected exactly one organizations row with id ${data.orgId}`);
  }
  for (const [key, rows] of [
    ["public.colonies", colonies],
    ["public.plots", plots],
    ["public.plot_history", history],
  ] as const) {
    const stray = rows.filter((r) => r.org_id !== data.orgId).length;
    if (stray > 0) problems.push(`${key}: ${stray} row(s) belong to a different org`);
  }

  const colonyById = new Map(colonies.map((c) => [String(c.id), c]));
  const plotIds = new Set(plots.map((p) => String(p.id)));
  const userIds = new Set(users.map((u) => String(u.id)));

  const noColony = plots.filter((p) => !colonyById.has(String(p.colony_id))).length;
  if (noColony > 0) problems.push(`public.plots: ${noColony} plot(s) with no colony in the export`);

  // Orphan rule (spec/00-rules.md, orphans): a plot whose svg_id is in no path renders nowhere.
  const svgIdsByColony = new Map<string, Set<string>>();
  for (const [id, c] of colonyById) {
    svgIdsByColony.set(id, extractSvgPlotIds(typeof c.svg === "string" ? c.svg : ""));
  }
  const orphans = plots.filter(
    (p) => !svgIdsByColony.get(String(p.colony_id))?.has(String(p.svg_id)),
  ).length;
  if (orphans > 0) problems.push(`public.plots: ${orphans} plot(s) whose svg_id is not in its colony's svg`);

  const noPlot = history.filter((h) => !plotIds.has(String(h.plot_id))).length;
  if (noPlot > 0) problems.push(`public.plot_history: ${noPlot} row(s) with no plot in the export`);

  const noUser = identities.filter((i) => !userIds.has(String(i.user_id))).length;
  if (noUser > 0) problems.push(`auth.identities: ${noUser} row(s) with no user in the export`);

  const wrongInstance = users.filter((u) => u.instance_id !== ZERO_INSTANCE).length;
  if (wrongInstance > 0) problems.push(`auth.users: ${wrongInstance} user(s) with a non-default instance_id`);

  const oddEmail = users.filter((u) => !String(u.email ?? "").endsWith("@colony.local")).length;
  if (oddEmail > 0) problems.push(`auth.users: ${oddEmail} user(s) that are not username accounts (@colony.local)`);

  return problems;
}
