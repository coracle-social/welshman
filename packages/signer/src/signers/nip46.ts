import {Emitter, sleep, tryCatch, randomId, equals} from "@welshman/lib"
import {createEvent, TrustedEvent, StampedEvent, NOSTR_CONNECT} from "@welshman/util"
import {subscribe, publish, Subscription, SubscriptionEvent} from "@welshman/net"
import {ISigner, decrypt, hash, own, makeSecret, getPubkey} from '../util'
import {Nip01Signer} from './nip01'

export type Nip46Algorithm = "nip04" | "nip44"

export type Nip46Handler = {
  relays: string[]
  pubkey: string
  domain?: string
}

export type Nip46InitiateParams = {
  url: string
  name: string
  image: string
  perms: string
  relays: string[]
  abortController?: AbortController
}

export type Nip46BrokerParams = {
  secret: string
  handler: Nip46Handler
  algorithm?: Nip46Algorithm
}

export type Nip46Request = {
  method: string
  params: string[]
  resolve: (result: Nip46ResponseWithResult) => void
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

export class Nip46Broker extends Emitter {
  #signer: ISigner
  #handler: Nip46Handler
  #algorithm: Nip46Algorithm
  #closed = false
  #processing = false
  #connectResponse?: Nip46Response
  #queue: Nip46Request[] = []
  #sub?: Subscription

  static initiate({url, name, image, perms, relays, abortController}: Nip46InitiateParams) {
    const secret = Math.random().toString(36).substring(7)
    const clientSecret = makeSecret()
    const clientPubkey = getPubkey(clientSecret)
    const clientSigner = new Nip01Signer(clientSecret)
    const params = new URLSearchParams({secret, url, name, image, perms})

    for (const relay of relays) {
      params.append('relay', relay)
    }

    const nostrconnect = `nostrconnect://${clientPubkey}?${params.toString()}`

    const result = new Promise<string | undefined>(resolve => {
      const complete = (pubkey?: string) => {
        sub.close()
        resolve(pubkey)
      }

      const sub = subscribe({
        relays,
        filters: [{kinds: [NOSTR_CONNECT], "#p": [clientPubkey]}],
        onEvent: async ({pubkey, content}: TrustedEvent) => {
          const response = await tryCatch(
            async () => JSON.parse(
              await decrypt(clientSigner, pubkey, content)
            )
          )

          if (response?.result === secret) {
            complete(pubkey)
          }

          if (response?.result === 'ack') {
            console.warn("Bunker responded to nostrconnect with 'ack', which can lead to session hijacking")
            complete(pubkey)
          }
        },
      })

      abortController?.signal.addEventListener('abort', () => complete())
    })

    return {result, params, nostrconnect, clientSecret, clientPubkey}
  }

  static parseBunkerLink(link: string) {
    let token = ""
    let pubkey = ""
    let relays: string[] = []

    try {
      const url = new URL(link)

      pubkey = url.hostname || url.pathname.replace(/\//g, '')
      relays = url.searchParams.getAll("relay") || []
      token = url.searchParams.get("secret") || ""
    } catch {
      // pass
    }

    return {token, pubkey, relays}
  }

  static get(params: Nip46BrokerParams) {
    if (!singleton?.hasParams(params)) {
      singleton?.teardown()
      singleton = new Nip46Broker(params)
    }

    return singleton
  }

  constructor(private params: Nip46BrokerParams) {
    super()

    this.#handler = params.handler
    this.#algorithm = params.algorithm || 'nip04'
    this.#signer = new Nip01Signer(params.secret)
  }

  hasParams(params: Nip46BrokerParams) {
    return equals(this.params, params)
  }

  #subscribe = async () => {
    const pubkey = await this.#signer.getPubkey()

    return new Promise<void>(resolve => {
      if (this.#sub) {
        this.#sub.close()
      }

      this.#sub = subscribe({
        relays: this.#handler.relays,
        filters: [{kinds: [NOSTR_CONNECT], "#p": [pubkey]}],
      })

      this.#sub.emitter.on(SubscriptionEvent.Send, resolve)

      this.#sub.emitter.on(SubscriptionEvent.Event, async (url: string, event: TrustedEvent) => {
        const json = await decrypt(this.#signer, event.pubkey, event.content)
        const response = tryCatch(() => JSON.parse(json)) || {}

        if (!response.id) {
          console.error(`Invalid nostr-connect response: ${json}`)
        }

        // Delay errors in case there's a zombie signer out there clogging things up
        if (response.error) {
          await sleep(3000)
        }

        if (response.result === "auth_url") {
          this.emit(`auth-${response.id}`, response)
        } else {
          this.emit(`res-${response.id}`, response)
        }
      })

      this.#sub.emitter.on("complete", () => {
        this.#sub = undefined
      })
    })
  }

  #processQueue = async () => {
    if (this.#processing) {
      return
    }

    this.#processing = true

    try {
      while (this.#queue.length > 0) {
        const [{method, params, resolve}] = this.#queue.splice(0, 1)

        try {
          const response = await this.request(method, params)

          console.log('nip46 response:', {method, params, ...response})

          resolve(response)
        } catch (error: any) {
          console.error(`nip46 error:`, {method, params, ...error})
        }
      }
    } finally {
      this.#processing = false
    }
  }

  #getResult = async (promise: Promise<Nip46ResponseWithResult>) => {
    const {result} = await promise

    return result
  }

  request = async (method: string, params: string[]) => {
    if (this.#closed) {
      throw new Error("Attempted to make a nip46 request with a closed broker")
    }

    if (!this.#sub) {
      await this.#subscribe()
    }

    const id = randomId()
    const recipient = this.#handler.pubkey
    const payload = JSON.stringify({id, method, params})
    const content = await this.#signer[this.#algorithm].encrypt(recipient, payload)
    const template = createEvent(NOSTR_CONNECT, {content, tags: [["p", recipient]]})

    console.log('nip46 request:', {id, method, params})

    publish({
      relays: this.#handler.relays,
      event: await this.#signer.sign(template),
    })

    this.once(`auth-${id}`, response => {
      window.open(response.error, "", "width=600,height=800,popup=yes")
    })

    return new Promise<Nip46ResponseWithResult>((resolve, reject) => {
      this.once(`res-${id}`, (response: Nip46Response) => {
        if (response.error) {
          reject(response as Nip46ResponseWithError)
        } else {
          resolve(response as Nip46ResponseWithResult)
        }
      })
    })
  }

  enqueue = (method: string, params: string[]) =>
    new Promise<Nip46ResponseWithResult>(resolve => {
      this.#queue.push({method, params, resolve})
      this.#processQueue()
    })

  createAccount = (username: string, perms = "") => {
    if (!this.#handler.domain) {
      throw new Error("Unable to create an account without a handler domain")
    }

    return this.#getResult(this.enqueue("create_account", [username, this.#handler.domain, "", perms]))
  }

  connect = async (token = "", perms = "", secret = "") => {
    if (!this.#connectResponse) {
      const params = ["", token, perms]

      this.#connectResponse = await this.enqueue("connect", params)
    }

    return this.#connectResponse.result === 'ack'
  }

  getPublicKey = () => this.#getResult(this.enqueue("get_public_key", []))

  signEvent = async (event: StampedEvent) =>
    JSON.parse(await this.#getResult(this.enqueue("sign_event", [JSON.stringify(event)])))

  nip04Encrypt = (pk: string, message: string) =>
    this.#getResult(this.enqueue("nip04_encrypt", [pk, message]))

  nip04Decrypt = (pk: string, message: string) =>
    this.#getResult(this.enqueue("nip04_decrypt", [pk, message]))

  nip44Encrypt = (pk: string, message: string) =>
    this.#getResult(this.enqueue("nip44_encrypt", [pk, message]))

  nip44Decrypt = (pk: string, message: string) =>
    this.#getResult(this.enqueue("nip44_decrypt", [pk, message]))

  teardown = () => {
    this.#closed = true
    this.#sub?.close()
  }
}

export class Nip46Signer implements ISigner {
  #pubkey?: string

  constructor(private broker: Nip46Broker) {}

  getPubkey = async () => {
    if (!this.#pubkey) {
      this.#pubkey = await this.broker.getPublicKey()
    }

    return this.#pubkey
  }

  sign = async (template: StampedEvent) =>
    this.broker.signEvent(hash(own(template, await this.getPubkey())))

  nip04 = {
    encrypt: this.broker.nip04Encrypt,
    decrypt: this.broker.nip04Decrypt,
  }

  nip44 = {
    encrypt: this.broker.nip44Encrypt,
    decrypt: this.broker.nip44Decrypt,
  }
}
