import {uniq} from "@welshman/lib"
import {COMMUNITIES, getAddressTagValues} from "@welshman/util"
import {EncryptableList} from "./List.js"

// NIP-51 kind-10004 community membership list. Entries are `a` tags pointing at
// kind-34550 community definitions.
export class CommunityList extends EncryptableList {
  readonly kind = COMMUNITIES

  addresses() {
    return uniq(getAddressTagValues(this.tags()))
  }

  add(address: string, relayHint?: string) {
    return this.addPublicTags(["a", address, relayHint || ""])
  }

  remove(address: string) {
    return this.removeTagsWithValue(address)
  }
}
