import {ROOM_META, ROOM_MEMBERS, ROOM_ADMINS} from "@welshman/util"
import type {Filter} from "@welshman/util"
import {
  RoomMeta,
  RoomMetaReader,
  RoomMembers,
  RoomMembersReader,
  RoomAdmins,
  RoomAdminsReader,
} from "@welshman/domain"
import {projectFrom} from "./base.js"
import type {Projection, RelayScopedDerivedPluginOptions} from "./base.js"
import {RelaySignedDerivedPlugin} from "./relaySigned.js"
import {Network} from "./network.js"
import type {IApp} from "../app.js"

// NIP-29 group metadata (kinds 39000–39002) is addressable per group but hosted
// on a specific relay, so the same group id can exist independently on many
// relays. Key it by `${url}'${group}` (the `'` separator matches flotilla's
// room-id convention; relay urls never contain it).
export const makeGroupKey = (url: string, group: string) => `${url}'${group}`

export const splitGroupKey = (key: string): [string, string] => {
  const i = key.indexOf("'")

  return [key.slice(0, i), key.slice(i + 1)]
}

// Shared machinery for the three group-addressable room collections: same
// key scheme, same relay-scoped fetch, differing only in kind + reader. These
// are NIP-29 group-state kinds, authored by the relay, so validate the relay
// signature (RelaySignedDerivedPlugin).
abstract class RoomCollection<
  T extends {identifier(): string | undefined; author(): string},
> extends RelaySignedDerivedPlugin<T> {
  constructor(
    app: IApp,
    kind: number,
    options: Omit<RelayScopedDerivedPluginOptions<T>, "filters" | "getKey">,
  ) {
    super(app, {
      ...options,
      filters: [{kinds: [kind]}],
      getKey: (item, url) => makeGroupKey(url, item.identifier() ?? ""),
    })

    this.kind = kind
  }

  protected kind: number

  fetch(key: string) {
    const [url, group] = splitGroupKey(key)
    const filters: Filter[] = [{kinds: [this.kind], "#d": [group]}]

    return this.app.use(Network).load({relays: [url], filters})
  }

  // Everything hosted on a given relay.
  forUrl = (url: string): Projection<T[]> =>
    projectFrom(this.index, byKey =>
      Array.from(byKey.entries())
        .filter(([key]) => key.startsWith(`${url}'`))
        .map(([, item]) => item),
    )

  // The single item for one group on one relay.
  forGroup = (url: string, group: string) => this.one(makeGroupKey(url, group))
}

/** NIP-29 kind-39000 room metadata, keyed by `${url}'${group}`. */
export class RoomMetas extends RoomCollection<RoomMetaReader> {
  constructor(app: IApp) {
    super(app, ROOM_META, {eventToItem: RoomMeta.factory(app.user?.signer)})
  }
}

/** NIP-29 kind-39002 room member lists, keyed by `${url}'${group}`. */
export class RoomMemberLists extends RoomCollection<RoomMembersReader> {
  constructor(app: IApp) {
    super(app, ROOM_MEMBERS, {eventToItem: RoomMembers.factory(app.user?.signer)})
  }
}

/** NIP-29 kind-39001 room admin lists, keyed by `${url}'${group}`. */
export class RoomAdminLists extends RoomCollection<RoomAdminsReader> {
  constructor(app: IApp) {
    super(app, ROOM_ADMINS, {eventToItem: RoomAdmins.factory(app.user?.signer)})
  }
}
