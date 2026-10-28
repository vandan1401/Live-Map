// wrangler.toml's `[[rules]]` block turns these extensions into raw imports at bundle time
// (Text for .css, CompiledWasm for .wasm) — ambient declarations scoped to this Worker's
// own tsconfig.worker.json, not the app's Vite-side CSS module typing.
declare module "*.css" {
  const content: string;
  export default content;
}

declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
