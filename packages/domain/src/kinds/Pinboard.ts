import {spec} from "@welshman/lib"
import {PINBOARD, getTagValue, getTopicTagValues} from "@welshman/util"
import {EventReader} from "../EventReader.js"
import {EventBuilder} from "../EventBuilder.js"
import {OutboxRouter} from "../EventRouter.js"
import {Kind} from "../Kind.js"

// Pinboards-NIP kind-30067 pinboard — addressable board metadata. Pins
// themselves are separate kind-39067 events (see Pin).
export class PinboardReader extends EventReader {
  readonly kind = PINBOARD

  title() {
    return getTagValue("title", this.event.tags)
  }

  description() {
    return getTagValue("description", this.event.tags)
  }

  image() {
    return getTagValue("image", this.event.tags)
  }

  topics() {
    return getTopicTagValues(this.event.tags)
  }

  collaborative() {
    return this.event.tags.some(spec(["collaborative"]))
  }
}

export class PinboardBuilder extends EventBuilder<PinboardReader> {
  readonly kind = PINBOARD

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

  protected validate() {
    super.validate()

    if (!getTagValue("title", this.extraTags)) {
      throw new Error("A title is required for a pinboard")
    }
  }
}

export const Pinboard = new Kind({
  reader: PinboardReader,
  builder: PinboardBuilder,
  router: OutboxRouter,
})
