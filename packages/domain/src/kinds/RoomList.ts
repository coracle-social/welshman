import {nthEq} from "@welshman/lib"
import {ROOMS, getGroupTags, getGroupTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10009 simple-groups membership list.
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

  join(groupId: string, url: string) {
    return this.addPublic(["group", groupId, url])
  }

  leave(groupId: string) {
    return this.drop(nthEq(1, groupId))
  }
}
