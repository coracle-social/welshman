import {randomId, uniq} from "@welshman/lib"
import {ROOM_ADMINS, getPubkeyTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-29 kind-39001 relay-generated room admin list. Addressable, with the group
// id ("h") stored in the "d" tag and admins as "p" tags. Tags-only content.
export class RoomAdmins extends EventReader {
  static kind = ROOM_ADMINS

  protected validate() {
    if (!this.identifier()) {
      throw new Error("RoomAdmins requires a d tag")
    }
  }

  protected reservedTagKeys() {
    return ["d", "p"]
  }

  // The group id is the addressable identifier (the "d" tag).
  h() {
    return this.identifier()
  }

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  builder() {
    const builder = new RoomAdminsBuilder()

    builder.h = this.identifier() || ""
    builder.pubkeys = this.pubkeys()

    return this.seedBuilder(builder)
  }
}

export class RoomAdminsBuilder extends EventBuilder {
  static kind = ROOM_ADMINS

  h = randomId()
  pubkeys: string[] = []

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
