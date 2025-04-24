import Trava from "trava"
import {spec, isPojo} from "@welshman/lib"
import {isRelayUrl, Address} from "@welshman/util"
import {Scope, FeedType} from "./core.js"
import {getFeedArgs} from "./utils.js"

const {ValidationError, Compose, Check, Each, Optional, Keys} = Trava

const validateNumber = Check((x: any) => typeof x === "number", "Value must be a number")

const validateString = Check((x: any) => typeof x === "string", "Value must be a string")

const validateRelay = Check((x: any) => typeof x === "string" && isRelayUrl(x), "Invalid relay url")

const validateScope = Check((x: any) => Object.values(Scope).includes(x), "Invalid scope")

const validateHex = Check((x: any) => typeof x === "string" && x.length === 64, "Invalid hex value")

const validateAddress = Check(
  (x: any) => typeof x === "string" && Address.isAddress(x),
  "Invalid address",
)

const validateArray = Check((x: any) => Array.isArray(x), "Value must be an array")

const validateObject = Check((x: any) => isPojo(x), "Value must be an object")

export {ValidationError}

export const validateTagFeedMapping = Compose([
  validateArray,
  Check(spec({length: 2}), "Tag feed mappings must have two entries"),
  (a: any[]) => validateString(a[0]),
  (a: any[]) => validateFeed(a[1]),
])

export const validateFeedArgs = (validateArgument: Trava.Validator) => (feed: any) => {
  let error = validateArray(feed)
  if (error instanceof ValidationError) return error

  for (const argument of getFeedArgs(feed)) {
    error = validateArgument(argument)
    if (error instanceof ValidationError) return error
  }

  return feed
}

export const validateAddressFeed = validateFeedArgs(validateAddress)

export const validateAuthorFeed = validateFeedArgs(validateHex)

export const validateCreatedAtFeed = validateFeedArgs(
  Keys({
    since: Optional(validateNumber),
    until: Optional(validateNumber),
    relative: Optional(Each(validateString)),
  }),
)

export const validateDVMFeed = validateFeedArgs(
  Keys({
    kind: validateNumber,
    tags: Optional(Each(validateString)),
    relays: Optional(Each(validateString)),
    mappings: Optional(Each(validateTagFeedMapping)),
  }),
)

export const validateDifferenceFeed = validateFeedArgs((x: any) => validateFeed(x))

export const validateIDFeed = validateFeedArgs(validateHex)

export const validateIntersectionFeed = validateFeedArgs((x: any) => validateFeed(x))

export const validateGlobalFeed = validateFeedArgs((x: any) => validateFeed(x))

export const validateKindFeed = validateFeedArgs(validateNumber)

export const validateListFeed = validateFeedArgs(
  Keys({
    addresses: Optional(Each(validateString)),
    mappings: Optional(Each(validateTagFeedMapping)),
  }),
)

export const validateLabelFeed = validateFeedArgs(
  Compose([
    validateObject,
    (item: any) => {
      const validateRelays = Each(validateRelay)
      const validateAuthors = Each(validateHex)
      const validateStrings = Each(validateString)
      const validateMappings = Each(validateTagFeedMapping)

      for (const [key, value] of Object.entries(item)) {
        let error
        if (key === "relays") {
          error = validateRelays(value)
        } else if (key === "authors") {
          error = validateAuthors(value)
        } else if (key === "mappings") {
          error = validateMappings(value)
        } else if (key.match("^#.$")) {
          error = validateStrings(value)
        } else {
          error = new ValidationError("Invalid label item")
        }

        if (error instanceof ValidationError) return error
      }

      return item
    },
  ]),
)

export const validateWOTFeed = validateFeedArgs(
  Keys({
    min: Optional(validateNumber),
    max: Optional(validateNumber),
  }),
)

export const validateRelayFeed = validateFeedArgs(validateRelay)

export const validateScopeFeed = validateFeedArgs(validateScope)

export const validateSearchFeed = validateFeedArgs(validateString)

export const validateTagFeed = validateFeedArgs(validateString)

export const validateUnionFeed = validateFeedArgs((x: any) => validateFeed(x))

export const validateFeed = (feed: any) => {
  const error = validateArray(feed)
  if (error instanceof ValidationError) return error

  switch (feed[0]) {
    case FeedType.Address:
      return validateAddressFeed(feed)
    case FeedType.Author:
      return validateAuthorFeed(feed)
    case FeedType.CreatedAt:
      return validateCreatedAtFeed(feed)
    case FeedType.DVM:
      return validateDVMFeed(feed)
    case FeedType.Difference:
      return validateDifferenceFeed(feed)
    case FeedType.ID:
      return validateIDFeed(feed)
    case FeedType.Intersection:
      return validateIntersectionFeed(feed)
    case FeedType.Global:
      return validateGlobalFeed(feed)
    case FeedType.Kind:
      return validateKindFeed(feed)
    case FeedType.List:
      return validateListFeed(feed)
    case FeedType.Label:
      return validateLabelFeed(feed)
    case FeedType.WOT:
      return validateWOTFeed(feed)
    case FeedType.Relay:
      return validateRelayFeed(feed)
    case FeedType.Scope:
      return validateScopeFeed(feed)
    case FeedType.Search:
      return validateSearchFeed(feed)
    case FeedType.Tag:
      return validateTagFeed(feed)
    case FeedType.Union:
      return validateUnionFeed(feed)
    default:
      return new ValidationError("Unknown feed type")
  }
}
