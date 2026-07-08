import {parseJson, spec} from "@welshman/lib"
import {FEED, getTagValue} from "@welshman/util"
import type {Feed as FeedDefinition} from "@welshman/feeds"

import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// NIP-51 kind-31890 saved-feed definition.
export class FeedReader extends EventReader {
  readonly kind = FEED

  title() {
    return getTagValue("title", this.event.tags) || ""
  }

  description() {
    return getTagValue("description", this.event.tags) || ""
  }

  definition(): FeedDefinition | undefined {
    return parseJson(getTagValue("feed", this.event.tags))
  }
}

export class FeedBuilder extends EventBuilder<FeedReader> {
  readonly kind = FEED

  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setDescription(description: string) {
    return this.dropTags(spec(["description"])).addTags(["description", description])
  }

  setDefinition(feed: FeedDefinition) {
    return this.dropTags(spec(["feed"])).addTags(["feed", JSON.stringify(feed)])
  }
}

export const Feed = new Kind({
  reader: FeedReader,
  builder: FeedBuilder,
  router: OutboxRouter,
})
