import {
  isHashedEvent,
  SignedEvent,
  HashedEvent,
  StampedEvent,
  WRAP,
  SEAL,
  prep,
  hash,
} from "@welshman/util"
import {decrypt, ISigner} from "./util.js"
import {Nip01Signer} from "./signers/nip01.js"

export const now = (drift = 0) =>
  Math.round(Date.now() / 1000 - Math.random() * Math.pow(10, drift))

export const getSeal = async (signer: ISigner, pubkey: string, rumor: HashedEvent) =>
  signer.sign(
    hash({
      kind: SEAL,
      pubkey: await signer.getPubkey(),
      content: await signer.nip44.encrypt(pubkey, JSON.stringify(rumor)),
      created_at: now(5),
      tags: [],
    }),
  )

export const getWrap = async (
  wrapper: ISigner,
  pubkey: string,
  seal: SignedEvent,
  tags: string[][],
) =>
  wrapper.sign(
    hash({
      kind: WRAP,
      pubkey: await wrapper.getPubkey(),
      content: await wrapper.nip44.encrypt(pubkey, JSON.stringify(seal)),
      created_at: now(5),
      tags: [...tags, ["p", pubkey]],
    }),
  )

export const wrap = async (
  signer: ISigner,
  wrapper: ISigner,
  pubkey: string,
  template: StampedEvent,
  tags: string[][] = [],
) => {
  const author = await signer.getPubkey()
  const rumor = await prep(template, author)
  const seal = await getSeal(signer, pubkey, rumor)
  const wrap = await getWrap(wrapper, pubkey, seal, tags)

  return wrap
}

export const unwrap = async (signer: ISigner, wrap: SignedEvent): Promise<HashedEvent> => {
  const seal = JSON.parse(await decrypt(signer, wrap.pubkey, wrap.content))
  const rumor = JSON.parse(await decrypt(signer, seal.pubkey, seal.content))

  if (seal.pubkey !== rumor.pubkey) throw new Error("Seal pubkey does not match rumor pubkey")
  if (!isHashedEvent(rumor)) throw new Error("Unwrapped object was not a hashed event")

  return rumor
}

export class Nip59 {
  private cache = new Map<string, HashedEvent | Error>()

  constructor(
    private signer: ISigner,
    private wrapper?: ISigner,
  ) {}

  static fromSigner = (signer: ISigner) => new Nip59(signer)

  static fromSecret = (secret: string) => new Nip59(new Nip01Signer(secret))

  withWrapper = (wrapper: ISigner) => new Nip59(this.signer, wrapper)

  wrap = (pubkey: string, template: StampedEvent, tags: string[][] = []) =>
    wrap(this.signer, this.wrapper || Nip01Signer.ephemeral(), pubkey, template, tags)

  unwrap = async (event: SignedEvent): Promise<HashedEvent> => {
    const cached = this.cache.get(event.id)

    if (cached) {
      if (cached instanceof Error) {
        throw cached
      }

      return cached
    }

    try {
      const rumor = await unwrap(this.signer, event)

      this.cache.set(event.id, rumor)

      return rumor
    } catch (error) {
      this.cache.set(event.id, error as Error)

      throw error
    }
  }
}
