import {throttle} from "@welshman/lib"
import {Repository, Relay} from "@welshman/util"
import type {TrustedEvent} from "@welshman/util"
import {Tracker} from "@welshman/net"
import {custom} from "@welshman/store"

export const repository = new Repository<TrustedEvent>()

export const relay = new Relay(repository)

export const tracker = new Tracker()

// Adapt above objects to stores

export const makeRepositoryStore = ({throttle: t = 300}: {throttle?: number} = {}) =>
  custom(
    setter => {
      let onUpdate = () => setter(repository)

      if (t) {
        onUpdate = throttle(t, onUpdate)
      }

      onUpdate()
      repository.on("update", onUpdate)

      return () => repository.off("update", onUpdate)
    },
    {
      set: (other: Repository) => repository.load(other.dump()),
    },
  )

export const makeTrackerStore = ({throttle: t = 300}: {throttle?: number} = {}) =>
  custom(
    setter => {
      let onUpdate = () => setter(tracker)

      if (t) {
        onUpdate = throttle(t, onUpdate)
      }

      onUpdate()
      tracker.on("update", onUpdate)

      return () => tracker.off("update", onUpdate)
    },
    {
      set: (other: Tracker) => tracker.load(other.relaysById),
    },
  )
