import {uniq, spec} from "@welshman/lib"
import {ROOM_ADMINS, hexTags, matchTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-29 kind-39001 room admins list. Each admin is a `["p", pubkey, ...roles]` tag.
export class RoomAdminsReader extends EventReader {
  pubkeys() {
    return uniq(tagValues(hexTags("p"), this.event.tags))
  }

  rolesByPubkey() {
    const rolesByPubkey = new Map<string, string[]>()

    for (const [, pubkey, ...roles] of matchTags(hexTags("p"), this.event.tags)) {
      rolesByPubkey.set(
        pubkey,
        uniq([...(rolesByPubkey.get(pubkey) ?? []), ...roles.filter(Boolean)]),
      )
    }

    return rolesByPubkey
  }

  rolesFor(pubkey: string) {
    return this.rolesByPubkey().get(pubkey) ?? []
  }
}

export class RoomAdminsWriter extends EventWriter<RoomAdminsReader> {
  readonly requiresRelays = true

  // Omitting `roles` keeps whatever roles the admin already has.
  addPubkey(pubkey: string, roles = this.rolesFor(pubkey)) {
    return this.dropTags(spec(["p", pubkey])).addTags(["p", pubkey, ...roles])
  }

  removePubkey(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }

  setPubkeys(pubkeys: string[]) {
    const tags = uniq(pubkeys).map(pk => ["p", pk, ...this.rolesFor(pk)])

    return this.dropTags(spec(["p"])).addTags(...tags)
  }

  private rolesFor(pubkey: string) {
    return this.extraTags.find(spec(["p", pubkey]))?.slice(2) ?? []
  }
}

export class RoomAdminsQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RoomAdmins = new KindFactory({
  kind: ROOM_ADMINS,
  reader: RoomAdminsReader,
  writer: RoomAdminsWriter,
  query: RoomAdminsQuery,
})
