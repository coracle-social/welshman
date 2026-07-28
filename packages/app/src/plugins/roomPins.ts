import {ROOM_PINS} from "@welshman/util"
import {RoomPins, RoomPinsReader, RoomUpdatePins} from "@welshman/domain"
import {projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Domain} from "./domain.js"
import {Network} from "./network.js"
import {RelaySignedDerivedPlugin} from "./relays.js"
import {makeRoomKey, splitRoomKey} from "./rooms.js"
import type {IApp} from "../app.js"

/**
 * NIP-29 kind-39005 room pin lists, keyed by `${url}'${h}` like the rest of a room's state.
 * The relay authors the list, so only its own signature counts; clients ask for a change with
 * a kind-9010 op and the relay republishes the list.
 */
export class RoomPinLists extends RelaySignedDerivedPlugin<RoomPinsReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [ROOM_PINS]}],
      eventToItem: app.use(Domain).reader(RoomPins),
      getKey: (pins, url) => makeRoomKey(url, pins.identifier() ?? ""),
    })
  }

  fetch(key: string, signal?: AbortSignal) {
    const [url, h] = splitRoomKey(key)

    return this.app
      .use(Network)
      .load({relays: [url], signal, filters: [{kinds: [ROOM_PINS], "#d": [h]}]})
  }

  forRoom = (url: string, h: string) => this.one(makeRoomKey(url, h))

  loadForRoom = (url: string, h: string, signal?: AbortSignal) =>
    this.forceLoad(makeRoomKey(url, h), signal)

  pins = (url: string, h: string): Projection<string[]> =>
    projectFrom(this.index, byKey => byKey.get(makeRoomKey(url, h))?.pins() ?? [])

  setPins = (url: string, h: string, idsOrAddresses: string[]) =>
    this.app
      .use(Domain)
      .command(this.app.use(Domain).writer(RoomUpdatePins).setRoom(url, h).setPins(idsOrAddresses))
}
