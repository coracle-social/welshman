import {Emitter, sleep, tryCatch, randomId, equals, now} from "@welshman/lib"
import {createEvent, TrustedEvent, StampedEvent, NOSTR_CONNECT} from "@welshman/util"
import {subscribe, publish, Subscription} from "@welshman/net"
import {ISigner, decrypt, hash, own} from '../util'
import {Nip01Signer} from './nip01'

export type Nip46Algorithm = "nip04" | "nip44"

export type Nip46Handler = {
  relays: string[]
  pubkey: string
  domain?: string
}

export type Nip46BrokerParams = {
  secret: string
  handler: Nip46Handler
  algorithm?: Nip46Algorithm
}

export type Nip46Response = {
  id: string
  error?: string
  result?: string
}

type Request = {
  method: string
  params: string[]
  resolve: (result: string) => void
}

let singleton: Nip46Broker

export class Nip46Broker extends Emitter {
  #signer: ISigner
  #handler: Nip46Handler
  #algorithm: Nip46Algorithm
  #closed = false
  #processing = false
  #connectResult?: string
  #queue: Request[] = []
  #sub?: Subscription

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
        filters: [{since: now() - 30, kinds: [NOSTR_CONNECT], "#p": [pubkey]}],
      })

      this.#sub.emitter.on('send', resolve)

      this.#sub.emitter.on("event", async (url: string, e: TrustedEvent) => {
        const json = await decrypt(this.#signer, e.pubkey, e.content)
        const res = await tryCatch(() => JSON.parse(json))

        if (!res.id) {
          console.error(`Invalid nostr-connect response: ${json}`)
        }

        if (res.result === "auth_url") {
          this.emit(`auth-${res.id}`, res)
        } else {
          this.emit(`res-${res.id}`, res)
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

        // Throttle requests to the signer so the user isn't overwhelmed by dialogs, but time
        // out and move on to other requests if they're ignored
        // Note: currenlty throttle is too low to help with dialogs, but blocking prevents
        // important user actions
        await Promise.race([
          this.request(method, params).then(resolve),
          sleep(100),
        ])
      }
    } finally {
      this.#processing = false
    }
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

    publish({
      relays: this.#handler.relays,
      event: await this.#signer.sign(template),
    })

    this.once(`auth-${id}`, res => {
      window.open(res.error, "Coracle", "width=600,height=800,popup=yes")
    })

    return new Promise<string>((resolve, reject) => {
      this.once(`res-${id}`, ({result, error}: Nip46Response) => {
        if (error) {
          reject(error as string)
        } else {
          resolve(result as string)
        }
      })
    })
  }

  enqueue = (method: string, params: string[]) =>
    new Promise<string>(resolve => {
      this.#queue.push({method, params, resolve})
      this.#processQueue()
    })

  createAccount = (username: string, perms = "") => {
    if (!this.#handler.domain) {
      throw new Error("Unable to create an account without a handler domain")
    }

    return this.enqueue("create_account", [username, this.#handler.domain, "", perms])
  }

  connect = async (token = "", perms = "") => {
    if (!this.#connectResult) {
      const params = ["", token, perms]

      this.#connectResult = await this.enqueue("connect", params)
    }

    return this.#connectResult === "ack"
  }

  getPublicKey = () => this.enqueue("get_public_key", [])

  signEvent = async (event: StampedEvent) => {
    return JSON.parse(await this.enqueue("sign_event", [JSON.stringify(event)]) as string)
  }

  nip04Encrypt = (pk: string, message: string) => {
    return this.enqueue("nip04_encrypt", [pk, message])
  }

  nip04Decrypt = (pk: string, message: string) => {
    return this.enqueue("nip04_decrypt", [pk, message])
  }

  nip44Encrypt = (pk: string, message: string) => {
    return this.enqueue("nip44_encrypt", [pk, message])
  }

  nip44Decrypt = (pk: string, message: string) => {
    return this.enqueue("nip44_decrypt", [pk, message])
  }

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
