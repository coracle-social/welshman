import {App} from "./app.js"
import type {AppOptions} from "./app.js"
import {defaultAppPolicies} from "./policy.js"

/**
 * Creates a batteries-included app: an `App` wired with the default app
 * policies (event ingestion, relay-stats collection, gift-wrap unwrapping).
 * Reach data modules via `app.use(Profiles)`, `app.use(FollowLists)`, etc.
 *
 * For a bare app (no default side effects) construct `new App(...)`
 * directly, or pass your own `policies`.
 */
export const createApp = (options: AppOptions = {}) =>
  new App({...options, policies: options.policies ?? defaultAppPolicies})
