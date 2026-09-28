import {uniq, spec} from "@welshman/lib"
import {RELAY_MEMBERS, matchTags, tagSpec, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

// Flotilla kind-13534 relay/space member-list snapshot. Members are carried in
// NIP-43 `member` tags, `["member", pubkey, ...roleIds]`, and the event is NIP-70
// protected (`-`).
export class RelayMembersReader extends EventReader {
  pubkeys() {
    return uniq(tagValues(tagSpec("member"), this.event.tags))
  }

  isMember(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  rolesByPubkey() {
    const rolesByPubkey = new Map<string, string[]>()

    for (const [, pubkey, ...roles] of matchTags(tagSpec("member"), this.event.tags)) {
      if (pubkey) {
        rolesByPubkey.set(
          pubkey,
          uniq([...(rolesByPubkey.get(pubkey) ?? []), ...roles.filter(Boolean)]),
        )
      }
    }

    return rolesByPubkey
  }

  rolesFor(pubkey: string) {
    return this.rolesByPubkey().get(pubkey) ?? []
  }
}

export class RelayMembersWriter extends EventWriter<RelayMembersReader> {
  readonly requiresRelays = true

  constructor(kind: number, context: KindContext, reader?: RelayMembersReader) {
    super(kind, context, reader)

    // NIP-43 requires kind-13534 member lists to be NIP-70 protected.
    this.setProtected(true)
  }

  // Omitting `roles` keeps whatever roles the member already has.
  addPubkey(pubkey: string, roles = this.rolesFor(pubkey)) {
    return this.dropTags(spec(["member", pubkey])).addTags(["member", pubkey, ...roles])
  }

  removePubkey(pubkey: string) {
    return this.dropTags(spec(["member", pubkey]))
  }

  setPubkeys(pubkeys: string[]) {
    const tags = uniq(pubkeys).map(pk => ["member", pk, ...this.rolesFor(pk)])

    return this.dropTags(spec(["member"])).addTags(...tags)
  }

  private rolesFor(pubkey: string) {
    return this.extraTags.find(spec(["member", pubkey]))?.slice(2) ?? []
  }
}

export class RelayMembersQuery extends EventQuery {
  protected renderRoutes() {
    return []
  }
}

export const RelayMembers = new KindFactory({
  kind: RELAY_MEMBERS,
  reader: RelayMembersReader,
  writer: RelayMembersWriter,
  query: RelayMembersQuery,
})
