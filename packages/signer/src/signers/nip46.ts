import {
  trustedKeyDeal,
  hexShard,
  hexPubShard,
  KeyShard,
} from "@jsr/fiatjaf__promenade-trusted-dealer"
import {
  Emitter,
  uniq,
  spec,
  inc,
  throttle,
  makePromise,
  defer,
  sleep,
  tryCatch,
  randomId,
  MaybeAsync,
  shuffle,
} from "@welshman/lib"
import {
  getPubkey,
  HashedEvent,
  makeEvent,
  makeSecret,
  normalizeRelayUrl,
  NOSTR_CONNECT,
  prep,
  PROMENADE_REGISTER_ACCOUNT,
  PROMENADE_SHARD_ACK,
  PROMENADE_SHARD_SHARE,
  RelayMode,
  StampedEvent,
  TrustedEvent,
} from "@welshman/util"
import {publish, request, PublishStatus, AdapterContext} from "@welshman/net"
import {ISigner, EncryptionImplementation, signWithOptions, SignOptions, decrypt} from "../util.js"
import {Nip01Signer} from "./nip01.js"

export type Nip46Context = {
  debug: boolean
}

export const nip46Context = {
  debug: false,
}

const nip46Log = (...args: any[]) => {
  if (nip46Context.debug) {
    console.log(...args)
  }
}

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
  context?: AdapterContext
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

export type PromenadeOptions = {
  secret: string
  policy: [number, number]
  coordinatorUrl: string
  signerPubkeys: string[]
  onProgress?: (progress: number) => void
  generatePow: (event: HashedEvent, difficulty: number) => MaybeAsync<HashedEvent>
  getPubkeyRelays: (pubkey: string, mode: RelayMode) => MaybeAsync<string[]>
}

export class PromenadeShardError extends Error {
  constructor(
    message: string,
    readonly errorsBySignerPubkey: Map<string, string>,
  ) {
    super(message)
  }
}

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
  public abortController?: AbortController

  constructor(
    public signer: ISigner,
    public params: Nip46BrokerParams,
  ) {
    super()
  }

  // start listening to the remote signer for incoming events
  // broadcast any event returned by the remote signer
  start = async () => {
    if (this.abortController) return

    this.abortController = new AbortController()

    const {relays, context} = this.params
    const userPubkey = await this.signer.getPubkey()
    const filters = [{kinds: [NOSTR_CONNECT], "#p": [userPubkey]}]

    request({
      relays,
      filters,
      context,
      signal: this.abortController.signal,
      onEvent: async (event: TrustedEvent, url: string) => {
        const json = await decrypt(this.signer, event.pubkey, event.content)
        const response = tryCatch(() => JSON.parse(json)) || {}

        // Delay errors in case there's a zombie signer out there clogging things up
        if (response.error) {
          await sleep(3000)
        }

        this.emit(Nip46Event.Receive, {...response, url, event} as Nip46Response)
      },
      onClose: () => {
        this.abortController = undefined
      },
    })
  }

  stop = () => {
    this.abortController?.abort()
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
  // send a request to the remote signer, emitting the request and the pub
  public send = async (request: Nip46Request) => {
    const {id, method, params} = request
    const {relays, signerPubkey, context, algorithm = "nip44"} = this.params

    if (!signerPubkey) {
      throw new Error("Unable to send nip46 request without a signer pubkey")
    }

    const payload = JSON.stringify({id, method, params})
    const content = await this.signer[algorithm].encrypt(signerPubkey, payload)
    const template = makeEvent(NOSTR_CONNECT, {content, tags: [["p", signerPubkey]]})
    const event = await this.signer.sign(template)

    publish({relays, event, context})

    this.emit(Nip46Event.Send, request)
  }

  // process the queue of requests
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
          nip46Log("nip46 error:", error, request)
        }
      }
    } finally {
      this.processing = false
    }
  }

  // enqueue a request to the queue and process it
  enqueue = (request: Nip46Request) => {
    this.queue.push(request)
    this.process()
  }

  stop = () => {
    this.removeAllListeners()
  }
}

// NIP 46 request object constructor
export class Nip46Request {
  id = randomId()
  promise = defer<Nip46ResponseWithResult, Nip46ResponseWithError>()

  constructor(
    readonly method: string,
    readonly params: string[],
  ) {}

  // listen for a response from the remote signer and resolve/reject the in class promise
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

  // send the request to the remote signer
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

  // Static utility methods

