import {uniq, nthEq} from "@welshman/lib"
import {COMMUNITIES, getAddressTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-51 kind-10004 group/community list.
export class GroupList extends ListReader {
  readonly kind = COMMUNITIES

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  builder() {
    return new GroupListBuilder(this)
  }
}

export class GroupListBuilder extends ListBuilder<GroupList> {
  readonly kind = COMMUNITIES

  addGroup(address: string, relayHint?: string) {
    return this.addPublic(["a", address, relayHint || ""])
  }

  removeGroup(address: string) {
    return this.drop(nthEq(1, address))
  }
}
