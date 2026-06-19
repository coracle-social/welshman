import {uniq, nthEq} from "@welshman/lib"
import {FOLLOWS, getPubkeyTagValues} from "@welshman/util"
import {ListReader} from "../ListReader.js"
import {ListBuilder} from "../ListBuilder.js"

// NIP-02 kind-3 follow list.
export class FollowList extends ListReader {
  readonly kind = FOLLOWS

  pubkeys() {
    return uniq(getPubkeyTagValues(this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  builder() {
    return new FollowListBuilder(this)
  }
}

export class FollowListBuilder extends ListBuilder<FollowList> {
  readonly kind = FOLLOWS

  addFollow(tag: string[]) {
    return this.addPublic(tag)
  }

  removeFollow(value: string) {
    return this.drop(nthEq(1, value))
  }
}
