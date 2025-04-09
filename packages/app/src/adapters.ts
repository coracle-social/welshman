import {derived} from "svelte/store"
import {batch, fromPairs} from "@welshman/lib"
import {
  PROFILE,
  FOLLOWS,
  MUTES,
  RELAYS,
  INBOX_RELAYS,
  getPubkeyTagValues,
  getListTags,
} from "@welshman/util"
import {throttled, withGetter} from "@welshman/store"
import {RepositoryUpdate} from "@welshman/relay"
import {getAll, bulkPut, bulkDelete} from "./storage.js"
import {relays} from "./relays.js"
import {handles, onHandle} from "./handles.js"
import {zappers, onZapper} from "./zappers.js"
import {plaintext} from "./plaintext.js"
import {freshness} from "./freshness.js"
import {repository} from "./core.js"
import {sessions} from "./session.js"
import {userFollows} from "./user.js"

export const defaultStorageAdapters = {
  relays: {
    keyPath: "url",
    init: async () => relays.set(await getAll("relays")),
    sync: () => throttled(3000, relays).subscribe($relays => bulkPut("relays", $relays)),
  },
  handles: {
    keyPath: "nip05",
    init: async () => handles.set(await getAll("handles")),
    sync: () => onHandle(batch(300, $handles => bulkPut("handles", $handles))),
  },
  zappers: {
    keyPath: "lnurl",
    init: async () => zappers.set(await getAll("zappers")),
    sync: () => onZapper(batch(300, $zappers => bulkPut("zappers", $zappers))),
  },
  freshness: {
    keyPath: "key",
    init: async () => {
      const items = await getAll("freshness")

      freshness.set(fromPairs(items.map(item => [item.key, item.value])))
    },
    sync: () => {
      const interval = setInterval(() => {
        bulkPut(
          "freshness",
          Object.entries(freshness.get()).map(([key, value]) => ({key, value})),
        )
      }, 10_000)

      return () => clearInterval(interval)
    },
  },
  plaintext: {
    keyPath: "key",
    init: async () => {
      const items = await getAll("plaintext")

      plaintext.set(fromPairs(items.map(item => [item.key, item.value])))
    },
    sync: () => {
      const interval = setInterval(() => {
        bulkPut(
          "plaintext",
          Object.entries(plaintext.get()).map(([key, value]) => ({key, value})),
        )
      }, 10_000)

      return () => clearInterval(interval)
    },
  },
  events: {
    keyPath: "id",
    init: async () => repository.load(await getAll("events")),
    sync: () => {
      const userFollowPubkeys = withGetter(
        derived(userFollows, l => new Set(getPubkeyTagValues(getListTags(l)))),
      )

      const onUpdate = async ({added, removed}: RepositoryUpdate) => {
        const sessionKeys = new Set(Object.keys(sessions.get()))
        const metaKinds = [PROFILE, FOLLOWS, MUTES, RELAYS, INBOX_RELAYS]

        if (removed.size > 0) {
          await bulkDelete("events", Array.from(removed))
        }

        if (added.length > 0) {
          await bulkPut(
            "events",
            added.filter(e => {
              if (sessionKeys.has(e.pubkey)) return true
              if (e.tags.some(t => sessionKeys.has(t[1]))) return true
              if (metaKinds.includes(e.kind) && userFollowPubkeys.get()?.has(e.pubkey)) return true

              return false
            }),
          )
        }
      }

      repository.on("update", onUpdate)

      return () => repository.off("update", onUpdate)
    },
  },
}
