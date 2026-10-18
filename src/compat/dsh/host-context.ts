/**
 * compat/dsh — the only layer allowed to import DSH APIs directly.
 *
 * Host-side context alias. Host plugins are ordinary cordis object plugins
 * (`apply(ctx)` + optional `inject`). Verified against deepseek-harness
 * 0.2.1-rc.2 @ 687f282e86: packages/client/ui-renderer/src/client/index.ts and Cordis Context.
 */
export type { Context as DshHostContext } from '@deepseek-ai/cordis'
