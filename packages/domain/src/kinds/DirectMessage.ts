import {spec} from "@welshman/lib"
import {DIRECT_MESSAGE, hexTags, messaging, tagSpec, tagValue, tagValues} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-17 kind-14 direct message. It is never signed or published on its own — it
// stays a rumor, gift-wrapped once per recipient.
export class DirectMessageReader extends EventReader {
  recipients() {
    return tagValues(hexTags("p"), this.event.tags)
  }

  subject() {
    return tagValue(tagSpec("subject"), this.event.tags)
  }

  parentId() {
    return tagValue(tagSpec("e"), this.event.tags)
  }
}

export class DirectMessageWriter extends EventWriter<DirectMessageReader> {
  addRecipient(pubkey: string) {
    const tag = ["p", pubkey, ""]

    this.addTags(tag)

    this.hint(messaging(pubkey)).then(url => {
      tag[2] = url
    })

    return this
  }

  removeRecipient(pubkey: string) {
    return this.dropTags(spec(["p", pubkey]))
  }

  setSubject(subject: string) {
    return this.dropTags(spec(["subject"])).addTags(["subject", subject])
  }

  setParent(event: TrustedEvent) {
    this.dropTags(spec(["e"]))

    const tag = ["e", event.id, "", "reply"]

    this.addTags(tag)

    this.hint(messaging(event.pubkey)).then(url => {
      tag[2] = url
    })

    return this
  }

  protected async renderRoutes() {
    // Return nothing, because each wrapped copy is sent somewhere else
    return []
  }

  validate() {
    super.validate()

    if (!this.extraTags.some(spec(["p"]))) {
      throw new Error("A direct message must have at least one recipient")
    }
  }
}

export const DirectMessage = new KindFactory({
  kind: DIRECT_MESSAGE,
  reader: DirectMessageReader,
  writer: DirectMessageWriter,
})
