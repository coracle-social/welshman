import {equals, spec, sum} from "@welshman/lib"
import {
  BOLT12_OFFER,
  BOLT12_ZAP,
  BOLT12_ZAP_INTENT,
  addressTags,
  asSignedEvent,
  bolt12ProofPaysOffer,
  decodeBolt12PayerProof,
  getAddress,
  hexTags,
  inboxes,
  isBolt12PayerProof,
  isReplaceable,
  kindTags,
  makeBolt12PayerNote,
  matchTags,
  msatsTags,
  tagMatcher,
  tagSpec,
  tagValue,
  tagValues,
  parseVerifiedEvent,
} from "@welshman/util"
import type {SignedEvent, TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"
import {Bolt12OfferReader} from "./Bolt12Offer.js"
import {getBolt12ZapIntentError} from "./Bolt12ZapIntent.js"

// The tags NIP-B1 requires the zap event to repeat from the intent it embeds.
const intentKeys = ["p", "amount", "offer_event", "e", "a", "k"]

/**
 * What `Bolt12ZapReader.validate` returns: the three events, the amount in millisats, and
 * what the payer proof has to bind to. The `target` is the zapped event's id or address,
 * and undefined for a zap of the recipient themselves. Only `getBolt12ZapPaymentHash` reads
 * the `proof`, so a claim on its own is not yet a paid zap.
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

  return equals(values(a), values(b))
}

const readOffer = (context: KindContext, offer: TrustedEvent) =>
  new Bolt12OfferReader(BOLT12_OFFER, context, offer)

// What NIP-B1 checks a zap by before anyone signs it, so a writer can check it too.
type Bolt12ZapDraft = {
  content: string
  tags: string[][]
}

type Bolt12ZapParts = {
  intent: TrustedEvent
  offer: TrustedEvent
  offers: string[]
  amount: number
  proof: string
}

type Bolt12ZapCheck = {ok: true; parts: Bolt12ZapParts} | {ok: false; error: string}

/**
 * The NIP-B1 rules a zap answers to whoever signs it: both embedded events, the structure of
 * the zap and its intent, that the zap repeats what the payer signed, and that the recipient
 * announced the offer before the intent named it. Returns the first rule broken, or the parts
 * a claim is made of.
 */
const checkBolt12Zap = (context: KindContext, {content, tags}: Bolt12ZapDraft): Bolt12ZapCheck => {
  const intent = parseVerifiedEvent(tagValue(tagSpec("description"), tags), BOLT12_ZAP_INTENT)
  const offer = parseVerifiedEvent(tagValue(tagSpec("offer_event"), tags), BOLT12_OFFER)
  const offerReader = offer && readOffer(context, offer)
  const amount = tagValue(msatsTags("amount"), tags)
  const proof = tagValue(tagSpec("proof"), tags)
  const recipient = tagValue(hexTags("p"), tags)
  const intentError = intent && getBolt12ZapIntentError(intent.tags)
  const fail = (error: string): Bolt12ZapCheck => ({ok: false, error})
  let check: Bolt12ZapCheck

  if (!intent || countTags("description", tags) !== 1) {
    check = fail("Bolt12Zap requires the zap intent it was paid for")
  } else if (!recipient || countTags("p", tags) !== 1) {
    check = fail("Bolt12Zap requires a recipient")
  } else if (!offerReader || countTags("offer_event", tags) !== 1) {
    check = fail("Bolt12Zap requires the recipient's offer announcement")
  } else if (amount === undefined || amount <= 0) {
    check = fail("Bolt12Zap requires a positive whole number of millisats")
  } else if (!proof || !isBolt12PayerProof(proof)) {
    check = fail("Bolt12Zap requires a settled lnp payer proof")
  } else if (countTags("e", tags) + countTags("a", tags) > 1) {
    check = fail("Bolt12Zap names at most one event")
  } else if (intentError) {
    check = fail(`Bolt12Zap embeds an invalid intent: ${intentError}`)
  } else if (content !== intent.content || !intentKeys.every(k => agreesOn(k, tags, intent.tags))) {
    check = fail("Bolt12Zap has to repeat the content and tags of the intent it was paid for")
  } else if (!offerReader.offersAreCanonical()) {
    check = fail("Bolt12Zap requires an announcement whose offers are canonical")
  } else if (
    offerReader.event.pubkey !== recipient ||
    offerReader.event.created_at > intent.created_at
  ) {
    check = fail("Bolt12Zap requires the recipient's announcement from before the intent")
  } else {
    check = {
      ok: true,
      parts: {intent, offer: offerReader.event, offers: offerReader.offers(), amount, proof},
    }
  }

  return check
}

/**
 * The lightning half of NIP-B1 validation, which `Bolt12ZapReader.validate` leaves alone and
 * `Bolt12ZapWriter.validate` runs before publishing:
 * the payer proof settles, it pays one of the offers the recipient announced, and it carries
 * the payer note and amount this claim says it does. Returns the proof's
 * `invoice_payment_hash`, which is how two claims of one payment are told apart.
 */
export const getBolt12ZapPaymentHash = (
  claim: Pick<Bolt12ZapClaim, "proof" | "payerNote" | "amount" | "offers">,
) => {
  const proof = decodeBolt12PayerProof(claim.proof)

  return proof &&
    proof.payerNote === claim.payerNote &&
    proof.amount === claim.amount &&
    claim.offers.some(offer => bolt12ProofPaysOffer(proof, offer))
    ? proof.paymentHash
    : undefined
}

/**
 * Sums a target's zaps in millisats, counting each lightning payment once. Two claims
 * sharing a target and a payment hash count as the lower of their amounts. A profile total
 * is the claims whose `target` is undefined, since a `#p` query answers with zaps of that
 * pubkey's events too.
 */
export const sumBolt12Zaps = (
  claims: Bolt12ZapClaim[],
  paymentHash: (claim: Bolt12ZapClaim) => string | undefined = getBolt12ZapPaymentHash,
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
    return parseVerifiedEvent(tagValue(tagSpec("description"), this.tags()), BOLT12_ZAP_INTENT)
  }

  // The recipient's announcement of the offer that was paid, verified.
  offer() {
    return parseVerifiedEvent(tagValue(tagSpec("offer_event"), this.tags()), BOLT12_OFFER)
  }

  // The canonical raw offers the payer proof may have paid.
  offers() {
    const offer = this.offer()

    return offer ? readOffer(this.context, offer).offers() : []
  }

  /**
   * Runs NIP-B1 validation as far as nostr reaches: `checkBolt12Zap`, plus that the payer
   * signed both the zap and its intent. Returns undefined when any of that fails.
   * `getBolt12ZapPaymentHash` is the lightning half, and it reads the claim this returns.
   */
  validate(): Bolt12ZapClaim | undefined {
    const check = checkBolt12Zap(this.context, {content: this.event.content, tags: this.tags()})
    let claim: Bolt12ZapClaim | undefined

    if (check.ok && this.isSignedByPayer(check.parts.intent)) {
      claim = {
        ...check.parts,
        event: this.event,
        target: this.target(),
        payerNote: makeBolt12PayerNote(check.parts.intent.id),
      }
    }

    return claim
  }

  // An anonymous zap's key exists only once it is signed, so only a reader can check these.
  // Reading `P` through `payer` would pass a malformed one off as an anonymous zap.
  private isSignedByPayer(intent: TrustedEvent) {
    const {pubkey} = this.event

    return (
      intent.pubkey === pubkey && matchTags(tagSpec("P"), this.tags()).every(t => t[1] === pubkey)
    )
  }
}

export class Bolt12ZapWriter extends EventWriter<Bolt12ZapReader> {
  // Copies the tags NIP-B1 requires the zap and its intent to agree on.
  setIntent(intent: SignedEvent) {
    const copied = matchTags(tagSpec(intentKeys), intent.tags)

    return this.dropTags(tagMatcher(tagSpec(["description", ...intentKeys])))
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

    const check = checkBolt12Zap(this.context, {content: this.content, tags: this.extraTags})

    if (!check.ok) {
      throw new Error(check.error)
    }

    const {intent, ...parts} = check.parts

    if (!getBolt12ZapPaymentHash({...parts, payerNote: makeBolt12PayerNote(intent.id)})) {
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
