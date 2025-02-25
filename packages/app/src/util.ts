import {now, int, DAY, HOUR, MINUTE} from "@welshman/lib"

export const LOCALE = new Intl.DateTimeFormat().resolvedOptions().locale

export const TIMEZONE = new Date().toString().match(/GMT[^\s]+/)![0]

export const secondsToDate = (ts: number) => new Date(ts * 1000)

export const dateToSeconds = (date: Date) => Math.round(date.valueOf() / 1000)

export const createLocalDate = (dateString: any) => new Date(`${dateString} ${TIMEZONE}`)

export const timestampFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: "short",
  timeStyle: "short",
})

export const formatTimestamp = (ts: number) => timestampFormatter.format(secondsToDate(ts))

export const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "long",
  day: "numeric",
})

export const formatTimestampAsDate = (ts: number) => dateFormatter.format(secondsToDate(ts))

export const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeStyle: "short",
})

export const formatTimestampAsTime = (ts: number) => timeFormatter.format(secondsToDate(ts))

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
