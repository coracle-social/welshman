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
import {isPojo, tryCatch} from "@welshman/lib"
import {decrypt, ISigner, SignerOptions} from "./util.js"
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

/**
 * A decision about the wrap itself rather than a failure to reach the signer. The wrap will
 * read the same way every time it is tried, so a caller is free to remember the verdict;
 * anything the signer throws is about the signer and may answer next time.
 */
export class InvalidWrapError extends Error {}

const parseWrapped = (json: string) => {
  const value = tryCatch(() => JSON.parse(json))

  if (!isPojo(value)) throw new InvalidWrapError("Decrypted content was not a JSON object")

  return value
}

export const unwrap = async (
  signer: ISigner,
  wrap: SignedEvent,
  options?: SignerOptions,
): Promise<HashedEvent> => {
  const seal = parseWrapped(await decrypt(signer, wrap.pubkey, wrap.content, options))
  const rumor = parseWrapped(await decrypt(signer, seal.pubkey, seal.content, options))

  if (seal.pubkey !== rumor.pubkey) {
    throw new InvalidWrapError("Seal pubkey does not match rumor pubkey")
  }

  if (!isHashedEvent(rumor)) {
    throw new InvalidWrapError("Unwrapped object was not a hashed event")
  }

  return rumor
}

export class Nip59 {
  private cache = new Map<string, HashedEvent | InvalidWrapError>()

  constructor(
    private signer: ISigner,
    private wrapper?: ISigner,
  ) {}

  static fromSigner = (signer: ISigner) => new Nip59(signer)

  static fromSecret = (secret: string) => new Nip59(new Nip01Signer(secret))

  withWrapper = (wrapper: ISigner) => new Nip59(this.signer, wrapper)

  wrap = (pubkey: string, template: StampedEvent, tags: string[][] = []) =>
    wrap(this.signer, this.wrapper || Nip01Signer.ephemeral(), pubkey, template, tags)

  unwrap = async (event: SignedEvent, options?: SignerOptions): Promise<HashedEvent> => {
    const cached = this.cache.get(event.id)

    if (cached) {
      if (cached instanceof Error) {
        throw cached
      }

      return cached
    }

    try {
      const rumor = await unwrap(this.signer, event, options)

      this.cache.set(event.id, rumor)

      return rumor
    } catch (error) {
      if (error instanceof InvalidWrapError) {
        this.cache.set(event.id, error)
      }

      throw error
    }
  }
}
