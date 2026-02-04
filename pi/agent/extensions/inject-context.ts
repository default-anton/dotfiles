// NOTE: pi discovers and loads extensions by scanning for *.ts/*.js files.
//
// On Node 24, loading a full TypeScript ESM implementation here can fail with an
// "Cannot determine intended module format" error.
//
// We keep the entry point as `inject-context.ts`, but delegate to an ESM
// implementation file that is NOT auto-discovered by pi.
//
// Keep this file CommonJS (no ESM imports/exports).

module.exports = async function injectContextExtension(pi: unknown) {
  const mod = await import("./inject-context.impl.mjs");

  const factory = (mod as { default?: unknown }).default;
  if (typeof factory !== "function") {
    throw new Error("inject-context.impl.mjs does not have a default export function");
  }

  return (factory as (pi: unknown) => unknown)(pi);
};
