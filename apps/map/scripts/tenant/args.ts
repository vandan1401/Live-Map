import { TenantError } from "./errors.ts";

export interface ParsedArgs {
  values: Record<string, string>;
  flags: Set<string>;
}

// Tiny flag parser: `--name value` for valueFlags, bare `--name` for boolFlags. Unknown flags and
// missing values are refused rather than ignored: a typo'd `--dry-runn` must not silently turn a
// dry run into a real import.
export function parseArgs(
  argv: readonly string[],
  valueFlags: readonly string[],
  boolFlags: readonly string[],
): ParsedArgs {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new TenantError(`unexpected argument "${arg}"`);
    const name = arg.slice(2);
    if (boolFlags.includes(name)) {
      flags.add(name);
    } else if (valueFlags.includes(name)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new TenantError(`--${name} needs a value`);
      }
      values[name] = value;
      i++;
    } else {
      throw new TenantError(`unknown flag --${name}`);
    }
  }
  return { values, flags };
}

export function requireValue(args: ParsedArgs, name: string): string {
  const value = args.values[name];
  if (!value) throw new TenantError(`--${name} is required`);
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: string, label: string): string {
  if (!UUID.test(value)) throw new TenantError(`${label} is not a uuid`);
  return value.toLowerCase();
}
