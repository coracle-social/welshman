import {readable, derived} from "svelte/store"
import type {Readable} from "svelte/store"
import {on} from "@welshman/lib"
import {tagValues, topicTags} from "@welshman/util"
import type {RepositoryUpdate} from "@welshman/net"
import {deriveItems} from "@welshman/store"
import {projection, createSearch} from "./base.js"
import type {Projection, Search} from "./base.js"
import type {IApp} from "../app.js"

export type Topic = {
  name: string
  count: number
}

/**
 * Hashtag topics with occurrence counts, derived live from the app's
 * repository tag index.
 */
export class Topics {
  byName: Projection<Map<string, Topic>>
  all: Projection<Topic[]>
  topicSearch: Readable<Search<string, Topic>>

  constructor(readonly app: IApp) {
    const topicsByName = new Map<string, Topic>()

    const addTopic = (name: string) => {
      const topic = topicsByName.get(name)

      if (topic) {
        topic.count++
      } else {
        topicsByName.set(name, {name, count: 1})
      }
    }

    for (const tagString of app.repository.eventsByTag.keys()) {
      if (tagString.startsWith("t:")) {
        addTopic(tagString.slice(2).toLowerCase())
      }
    }

    this.byName = projection(
      readable(topicsByName, set =>
        on(app.repository, "update", ({added}: RepositoryUpdate) => {
          let dirty = false

          for (const event of added) {
            for (const name of tagValues(topicTags("t"), event.tags)) {
              addTopic(name)
              dirty = true
            }
          }

          if (dirty) {
            set(topicsByName)
          }
        }),
      ),
      () => topicsByName,
    )

    this.all = projection(deriveItems(this.byName.$))

    this.topicSearch = derived(this.all.$, $topics =>
      createSearch($topics, {
        getValue: (topic: Topic) => topic.name,
        fuseOptions: {keys: ["name"]},
      }),
    )
  }
}
