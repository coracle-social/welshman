import {spec} from "@welshman/lib"
import {PINBOARD, tagSpec, tagValue, tagValues, topicTags} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// Pinboards-NIP kind-30067 pinboard — addressable board metadata. Pins
// themselves are separate kind-39067 events (see Pin).
export class PinboardReader extends EventReader {
  title() {
    return tagValue(tagSpec("title"), this.event.tags)
  }

  description() {
    return tagValue(tagSpec("description"), this.event.tags)
  }

  image() {
    return tagValue(tagSpec("image"), this.event.tags)
  }

  topics() {
    return tagValues(topicTags("t"), this.event.tags)
  }

  collaborative() {
    return this.event.tags.some(spec(["collaborative"]))
  }
}

export class PinboardWriter extends EventWriter<PinboardReader> {
  setTitle(title: string) {
    return this.dropTags(spec(["title"])).addTags(["title", title])
  }

  setDescription(description: string) {
    return this.dropTags(spec(["description"])).addTags(["description", description])
  }

  setImage(image: string) {
    return this.dropTags(spec(["image"])).addTags(["image", image])
  }

  setTopics(topics: string[]) {
    return this.dropTags(spec(["t"])).addTags(...topics.map(topic => ["t", topic]))
  }

  setCollaborative(collaborative: boolean) {
    this.dropTags(spec(["collaborative"]))

    return collaborative ? this.addTags(["collaborative"]) : this
  }

  validate() {
    super.validate()

    if (!tagValue(tagSpec("title"), this.extraTags as string[][])) {
      throw new Error("A title is required for a pinboard")
    }
  }
}

export const Pinboard = new KindFactory({
  kind: PINBOARD,
  reader: PinboardReader,
  writer: PinboardWriter,
})
