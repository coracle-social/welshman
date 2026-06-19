import {nthEq} from "@welshman/lib"
import {MUTES} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import type {ISigner} from "@welshman/signer"
import {MuteList, MuteListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {IApp} from "../app.js"
import {Network} from "./network.js"
import {Thunks} from "./thunk.js"
import {Plaintext} from "./plaintext.js"
import {User} from "../user.js"

/**
 * A signer that decrypts via the app's plaintext cache (keyed by event), falling
 * back to the real signer. Lets `MuteList.fromEvent(event, signer)` reuse cached
 * decryptions instead of re-decrypting. Returns undefined when there's no user,
 * so the reader falls back to public-only.
 */
const makeCachedSigner = (app: IApp, event: TrustedEvent): ISigner | undefined => {
  const user = app.user

  if (!user) return undefined

  const {signer} = user
  const decryptVia =
    (fallback: (pubkey: string, message: string) => Promise<string>) =>
    async (pubkey: string, message: string) =>
      (await app.use(Plaintext).ensure(event)) ?? fallback(pubkey, message)

  return {
    sign: (event, options) => signer.sign(event, options),
    getPubkey: () => signer.getPubkey(),
    nip04: {
      encrypt: (pubkey, message) => signer.nip04.encrypt(pubkey, message),
      decrypt: decryptVia((pubkey, message) => signer.nip04.decrypt(pubkey, message)),
    },
    nip44: {
      encrypt: (pubkey, message) => signer.nip44.encrypt(pubkey, message),
      decrypt: decryptVia((pubkey, message) => signer.nip44.decrypt(pubkey, message)),
    },
  }
}

/**
 * Kind-10000 mute lists, keyed by pubkey. Mute lists carry private entries in
 * encrypted content, decoded through the plaintext cache (via a cache-backed
 * signer passed to the reader).
 */
export class MuteLists extends DerivedPlugin<MuteList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [MUTES]}],
      eventToItem: event => MuteList.fromEvent(event, makeCachedSigner(app, event)),
      getKey: mute => mute.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [MUTES]}, relayHints)
  }

  update = async (fn: (builder: MuteListBuilder) => void) => {
    const user = User.require(this.app)
    const builder = new MuteListBuilder(await this.forceLoad(user.pubkey))

    fn(builder)

    const event = await builder.toTemplate(user.signer)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  mutePublicly = (tag: string[]) => this.update(builder => builder.addPublic(tag))

  mutePrivately = (tag: string[]) => this.update(builder => builder.addPrivate(tag))

  unmute = (value: string) => this.update(builder => builder.drop(nthEq(1, value)))

  setMutes = (updates: {publicTags?: string[][]; privateTags?: string[][]}) =>
    this.update(builder => {
      if (updates.publicTags) builder.clearPublic().addPublic(...updates.publicTags)
      if (updates.privateTags) builder.clearPrivate().addPrivate(...updates.privateTags)
    })
}
