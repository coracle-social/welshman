import {hexToBytes} from "@noble/hashes/utils"
import {getPublicKey, finalizeEvent} from "nostr-tools/pure"
import {now} from "@welshman/lib"
import {TrustedEvent, StampedEvent, Filter} from "@welshman/util"
import {MultiRequest, MultiPublish, PublishEvent, RequestEvent, AdapterContext} from "@welshman/net"

export type DVMHandler = {
  stop?: () => void
  handleEvent: (e: TrustedEvent) => AsyncGenerator<StampedEvent>
}

export type CreateDVMHandler = (dvm: DVM) => DVMHandler

export type DVMOpts = {
  sk: string
  relays: string[]
  handlers: Record<string, CreateDVMHandler>
  expireAfter?: number
  requireMention?: boolean
  context?: AdapterContext
}

export class DVM {
  active = false
  logEvents = false
  seen = new Set()
  handlers = new Map()

  constructor(readonly opts: DVMOpts) {
    for (const [kind, createHandler] of Object.entries(this.opts.handlers)) {
      this.handlers.set(parseInt(kind), createHandler(this))
    }
  }

  async start() {
    this.active = true

    const {sk, relays, context, requireMention = false} = this.opts

    while (this.active) {
      await new Promise<void>(resolve => {
        const since = now()
        const kinds = Array.from(this.handlers.keys())
        const filter: Filter = {kinds, since}

        if (requireMention) {
          filter["#p"] = [getPublicKey(hexToBytes(sk))]
        }

        const req = new MultiRequest({relays, filter, context})

        req.on(RequestEvent.Event, this.onEvent)
        req.on(RequestEvent.Close, resolve)
      })
    }
  }

  stop() {
    for (const handler of this.handlers.values()) {
      handler.stop?.()
    }

    this.active = false
  }

  async onEvent(request: TrustedEvent) {
    const {expireAfter = 60 * 60} = this.opts

    if (this.seen.has(request.id)) {
      return
    }

    const handler = this.handlers.get(request.kind)

    if (!handler) {
      return
    }

    this.seen.add(request.id)

    if (this.logEvents) {
      console.info("Handling request", request)
    }

    for await (const event of handler.handleEvent(request)) {
      if (event.kind !== 7000) {
        event.tags.push(["request", JSON.stringify(request)])

        const inputTag = request.tags.find((t: string[]) => t[0] === "i")

        if (inputTag) {
          event.tags.push(inputTag)
        }
      }

      event.tags.push(["p", request.pubkey])
      event.tags.push(["e", request.id])

      if (expireAfter) {
        event.tags.push(["expiration", String(now() + expireAfter)])
      }

      if (this.logEvents) {
        console.info("Publishing event", event)
      }

      this.publish(event)
    }
  }

  async publish(template: StampedEvent) {
    const {sk, relays, context} = this.opts
    const event = finalizeEvent(template, hexToBytes(sk))

    await new Promise<void>(resolve => {
      new MultiPublish({event, relays, context}).on(PublishEvent.Complete, resolve)
    })
  }
}
