import {uniq, spec} from "@welshman/lib"
import {
  BOLT12_OFFER,
  canonicalBolt12,
  indexers,
  isBolt12Offer,
  isCanonicalBolt12Offer,
  tagSpec,
  tagValueMatcher,
  tagValues,
} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"

const offerSpec = tagSpec("offer", isBolt12Offer, canonicalBolt12)

// NIP-B1 requires every offer tag to be canonical, and `offers` drops the ones that are not
const offersAreCanonical = (tags: string[][]) => {
  const offerTags = tags.filter(spec(["offer"]))

  return offerTags.length > 0 && offerTags.every(tag => isCanonicalBolt12Offer(tag[1]))
}

// NIP-B1 kind-10058 BOLT12 offer announcement.
export class Bolt12OfferReader extends EventReader {
  offers() {
    return uniq(tagValues(offerSpec, this.tags()))
  }

  offersAreCanonical() {
    return offersAreCanonical(this.tags())
  }
}

export class Bolt12OfferWriter extends EventWriter<Bolt12OfferReader> {
  addOffer(offer: string) {
    const canonical = canonicalBolt12(offer)

    return this.dropTags(tagValueMatcher(offerSpec, canonical)).addTags(["offer", canonical])
  }

  removeOffer(offer: string) {
    return this.dropTags(tagValueMatcher(offerSpec, canonicalBolt12(offer)))
  }

  setOffers(offers: string[]) {
    return this.dropTags(spec(["offer"])).addTags(
      ...offers.map(offer => ["offer", canonicalBolt12(offer)]),
    )
  }

  validate() {
    super.validate()

    if (!this.extraTags.some(spec(["offer"]))) {
      throw new Error("Bolt12Offer requires at least one offer")
    }

    if (!offersAreCanonical(this.extraTags)) {
      throw new Error("Bolt12Offer refuses an offer that is not a BOLT12 offer in canonical form")
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
