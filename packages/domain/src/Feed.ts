import {randomId, parseJson} from "@welshman/lib"
import {FEED, getTagValue} from "@welshman/util"

import {EventReader, EventBuilder} from "./base.js"

// NIP-51 kind-31890 saved-feed DEFINITION event. Addressable via the "d" tag.
// The feed definition is a @welshman/feeds `IFeed` AST, JSON-encoded in a "feed"
// tag. Content is empty (tags-only, no encryption). This is distinct from the
// kind-10014 FEEDS favorites list (FeedList.ts) which references these by
// address. Flotilla's isTopicFeed/isMentionFeed/isAddressFeed/isContextFeed/
// isPeopleFeed are pure functions over the IFeed AST and stay in flotilla's lib,
// not on this class. Tags-only, so it extends EventReader directly.
export class Feed extends EventReader {
  static kind = FEED

  protected validate() {
    if (!this.identifier()) {
      throw new Error("Feed requires a d tag")
    }

    if (getTagValue("feed", this.event.tags) == null) {
      throw new Error("Feed requires a feed tag")
    }
  }

  protected reservedTagKeys() {
    return ["d", "alt", "title", "description", "feed"]
  }

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
    const builder = new FeedBuilder()

    builder.identifier = this.identifier() || ""
    builder.title = this.title()
    builder.description = this.description()
    builder.definition = this.definition()

    return this.seedBuilder(builder)
  }
}

export class FeedBuilder extends EventBuilder {
  static kind = FEED

  identifier = randomId()
  title = ""
  description = ""
  // Default to an empty @welshman/feeds feed (a union of nothing). That package
  // isn't a dependency here, so the AST is written structurally.
  definition: unknown = ["union"]

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
