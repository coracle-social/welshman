import {Emitter, remove, omit} from "@welshman/lib"
import {HashedEvent, SignedEvent} from "@welshman/util"
import {Tracker} from "./tracker.js"
import {LocalRelay} from "./relay.js"

export type WrapItem = Omit<HashedEvent, "content"> & {
  rumorId: string
  recipient: string
}

export type WrapReference = string[]

export type WrapManagerOptions = {
  relay: LocalRelay
  tracker: Tracker
}

export class WrapManager extends Emitter {
  _wrapIndex = new Map<string, WrapItem>()
  _rumorIndex = new Map<string, WrapReference>()
  _recipientIndex = new Map<string, WrapReference>()

  constructor(readonly options: WrapManagerOptions) {
    super()
  }

  getRumor = (id: string) => {
    const wrapItem = this._wrapIndex.get(id)

    if (wrapItem) {
      return this.options.relay.repository.getEvent(wrapItem.rumorId)
    }
  }

  // Adding/importing

  load = (wrapItems: WrapItem[]) => {
    this._wrapIndex.clear()
    this._rumorIndex.clear()
    this._recipientIndex.clear()

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

    // Send via our relay so that listeners get notified
    this.options.relay.send("EVENT", rumor)

    // Mark the rumor as having come from the wrap's urls
    this.options.tracker.copy(wrap.id, rumor.id)

    this.emit("add", wrapItem)
  }

  // Removing

  remove = (id: string) => {
    const wrapItem = this._wrapIndex.get(id)

    if (wrapItem) {
      this._remove(wrapItem)
      this.options.relay.repository.removeEvent(wrapItem.rumorId)
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
    this._addReference(this._rumorIndex, wrapItem.rumorId, wrapItem.id)
    this._addReference(this._recipientIndex, wrapItem.recipient, wrapItem.id)
  }

  _addReference = (index: Map<string, WrapReference>, key: string, wrapId: string) => {
    const reference = index.get(key)

    if (reference) {
      reference.push(wrapId)
    } else {
      index.set(key, [wrapId])
    }
  }

  _remove = (wrapItem: WrapItem) => {
    this._wrapIndex.delete(wrapItem.id)
    this._removeReference(this._rumorIndex, wrapItem.rumorId, wrapItem.id)
    this._removeReference(this._recipientIndex, wrapItem.recipient, wrapItem.id)
  }

  _removeReference = (index: Map<string, WrapReference>, key: string, wrapId: string) => {
    const reference = index.get(key)

    if (reference) {
      const wraps = remove(wrapId, reference)

      if (wraps.length > 0) {
        index.set(key, wraps)
      } else {
        index.delete(key)
      }
    }
  }
}
