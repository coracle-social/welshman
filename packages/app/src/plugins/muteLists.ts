import {nthEq} from "@welshman/lib"
import {MUTES} from "@welshman/util"
import {MuteList, MuteListReader, MuteListWriter} from "@welshman/domain"
import {DerivedPlugin} from "./base.js"
import type {IApp} from "../app.js"
import {Network} from "./network.js"
import {Domain} from "./domain.js"
import {User} from "../user.js"

/**
 * Kind-10000 mute lists, keyed by pubkey.
 */
export class MuteLists extends DerivedPlugin<MuteListReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [MUTES]}],
      eventToItem: app.use(Domain).reader(MuteList),
      getKey: mute => mute.author(),
    })
  }

  fetch(pubkey: string, relayHints: string[] = []) {
    return this.app.use(Network).loadUsingOutbox(pubkey, {kinds: [MUTES]}, relayHints)
  }

  update = async (fn: (writer: MuteListWriter) => void) => {
    const user = User.require(this.app)
    const writer = this.app.use(Domain).writer(MuteList, await this.forceLoad(user.pubkey))

    fn(writer)

    return this.app.use(Domain).command(writer)
  }

  mutePublicly = (tag: string[]) => this.update(writer => writer.addPublic(tag))

  mutePrivately = (tag: string[]) => this.update(writer => writer.addPrivate(tag))

  unmute = (value: string) => this.update(writer => writer.dropTags(nthEq(1, value)))

  setMutes = (updates: {publicTags?: string[][]; privateTags?: string[][]}) =>
    this.update(writer => {
      if (updates.publicTags) writer.dropPublic(() => true).addPublic(...updates.publicTags)
      if (updates.privateTags) writer.dropPrivate(() => true).addPrivate(...updates.privateTags)
    })
}
