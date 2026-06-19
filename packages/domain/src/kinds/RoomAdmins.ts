import {first, randomId, uniq} from "@welshman/lib"
import {ROOM_ADMINS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-39001 relay-generated room admin list. Addressable, with the group
// id ("h") stored in the "d" tag and admins as "p" tags. Tags-only content.
export class RoomAdmins extends EventReader {
  readonly kind = ROOM_ADMINS

  // The group id is the addressable identifier (the "d" tag).
  h() {
    return this.identifier()
  }

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  builder() {
    return new RoomAdminsBuilder(this)
  }
}

export class RoomAdminsBuilder extends EventBuilder<RoomAdmins> {
  readonly kind = ROOM_ADMINS

  h = randomId()
  pubkeys: string[] = []

  constructor(readonly reader?: RoomAdmins) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    const d = first(this.consumeTags("d"))

    this.h = d?.[1] || randomId()
    this.pubkeys = uniq(this.consumeTags("p").map(t => t[1]))
  }

  setH(h: string) {
    this.h = h

    return this
  }

  addPubkey(pubkey: string) {
    if (!this.pubkeys.includes(pubkey)) {
      this.pubkeys.push(pubkey)
    }

    return this
  }

  protected validate() {
    if (!this.h) {
      throw new Error("RoomAdmins requires an h/d identifier")
    }
  }

  protected buildTags() {
    return [["d", this.h], ...this.pubkeys.map(pk => ["p", pk])]
  }
}
