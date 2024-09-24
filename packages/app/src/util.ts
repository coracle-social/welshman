import Fuse from "fuse.js"
import type {IFuseOptions, FuseResult} from "fuse.js"
import {sortBy} from "@welshman/lib"

export type SearchOptions<V, T> = {
  getValue: (item: T) => V
  fuseOptions?: IFuseOptions<T>
  onSearch?: (term: string) => void
  sortFn?: (items: FuseResult<T>) => any
}

export type Search<V, T> = {
  options: T[]
  getValue: (item: T) => V
  getOption: (value: V) => T | undefined
  searchOptions: (term: string) => T[]
  searchValues: (term: string) => V[]
}

export const createSearch = <V, T>(options: T[], opts: SearchOptions<V, T>): Search<V, T> => {
  const fuse = new Fuse(options, {...opts.fuseOptions, includeScore: true})
  const map = new Map<V, T>(options.map(item => [opts.getValue(item), item]))

  const search = (term: string) => {
    opts.onSearch?.(term)

    let results = term ? fuse.search(term) : options.map(item => ({item, score: 1}) as FuseResult<T>)

    if (opts.sortFn) {
      results = sortBy(opts.sortFn, results)
    }

    return results.map(result => result.item)
  }

  return {
    options,
    getValue: opts.getValue,
    getOption: (value: V) => map.get(value),
    searchOptions: (term: string) => search(term),
    searchValues: (term: string) => search(term).map(opts.getValue),
  }
}

export const secondsToDate = (ts: number) => new Date(ts * 1000)

export const dateToSeconds = (date: Date) => Math.round(date.valueOf() / 1000)

export const getTimeZone = () => new Date().toString().match(/GMT[^\s]+/)

export const createLocalDate = (dateString: any) => new Date(`${dateString} ${getTimeZone()}`)

export const getLocale = () => new Intl.DateTimeFormat().resolvedOptions().locale

export const formatTimestamp = (ts: number) => {
  const formatter = new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "short",
    timeStyle: "short",
  })

  return formatter.format(secondsToDate(ts))
}

export const formatTimestampAsDate = (ts: number) => {
  const formatter = new Intl.DateTimeFormat(getLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return formatter.format(secondsToDate(ts))
}

export const formatTimestampAsTime = (ts: number) => {
  const formatter = new Intl.DateTimeFormat(getLocale(), {
    timeStyle: "short",
  })

  return formatter.format(secondsToDate(ts))
}
