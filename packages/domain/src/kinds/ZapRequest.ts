import {spec, tryCatch, fetchJson} from "@welshman/lib"
import {ZAP_REQUEST, matchTag, tagSpec, tagValue, stamp} from "@welshman/util"
import type {SignedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {Zapper} from "../other/Zapper.js"

// NIP-57 kind-9734 zap request.
export class ZapRequestReader extends EventReader {
  amount() {
    const amount = tagValue(tagSpec("amount"), this.event.tags)

    return amount ? parseInt(amount) : undefined
  }

  lnurl() {
    return tagValue(tagSpec("lnurl"), this.event.tags)
  }

  recipient() {
    return tagValue(tagSpec("p"), this.event.tags)
  }

  eventId() {
    return tagValue(tagSpec("e"), this.event.tags)
  }

  urls() {
    const tag = matchTag(tagSpec("relays"), this.event.tags)

    return tag ? tag.slice(1) : []
  }

  anonymous() {
    return this.event.tags.some(spec(["anon"]))
  }
}

export class ZapRequestWriter extends EventWriter<ZapRequestReader> {
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

  setAnonymous(anonymous: boolean) {
    return anonymous
      ? this.dropTags(spec(["anon"])).addTags(["anon"])
      : this.dropTags(spec(["anon"]))
  }

  async requestInvoice(
    zapper: Zapper,
  ): Promise<{event: SignedEvent; invoice?: string; error?: string}> {
    const {signer} = this.context

    if (!signer) {
      throw new Error("A signer is required to request a zap invoice")
    }

    const event = await signer.sign(stamp(await this.renderTemplate()))
    const zapString = encodeURI(JSON.stringify(event))
    const msats = parseInt(tagValue(tagSpec("amount"), event.tags)!)
    const qs = `?amount=${msats}&nostr=${zapString}&lnurl=${zapper.lnurl}`
    const res = await tryCatch(() => fetchJson(zapper.callback + qs))

    return {
      event,
      invoice: res?.pr,
      error: res?.pr ? undefined : res.reason || "Failed to request invoice",
    }
  }
}

export class ZapRequestQuery extends EventQuery {
  protected renderRoutes() {
    return [...this.authorRoutes(), ...this.mentionRoutes()]
  }
}

export const ZapRequest = new KindFactory({
  kind: ZAP_REQUEST,
  reader: ZapRequestReader,
  writer: ZapRequestWriter,
  query: ZapRequestQuery,
})
