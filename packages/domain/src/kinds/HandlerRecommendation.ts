import {nthEq, last} from "@welshman/lib"
import {HANDLER_RECOMMENDATION, getAddressTags, getAddressTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-89 kind-31989 handler recommendation.
export class HandlerRecommendation extends EventReader {
  readonly kind = HANDLER_RECOMMENDATION

  addressTags() {
    return getAddressTags(this.event.tags)
  }

  addresses() {
    return getAddressTagValues(this.event.tags)
  }

  handlerAddress() {
    const tags = this.addressTags()
    const tag = tags.find(t => last(t) === "web") || tags[0]

    return tag?.[1]
  }

  builder() {
    return new HandlerRecommendationBuilder(this)
  }
}

export class HandlerRecommendationBuilder extends EventBuilder<HandlerRecommendation> {
  readonly kind = HANDLER_RECOMMENDATION

  addressTags: string[][] = []

  constructor(readonly reader?: HandlerRecommendation) {
    super(reader)

    this.addressTags = this.consumeTags("a")
  }

  addRecommendation(address: string, relay?: string, platform?: string) {
    if (!this.addressTags.some(t => t[1] === address)) {
      this.addressTags = [...this.addressTags, ["a", address, relay || "", platform || ""]]
    }

    return this
  }

  removeRecommendation(address: string) {
    this.addressTags = this.addressTags.filter(nthEq(1, address))

    return this
  }

  protected buildTags() {
    return [...this.addressTags]
  }
}
