import {nthEq} from "@welshman/lib"
import {ROOMS, getGroupTags, getGroupTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 / NIP-29 kind-10009 simple-groups membership list. Each entry is a
// group tag `["group", groupId, relayUrl]` (legacy `"h"` is also accepted on
// read). Distinct from the NIP-29 room management events, which are not lists.
export class RoomList extends ListReader {
  readonly kind = ROOMS

  groups() {
    return getGroupTagValues(this.tags())
  }

  groupTags() {
    return getGroupTags(this.tags())
  }

  builder() {
    return new RoomListBuilder(this)
  }
}

export class RoomListBuilder extends ListBuilder<RoomList> {
  readonly kind = ROOMS

  join(groupId: string, relayUrl: string) {
    return this.addPublic(["group", groupId, relayUrl])
  }

  leave(groupId: string) {
    return this.drop(nthEq(1, groupId))
  }
}
