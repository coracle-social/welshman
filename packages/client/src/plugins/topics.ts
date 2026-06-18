import {readable} from "svelte/store"
import type {Readable} from "svelte/store"
import {on} from "@welshman/lib"
import {getTopicTagValues} from "@welshman/util"
import type {RepositoryUpdate} from "@welshman/net"
import {deriveItems} from "@welshman/store"
import type {IClient} from "../client.js"

export type Topic = {
  name: string
  count: number
}

/**
 * Hashtag topics with occurrence counts, derived live from the client's
 * repository tag index.
 */
export class Topics {
  byName: Readable<Map<string, Topic>>
  all: Readable<Topic[]>

  constructor(readonly ctx: IClient) {
    const topicsByName = new Map<string, Topic>()

    const addTopic = (name: string) => {
      const topic = topicsByName.get(name)

      if (topic) {
        topic.count++
      } else {
        topicsByName.set(name, {name, count: 1})
      }
    }

    for (const tagString of ctx.repository.eventsByTag.keys()) {
      if (tagString.startsWith("t:")) {
        addTopic(tagString.slice(2).toLowerCase())
      }
    }

    this.byName = readable(topicsByName, set =>
      on(ctx.repository, "update", ({added}: RepositoryUpdate) => {
        let dirty = false

        for (const event of added) {
          for (const name of getTopicTagValues(event.tags)) {
            addTopic(name)
            dirty = true
          }
        }

        if (dirty) {
          set(topicsByName)
        }
      }),
    )

    this.all = deriveItems(this.byName)
  }
}
