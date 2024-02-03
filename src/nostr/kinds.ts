export const GROUP = 35834
export const COMMUNITY = 34550

export const isGroupAddress = (a: string) => a.startsWith(`${GROUP}:`)

export const isCommunityAddress = (a: string) => a.startsWith(`${COMMUNITY}:`)

export const isCommunityOrGroupAddress = (a: string) => isCommunityAddress(a) || isGroupAddress(a)
