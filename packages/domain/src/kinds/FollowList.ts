import {uniq, spec, removeUndefined} from "@welshman/lib"
import {FOLLOWS, getPubkeyTagValues, userOutbox} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-02 kind-3 follow list.
export class FollowListReader extends EventReader {
  pubkeys() {
    return uniq(getPubkeyTagValues(this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }
}

export class FollowListWriter extends EventWriter<FollowListReader> {
  protected async routes() {
    return [userOutbox()]
  }

  follow(pubkey: string, relayHint?: string, petname?: string) {
    return this.addTags(removeUndefined(["p", pubkey, relayHint, petname]))
  }

  unfollow(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }
}

export const FollowList = new KindFactory({
  kind: FOLLOWS,
  reader: FollowListReader,
  writer: FollowListWriter,
})
