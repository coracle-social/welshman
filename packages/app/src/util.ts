import {now, int, DAY, HOUR, MINUTE} from "@welshman/lib"

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

export const formatTimestampRelative = (ts: number) => {
  let unit
  let delta = now() - ts
  if (delta < int(MINUTE)) {
    unit = "second"
  } else if (delta < int(HOUR)) {
    unit = "minute"
    delta = Math.round(delta / int(MINUTE))
  } else if (delta < int(DAY, 2)) {
    unit = "hour"
    delta = Math.round(delta / int(HOUR))
  } else {
    unit = "day"
    delta = Math.round(delta / int(DAY))
  }

  const locale = new Intl.RelativeTimeFormat().resolvedOptions().locale
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  })

  return formatter.format(-delta, unit as Intl.RelativeTimeFormatUnit)
}