  static parseBunkerUrl = (url: string) => {
    let connectSecret = ""
    let signerPubkey = ""
    let relays: string[] = []

    try {
      const _url = new URL(url)
      const _relays = _url.searchParams.getAll("relay") || []
      const _signerPubkey = _url.hostname || _url.pathname.replace(/\//g, "")
      const _connectSecret = _url.searchParams.get("secret") || ""

      relays = _relays.map(normalizeRelayUrl)
      signerPubkey = _signerPubkey.match(/^[0-9a-f]{64}$/)?.[0] || ""
      connectSecret = _connectSecret
    } catch {
      // pass
    }

    return {relays, signerPubkey, connectSecret}
  }

  static fromBunkerUrl = (url: string) => {
    const clientSecret = makeSecret()
    const {relays, signerPubkey, connectSecret} = Nip46Broker.parseBunkerUrl(url)

    return new Nip46Broker({
      relays,
      clientSecret,
      signerPubkey,
      connectSecret,
    })
  }

  static fromPromenade = async (options: PromenadeOptions) => {
    const [m, n] = options.policy

    if (options.signerPubkeys.length < n) {
      throw new Error("Not enough signers to create all shards")
    }

    const deal = trustedKeyDeal(BigInt("0x" + options.secret), m, n)
    const signer = Nip01Signer.fromSecret(options.secret)
    const ourPubkey = await signer.getPubkey()
    const ackRelays = await options.getPubkeyRelays(ourPubkey, RelayMode.Read)
    const remainingSignerPubkeys = shuffle(uniq(options.signerPubkeys))
    const errorsBySignerPubkey = new Map<string, string>()
    const shardsBySignerPubkey = new Map<string, KeyShard>()

    if (ackRelays.length === 0) {
      throw new Error("No read relays returned for user pubkey")
    }

    nip46Log(`generated promenade shards for user ${ourPubkey}`, deal)

    await Promise.all(
      deal.shards.map(async (shard, i) => {
        while (remainingSignerPubkeys.length > 0) {
          const signerPubkey = remainingSignerPubkeys.shift()!

          nip46Log(`generating proof of work for shard ${i}`)

          const shardTemplate = makeEvent(PROMENADE_SHARD_SHARE, {
            content: await signer.nip44.encrypt(signerPubkey, hexShard(shard)),
            tags: [
              ["p", signerPubkey],
              ["coordinator", options.coordinatorUrl],
              ...ackRelays.map(url => ["reply", url]),
            ],
          })

          const shardTemplateWithWork = await tryCatch(() =>
            options.generatePow(prep(shardTemplate, ourPubkey), 20),
          )

          if (!shardTemplateWithWork) {
            errorsBySignerPubkey.set(signerPubkey, "Failed to generate work")
            continue
          }

          const shardEvent = await signer.sign(shardTemplateWithWork)
          const shardRelays = await options.getPubkeyRelays(signerPubkey, RelayMode.Read)
          const publishResults = await publish({relays: shardRelays, event: shardEvent})

          nip46Log(`published shard ${i} to signer ${signerPubkey}`, shardRelays, publishResults)

          if (!Object.values(publishResults).some(spec({status: PublishStatus.Success}))) {
            errorsBySignerPubkey.set(signerPubkey, "Failed to publish shard")
            continue
          }

          const controller = new AbortController()
          const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])

          await request({
            signal,
            relays: ackRelays,
            filters: [
              {
                kinds: [PROMENADE_SHARD_ACK],
                authors: [signerPubkey],
                "#p": [ourPubkey],
                "#e": [shardEvent.id],
              },
            ],
            onEvent: (event: TrustedEvent, url: string) => {
              nip46Log(`received ack for shard ${i} from signer ${signerPubkey} on ${url}`)
              shardsBySignerPubkey.set(signerPubkey, shard)
              options.onProgress?.(shardsBySignerPubkey.size / inc(n))
              controller.abort()
            },
          })

          if (shardsBySignerPubkey.has(signerPubkey)) {
            break
          } else {
            errorsBySignerPubkey.set(signerPubkey, "Failed to receive shard ACK")
            nip46Log(`failed to receive ack for shard ${i} from signer ${signerPubkey}`)
          }
        }
      }),
    )

    if (shardsBySignerPubkey.size < deal.shards.length) {
      throw new PromenadeShardError("Failed to publish all shards", errorsBySignerPubkey)
    }

    const connectSecret = randomId()
    const signerSecret = makeSecret()
    const signerPubkey = getPubkey(signerSecret)
    const tags = [
      ["h", signerPubkey],
      ["threshold", String(m)],
      ["handlersecret", signerSecret],
      ["profile", "MAIN", connectSecret, ""],
    ]

    for (const [pubkey, shard] of shardsBySignerPubkey) {
      tags.push(["p", pubkey, hexPubShard(shard.pubShard)])
    }

    nip46Log(`registering coordinator account`, tags)

    const relays = [options.coordinatorUrl]
    const event = await signer.sign(makeEvent(PROMENADE_REGISTER_ACCOUNT, {tags}))
    const accountResults = await publish({relays, event})

    if (!Object.values(accountResults).some(spec({status: PublishStatus.Success}))) {
      throw new Error("Failed to publish accounts to coordinator")
    }

    nip46Log(`successfully created promenade broker`)

    const clientSecret = makeSecret()

    return new Nip46Broker({
      relays,
      clientSecret,
      signerPubkey,
      connectSecret,
    })
  }

  // Getters for helper objects

  makeSigner = () => new Nip01Signer(this.params.clientSecret)

  makeSender = () => {
    const sender = new Nip46Sender(this.signer, this.params)

    sender.on(Nip46Event.Send, (data: any) => {
      nip46Log("nip46 send:", data)
    })

    return sender
  }

  makeReceiver = () => {
    const receiver = new Nip46Receiver(this.signer, this.params)

    receiver.on(Nip46Event.Receive, (data: any) => {
      nip46Log("nip46 receive:", data)
    })

    return receiver
  }

  // Lifecycle methods

  cleanup = () => {
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

  waitForNostrconnect = (url: string, signal: AbortSignal) => {
    const secret = new URL(url).searchParams.get("secret")

    return makePromise<Nip46ResponseWithResult, Nip46Response | undefined>((resolve, reject) => {
      const onReceive = (response: Nip46Response) => {
        if (response.result === "auth_url") return

        if (["ack", secret].includes(response.result!)) {
          this.params.signerPubkey = response.event.pubkey

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

      signal.addEventListener("abort", () => {
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

  connect = async (connectSecret = "", perms = "") => {
    if (!this.params.signerPubkey) {
      throw new Error("Attempted to `connect` with no signerPubkey")
    }

    return this.send("connect", [this.params.signerPubkey, connectSecret, perms])
  }

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

  sign = (template: StampedEvent, options: SignOptions = {}) =>
    signWithOptions(
      this.getPubkey().then(pubkey => this.broker.signEvent(prep(template, pubkey))),
      options,
    )
}
