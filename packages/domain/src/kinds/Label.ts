import {nth, spec} from "@welshman/lib"
import {
  LABEL,
  addressTags,
  hexTags,
  matchTags,
  relayTags,
  tagSpec,
  tagValues,
  topicTags,
  userOutbox,
} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

// NIP-32 label. `L` declares a namespace and `l` carries the labels within it,
// while the labeled subjects are referenced with ordinary `e`/`p`/`a`/`r`/`t`
// tags. One event may label several subjects across several namespaces.
export class LabelReader extends EventReader {
  namespaces() {
    return tagValues(tagSpec("L"), this.event.tags)
  }

  // The label values, optionally narrowed to one namespace.
  labels(namespace?: string) {
    return matchTags(tagSpec("l"), this.event.tags)
      .filter(t => !namespace || t[2] === namespace)
      .map(nth(1))
  }

  eventIds() {
    return tagValues(hexTags("e"), this.event.tags)
  }

  pubkeys() {
    return tagValues(hexTags("p"), this.event.tags)
  }

  addresses() {
    return tagValues(addressTags("a"), this.event.tags)
  }

  topics() {
    return tagValues(topicTags("t"), this.event.tags)
  }

  urls() {
    return tagValues(relayTags("r"), this.event.tags)
  }
}

export class LabelWriter extends EventWriter<LabelReader> {
  // A label is the author's own assertion. The subject tags name what is being
  // labeled, not who should receive it, so this goes to the author's outbox only.
  protected async renderRoutes() {
    return [userOutbox()]
  }

  // A label belongs to a namespace, which has to be declared alongside it.
  addLabel(name: string, namespace: string) {
    for (const tag of [
      ["L", namespace],
      ["l", name, namespace],
    ]) {
      if (!this.extraTags.some(spec(tag))) {
        this.addTags(tag)
      }
    }

    return this
  }

  // Drops the namespace declaration too, once nothing else in it is left.
  removeLabel(name: string, namespace: string) {
    this.dropTags(spec(["l", name, namespace]))

    if (!this.extraTags.some(t => t[0] === "l" && t[2] === namespace)) {
      this.dropTags(spec(["L", namespace]))
    }

    return this
  }

  addEventId(id: string) {
    return this.addTags(["e", id])
  }

  addPubkey(pubkey: string) {
    return this.addTags(["p", pubkey])
  }

  addAddress(address: string) {
    return this.addTags(["a", address])
  }

  addTopic(topic: string) {
    return this.addTags(["t", topic])
  }

  addUrl(url: string) {
    return this.addTags(["r", url])
  }

  validate() {
    super.validate()

    if (!this.extraTags.some(spec(["l"]))) {
      throw new Error("A label must carry at least one l tag")
    }
  }
}

export class LabelQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const Label = new KindFactory({
  kind: LABEL,
  reader: LabelReader,
  writer: LabelWriter,
  query: LabelQuery,
})
