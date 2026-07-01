import {uniq} from "@welshman/lib"
import {Address, PINBOARD, PIN} from "@welshman/util"
import {Pinboard, PinboardBuilder, Pin, PinBuilder} from "@welshman/domain"
import {DerivedPlugin, projectFrom} from "./base.js"
import type {Projection} from "./base.js"
import {Network} from "./network.js"
import {Router} from "./router.js"
import {Thunks} from "./thunk.js"
import {User} from "../user.js"
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
export class Pinboards extends DerivedPlugin<Pinboard> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [PINBOARD]}],
      eventToItem: Pinboard.factory(app.user?.signer),
      getKey: board => board.address(),
    })
  }

  fetch(address: string, relayHints: string[] = []) {
    const {pubkey, identifier} = Address.from(address)

    return this.app
      .use(Network)
      .loadUsingOutbox(pubkey, {kinds: [PINBOARD], "#d": [identifier]}, relayHints)
  }

  forAuthor = (pubkey: string): Projection<Pinboard[]> =>
    projectFrom(this.all, boards => boards.filter(board => board.author() === pubkey))

  loadForAuthor = (pubkey: string, relayHints: string[] = []) =>
    this.app.use(Network).loadAllUsingOutbox(pubkey, {kinds: [PINBOARD]}, relayHints)

  create = async (fields: PinboardFields) => {
    const user = User.require(this.app)
    const builder = new PinboardBuilder().setIdentifier().setTitle(fields.title)

    if (fields.description) builder.setDescription(fields.description)
    if (fields.image) builder.setImage(fields.image)
    if (fields.topics) builder.setTopics(fields.topics)
    if (fields.collaborative) builder.setCollaborative(fields.collaborative)

    const event = await builder.toTemplate(user.signer)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  update = async (address: string, fn: (builder: PinboardBuilder) => void) => {
    const board = await this.forceLoad(address)

    if (!board) throw new Error(`Unknown pinboard ${address}`)

    const builder = new PinboardBuilder(board)

    fn(builder)

    const user = User.require(this.app)
    const event = await builder.toTemplate(user.signer)

    return this.app.use(Thunks).publishToOutbox({event})
  }
}

/**
 * Pinboards-NIP kind-39067 pins, keyed by address. A pin belongs to zero
 * or more boards via `A` tags; one with none is a profile pin.
 */
export class Pins extends DerivedPlugin<Pin> {
  constructor(app: IApp) {
    super(app, {
      filters: [{kinds: [PIN]}],
      eventToItem: Pin.factory(app.user?.signer),
      getKey: pin => pin.address(),
    })
  }

  fetch(address: string, relayHints: string[] = []) {
    const {pubkey, identifier} = Address.from(address)

    return this.app
      .use(Network)
      .loadUsingOutbox(pubkey, {kinds: [PIN], "#d": [identifier]}, relayHints)
  }

  forBoard = (address: string): Projection<Pin[]> =>
    projectFrom(this.all, pins => pins.filter(pin => pin.boards().includes(address)))

  forProfile = (pubkey: string): Projection<Pin[]> =>
    projectFrom(this.all, pins => pins.filter(pin => pin.isProfilePin() && pin.author() === pubkey))

  // Pins on a board can come from any author (boards may be collaborative), so
  // look for them where the board owner would see mentions: their read relays.
  loadForBoard = async (address: string, relayHints: string[] = []) => {
    const {pubkey} = Address.from(address)
    const relays = this.app.use(Router).ForPubkey(pubkey).getUrls()

    return this.app.use(Network).load({
      filters: [{kinds: [PIN], "#A": [address]}],
      relays: uniq([...relayHints, ...relays]),
    })
  }

  loadForProfile = (pubkey: string, relayHints: string[] = []) =>
    this.app.use(Network).loadAllUsingOutbox(pubkey, {kinds: [PIN]}, relayHints)

  create = async (builder: PinBuilder) => {
    const user = User.require(this.app)
    const event = await builder.toTemplate(user.signer)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  update = async (address: string, fn: (builder: PinBuilder) => void) => {
    const pin = await this.forceLoad(address)

    if (!pin) throw new Error(`Unknown pin ${address}`)

    const builder = new PinBuilder(pin)

    fn(builder)

    const user = User.require(this.app)
    const event = await builder.toTemplate(user.signer)

    return this.app.use(Thunks).publishToOutbox({event})
  }

  addToBoard = (address: string, board: string) =>
    this.update(address, builder => builder.addBoard(board))

  removeFromBoard = (address: string, board: string) =>
    this.update(address, builder => builder.removeBoard(board))
}
