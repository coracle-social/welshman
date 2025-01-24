import {
  Emitter,
  throttle,
  makePromise,
  defer,
  sleep,
  tryCatch,
  randomId,
  equals,
} from "@welshman/lib"
import {
  createEvent,
  normalizeRelayUrl,
  TrustedEvent,
  StampedEvent,
  NOSTR_CONNECT,
} from "@welshman/util"
import {subscribe, publish, Subscription, SubscriptionEvent} from "@welshman/net"
import {ISigner, EncryptionImplementation, decrypt, hash, own} from "../util.js"
import {Nip01Signer} from "./nip01.js"

export type Nip46Algorithm = "nip04" | "nip44"

export enum Nip46Event {
  Send = "send",
  Receive = "receive",
}

export type Nip46BrokerParams = {
  relays: string[]
  clientSecret: string
  connectSecret?: string
  signerPubkey?: string
  algorithm?: Nip46Algorithm
}

export type Nip46Response = {
  id: string
  url: string
  event: TrustedEvent
  error?: string
  result?: string
}

export type Nip46ResponseWithResult = {
  id: string
  url: string
  event: TrustedEvent
  result: string
}

export type Nip46ResponseWithError = {
  id: string
  url: string
  event: TrustedEvent
  error: string
}

let singleton: Nip46Broker

const popupManager = (() => {
  let pendingUrl = ""
  let pendingSince = 0
  let currentWindow: Window

  const openPending = throttle(1000, () => {
    // If it's been a while since they asked for it, drop the request
    if (Date.now() - pendingSince > 10_000) return

    // If we have an active, open window, continue to wait
    if (currentWindow && !currentWindow.closed) {
      setTimeout(() => openPending(), 100)
    } else {
      // Attempt to open the window
      const w = window.open(pendingUrl, "", "width=600,height=800,popup=yes")

      // If open was successful, keep track of our window
      if (w) {
        currentWindow = w
      }

      // In any case, this url has been handled
      pendingUrl = ""
      pendingSince = 0
    }
  })

  return {
    open: (url: string) => {
      pendingUrl = url
      pendingSince = Date.now()

      openPending()
    },
  }
})()

export class Nip46Receiver extends Emitter {
  public sub?: Subscription

  constructor(
    public signer: ISigner,
    public params: Nip46BrokerParams,
  ) {
    super()
  }

  start = async () => {
    if (this.sub) return

    const userPubkey = await this.signer.getPubkey()
    const filters = [{kinds: [NOSTR_CONNECT], "#p": [userPubkey]}]

    this.sub = subscribe({relays: this.params.relays, filters})

    return new Promise<void>(resolve => {
      this.sub!.on(SubscriptionEvent.Send, resolve)

      this.sub!.on(SubscriptionEvent.Event, async (url: string, event: TrustedEvent) => {
        const json = await decrypt(this.signer, event.pubkey, event.content)
        const response = tryCatch(() => JSON.parse(json)) || {}

        // Delay errors in case there's a zombie signer out there clogging things up
        if (response.error) {
          await sleep(3000)
        }

        this.emit(Nip46Event.Receive, {...response, url, event} as Nip46Response)
      })

      this.sub!.on(SubscriptionEvent.Complete, () => {
        this.sub = undefined
      })
    })
  }

  stop = () => {
    this.sub?.close()
    this.removeAllListeners()
  }
}

export class Nip46Sender extends Emitter {
  public processing = false
  public queue: Nip46Request[] = []

  constructor(
    public signer: ISigner,
    public params: Nip46BrokerParams,
  ) {
    super()
  }

