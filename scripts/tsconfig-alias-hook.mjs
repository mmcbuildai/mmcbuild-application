/**
 * Teach plain `node` the `@/*` path alias that tsconfig.json declares.
 *
 * WHY THIS EXISTS
 * Node 24 runs a `.ts` file directly by stripping its types, which is what lets
 * `scripts/check-pricing-drift.mjs` import the real `PLANS` instead of keeping a
 * second copy of the prices — the whole point of that guard. Type stripping is
 * not type RESOLUTION though: `tsconfig.json` maps `@/*` to `./src/*`, and Node
 * knows nothing about it, so the first aliased import throws
 * ERR_MODULE_NOT_FOUND at link time.
 *
 * That is not hypothetical. On 10 August #179 added
 *
 *     import { ... } from "@/lib/legal/commercial-facts";
 *
 * to `src/lib/stripe/plans.ts` — correct, conventional, and it took the pricing
 * guard out. The nightly job then failed on the IMPORT for three consecutive
 * nights (11, 12, 13 Aug) without ever reaching the assertion, so nothing was
 * comparing the live pricing page to this app while the workflow displayed a red
 * X that read like a pricing fault. A guard that dies before it checks anything
 * is worse than no guard: it occupies the slot.
 *
 * WHY A HOOK RATHER THAN A RELATIVE IMPORT
 * Rewriting that one line to `../legal/commercial-facts` would also work, today.
 * It fixes the instance and leaves the class: the next `@/` import added to
 * anything on this graph breaks the guard again, and the person adding it has no
 * reason to suspect a build script reads their file. Resolving the alias the way
 * TypeScript does removes the trap instead of stepping over it.
 *
 * USAGE — the register call must run BEFORE the aliased module is imported, and
 * a static `import` is hoisted above all statements, so the consumer registers
 * the hook and then imports dynamically:
 *
 *     import { register } from "node:module";
 *     register("./tsconfig-alias-hook.mjs", import.meta.url);
 *     const { PLANS } = await import("../src/lib/stripe/plans.ts");
 *
 * SCOPE, stated rather than implied: this resolves `@/*` only, against `src/`,
 * with the extension probing TypeScript does for an extensionless specifier. It
 * is not a tsconfig parser — it does not read `paths` from disk, so if that
 * mapping ever changes, this file has to change with it. One alias, hard-coded
 * and named here, is easier to keep honest than a partial implementation of
 * TypeScript's resolver that looks complete.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** `@/*` → `<repo>/src/*`, mirroring tsconfig.json `compilerOptions.paths`. */
const SRC_ROOT = new URL("../src/", import.meta.url);

/**
 * The order TypeScript would try for an extensionless specifier. The empty
 * string is first so an import that already names its extension is honoured
 * as written rather than being shadowed by a sibling.
 */
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

  const base = new URL(specifier.slice("@/".length), SRC_ROOT);

  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = new URL(base.href + suffix);
    if (existsSync(fileURLToPath(candidate))) {
      return nextResolve(candidate.href, context);
    }
  }

  // Deliberately louder than Node's own ERR_MODULE_NOT_FOUND, which reports the
  // bare specifier `@/lib` and reads as a missing npm PACKAGE — the wrong
  // diagnosis, and the reason the original failure took a log dive to explain.
  throw new Error(
    `Cannot resolve the tsconfig alias "${specifier}" from ${fileURLToPath(SRC_ROOT)}. ` +
      `Tried: ${CANDIDATE_SUFFIXES.map((s) => `${specifier}${s}`).join(", ")}. ` +
      `This is the alias hook in scripts/tsconfig-alias-hook.mjs, not a missing npm package.`,
  );
}
