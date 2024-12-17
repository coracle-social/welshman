import {UnwrappedEvent, SignedEvent, HashedEvent, StampedEvent, WRAP, SEAL} from "@welshman/util"
import {own, hash, decrypt, ISigner} from "./util.js"
import {Nip01Signer} from "./signers/nip01.js"

export const seen = new Map<string, UnwrappedEvent | Error>()

export const now = (drift = 0) =>
  Math.round(Date.now() / 1000 - Math.random() * Math.pow(10, drift))

export const getRumor = async (signer: ISigner, template: StampedEvent) =>
  hash(own(template, await signer.getPubkey()))

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
  const rumor = await getRumor(signer, template)
  const seal = await getSeal(signer, pubkey, rumor)
  const wrap = await getWrap(wrapper, pubkey, seal, tags)

  return Object.assign(rumor, {wrap}) as UnwrappedEvent
}

export const unwrap = async (signer: ISigner, wrap: SignedEvent) => {
  // Avoid decrypting the same event multiple times
  if (seen.has(wrap.id)) {
    const rumorOrError = seen.get(wrap.id)

    if (rumorOrError instanceof Error) {
      throw rumorOrError
    } else {
      return rumorOrError
    }
  }

  try {
    const seal = JSON.parse(await decrypt(signer, wrap.pubkey, wrap.content))
    const rumor = JSON.parse(await decrypt(signer, seal.pubkey, seal.content))

    if (seal.pubkey !== rumor.pubkey) throw new Error("Seal pubkey does not match rumor pubkey")

    seen.set(wrap.id, rumor)

    return Object.assign(rumor, {wrap}) as UnwrappedEvent
  } catch (error) {
    seen.set(wrap.id, error as Error)

    throw error
  }
}

// This is a utility that makes it harder to re-use wrapper signers, since that can result in
// leaked metadata. It simultaneously makes it easier to wrap stuff, because it allows for
// wrapping a single user signer and omit the wrapper signer argument to wrap, while still
// making it possible to pass a wrapper signer if desired.
export class Nip59 {
  constructor(
    private signer: ISigner,
    private wrapper?: ISigner,
  ) {}

  static fromSigner = (signer: ISigner) => new Nip59(signer)

  static fromSecret = (secret: string) => new Nip59(new Nip01Signer(secret))

  withWrapper = (wrapper: ISigner) => new Nip59(this.signer, wrapper)

  wrap = (pubkey: string, template: StampedEvent, tags: string[][] = []) =>
    wrap(this.signer, this.wrapper || Nip01Signer.ephemeral(), pubkey, template, tags)

  unwrap = (event: SignedEvent) => unwrap(this.signer, event)
}
