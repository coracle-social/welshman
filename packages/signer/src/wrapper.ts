import {UnwrappedEvent, SignedEvent, HashedEvent, EventTemplate, WRAP, SEAL} from '@welshman/util'
import {own, hash, decrypt, ISigner} from './util'

// Wrapper

export type WrapperParams = {
  author?: string
  wrap?: {
    author: string
    recipient: string
    tags?: string[][]
  }
}

export class Wrapper {
  seen = new Map<string, UnwrappedEvent | Error>()

  constructor(readonly userSigner: ISigner, readonly wrapSigner: ISigner) {}

  now = (drift = 0) =>
    Math.round(Date.now() / 1000 - Math.random() * Math.pow(10, drift))

  getSeal = async (pk: string, rumor: HashedEvent) =>
    this.userSigner.sign(hash({
      kind: SEAL,
      pubkey: await this.userSigner.getPubkey(),
      content: await this.userSigner.nip44.encrypt(pk, JSON.stringify(rumor)),
      created_at: this.now(5),
      tags: [],
    }))

  getWrap = async (pk: string, seal: SignedEvent) =>
    this.wrapSigner.sign(hash({
      kind: WRAP,
      pubkey: await this.wrapSigner.getPubkey(),
      content: await this.wrapSigner.nip44.encrypt(pk, JSON.stringify(seal)),
      created_at: this.now(5),
      tags: [["p", pk]],
    }))

  wrap = async (pk: string, template: EventTemplate) => {
    const pubkey = await this.userSigner.getPubkey()
    const rumor = hash(own(pubkey, template))
    const seal = await this.getSeal(pk, rumor)
    const wrap = await this.getWrap(pk, seal)

    return wrap
  }

  unwrap = async (wrap: SignedEvent) => {
    // Avoid decrypting the same event multiple times
    if (this.seen.has(wrap.id)) {
      const rumorOrError = this.seen.get(wrap.id)

      if (rumorOrError instanceof Error) {
        throw rumorOrError
      } else {
        return rumorOrError
      }
    }

    try {
      const seal = JSON.parse(await decrypt(this.wrapSigner, wrap.pubkey, wrap.content))
      const rumor = JSON.parse(await decrypt(this.wrapSigner, seal.pubkey, seal.content))

      if (seal.pubkey !== rumor.pubkey) throw new Error("Seal pubkey does not match rumor pubkey")

      this.seen.set(wrap.id, rumor)

      return rumor
    } catch (error) {
      this.seen.set(wrap.id, error as Error)

      throw error
    }
  }
}
