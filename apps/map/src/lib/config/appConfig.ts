// One place that decides what this deployment is pointed at. The same built bundle serves the
// SaaS and every private (self-hosted) instance, so nothing environment-specific may be baked
// in at build time alone: a deployment can ship a /config.js (loaded by index.html before the
// app) that sets window.__APP_CONFIG__, and anything it leaves out falls back to the build-time
// VITE_* values. The SaaS ships an empty /config.js, so its behaviour is unchanged.
//
// The last good config is remembered in localStorage so an offline PWA launch (cached
// index.html, config.js unreachable) still knows its Supabase URL instead of crashing.

export type DeploymentMode = "saas" | "selfhosted";

export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  deploymentMode: DeploymentMode;
}

export interface RuntimeConfigInput {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  deploymentMode?: string;
}

export interface BuildEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_DEPLOYMENT_MODE?: string;
}

const STORAGE_KEY = "app-config-v1";

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeConfigInput;
  }
}

function asMode(value: string | undefined): DeploymentMode {
  return value === "selfhosted" ? "selfhosted" : "saas";
}

function readRemembered(storage: Pick<Storage, "getItem"> | undefined): RuntimeConfigInput {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RuntimeConfigInput) : {};
  } catch {
    return {};
  }
}

export function resolveAppConfig(
  runtime: RuntimeConfigInput | undefined,
  env: BuildEnv,
  storage?: Pick<Storage, "getItem" | "setItem">,
): AppConfig {
  const fromRuntime = runtime && Object.keys(runtime).length > 0 ? runtime : undefined;
  const source = fromRuntime ?? readRemembered(storage);
  const config: AppConfig = {
    supabaseUrl: source.supabaseUrl || env.VITE_SUPABASE_URL || "",
    supabaseAnonKey: source.supabaseAnonKey || env.VITE_SUPABASE_ANON_KEY || "",
    deploymentMode: asMode(source.deploymentMode || env.VITE_DEPLOYMENT_MODE),
  };
  if (fromRuntime) {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(fromRuntime));
    } catch {
      // Private mode / blocked storage: the offline fallback is a convenience only.
    }
  }
  return config;
}

export function getAppConfig(): AppConfig {
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  const env: BuildEnv = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_DEPLOYMENT_MODE: import.meta.env.VITE_DEPLOYMENT_MODE,
  };
  return resolveAppConfig(window.__APP_CONFIG__, env, storage);
}

export function isSelfHosted(): boolean {
  return getAppConfig().deploymentMode === "selfhosted";
}
