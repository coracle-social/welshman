import {uniq, spec} from "@welshman/lib"
import {
  MUTES,
  addressTags,
  hexTags,
  tagSpec,
  tagValues,
  topicTags,
  userOutbox,
} from "@welshman/util"
import {ListReader} from "../core/ListReader.js"
import {ListWriter} from "../core/ListWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-51 kind-10000 mute list.
export class MuteListReader extends ListReader {
  pubkeys() {
    return uniq(tagValues(hexTags("p"), this.tags()))
  }

  words() {
    return uniq(tagValues(tagSpec("word"), this.tags()))
  }

  topics() {
    return uniq(tagValues(topicTags("t"), this.tags()))
  }

  ids() {
    return uniq(tagValues(hexTags("e"), this.tags()))
  }

  addresses() {
    return uniq(tagValues(addressTags("a"), this.tags()))
  }

  includes(pubkey: string) {
    return this.pubkeys().includes(pubkey)
  }
}

export class MuteListWriter extends ListWriter<MuteListReader> {
  protected async renderRoutes() {
    return [userOutbox()]
  }

  mutePublicly(pubkey: string) {
    return this.addPublic(["p", pubkey])
  }

  mutePrivately(pubkey: string) {
    return this.addPrivate(["p", pubkey])
  }

  unmute(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }
}

export class MuteListQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const MuteList = new KindFactory({
  kind: MUTES,
  reader: MuteListReader,
  writer: MuteListWriter,
  query: MuteListQuery,
})
