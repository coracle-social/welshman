import {spec} from "@welshman/lib"
import {ZAP_REQUEST, getTag, getTagValue} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {KindFactory} from "../core/Kind.js"

// NIP-57 kind-9734 zap request.
export class ZapRequestReader extends EventReader {
  readonly kind = ZAP_REQUEST

  amount() {
    const amount = getTagValue("amount", this.event.tags)

    return amount ? parseInt(amount) : undefined
  }

  lnurl() {
    return getTagValue("lnurl", this.event.tags)
  }

  recipient() {
    return getTagValue("p", this.event.tags)
  }

  eventId() {
    return getTagValue("e", this.event.tags)
  }

  urls() {
    const tag = getTag("relays", this.event.tags)

    return tag ? tag.slice(1) : []
  }
}

export class ZapRequestWriter extends EventWriter<ZapRequestReader> {
  readonly kind = ZAP_REQUEST

  setAmount(amount: number) {
    return this.dropTags(spec(["amount"])).addTags(["amount", String(amount)])
  }

  setLnurl(lnurl: string) {
    return this.dropTags(spec(["lnurl"])).addTags(["lnurl", lnurl])
  }

  setRecipient(recipient: string) {
    return this.dropTags(spec(["p"])).addTags(["p", recipient])
  }

  setEventId(eventId: string) {
    return this.dropTags(spec(["e"])).addTags(["e", eventId])
  }

  setUrls(urls: string[]) {
    return this.dropTags(spec(["relays"])).addTags(["relays", ...urls])
  }
}

export const ZapRequest = new KindFactory({
  reader: ZapRequestReader,
  writer: ZapRequestWriter,
})
