import {ROOMS, getGroupTags, getGroupTagValues} from "@welshman/util"
import {ListReader, ListBuilder} from "./List.js"

// NIP-51 / NIP-29 kind-10009 simple-groups membership list. Each entry is a
// group tag `["group", groupId, relayUrl]` (legacy `"h"` is also accepted on
// read). Distinct from the NIP-29 room management events, which are not lists.
export class RoomList extends ListReader {
  static kind = ROOMS

  groups() {
    return getGroupTagValues(this.tags())
  }

  groupTags() {
    return getGroupTags(this.tags())
  }

  builder() {
    return this.seedList(new RoomListBuilder())
  }
}

export class RoomListBuilder extends ListBuilder {
  static kind = ROOMS

  join(groupId: string, relayUrl: string) {
    return this.addPublicTags(["group", groupId, relayUrl])
  }

  leave(groupId: string) {
    return this.removeTagsWithValue(groupId)
  }
}
