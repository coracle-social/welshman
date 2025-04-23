import {throttle} from "@welshman/lib"
import {Repository, LocalRelay} from "@welshman/relay"
import {custom} from "@welshman/store"
import {Tracker} from "@welshman/net"

export const repository = Repository.get()

export const relay = new LocalRelay(repository)

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