  public send = async (request: Nip46Request) => {
    const {id, method, params} = request
    const {relays, signerPubkey, algorithm = "nip44"} = this.params

    if (!signerPubkey) {
      throw new Error("Unable to send nip46 request without a signer pubkey")
    }

    const payload = JSON.stringify({id, method, params})
    const content = await this.signer[algorithm].encrypt(signerPubkey, payload)
    const template = createEvent(NOSTR_CONNECT, {content, tags: [["p", signerPubkey]]})
    const event = await this.signer.sign(template)
    const pub = publish({relays, event})

    this.emit(Nip46Event.Send, {...request, pub})
  }

  public process = async () => {
    if (this.processing) {
      return
    }

    this.processing = true

    try {
      while (this.queue.length > 0) {
        const [request] = this.queue.splice(0, 1)

        try {
          await this.send(request)
        } catch (error: any) {
          console.error("nip46 error:", error, request)
        }
      }
    } finally {
      this.processing = false
    }
  }

  enqueue = (request: Nip46Request) => {
    this.queue.push(request)
    this.process()
  }

  stop = () => {
    this.removeAllListeners()
  }
}

export class Nip46Request {
  id = randomId()
  promise = defer<Nip46ResponseWithResult, Nip46ResponseWithError>()

  constructor(
    readonly method: string,
    readonly params: string[],
  ) {}

  listen = async (receiver: Nip46Receiver) => {
    await receiver.start()

    const onReceive = (response: Nip46Response) => {
      if (response.id !== this.id) {
        return
      }

      if (response.result === "auth_url") {
        popupManager.open(response.error!)
      } else {
        if (response.error) {
          this.promise.reject(response as Nip46ResponseWithError)
        } else {
          this.promise.resolve(response as Nip46ResponseWithResult)
        }

        receiver.off(Nip46Event.Receive, onReceive)
      }
    }

    receiver.on(Nip46Event.Receive, onReceive)
  }

  send = async (sender: Nip46Sender) => {
    sender.enqueue(this)
  }
}

export class Nip46Broker extends Emitter {
  public signer: ISigner
  public sender: Nip46Sender
  public receiver: Nip46Receiver

  constructor(public params: Nip46BrokerParams) {
    super()

    this.signer = this.makeSigner()
    this.sender = this.makeSender()
    this.receiver = this.makeReceiver()
  }

  // Use a static getter to avoid duplicate connections

  static get(params: Nip46BrokerParams) {
    if (!singleton?.hasParams(params)) {
      singleton?.teardown()
      singleton = new Nip46Broker(params)
    }

    return singleton
  }

  // Static utility methods

