import { describe, expect, it } from "vitest";
import { resolveAppConfig } from "./appConfig";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    data,
  };
}

const ENV = { VITE_SUPABASE_URL: "https://build.example", VITE_SUPABASE_ANON_KEY: "build-key" };

describe("resolveAppConfig", () => {
  it("falls back to the build-time values when /config.js is empty (the SaaS case)", () => {
    expect(resolveAppConfig({}, ENV, memoryStorage())).toEqual({
      supabaseUrl: "https://build.example",
      supabaseAnonKey: "build-key",
      deploymentMode: "saas",
    });
  });

  it("lets the runtime config override the build-time values", () => {
    const config = resolveAppConfig(
      { supabaseUrl: "https://api.client.example", supabaseAnonKey: "run-key", deploymentMode: "selfhosted" },
      ENV,
      memoryStorage(),
    );
    expect(config).toEqual({
      supabaseUrl: "https://api.client.example",
      supabaseAnonKey: "run-key",
      deploymentMode: "selfhosted",
    });
  });

  it("treats any unknown mode as saas", () => {
    expect(resolveAppConfig({ deploymentMode: "enterprise" }, ENV, memoryStorage()).deploymentMode).toBe("saas");
  });

  it("remembers a runtime config and reuses it when config.js did not load", () => {
    const storage = memoryStorage();
    resolveAppConfig({ supabaseUrl: "https://api.client.example", deploymentMode: "selfhosted" }, {}, storage);
    const offline = resolveAppConfig(undefined, {}, storage);
    expect(offline.supabaseUrl).toBe("https://api.client.example");
    expect(offline.deploymentMode).toBe("selfhosted");
  });

  it("does not throw when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => resolveAppConfig({ supabaseUrl: "https://x.example" }, ENV, broken)).not.toThrow();
    expect(resolveAppConfig(undefined, ENV, broken).supabaseUrl).toBe("https://build.example");
  });
});
