import {first} from "@welshman/lib"
import {THREAD, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-7D kind-11 forum thread root. The body lives in `content` as plain text
// (not JSON) and the title is carried in a "title" tag; room scoping is handled
// by the base `group` behavior tag. Non-addressable (referenced by event id);
// replies are COMMENT (kind 1111) via "#E". Flotilla also appends editor/inline
// tags at call sites; those round-trip via the base `extraTags` (with "title"
// consumed by the builder so it isn't double-counted).
export class Thread extends EventReader {
  readonly kind = THREAD

  title() {
    return getTagValue("title", this.event.tags)
  }

  content() {
    return this.event.content || ""
  }

  builder() {
    return new ThreadBuilder(this)
  }
}

export class ThreadBuilder extends EventBuilder<Thread> {
  readonly kind = THREAD

  title?: string
  content = ""

  constructor(readonly reader?: Thread) {
    super(reader)

    // Consume the represented "title" tag out of the carried-over extraTags so it
    // round-trips through the field below rather than being emitted twice (once
    // from buildTags, once from the base's extraTags pass-through).
    this.title = first(this.consumeTags("title"))?.[1]
    this.content = reader?.event.content ?? ""
  }

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
