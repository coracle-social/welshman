import {uniq, last, spec} from "@welshman/lib"
import {FOLLOWS, hexTags, matchTags, tagValues, indexers, userOutbox} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-02 kind-3 follow list.
export class FollowListReader extends EventReader {
  pubkeys() {
    return uniq(tagValues(hexTags("p"), this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }

  petnames() {
    const petnames: Record<string, string> = {}

    for (const tag of matchTags(hexTags("p"), this.tags())) {
      if (tag[3]) {
        petnames[tag[1]] = tag[3]
      }
    }

    return petnames
  }

  petname(pubkey: string) {
    return this.petnames()[pubkey]
  }
}

export class FollowListWriter extends EventWriter<FollowListReader> {
  protected async renderRoutes() {
    return [userOutbox()]
  }

  follow(pubkey: string, relayHint?: string, petname?: string) {
    const slots = [pubkey, relayHint || "", petname || ""]

    while (last(slots) === "") {
      slots.pop()
    }

    return this.dropTags(spec(["p", pubkey])).addTags(["p", ...slots])
  }

  unfollow(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }
}

export class FollowListQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), indexers()]
  }
}

export const FollowList = new KindFactory({
  kind: FOLLOWS,
  reader: FollowListReader,
  writer: FollowListWriter,
  query: FollowListQuery,
})
