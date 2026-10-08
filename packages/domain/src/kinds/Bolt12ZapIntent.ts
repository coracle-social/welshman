import {spec} from "@welshman/lib"
import {
  BOLT12_ZAP_INTENT,
  addressTags,
  asSignedEvent,
  getAddress,
  hexTags,
  isBolt12ZapId,
  isReplaceable,
  kindTags,
  makeBolt12PayerNote,
  makeBolt12ZapId,
  msatsTags,
  tagMatcher,
  tagSpec,
  tagValue,
} from "@welshman/util"
import type {SignedEvent, TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"

const isTargetTag = tagMatcher(tagSpec(["e", "a", "k"]))

// NIP-B1 kind-9737 zap intent, signed before payment and embedded in the kind-9736 zap.
export class Bolt12ZapIntentReader extends EventReader {
  recipient() {
    return tagValue(hexTags("p"), this.tags())
  }

  // Amount in millisats, or undefined when the tag is absent or not a whole number.
  amount() {
    return tagValue(msatsTags("amount"), this.tags())
  }

  // The recipient's serialized kind-10058 announcement, as the tag carries it.
  offerEvent() {
    return tagValue(tagSpec("offer_event"), this.tags())
  }

  zapId() {
    return tagValue(tagSpec("zap_id"), this.tags())
  }

  eventId() {
    return tagValue(hexTags("e"), this.tags())
  }

  targetAddress() {
    return tagValue(addressTags("a"), this.tags())
  }

  targetKind() {
    return tagValue(kindTags("k"), this.tags())
  }

  // What the payment's invreq_payer_note has to say.
  payerNote() {
    return makeBolt12PayerNote(this.id())
  }
}

export class Bolt12ZapIntentWriter extends EventWriter<Bolt12ZapIntentReader> {
  constructor(kind: number, context: KindContext, reader?: Bolt12ZapIntentReader) {
    super(kind, context, reader)

    this.ensureZapId()
  }

  private ensureZapId() {
    if (!this.extraTags.some(spec(["zap_id"]))) {
      this.setZapId()
    }
  }

  setRecipient(recipient: string) {
    return this.dropTags(spec(["p"])).addTags(["p", recipient])
  }

  setAmount(amount: number) {
    return this.dropTags(spec(["amount"])).addTags(["amount", String(amount)])
  }

  setZapId(zapId = makeBolt12ZapId()) {
    return this.dropTags(spec(["zap_id"])).addTags(["zap_id", zapId])
  }

  // The complete signed announcement binds the offer to the recipient's key.
  setOfferEvent(offer: SignedEvent) {
    return this.dropTags(spec(["offer_event"])).addTags([
      "offer_event",
      JSON.stringify(asSignedEvent(offer)),
    ])
  }

  // A regular event is tagged e, a replaceable one a, and NIP-B1 forbids both.
  setEvent(event: TrustedEvent) {
    const target = isReplaceable(event) ? ["a", getAddress(event)] : ["e", event.id]

    return this.dropTags(isTargetTag).addTags(target, ["k", String(event.kind)])
  }

  clearEvent() {
    return this.dropTags(isTargetTag)
  }

  validate() {
    super.validate()

    const amount = tagValue(msatsTags("amount"), this.extraTags)
    const zapId = tagValue(tagSpec("zap_id"), this.extraTags)

    if (!this.extraTags.some(spec(["p"]))) {
      throw new Error("Bolt12ZapIntent requires a recipient")
    }

    if (amount === undefined || amount <= 0) {
      throw new Error("Bolt12ZapIntent requires a positive whole number of millisats")
    }

    if (!this.extraTags.some(spec(["offer_event"]))) {
      throw new Error("Bolt12ZapIntent requires the recipient's offer announcement")
    }

    if (!zapId || !isBolt12ZapId(zapId)) {
      throw new Error("Bolt12ZapIntent requires a zap id of at least 128 bits of lowercase hex")
    }
  }
}

export class Bolt12ZapIntentQuery extends EventQuery {
  // A zap intent is embedded in its zap rather than published, so no relay has one.
  protected renderRoutes() {
    return []
  }
}

export const Bolt12ZapIntent = new KindFactory({
  kind: BOLT12_ZAP_INTENT,
  reader: Bolt12ZapIntentReader,
  writer: Bolt12ZapIntentWriter,
  query: Bolt12ZapIntentQuery,
})
