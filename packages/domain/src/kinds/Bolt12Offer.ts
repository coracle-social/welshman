import {uniq, spec} from "@welshman/lib"
import {
  BOLT12_OFFER,
  canonicalBolt12Offer,
  indexers,
  isBolt12Offer,
  matchTags,
  tagSpec,
  tagValueMatcher,
  tagValues,
} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

const offerSpec = tagSpec("offer", isBolt12Offer, canonicalBolt12Offer)

const isCanonicalBolt12Offer = (offer = "") =>
  isBolt12Offer(offer) && offer === canonicalBolt12Offer(offer)

// NIP-B1 kind-10058 BOLT12 offer announcement.
export class Bolt12OfferReader extends EventReader {
  offers() {
    return uniq(tagValues(offerSpec, this.tags()))
  }

  // NIP-B1 asks every offer tag to be canonical, where `offers` drops the ones that are not.
  offersAreCanonical() {
    const tags = this.tags().filter(spec(["offer"]))

    return tags.length > 0 && tags.every(tag => isCanonicalBolt12Offer(tag[1]))
  }
}

export class Bolt12OfferWriter extends EventWriter<Bolt12OfferReader> {
  addOffer(offer: string) {
    const canonical = canonicalBolt12Offer(offer)

    return this.dropTags(tagValueMatcher(offerSpec, canonical)).addTags(["offer", canonical])
  }

  removeOffer(offer: string) {
    return this.dropTags(tagValueMatcher(offerSpec, canonicalBolt12Offer(offer)))
  }

  setOffers(offers: string[]) {
    return this.dropTags(spec(["offer"])).addTags(
      ...offers.map(offer => ["offer", canonicalBolt12Offer(offer)]),
    )
  }

  validate() {
    super.validate()

    const tags = this.extraTags.filter(spec(["offer"]))

    if (tags.length === 0) {
      throw new Error("Bolt12Offer requires at least one offer")
    }

    if (tags.length > matchTags(offerSpec, this.extraTags).length) {
      throw new Error("Bolt12Offer refuses an offer that is not a BOLT12 offer")
    }
  }
}

export class Bolt12OfferQuery extends EventQuery {
  // A payer looks the announcement up by pubkey, the way it looks up a profile or a relay list.
  protected renderRoutes() {
    return [...this.authorRoutes(), indexers()]
  }
}

export const Bolt12Offer = new KindFactory({
  kind: BOLT12_OFFER,
  reader: Bolt12OfferReader,
  writer: Bolt12OfferWriter,
  query: Bolt12OfferQuery,
})
