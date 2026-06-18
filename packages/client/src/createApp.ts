import {Client} from "./client.js"
import type {ClientOptions} from "./client.js"
import {defaultClientPolicies} from "./policy.js"

/**
 * Creates a batteries-included client: a `Client` wired with the default client
 * policies (event ingestion, relay-stats collection, gift-wrap unwrapping).
 * Reach data modules via `client.use(Profiles)`, `client.use(FollowLists)`, etc.
 *
 * For a bare client (no default side effects) construct `new Client(...)`
 * directly, or pass your own `policies`.
 */
export const createApp = (options: ClientOptions = {}) =>
  new Client({...options, policies: options.policies ?? defaultClientPolicies})
