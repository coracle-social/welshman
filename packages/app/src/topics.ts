import {readable} from "svelte/store"
import {on, call} from "@welshman/lib"
import {deriveItems} from "@welshman/store"
import {getTopicTagValues} from "@welshman/util"
import {repository} from "./core.js"

export type Topic = {
  name: string
  count: number
}

export const topicsByName = call(() => {
  const topicsByName = new Map<string, Topic>()

  const addTopic = (name: string) => {
    const topic = topicsByName.get(name)

    if (topic) {
      topic.count++
    } else {
      topicsByName.set(name, {name, count: 0})
    }
  }

  for (const tagString of repository.eventsByTag.keys()) {
    if (tagString.startsWith("t:")) {
      addTopic(tagString.slice(2).toLowerCase())
    }
  }

  return readable<Map<string, Topic>>(topicsByName, set => {
    return on(repository, "update", ({added}) => {
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
    })
  })
})

export const topics = deriveItems(topicsByName)
