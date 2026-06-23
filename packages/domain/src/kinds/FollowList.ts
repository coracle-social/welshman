import {uniq, spec, removeUndefined} from "@welshman/lib"
import {FOLLOWS, getPubkeyTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-02 kind-3 follow list.
export class FollowList extends EventReader {
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

export class FollowListBuilder extends EventBuilder<FollowList> {
  readonly kind = FOLLOWS

  follow(pubkey: string, relayHint?: string, petname?: string) {
    return this.addTags(removeUndefined(["p", pubkey, relayHint, petname]))
  }

  unfollow(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }
}
