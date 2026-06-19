import {nth, nthNe, uniq, uniqBy} from "@welshman/lib"
import {ROOM_ADMINS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-29 kind-39001 room admins list.
export class RoomAdmins extends EventReader {
  readonly kind = ROOM_ADMINS

  pubkeys() {
    return uniq(getPubkeyTagValues(this.event.tags))
  }

  builder() {
    return new RoomAdminsBuilder(this)
  }
}

export class RoomAdminsBuilder extends EventBuilder<RoomAdmins> {
  readonly kind = ROOM_ADMINS

  adminTags: string[][] = []

  constructor(readonly reader?: RoomAdmins) {
    super(reader)

    this.adminTags = uniqBy(nth(1), this.consumeTags("p"))
  }

  addAdmin(pubkey: string) {
    this.adminTags = uniqBy(nth(1), [...this.adminTags, ["p", pubkey]])

    return this
  }

  removeAdmin(pubkey: string) {
    this.adminTags = this.adminTags.filter(nthNe(1, pubkey))

    return this
  }

  protected buildTags() {
    return this.adminTags
  }
}
