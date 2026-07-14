import {spec} from "@welshman/lib"
import {THREAD, getTagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-7D kind-11 forum thread root.
export class ThreadReader extends EventReader {
  title() {
    return getTagValue("title", this.event.tags)
  }
}

export class ThreadWriter extends EventWriter<ThreadReader> {
  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }
}

export const Thread = new KindFactory({
  kind: THREAD,
  reader: ThreadReader,
  writer: ThreadWriter,
})
