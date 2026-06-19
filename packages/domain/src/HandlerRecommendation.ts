import {last} from "@welshman/lib"
import {HANDLER_RECOMMENDATION, getAddressTags, getAddressTagValues} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-89 kind-31989 handler recommendation. Addressable (the `d` tag holds the
// recommended kind), tags-only with empty content. Each entry is a raw `a` tag
// pointing at a kind-31990 handler, optionally carrying a relay hint and a
// trailing platform marker (e.g. "web").
export class HandlerRecommendation extends EventReader {
  static kind = HANDLER_RECOMMENDATION

  protected validate() {
    if (!this.identifier()) {
      throw new Error("HandlerRecommendation requires a d tag")
    }
  }

  protected reservedTagKeys() {
    return ["d", "a"]
  }

  // Raw `a` tags: ["a", address, relay?, platform?].
  addressTags() {
    return getAddressTags(this.event.tags)
  }

  addresses() {
    return getAddressTagValues(this.event.tags)
  }

  // Prefer the recommendation marked as a "web" handler, otherwise fall back to
  // the first recommendation.
  handlerAddress() {
    const tags = this.addressTags()
    const tag = tags.find(t => last(t) === "web") || tags[0]

    return tag?.[1]
  }

  builder() {
    const builder = new HandlerRecommendationBuilder(this.identifier() || "")

    builder.addressTags = this.addressTags()

    return this.seedBuilder(builder)
  }
}

export class HandlerRecommendationBuilder extends EventBuilder {
  static kind = HANDLER_RECOMMENDATION

  // Raw `a` tags: ["a", address, relay?, platform?].
  addressTags: string[][] = []

  constructor(public identifier: string) {
    super()
  }

  addRecommendation(address: string, relay?: string, platform?: string) {
    if (!this.addressTags.some(t => t[1] === address)) {
      this.addressTags = [...this.addressTags, ["a", address, relay || "", platform || ""]]
    }

    return this
  }

  removeRecommendation(address: string) {
    this.addressTags = this.addressTags.filter(t => t[1] !== address)

    return this
  }

  protected validate() {
    if (!this.identifier) {
      throw new Error("HandlerRecommendation requires a d identifier")
    }
  }

  protected buildTags() {
    return [["d", this.identifier], ...this.addressTags]
  }
}