  static parseBunkerUrl = (url: string) => {
    let connectSecret = ""
    let signerPubkey = ""
    let relays: string[] = []

    try {
      const _url = new URL(url)

      relays = _url.searchParams.getAll("relay") || []
      signerPubkey = _url.hostname || _url.pathname.replace(/\//g, "")
      connectSecret = _url.searchParams.get("secret") || ""
    } catch {
      // pass
    }

    return {signerPubkey, connectSecret, relays: relays.map(normalizeRelayUrl)}
  }

  // Expose params without exposing params

  hasParams(params: Nip46BrokerParams) {
    return equals(this.params, params)
  }

  // Getters for helper objects

  makeSigner = () => new Nip01Signer(this.params.clientSecret)

  makeSender = () => {
    const sender = new Nip46Sender(this.signer, this.params)

    sender.on(Nip46Event.Send, (data: any) => {
      console.log("nip46 send:", data)
    })

    return sender
  }

  makeReceiver = () => {
    const receiver = new Nip46Receiver(this.signer, this.params)

    receiver.on(Nip46Event.Receive, (data: any) => {
      console.log("nip46 receive:", data)
    })

    return receiver
  }

  // Lifecycle methods

  setParams = (params: Partial<Nip46BrokerParams>) => {
    this.params = {...this.params, ...params}

    // Stop everything that's stateful
    this.teardown()

    // Set it back up again
    this.sender = this.makeSender()
    this.receiver = this.makeReceiver()
  }

  teardown = () => {
    this.sender.stop()
    this.receiver.stop()
  }

  // General purpose utility methods

  enqueue = async (method: string, params: string[]) => {
    const request = new Nip46Request(method, params)

    await request.listen(this.receiver)
    await request.send(this.sender)

    return request
  }

  send = async (method: string, params: string[]) => {
    const request = await this.enqueue(method, params)
    const response = await request.promise

    return response.result
  }

  // Methods for initiating a connection

  makeNostrconnectUrl = async (meta: Record<string, string> = {}) => {
    const clientPubkey = await this.signer.getPubkey()
    const secret = Math.random().toString(36).substring(7)
    const params = new URLSearchParams({...meta, secret})

    for (const relay of this.params.relays) {
      params.append("relay", relay)
    }

    return `nostrconnect://${clientPubkey}?${params.toString()}`
  }

  waitForNostrconnect = (url: string, abort?: AbortController) => {
    const secret = new URL(url).searchParams.get("secret")

    return makePromise<Nip46ResponseWithResult, Nip46Response | undefined>((resolve, reject) => {
      const onReceive = (response: Nip46Response) => {
        if (["ack", secret].includes(response.result!)) {
          this.setParams({signerPubkey: response.event.pubkey})

          if (response.result === "ack") {
            console.warn(
              "Bunker responded to nostrconnect with 'ack', which can lead to session hijacking",
            )
          }

          resolve(response as Nip46ResponseWithResult)
        } else {
          reject(response)
        }

        cleanup()
      }

      const cleanup = () => {
        this.receiver.off(Nip46Event.Receive, onReceive)
      }

      this.receiver.on(Nip46Event.Receive, onReceive)
      this.receiver.start()

      abort?.signal.addEventListener("abort", () => {
        reject(undefined)
        cleanup()
      })
    })
  }

  // Methods for serializing a connection

  getBunkerUrl = () => {
    if (!this.params.signerPubkey) {
      throw new Error("Attempted to get a bunker url with no signerPubkey")
    }

    const params = new URLSearchParams()

    for (const relay of this.params.relays) {
      params.append("relay", relay)
    }

    if (this.params.connectSecret) {
      params.set("secret", this.params.connectSecret)
    }

    return "bunker://" + this.params.signerPubkey + "?" + params.toString()
  }

  // Normal NIP 46 methods

  ping = () => this.send("ping", [])

  getPublicKey = () => this.send("get_public_key", [])

  createAccount = (username: string, domain: string, perms = "") =>
    this.send("create_account", [username, domain, "", perms])

  connect = async (connectSecret = "", perms = "") =>
    this.send("connect", [await this.signer.getPubkey(), connectSecret, perms])

  signEvent = async (event: StampedEvent) =>
    JSON.parse(await this.send("sign_event", [JSON.stringify(event)]))

  nip04Encrypt = (pk: string, message: string) => this.send("nip04_encrypt", [pk, message])

  nip04Decrypt = (pk: string, message: string) => this.send("nip04_decrypt", [pk, message])

  nip44Encrypt = (pk: string, message: string) => this.send("nip44_encrypt", [pk, message])

  nip44Decrypt = (pk: string, message: string) => this.send("nip44_decrypt", [pk, message])
}

export class Nip46Signer implements ISigner {
  pubkey?: string
  nip04: EncryptionImplementation
  nip44: EncryptionImplementation

  constructor(public broker: Nip46Broker) {
    this.nip04 = {
      encrypt: this.broker.nip04Encrypt,
      decrypt: this.broker.nip04Decrypt,
    }

    this.nip44 = {
      encrypt: this.broker.nip44Encrypt,
      decrypt: this.broker.nip44Decrypt,
    }
  }

  getPubkey = async () => {
    if (!this.pubkey) {
      this.pubkey = await this.broker.getPublicKey()
    }

    return this.pubkey
  }

  sign = async (template: StampedEvent) =>
    this.broker.signEvent(hash(own(template, await this.getPubkey())))
}
