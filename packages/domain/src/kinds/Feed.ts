import {first, parseJson} from "@welshman/lib"
import {FEED, getTagValue} from "@welshman/util"
import {makeUnionFeed} from "@welshman/feeds"
import type {Feed as FeedDefinition} from "@welshman/feeds"

import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-51 kind-31890 saved-feed definition.
export class Feed extends EventReader {
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

  builder() {
    return new FeedBuilder(this)
  }
}

export class FeedBuilder extends EventBuilder<Feed> {
  readonly kind = FEED

  titleTag?: string[]
  descriptionTag?: string[]
  definition: FeedDefinition = makeUnionFeed()

  constructor(readonly reader?: Feed) {
    super(reader)

    this.titleTag = first(this.consumeTags("title"))
    this.descriptionTag = first(this.consumeTags("description"))
    this.definition = parseJson(first(this.consumeTags("feed"))?.[1]) ?? makeUnionFeed()

    this.consumeTags("alt")
  }

  setTitle(title: string) {
    this.titleTag = ["title", title]

    return this
  }

  setDescription(description: string) {
    this.descriptionTag = ["description", description]

    return this
  }

  setDefinition(definition: FeedDefinition) {
    this.definition = definition

    return this
  }

  protected buildTags() {
    const tags = [["feed", JSON.stringify(this.definition)]]

    if (this.titleTag) tags.push(this.titleTag)
    if (this.descriptionTag) tags.push(this.descriptionTag)

    return tags
  }
}
