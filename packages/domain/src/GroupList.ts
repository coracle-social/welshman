import {uniq} from "@welshman/lib"
import {COMMUNITIES, getAddressTagValues} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-10004 group (community) membership list. Entries are `a` tags
// pointing at kind-34550 community definitions.
export class GroupList extends EncryptableList {
  readonly kind = COMMUNITIES

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  addGroup(address: string, relayHint?: string) {
    return this.addPublicTags(["a", address, relayHint || ""])
  }

  removeGroup(address: string) {
    return this.removeTagsWithValue(address)
  }
}
