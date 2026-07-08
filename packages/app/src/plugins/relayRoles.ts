import {RELAY_ROLE} from "@welshman/util"
import {RelayRole, RelayRoleReader} from "@welshman/domain"
import {projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {RelaySignedDerivedPlugin} from "./relaySigned.js"
import {Network} from "./network.js"
import type {IApp} from "../app.js"

// Flotilla kind-33534 relay roles are addressable (d = role id) and published
// by a relay's self key, so key them by `${url}|${d}` — the `|` separator keeps
// them distinct from the `'`-separated group keys and never appears in a url.
export const makeRelayRoleKey = (url: string, d: string) => `${url}|${d}`

export const splitRelayRoleKey = (key: string): [string, string] => {
  const i = key.indexOf("|")

  return [key.slice(0, i), key.slice(i + 1)]
}

/** Flotilla kind-33534 relay roles (relay-signed), keyed by `${url}|${roleId}`. */
export class RelayRoles extends RelaySignedDerivedPlugin<RelayRoleReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [RELAY_ROLE]}],
      eventToItem: RelayRole.factory(app.user?.signer),
      getKey: (role, url) => makeRelayRoleKey(url, role.identifier() ?? ""),
    })
  }

  fetch(key: string) {
    const [url, d] = splitRelayRoleKey(key)

    return this.app.use(Network).load({relays: [url], filters: [{kinds: [RELAY_ROLE], "#d": [d]}]})
  }

  forUrl = (url: string): Projection<RelayRoleReader[]> =>
    projectFrom(this.index, byKey =>
      Array.from(byKey.entries())
        .filter(([key]) => key.startsWith(`${url}|`))
        .map(([, role]) => role),
    )

  forRole = (url: string, d: string) => this.one(makeRelayRoleKey(url, d))
}
