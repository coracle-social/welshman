import {spec} from "@welshman/lib"
import {ROOMS, getGroupTags, getGroupTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-51 kind-10009 simple-groups membership list.
export class RoomList extends EventReader {
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

export class RoomListBuilder extends EventBuilder<RoomList> {
  readonly kind = ROOMS

  addGroup(groupId: string, url: string) {
    return this.addTags(["group", groupId, url])
  }

  removeGroup(groupId: string) {
    return this.dropTags(spec(["group", groupId]))
  }
}
