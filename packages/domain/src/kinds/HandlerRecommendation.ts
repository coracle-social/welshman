import {last, removeUndefined, spec} from "@welshman/lib"
import {HANDLER_RECOMMENDATION, getAddressTags, getAddressTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventWriter} from "../EventWriter.js"
import {KindFactory} from "../Kind.js"

// NIP-89 kind-31989 handler recommendation.
export class HandlerRecommendationReader extends EventReader {
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
}

export class HandlerRecommendationWriter extends EventWriter<HandlerRecommendationReader> {
  readonly kind = HANDLER_RECOMMENDATION

  addRecommendation(address: string, relay?: string, platform?: string) {
    return this.dropTags(spec(["a", address])).addTags(
      removeUndefined(["a", address, relay || "", platform || ""]),
    )
  }

  removeRecommendation(address: string) {
    return this.dropTags(spec(["a", address]))
  }
}

export const HandlerRecommendation = new KindFactory({
  reader: HandlerRecommendationReader,
  writer: HandlerRecommendationWriter,
})
