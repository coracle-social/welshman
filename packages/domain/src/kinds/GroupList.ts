import {uniq, spec, removeUndefined} from "@welshman/lib"
import {COMMUNITIES, getAddressTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-51 kind-10004 group/community list.
export class GroupList extends EventReader {
  readonly kind = COMMUNITIES

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  builder() {
    return new GroupListBuilder(this)
  }
}

export class GroupListBuilder extends EventBuilder<GroupList> {
  readonly kind = COMMUNITIES

  addGroup(address: string, relayHint?: string) {
    return this.addTags(removeUndefined(["a", address, relayHint]))
  }

  removeGroup(address: string) {
    return this.dropTags(spec(["a", address]))
  }
}
