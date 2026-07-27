// Ambient shims scoped to the Worker/Durable Object build only.
//
// The engine transitively imports two browser-oriented source files:
//   - src/game/tiles.ts uses `import.meta.env.BASE_URL` (Vite) in a UI-only
//     asset-path helper the Worker never calls.
//   - src/game/id.ts reads `globalThis.crypto` (available in Workers at runtime).
// These are valid in the browser (DOM lib) and at Worker runtime, but the
// worker tsconfig uses @cloudflare/workers-types, which types them differently.
// We declare them here so type-checking passes without editing shared code.

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Web Crypto is a runtime global in Workers; expose it on `globalThis` typing.
declare var crypto: Crypto;
