import {spec} from "@welshman/lib"
import {BADGE_AWARD, addressTags, hexTags, tagValue, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-58 kind-8 badge award. Names one badge definition by address and the
// pubkeys it is awarded to.
export class BadgeAwardReader extends EventReader {
  badge() {
    return tagValue(addressTags("a"), this.event.tags)
  }

  awardees() {
    return tagValues(hexTags("p"), this.event.tags)
  }
}

export class BadgeAwardWriter extends EventWriter<BadgeAwardReader> {
  // An award grants exactly one badge, so replace any existing one.
  setBadge(address: string) {
    return this.dropTags(spec(["a"])).addTags(["a", address])
  }

  addAwardee(pubkey: string) {
    return this.removeAwardee(pubkey).addMention(pubkey)
  }

  removeAwardee(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }

  validate() {
    super.validate()

    if (!this.extraTags.some(spec(["a"]))) {
      throw new Error("A badge award must name a badge definition via an a tag")
    }

    if (!this.extraTags.some(spec(["p"]))) {
      throw new Error("A badge award must name at least one awardee")
    }
  }
}

export class BadgeAwardQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const BadgeAward = new KindFactory({
  kind: BADGE_AWARD,
  reader: BadgeAwardReader,
  writer: BadgeAwardWriter,
  query: BadgeAwardQuery,
})
