import {Emitter, remove, omit, pushToMapKey} from "@welshman/lib"
import {HashedEvent, SignedEvent} from "@welshman/util"
import {Tracker} from "./tracker.js"
import {Repository} from "./repository.js"

export type WrapItem = Omit<HashedEvent, "content"> & {
  rumorId: string
  recipient: string
}

export type WrapReference = string[]

export type WrapManagerOptions = {
  repository: Repository
  tracker: Tracker
}

export class WrapManager extends Emitter {
  _wrapIndex = new Map<string, WrapItem>()
  _rumorIndex = new Map<string, WrapReference>()

  constructor(readonly options: WrapManagerOptions) {
    super()
  }

  // Reading/exporting

  dump = () => Array.from(this._wrapIndex.values())

  getWraps = (rumorId: string) =>
    (this._rumorIndex.get(rumorId) || []).map(wrapId => this._wrapIndex.get(wrapId)!)

  getRumor = (wrapId: string) => {
    const wrapItem = this._wrapIndex.get(wrapId)

    if (wrapItem) {
      return this.options.repository.getEvent(wrapItem.rumorId)
    }
  }

  // Adding/importing

  clear = () => {
    this._wrapIndex.clear()
    this._rumorIndex.clear()
    this.emit("clear")
  }

  load = (wrapItems: WrapItem[]) => {
    this._wrapIndex.clear()
    this._rumorIndex.clear()

    for (const wrapItem of wrapItems) {
      this._add(wrapItem)
    }

    this.emit("load")
  }

  add = ({recipient, rumor, wrap}: {recipient: string; rumor: HashedEvent; wrap: SignedEvent}) => {
    const wrapItem = {
      ...omit(["content"], wrap),
      rumorId: rumor.id,
      recipient,
    }

    this._add(wrapItem)

    // Save to our repository
    this.options.repository.publish(rumor)

    // Mark the rumor as having come from the wrap's urls
    this.options.tracker.copy(wrap.id, rumor.id)

    this.emit("add", wrapItem)
  }

  // Removing

  remove = (id: string) => {
    const wrapItem = this._wrapIndex.get(id)

    if (wrapItem) {
      this._remove(wrapItem)

      // Another wrap may carry the same rumor
      if (!this._rumorIndex.has(wrapItem.rumorId)) {
        this.options.repository.removeEvent(wrapItem.rumorId)
      }

      this.emit("remove", wrapItem)
    }
  }

  removeByRumorId = (rumorId: string) => {
    for (const id of this._rumorIndex.get(rumorId) || []) {
      this.remove(id)
    }
  }

  // Utils

  _add = (wrapItem: WrapItem) => {
    this._wrapIndex.set(wrapItem.id, wrapItem)
    pushToMapKey(this._rumorIndex, wrapItem.rumorId, wrapItem.id)
  }

  _remove = (wrapItem: WrapItem) => {
    const wrapIds = remove(wrapItem.id, this._rumorIndex.get(wrapItem.rumorId) || [])

    this._wrapIndex.delete(wrapItem.id)

    if (wrapIds.length > 0) {
      this._rumorIndex.set(wrapItem.rumorId, wrapIds)
    } else {
      this._rumorIndex.delete(wrapItem.rumorId)
    }
  }
}
