import {uniq} from "@welshman/lib"
import {Address, PINBOARD, PIN, inbox} from "@welshman/util"
import {Pinboard, PinboardReader, PinboardWriter, Pin, PinReader, PinWriter} from "@welshman/domain"
import {DerivedPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {Domain} from "./domain.js"
import type {IApp} from "../app.js"

export type PinboardFields = {
  title: string
  description?: string
  image?: string
  topics?: string[]
  collaborative?: boolean
}

/**
 * Pinboards-NIP kind-30067 boards, keyed by address (many boards per author).
 */
export class Pinboards extends DerivedPlugin<PinboardReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [PINBOARD]}],
      eventToItem: app.use(Domain).reader(Pinboard),
      getKey: board => board.address(),
    })
  }

  fetch(address: string, relayHints: string[] = []) {
    const {pubkey, identifier} = Address.from(address)

    return this.app
      .use(Network)
      .loadUsingOutbox(pubkey, {kinds: [PINBOARD], "#d": [identifier]}, relayHints)
  }

  forAuthor = (pubkey: string): Projection<PinboardReader[]> =>
    projectFrom(this.all, boards => boards.filter(board => board.author() === pubkey))

  loadForAuthor = (pubkey: string, relayHints: string[] = []) =>
    this.app.use(Network).loadAllUsingOutbox(pubkey, {kinds: [PINBOARD]}, relayHints)

  create = async (fields: PinboardFields) => {
    const writer = this.app.use(Domain).writer(Pinboard).setIdentifier().setTitle(fields.title)

    if (fields.description) writer.setDescription(fields.description)
    if (fields.image) writer.setImage(fields.image)
    if (fields.topics) writer.setTopics(fields.topics)
    if (fields.collaborative) writer.setCollaborative(fields.collaborative)

    return this.app.use(Domain).command(writer)
  }

  update = async (address: string, fn: (writer: PinboardWriter) => void) => {
    const board = await this.forceLoad(address)

    if (!board) throw new Error(`Unknown pinboard ${address}`)

    const writer = this.app.use(Domain).writer(Pinboard, board)

    fn(writer)

    return this.app.use(Domain).command(writer)
  }
}

/**
 * Pinboards-NIP kind-39067 pins, keyed by address. A pin belongs to zero
 * or more boards via `A` tags; one with none is a profile pin.
 */
export class Pins extends DerivedPlugin<PinReader> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [PIN]}],
      eventToItem: app.use(Domain).reader(Pin),
      getKey: pin => pin.address(),
    })
  }

  fetch(address: string, relayHints: string[] = []) {
    const {pubkey, identifier} = Address.from(address)

    return this.app
      .use(Network)
      .loadUsingOutbox(pubkey, {kinds: [PIN], "#d": [identifier]}, relayHints)
  }

  forBoard = (address: string): Projection<PinReader[]> =>
    projectFrom(this.all, pins => pins.filter(pin => pin.boards().includes(address)))

  forProfile = (pubkey: string): Projection<PinReader[]> =>
    projectFrom(this.all, pins => pins.filter(pin => pin.isProfilePin() && pin.author() === pubkey))

  // Pins on a board can come from any author (boards may be collaborative), so
  // look for them where the board owner would see mentions: their read relays.
  loadForBoard = async (address: string, relayHints: string[] = []) => {
    const {pubkey} = Address.from(address)
    const scenario = await this.app.use(Router).resolve([inbox(pubkey)])
    const relays = scenario.getUrls()

    return this.app.use(Network).load({
      filters: [{kinds: [PIN], "#A": [address]}],
      relays: uniq([...relayHints, ...relays]),
    })
  }

  loadForProfile = (pubkey: string, relayHints: string[] = []) =>
    this.app.use(Network).loadAllUsingOutbox(pubkey, {kinds: [PIN]}, relayHints)

  create = async (writer: PinWriter) => {
    return this.app.use(Domain).command(writer)
  }

  update = async (address: string, fn: (writer: PinWriter) => void) => {
    const pin = await this.forceLoad(address)

    if (!pin) throw new Error(`Unknown pin ${address}`)

    const writer = this.app.use(Domain).writer(Pin, pin)

    fn(writer)

    return this.app.use(Domain).command(writer)
  }

  addToBoard = (address: string, board: string) =>
    this.update(address, writer => writer.addBoard(board))

  removeFromBoard = (address: string, board: string) =>
    this.update(address, writer => writer.removeBoard(board))
}
