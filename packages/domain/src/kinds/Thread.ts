import {first} from "@welshman/lib"
import {THREAD, getTagValue} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"

// NIP-7D kind-11 forum thread root.
export class Thread extends EventReader {
  readonly kind = THREAD

  title() {
    return getTagValue("title", this.event.tags)
  }

  builder() {
    return new ThreadBuilder(this)
  }
}

export class ThreadBuilder extends EventBuilder<Thread> {
  readonly kind = THREAD

  titleTag?: string[]

  constructor(readonly reader?: Thread) {
    super(reader)

    this.titleTag = first(this.consumeTags("title"))
  }

  setTitle(title: string) {
    this.titleTag = ["title", title]

    return this
  }

  protected buildTags() {
    const tags: string[][] = []

    if (this.titleTag) tags.push(this.titleTag)

    return tags
  }
}
