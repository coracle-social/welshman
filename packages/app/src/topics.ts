import {throttle} from 'throttle-debounce'
import {derived} from 'svelte/store'
import {inc} from '@welshman/lib'
import {custom} from '@welshman/store'
import {createSearch} from './util'
import {repository} from './core'

export type Topic = {
  name: string
  count: number
}

export const topics = custom<Topic[]>(setter => {
  const getTopics = () => {
    const topics = new Map<string, number>()
    for (const tagString of repository.eventsByTag.keys()) {
      if (tagString.startsWith("t:")) {
        const topic = tagString.slice(2).toLowerCase()

        topics.set(topic, inc(topics.get(topic)))
      }
    }

    return Array.from(topics.entries()).map(([name, count]) => ({name, count}))
  }

  setter(getTopics())

  const onUpdate = throttle(3000, () => setter(getTopics()))

  repository.on("update", onUpdate)

  return () => repository.off("update", onUpdate)
})

export const topicSearch = derived(topics, $topics =>
  createSearch($topics, {
    getValue: (topic: Topic) => topic.name,
    fuseOptions: {keys: ["name"]},
  }),
)
