import {first, randomId, parseJson} from "@welshman/lib"
import {FEED, getTagValue} from "@welshman/util"

import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-51 kind-31890 saved-feed DEFINITION event. Addressable via the "d" tag.
// The feed definition is a @welshman/feeds `IFeed` AST, JSON-encoded in a "feed"
// tag. Content is empty (tags-only, no encryption). This is distinct from the
// kind-10014 FEEDS favorites list (FeedList.ts) which references these by
// address. Flotilla's isTopicFeed/isMentionFeed/isAddressFeed/isContextFeed/
// isPeopleFeed are pure functions over the IFeed AST and stay in flotilla's lib,
// not on this class. Tags-only, so it extends EventReader directly.
export class Feed extends EventReader {
  readonly kind = FEED

  title() {
    return getTagValue("title", this.event.tags) || ""
  }

  description() {
    return getTagValue("description", this.event.tags) || ""
  }

  // The feed definition is a @welshman/feeds `IFeed` AST. That package is not a
  // dependency of @welshman/domain, so it is typed as `unknown` here.
  definition(): unknown {
    return parseJson(getTagValue("feed", this.event.tags))
  }

  builder() {
    return new FeedBuilder(this)
  }
}

export class FeedBuilder extends EventBuilder<Feed> {
  readonly kind = FEED

  identifier = randomId()
  title = ""
  description = ""
  // Default to an empty @welshman/feeds feed (a union of nothing). That package
  // isn't a dependency here, so the AST is written structurally.
  definition: unknown = ["union"]

  constructor(readonly reader?: Feed) {
    super(reader)

    // Consume the represented tags out of the carried-over extraTags so they
    // round-trip through the structured fields below rather than being emitted
    // twice (once from buildTags, once from the base's extraTags pass-through).
    // The "alt" tag is a copy of title rebuilt in buildTags, so it's consumed and
    // discarded here.
    const d = first(this.consumeTags("d"))
    const title = first(this.consumeTags("title"))
    const description = first(this.consumeTags("description"))
    const feed = first(this.consumeTags("feed"))

    this.consumeTags("alt")

    this.identifier = d?.[1] || randomId()
    this.title = title?.[1] || ""
    this.description = description?.[1] || ""
    this.definition = feed ? parseJson(feed[1]) : ["union"]
  }

  setIdentifier(identifier: string) {
    this.identifier = identifier

    return this
  }

  setTitle(title: string) {
    this.title = title

    return this
  }

  setDescription(description: string) {
    this.description = description

    return this
  }

  setDefinition(definition: unknown) {
    this.definition = definition

    return this
  }

  protected validate() {
    if (!this.identifier) {
      throw new Error("Feed requires a d identifier")
    }
  }

  protected buildTags() {
    return [
      ["d", this.identifier],
      ["alt", this.title],
      ["title", this.title],
      ["description", this.description],
      ["feed", JSON.stringify(this.definition)],
    ]
  }
}
