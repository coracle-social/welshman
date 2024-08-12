import {nip04, finalizeEvent, getPublicKey} from "nostr-tools"
import {hexToBytes} from '@noble/hashes/utils'
import {Emitter, tryCatch, randomId, sleep, equals, now} from "@welshman/lib"
import {createEvent, TrustedEvent, EventTemplate, NOSTR_CONNECT} from "@welshman/util"
import {subscribe, publish, Subscription} from "@welshman/net"
import {ISigner, decrypt} from '../util'
import {Nip01Signer} from './nip01'

export type Nip46Handler = {
  relays: string[]
  pubkey?: string
  domain?: string
}

export type Nip46Response = {
  id: string
  error?: string
  result?: string
}

let singleton: Nip46Broker

// FIXME set the full list of requested perms
const Perms =
  "nip04_encrypt,nip04_decrypt,sign_event:0,sign_event:1,sign_event:4,sign_event:6,sign_event:7"

export class Nip46Broker extends Emitter {
  #sub: Subscription
  #signer: ISigner
  #ready = sleep(500)
  #closed = false
  #connectResult: any

  static get(pubkey: string, secret: string, handler: Nip46Handler) {
    if (
      singleton?.pubkey !== pubkey ||
      singleton?.secret !== secret ||
      !equals(singleton?.handler, handler)
    ) {
      singleton?.teardown()
      singleton = new Nip46Broker(pubkey, secret, handler)
    }

    return singleton
  }

  constructor(
    readonly pubkey: string,
    readonly secret: string,
    readonly handler: Nip46Handler,
  ) {
    super()

    this.#signer = new Nip01Signer(secret)
    this.#sub = this.subscribe()
  }

  subscribe = () => {
    const sub = subscribe({
      relays: this.handler.relays,
      filters: [
        {
          since: now() - 30,
          kinds: [NOSTR_CONNECT],
          "#p": [getPublicKey(hexToBytes(this.secret))],
        },
      ],
    })

    sub.emitter.on("event", async (url: string, e: TrustedEvent) => {
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

    sub.emitter.on("complete", () => {
      if (!this.#closed) {
        this.#sub = this.subscribe()
      }
    })

    return sub
  }

  request = async (method: string, params: string[], admin = false) => {
    // nsecbunker has a race condition
    await this.#ready

    const id = randomId()
    const pubkey = admin ? this.handler.pubkey! : this.pubkey
    const payload = JSON.stringify({id, method, params})
    const content = await nip04.encrypt(this.secret, pubkey, payload)
    const template = createEvent(NOSTR_CONNECT, {content, tags: [["p", pubkey]]})
    const event = finalizeEvent(template, this.secret as any)

    publish({event, relays: this.handler.relays})

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

  createAccount = (username: string) => {
    if (!this.handler.domain) {
      throw new Error("Unable to create an account without a handler domain")
    }

    return this.request("create_account", [username, this.handler.domain, "", Perms], true)
  }

  connect = async (token = "") => {
    if (!this.#connectResult) {
      const params = [this.pubkey, token, Perms]

      this.#connectResult = await this.request("connect", params)
    }

    return this.#connectResult === "ack"
  }

  signEvent = async (event: EventTemplate) => {
    return JSON.parse(await this.request("sign_event", [JSON.stringify(event)]) as string)
  }

  nip04Encrypt = (pk: string, message: string) => {
    return this.request("nip04_encrypt", [pk, message])
  }

  nip04Decrypt = (pk: string, message: string) => {
    return this.request("nip04_decrypt", [pk, message])
  }

  nip44Encrypt = (pk: string, message: string) => {
    return this.request("nip44_encrypt", [pk, message])
  }

  nip44Decrypt = (pk: string, message: string) => {
    return this.request("nip44_decrypt", [pk, message])
  }

  teardown = () => {
    this.#closed = true
    this.#sub?.close()
  }
}

export class Nip46Signer implements ISigner {
  constructor(private broker: Nip46Broker) {}

  getPubkey = async () => this.broker.pubkey

  sign = (event: EventTemplate) => this.broker.signEvent(event)

  nip04 = {
    encrypt: this.broker.nip04Encrypt,
    decrypt: this.broker.nip04Decrypt,
  }

  nip44 = {
    encrypt: this.broker.nip44Encrypt,
    decrypt: this.broker.nip44Decrypt,
  }
}
