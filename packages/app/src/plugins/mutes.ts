import {nthEq} from "@welshman/lib"
import {MUTES} from "@welshman/util"
import {MuteList, MuteListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {IApp} from "../app.js"
import {Network} from "./network.js"
import {Thunks} from "./thunk.js"
import {User} from "../user.js"

/**
 * Kind-10000 mute lists, keyed by pubkey.
 */
export class MuteLists extends DerivedPlugin<MuteList> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [MUTES]}],
      eventToItem: MuteList.factory(app.user?.signer),
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
