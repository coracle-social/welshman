import {first, spec, tryCatch, fetchJson} from "@welshman/lib"
import {
  ZAP_GOAL,
  ZAP_REQUEST,
  inbox,
  matchTag,
  msatsTags,
  relays,
  tagSpec,
  tagValue,
  stamp,
} from "@welshman/util"
import type {RelaySelection, SignedEvent, TrustedEvent} from "@welshman/util"
import {EventReader} from "../core/EventReader.js"
import {EventWriter, TagParser} from "../core/EventWriter.js"
import {EventQuery} from "../core/EventQuery.js"
import {KindFactory} from "../core/Kind.js"
import type {KindContext} from "../core/Kind.js"
import {ZapGoalReader} from "./ZapGoal.js"
import type {Zapper} from "../other/Zapper.js"

// NIP-57 kind-9734 zap request.
export class ZapRequestReader extends EventReader {
  // The requested amount in millisats, undefined unless the tag holds whole millisats.
  amount() {
    return tagValue(msatsTags("amount"), this.event.tags)
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
  // Relays the receipt has to reach on top of wherever the recipient reads.
  extraRoutes: RelaySelection[] = []

  constructor(kind: number, context: KindContext, reader?: ZapRequestReader) {
    super(kind, context, reader)

    if (reader) {
      const parser = new TagParser(this.extraTags)
      const tag = first(parser.consume("relays"))

      this.extraTags = parser.tags

      if (tag) {
        this.forceRoutes(...relays(tag.slice(1)))
      }
    }
  }

  setAmount(amount: number) {
    return this.dropTags(spec(["amount"])).addTags(["amount", String(amount)])
  }

  setLnurl(lnurl: string) {
    return this.dropTags(spec(["lnurl"])).addTags(["lnurl", lnurl])
  }

  setRecipient(recipient: string) {
    return this.dropTags(spec(["p"])).addTags(["p", recipient])
  }

  // NIP-75 totals a goal from the receipts on the goal's own relays, so a zap to
  // one is requested there as well.
  setEvent(event: TrustedEvent) {
    this.extraRoutes =
      event.kind === ZAP_GOAL
        ? relays(new ZapGoalReader(event.kind, this.context, event).urls())
        : []

    return this.dropTags(spec(["e"])).addTags(["e", event.id])
  }

  setAnonymous(anonymous: boolean) {
    return anonymous
      ? this.dropTags(spec(["anon"])).addTags(["anon"])
      : this.dropTags(spec(["anon"]))
  }

  // Where the zapper is asked to publish the receipt: the recipient's inbox
  // relays, or whatever the caller forced instead — a space's relay, say.
  protected async renderRoutes(): Promise<RelaySelection[]> {
    const recipient = tagValue(tagSpec("p"), this.extraTags)

    return recipient ? [inbox(recipient)] : []
  }

  // Extra routes survive forcing, since a goal is tallied on its own relays
  // whether or not the zap was sent from somewhere with relays of its own.
  async scenario() {
    const routes = this.forcedRoutes?.length ? this.forcedRoutes : await this.renderRoutes()

    return this.context.resolver.scenario([...routes, ...this.extraRoutes])
  }

  // Every one of these has to see the receipt, so a zap request takes its routes
  // whole rather than the top-scoring few.
  async relays() {
    return (await this.scenario()).getAllUrls()
  }

  // NIP-57's relays tag, and what a caller watches for the receipt.
  protected async renderDomainTags() {
    const urls = await this.relays()

    return urls.length > 0 ? [["relays", ...urls]] : []
  }

  async requestInvoice(
    zapper: Zapper,
  ): Promise<{event: SignedEvent; invoice?: string; error?: string}> {
    const {signer} = this.context

    if (!signer) {
      throw new Error("A signer is required to request a zap invoice")
    }

    const template = stamp(await this.renderTemplate())
    const msats = tagValue(msatsTags("amount"), template.tags)

    if (msats === undefined) {
      throw new Error("A whole number of millisats is required to request a zap invoice")
    }

    const event = await signer.sign(template)
    const zapString = encodeURI(JSON.stringify(event))
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
