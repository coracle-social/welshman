import {parseJson, spec, sum} from "@welshman/lib"
import {
  BOLT12_OFFER,
  BOLT12_ZAP,
  BOLT12_ZAP_INTENT,
  addressTags,
  asSignedEvent,
  getAddress,
  hexTags,
  inboxes,
  isBolt12PayerProof,
  isMsats,
  isReplaceable,
  kindTags,
  makeBolt12PayerNote,
  isBolt12ZapId,
  matchTags,
  msatsTags,
  tagSpec,
  tagValue,
  tagValues,
  verifyEvent,
} from "@welshman/util"
import type {SignedEvent, TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import {Bolt12OfferReader} from "./Bolt12Offer.js"
import {Bolt12ZapIntentReader} from "./Bolt12ZapIntent.js"

// The tags NIP-B1 requires the zap event to repeat from the intent it embeds.
const intentKeys = ["p", "amount", "offer_event", "e", "a", "k"]

/**
 * What `Bolt12ZapReader.validate` returns: the three events, the amount in millisats, and
 * what the payer proof has to bind to. The `target` is the zapped event's id or address,
 * and undefined for a zap of the recipient themselves. The `proof` is undecoded, so a
 * claim is not yet a paid zap.
 */
export type Bolt12ZapClaim = {
  event: TrustedEvent
  intent: TrustedEvent
  offer: TrustedEvent
  offers: string[]
  target?: string
  amount: number
  proof: string
  payerNote: string
}

const countTags = (key: string, tags: string[][]) => tags.filter(spec([key])).length

// The zap and its intent agree on presence and values, so every value for a key has to match.
const agreesOn = (key: string, a: string[][], b: string[][]) => {
  const values = (tags: string[][]) => tagValues(tagSpec(key), tags).sort()
  const mine = values(a)
  const theirs = values(b)

  return mine.length === theirs.length && mine.every((value, i) => value === theirs[i])
}

// An embedded event arrives as JSON rather than from a relay, so nothing else verifies it.
const parseEmbedded = (json: string | undefined, kind: number) => {
  const event = parseJson(json)
  let result: TrustedEvent | undefined

  if (event?.kind === kind && verifyEvent(event)) {
    result = event
  }

  return result
}

/**
 * Sums a target's zaps in millisats, counting each lightning payment once. `paymentHash`
 * runs the BOLT12 payer-proof checks and returns the proof's `invoice_payment_hash`, or
 * undefined for a proof it cannot validate. Two claims sharing a target and a hash count
 * as the lower of their amounts. A profile total is the claims whose `target` is
 * undefined, since a `#p` query answers with zaps of that pubkey's events too.
 */
export const sumBolt12Zaps = (
  claims: Bolt12ZapClaim[],
  paymentHash: (claim: Bolt12ZapClaim) => string | undefined,
) => {
  const amounts = new Map<string, number>()

  for (const claim of claims) {
    const hash = paymentHash(claim)

    if (hash) {
      const key = `${claim.target ?? ""}:${hash}`

      amounts.set(key, Math.min(amounts.get(key) ?? Infinity, claim.amount))
    }
  }

  return sum(Array.from(amounts.values()))
}

// NIP-B1 kind-9736 BOLT12 zap, the payer's own proof of paying the recipient's offer.
export class Bolt12ZapReader extends EventReader {
  recipient() {
    return tagValue(hexTags("p"), this.tags())
  }

  // Present on an attributed zap, absent on an anonymous one.
  payer() {
    return tagValue(hexTags("P"), this.tags())
  }

  // Amount in millisats, or undefined when the tag is absent or not a whole number.
  amount() {
    return tagValue(msatsTags("amount"), this.tags())
  }

  proof() {
    return tagValue(tagSpec("proof"), this.tags())
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

  // The event id or address the zap names, or nothing for a zap of the recipient themselves.
  target() {
    return tagValue(tagSpec(["e", "a"]), this.tags())
  }

  // A zap of the recipient rather than of anything they wrote.
  targetsProfile() {
    return countTags("e", this.tags()) === 0 && countTags("a", this.tags()) === 0
  }

  // The intent the payer signed before paying. Verified here, since it arrives as JSON.
  intent() {
    return parseEmbedded(tagValue(tagSpec("description"), this.tags()), BOLT12_ZAP_INTENT)
  }

  // The recipient's announcement of the offer that was paid, verified.
  offer() {
    return parseEmbedded(tagValue(tagSpec("offer_event"), this.tags()), BOLT12_OFFER)
  }

  // The canonical raw offers the payer proof may have paid.
  offers() {
    const offer = this.offer()

    return offer ? this.readOffer(offer).offers() : []
  }

  private readOffer(offer: TrustedEvent) {
    return new Bolt12OfferReader(BOLT12_OFFER, this.context, offer)
  }

  /**
   * Runs NIP-B1 validation as far as nostr reaches: both embedded signatures, the structure
   * of the zap and its intent, that the zap repeats what the payer signed, and that the
   * recipient authored the announcement. Returns undefined when any of that fails. The
   * `lnp` proof is the caller's to decode.
   */
  validate(): Bolt12ZapClaim | undefined {
    const intent = this.intent()
    const offer = this.offer()
    const amount = this.amount()
    const proof = this.proof()
    let claim: Bolt12ZapClaim | undefined

    if (intent && offer && proof && amount !== undefined) {
      const offerReader = this.readOffer(offer)
      const offers = offerReader.offers()

      const valid =
        amount > 0 &&
        isBolt12PayerProof(proof) &&
        offerReader.offersAreCanonical() &&
        this.isWellFormed() &&
        this.intentIsWellFormed(intent) &&
        this.matchesIntent(intent) &&
        this.offerIsAuthorized(offer, intent)

      if (valid) {
        claim = {
          event: this.event,
          intent,
          offer,
          offers,
          target: this.target(),
          amount,
          proof,
          payerNote: makeBolt12PayerNote(intent.id),
        }
      }
    }

    return claim
  }

  // One description, one recipient, one announcement, at most one target, author as payer.
  private isWellFormed() {
    const tags = this.tags()

    return (
      countTags("description", tags) === 1 &&
      countTags("p", tags) === 1 &&
      countTags("offer_event", tags) === 1 &&
      countTags("e", tags) + countTags("a", tags) <= 1 &&
      this.payerIsAuthor()
    )
  }

  // Reading `P` through `payer` would pass a malformed one off as an anonymous zap.
  private payerIsAuthor() {
    return matchTags(tagSpec("P"), this.tags()).every(tag => tag[1] === this.event.pubkey)
  }

  private intentIsWellFormed(intent: TrustedEvent) {
    const reader = new Bolt12ZapIntentReader(BOLT12_ZAP_INTENT, this.context, intent)
    const amount = reader.amount()
    const zapId = reader.zapId()

    return (
      intent.pubkey === this.event.pubkey &&
      countTags("p", intent.tags) === 1 &&
      countTags("offer_event", intent.tags) === 1 &&
      countTags("e", intent.tags) + countTags("a", intent.tags) <= 1 &&
      amount !== undefined &&
      amount > 0 &&
      zapId !== undefined &&
      isBolt12ZapId(zapId)
    )
  }

  private matchesIntent(intent: TrustedEvent) {
    const agrees = (key: string) => agreesOn(key, this.tags(), intent.tags)

    return this.event.content === intent.content && intentKeys.every(agrees)
  }

  // The announcement is the recipient's own, and predates the intent that embedded it.
  private offerIsAuthorized(offer: TrustedEvent, intent: TrustedEvent) {
    return offer.pubkey === this.recipient() && offer.created_at <= intent.created_at
  }
}

export class Bolt12ZapWriter extends EventWriter<Bolt12ZapReader> {
  // Copies the tags NIP-B1 requires the zap and its intent to agree on.
  setIntent(intent: SignedEvent) {
    const copied = matchTags(tagSpec(intentKeys), intent.tags)

    return this.dropTags(spec(["description"]))
      .dropTags(tag => intentKeys.includes(tag[0]))
      .addTags(["description", JSON.stringify(asSignedEvent(intent))], ...copied)
      .setContent(intent.content)
  }

  // Bech32 is case-insensitive, and lowercase is its canonical form.
  setProof(proof: string) {
    return this.dropTags(spec(["proof"])).addTags(["proof", proof.toLowerCase()])
  }

  // An anonymous zap omits this and signs with an ephemeral key.
  setPayer(payer: string) {
    return this.dropTags(spec(["P"])).addTags(["P", payer])
  }

  clearPayer() {
    return this.dropTags(spec(["P"]))
  }

  /**
   * An anonymous zap goes to the recipient's inboxes alone. The default adds the user's own
   * outbox relays, which would link the ephemeral key it is signed with back to them.
   */
  protected async renderRoutes() {
    const isAttributed = this.extraTags.some(spec(["P"]))

    return isAttributed
      ? super.renderRoutes()
      : inboxes(tagValues(hexTags("p"), await this.renderTags()), 0.5)
  }

  validate() {
    super.validate()

    const amount = tagValue(tagSpec("amount"), this.extraTags)
    const proof = tagValue(tagSpec("proof"), this.extraTags)

    if (!this.extraTags.some(spec(["description"]))) {
      throw new Error("Bolt12Zap requires the zap intent it was paid for")
    }

    if (!this.extraTags.some(spec(["p"]))) {
      throw new Error("Bolt12Zap requires a recipient")
    }

    if (!this.extraTags.some(spec(["offer_event"]))) {
      throw new Error("Bolt12Zap requires the recipient's offer announcement")
    }

    if (!amount || !isMsats(amount) || Number(amount) <= 0) {
      throw new Error("Bolt12Zap requires a positive whole number of millisats")
    }

    if (!proof || !isBolt12PayerProof(proof)) {
      throw new Error("Bolt12Zap requires a settled lnp payer proof")
    }
  }
}

export class Bolt12ZapQuery extends EventQuery {
  // Zaps of a regular event are tagged e, of a replaceable one a.
  forEvent(event: TrustedEvent) {
    return isReplaceable(event)
      ? this.setTag("a", [getAddress(event)])
      : this.setTag("e", [event.id])
  }

  // Also matches zaps of that pubkey's events, which `targetsProfile` tells apart.
  forProfile(pubkey: string) {
    return this.setTag("p", [pubkey])
  }

  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const Bolt12Zap = new KindFactory({
  kind: BOLT12_ZAP,
  reader: Bolt12ZapReader,
  writer: Bolt12ZapWriter,
  query: Bolt12ZapQuery,
})
