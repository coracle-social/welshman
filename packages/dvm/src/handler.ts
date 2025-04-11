import {now} from "@welshman/lib"
import {Nip01Signer} from "@welshman/signer"
import {TrustedEvent, StampedEvent, Filter} from "@welshman/util"
import {request, publish, AdapterContext} from "@welshman/net"

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
  signer: Nip01Signer

  constructor(readonly opts: DVMOpts) {
    this.signer = new Nip01Signer(opts.sk)

    for (const [kind, createHandler] of Object.entries(this.opts.handlers)) {
      this.handlers.set(parseInt(kind), createHandler(this))
    }
  }

  async start() {
    this.active = true

    const {relays, context, requireMention = false} = this.opts
    const pubkey = await this.signer.getPubkey()

    while (this.active) {
      await new Promise<void>(resolve => {
        const since = now()
        const kinds = Array.from(this.handlers.keys())
        const filter: Filter = {kinds, since}

        if (requireMention) {
          filter["#p"] = [pubkey]
        }

        request({
          relays,
          filters: [filter],
          context,
          onClose: resolve,
          onEvent: this.onEvent,
        })
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
    const {relays, context} = this.opts
    const event = await this.signer.sign(template)

    await publish({event, relays, context})
  }
}
