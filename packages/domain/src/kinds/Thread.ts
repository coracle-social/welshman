import {spec} from "@welshman/lib"
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

  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }
}
