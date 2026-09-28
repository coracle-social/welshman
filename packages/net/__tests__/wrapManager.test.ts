import {describe, it, vi, expect, beforeEach} from "vitest"
import {choice, range} from "@welshman/lib"
import {makeEvent, HashedEvent, SignedEvent, WRAP} from "@welshman/util"
import {Repository} from "../src/repository"
import {Tracker} from "../src/tracker"
import {WrapManager} from "../src/wrapManager"

const randomHex = () =>
  Array.from(range(0, 64))
    .map(() => choice(Array.from("0123456789abcdef")))
    .join("")

const createRumor = (): HashedEvent => ({...makeEvent(14), pubkey: randomHex(), id: randomHex()})

const createWrap = (): SignedEvent => ({
  ...makeEvent(WRAP),
  pubkey: randomHex(),
  id: randomHex(),
  sig: "fake",
})

describe("WrapManager", () => {
  let repository: Repository
  let wrapManager: WrapManager

  beforeEach(() => {
    repository = new Repository()
    wrapManager = new WrapManager({repository, tracker: new Tracker()})
  })

  it("should keep a rumor while another wrap still carries it", () => {
    const rumor = createRumor()
    const wrap1 = createWrap()
    const wrap2 = createWrap()

    wrapManager.add({recipient: randomHex(), rumor, wrap: wrap1})
    wrapManager.add({recipient: randomHex(), rumor, wrap: wrap2})
    wrapManager.remove(wrap1.id)

    expect(repository.getEvent(rumor.id)).toEqual(rumor)
    expect(wrapManager.getRumor(wrap2.id)).toEqual(rumor)

    wrapManager.remove(wrap2.id)

    expect(repository.getEvent(rumor.id)).toBeUndefined()
  })

  it("should emit clear once on clear and load once on load", () => {
    const onClear = vi.fn()
    const onLoad = vi.fn()

    wrapManager.on("clear", onClear)
    wrapManager.on("load", onLoad)
    wrapManager.clear()

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onLoad).not.toHaveBeenCalled()

    wrapManager.load([])

    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onLoad).toHaveBeenCalledTimes(1)
  })

  it("should replace its wraps on load", () => {
    const rumor = createRumor()
    const wrap = createWrap()
    const item = {...wrap, rumorId: rumor.id, recipient: randomHex()}

    wrapManager.add({recipient: randomHex(), rumor: createRumor(), wrap: createWrap()})
    wrapManager.load([item])

    expect(wrapManager.dump()).toEqual([item])
    expect(wrapManager.getWraps(rumor.id)).toEqual([item])
  })
})
