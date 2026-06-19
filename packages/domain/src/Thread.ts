import {THREAD, getTagValue} from "@welshman/util"
import {EventReader, EventBuilder} from "./base.js"

// NIP-7D kind-11 forum thread root. The body lives in `content` as plain text
// (not JSON) and the title is carried in a "title" tag; room scoping is handled
// by the base `group` behavior tag. Non-addressable (referenced by event id);
// replies are COMMENT (kind 1111) via "#E". Flotilla also appends editor/inline
// tags at call sites; those round-trip via the base `extraTags` (with "title"
// declared reserved so it isn't double-counted).
export class Thread extends EventReader {
  static kind = THREAD

  protected reservedTagKeys() {
    return ["title"]
  }

  title() {
    return getTagValue("title", this.event.tags)
  }

  content() {
    return this.event.content || ""
  }

  builder() {
    const builder = new ThreadBuilder()

    builder.title = this.title()
    builder.content = this.content()

    return this.seedBuilder(builder)
  }
}

export class ThreadBuilder extends EventBuilder {
  static kind = THREAD

  title?: string
  content = ""

  setTitle(title: string) {
    this.title = title

    return this
  }

  setContent(content: string) {
    this.content = content

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.title) tags.push(["title", this.title])

    return tags
  }

  protected buildContent() {
    return this.content
  }
}
