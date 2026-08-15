// One-off initial data load — the narrow exception in spec/00-rules.md to "no
// spreadsheet as the live data store". Not part of the app's runtime write path; that's
// M4's applyPlotTransition(). Run via `pnpm import:seed`.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDbClient } from "../src/lib/db/client.ts";
import { insertColony } from "../src/lib/db/colonies.ts";
import { insertPlotHistory } from "../src/lib/db/plotHistory.ts";
import { insertPlots } from "../src/lib/db/plots.ts";
import type { Facing, PlotInsert, PlotStatus } from "../src/lib/db/types.ts";

declare const process: NodeJS.Process & { loadEnvFile?: (path?: string) => void };
try {
  process.loadEnvFile?.();
} catch {
  // No .env file — fall through to whatever is already in the environment.
}

const STATUSES: PlotStatus[] = ["available", "booked", "registered"];
const FACINGS: Facing[] = [
  "north", "north-east", "east", "south-east",
  "south", "south-west", "west", "north-west",
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const manifestPath = resolve(repoRoot, process.argv[2] ?? "fixtures/shree-vatika-2/colony.json");
const csvPath = resolve(repoRoot, process.argv[3] ?? "seed/plot-status-seed.csv");

function fail(message: string): never {
  console.error(`import-seed: ${message}`);
  process.exit(1);
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Manifest {
  colony: {
    id: string;
    name: string;
    verified: boolean;
    generated: string;
    source: { file: string };
  };
  plots: Array<{
    svg_id: string;
    block: string;
    number: string;
    area_sqft: number;
    length_ft: number;
    breadth_ft: number;
    facing: Facing;
    is_corner: boolean;
  }>;
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as Manifest;

if (manifest.colony.verified !== true) {
  fail(
    `colony.verified is not true for "${manifest.colony.id}" — refusing to import an ` +
      "unverified manifest (D-108).",
  );
}

const svgPath = resolve(manifestPath, "..", "colony.svg");
const svgRaw = readFileSync(svgPath, "utf-8");
const svgPlotIds = new Set([...svgRaw.matchAll(/id="(plot-[A-Z]+-\d+)"/g)].map((m) => m[1]));
const manifestPlotIds = new Set(manifest.plots.map((p) => p.svg_id));

const inManifestNotSvg = [...manifestPlotIds].filter((id) => !svgPlotIds.has(id));
const inSvgNotManifest = [...svgPlotIds].filter((id) => !manifestPlotIds.has(id));
if (inManifestNotSvg.length > 0 || inSvgNotManifest.length > 0) {
  fail(
    "orphaned svg_ids — manifest and colony.svg disagree.\n" +
      `  in manifest but not svg: ${inManifestNotSvg.join(", ") || "(none)"}\n` +
      `  in svg but not manifest: ${inSvgNotManifest.join(", ") || "(none)"}`,
  );
}

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ""]));
  });
}

const csvRows = parseCsv(readFileSync(csvPath, "utf-8"));
const csvBySvgId = new Map(csvRows.map((row) => [row.svg_id, row]));

const inManifestNotCsv = [...manifestPlotIds].filter((id) => !csvBySvgId.has(id));
const inCsvNotManifest = [...csvBySvgId.keys()].filter((id) => !manifestPlotIds.has(id));
if (inManifestNotCsv.length > 0 || inCsvNotManifest.length > 0) {
  fail(
    "orphaned svg_ids — manifest and seed CSV disagree.\n" +
      `  in manifest but not csv: ${inManifestNotCsv.join(", ") || "(none)"}\n` +
      `  in csv but not manifest: ${inCsvNotManifest.join(", ") || "(none)"}`,
  );
}

function nullableText(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

function nullablePaise(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) fail(`non-integer paise value: "${value}"`);
  return parsed;
}

const plotInserts: PlotInsert[] = manifest.plots.map((plot) => {
  const seed = csvBySvgId.get(plot.svg_id)!;
  const status = seed.status as PlotStatus;
  if (!STATUSES.includes(status)) fail(`unrecognised status "${seed.status}" for ${plot.svg_id}`);
  if (!FACINGS.includes(plot.facing)) fail(`unrecognised facing "${plot.facing}" for ${plot.svg_id}`);

  return {
    colony_id: manifest.colony.id,
    svg_id: plot.svg_id,
    block: plot.block,
    number: plot.number,
    area_sqft: plot.area_sqft,
    length_ft: plot.length_ft,
    breadth_ft: plot.breadth_ft,
    facing: plot.facing,
    is_corner: plot.is_corner,
    status,
    owner_name: nullableText(seed.owner_name),
    owner_phone: nullableText(seed.owner_phone),
    broker_name: nullableText(seed.broker_name),
    rate_paise: nullablePaise(seed.rate_paise),
    booking_amount_paise: nullablePaise(seed.booking_amount_paise),
    booking_date: nullableText(seed.booking_date),
    registry_date: nullableText(seed.registry_date),
    notes: nullableText(seed.notes),
    updated_by: "import",
  };
});

const url = process.env.VITE_SUPABASE_URL ?? "";
// The service-role key, not the anon key (docs/plans/09.md) — M8's RLS lockdown leaves
// anon/authenticated with no insert grant on colonies/plots, so this admin-only import
// must bypass RLS entirely, the same way scripts/create-user.ts does.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !serviceRoleKey) {
  fail("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example).");
}
const client = createDbClient(url, serviceRoleKey);

async function main() {
  await insertColony(client, {
    id: manifest.colony.id,
    name: manifest.colony.name,
    verified: manifest.colony.verified,
    source_file: manifest.colony.source.file,
    generated: manifest.colony.generated,
  }).catch((error: unknown) => fail(`colony insert failed, nothing else attempted: ${errMsg(error)}`));

  const insertedPlots = await insertPlots(client, plotInserts).catch((error: unknown) =>
    fail(`plot insert failed, no plots or history written: ${errMsg(error)}`),
  );

  await insertPlotHistory(
    client,
    insertedPlots.map((row) => ({
      plot_id: row.id,
      status: row.status,
      changed_by: "import",
      note: "initial load",
    })),
  ).catch((error: unknown) =>
    fail(
      `plot_history insert failed AFTER ${insertedPlots.length} plots were already ` +
        'written — the database is now partially loaded. Run "supabase db reset" and ' +
        `retry rather than patching around it. Original error: ${errMsg(error)}`,
    ),
  );

  console.log(`imported ${insertedPlots.length} plots for "${manifest.colony.id}", 0 unmatched`);
}

void main();
