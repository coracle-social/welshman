import {nthEq} from "@welshman/lib"
import {MUTES} from "@welshman/util"
import {MuteList, MuteListReader, MuteListBuilder} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {IApp} from "../app.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {User} from "../user.js"

/**
 * Kind-10000 mute lists, keyed by pubkey.
 */
export class MuteLists extends DerivedPlugin<MuteListReader> {
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
    const builder = MuteList.builder(await this.forceLoad(user.pubkey))

    fn(builder)

    return this.app.use(Router).commandFromBuilder(builder)
  }

  mutePublicly = (tag: string[]) => this.update(builder => builder.addPublic(tag))

  mutePrivately = (tag: string[]) => this.update(builder => builder.addPrivate(tag))

  unmute = (value: string) => this.update(builder => builder.dropTags(nthEq(1, value)))

  setMutes = (updates: {publicTags?: string[][]; privateTags?: string[][]}) =>
    this.update(builder => {
      if (updates.publicTags) builder.dropPublic(() => true).addPublic(...updates.publicTags)
      if (updates.privateTags) builder.dropPrivate(() => true).addPrivate(...updates.privateTags)
    })
}
