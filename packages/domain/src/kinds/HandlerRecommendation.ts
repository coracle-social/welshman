import {last, removeUndefined, spec} from "@welshman/lib"
import {HANDLER_RECOMMENDATION, addressTags, matchTags, tagValues} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-89 kind-31989 handler recommendation.
export class HandlerRecommendationReader extends EventReader {
  addressTags() {
    return matchTags(addressTags("a"), this.event.tags)
  }

  addresses() {
    return tagValues(addressTags("a"), this.event.tags)
  }

  handlerAddress() {
    const tags = this.addressTags()
    const tag = tags.find(t => last(t) === "web") || tags[0]

    return tag?.[1]
  }
}

export class HandlerRecommendationWriter extends EventWriter<HandlerRecommendationReader> {
  addRecommendation(address: string, relay?: string, platform?: string) {
    return this.dropTags(spec(["a", address])).addTags(
      removeUndefined(["a", address, relay || "", platform || ""]),
    )
  }

  removeRecommendation(address: string) {
    return this.dropTags(spec(["a", address]))
  }
}

export class HandlerRecommendationQuery extends EventQuery {
  protected renderRoutes() {
    return this.authorRoutes()
  }
}

export const HandlerRecommendation = new KindFactory({
  kind: HANDLER_RECOMMENDATION,
  reader: HandlerRecommendationReader,
  writer: HandlerRecommendationWriter,
  query: HandlerRecommendationQuery,
})
