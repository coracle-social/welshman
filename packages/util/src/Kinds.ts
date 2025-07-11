import {between} from "@welshman/lib"

/** Events are **regular**, which means they're all expected to be stored by relays. */
export function isRegularKind(kind: number): boolean {
  return (
    (1000 <= kind && kind < 10000) || [1, 2, 4, 5, 6, 7, 8, 16, 40, 41, 42, 43, 44].includes(kind)
  )
}

/** Events are **replaceable**, which means that, for each combination of `pubkey` and `kind`, only the latest event is expected to (SHOULD) be stored by relays, older versions are expected to be discarded. */
export function isPlainReplaceableKind(kind: number): boolean {
  return [0, 3].includes(kind) || (10000 <= kind && kind < 20000)
}

/** Events are **ephemeral**, which means they are not expected to be stored by relays. */
export function isEphemeralKind(kind: number): boolean {
  return 20000 <= kind && kind < 30000
}

/** Events are **parameterized replaceable**, which means that, for each combination of `pubkey`, `kind` and the `d` tag, only the latest event is expected to be stored by relays, older versions are expected to be discarded. */
export function isParameterizedReplaceableKind(kind: number): boolean {
  return 30000 <= kind && kind < 40000
}

export const isReplaceableKind = (kind: number) =>
  isPlainReplaceableKind(kind) || isParameterizedReplaceableKind(kind)

export const isDVMKind = (kind: number) => between([4999, 7001], kind)

export const PROFILE = 0
export const NOTE = 1
export const FOLLOWS = 3
export const DELETE = 5
export const REPOST = 6
export const REACTION = 7
export const BADGE_AWARD = 8
export const MESSAGE = 9
export const THREAD = 11
export const SEAL = 13
export const DIRECT_MESSAGE = 14
export const DIRECT_MESSAGE_FILE = 15
export const GENERIC_REPOST = 16
export const PICTURE_NOTE = 20
export const CHANNEL_CREATE = 40
export const CHANNEL_UPDATE = 41
export const CHANNEL_MESSAGE = 42
export const CHANNEL_HIDE_MESSAGE = 43
export const CHANNEL_MUTE_USER = 44
export const VANISH = 62
export const BID = 1021
export const BID_CONFIRMATION = 1022
export const OTS = 1040
export const WRAP = 1059
export const WRAP_NIP04 = 1060
export const FILE_METADATA = 1063
export const COMMENT = 1111
export const LIVE_CHAT_MESSAGE = 1311
export const GIT_PATCH = 1617
export const GIT_ISSUE = 1621
export const GIT_REPLY = 1622
export const GIT_STATUS_OPEN = 1630
export const GIT_STATUS_COMPLETE = 1631
export const GIT_STATUS_CLOSED = 1632
export const GIT_STATUS_DRAFT = 1633
export const GIT_REPOSITORY = 30403
export const REMIX = 1808
export const NOSTROCKET_PROBLEM = 1971
export const REPORT = 1984
export const LABEL = 1985
export const REVIEW = 1986
export const APPROVAL = 4550
export const DVM_REQUEST_TEXT_EXTRACTION = 5000
export const DVM_REQUEST_TEXT_SUMMARY = 5001
export const DVM_REQUEST_TEXT_TRANSLATION = 5002
export const DVM_REQUEST_TEXT_GENERATION = 5050
export const DVM_REQUEST_IMAGE_GENERATION = 5100
export const DVM_REQUEST_VIDEO_CONVERSION = 5200
export const DVM_REQUEST_VIDEO_TRANSLATION = 5201
export const DVM_REQUEST_IMAGE_TO_VIDEO_CONVERSION = 5202
export const DVM_REQUEST_TEXT_TO_SPEECH = 5250
export const DVM_REQUEST_DISCOVER_CONTENT = 5300
export const DVM_REQUEST_DISCOVER_PEOPLE = 5301
export const DVM_REQUEST_SEARCH_CONTENT = 5302
export const DVM_REQUEST_SEARCH_PEOPLE = 5303
export const DVM_REQUEST_COUNT = 5400
export const DVM_REQUEST_MALWARE_SCAN = 5500
export const DVM_REQUEST_OTS = 5900
export const DVM_REQUEST_OP_RETURN = 5901
export const DVM_REQUEST_PUBLISH_SCHEDULE = 5905
export const DVM_RESPONSE_TEXT_EXTRACTION = 6000
export const DVM_RESPONSE_TEXT_SUMMARY = 6001
export const DVM_RESPONSE_TEXT_TRANSLATION = 6002
export const DVM_RESPONSE_TEXT_GENERATION = 6050
export const DVM_RESPONSE_IMAGE_GENERATION = 6100
export const DVM_RESPONSE_VIDEO_CONVERSION = 6200
export const DVM_RESPONSE_VIDEO_TRANSLATION = 6201
export const DVM_RESPONSE_IMAGE_TO_VIDEO_CONVERSION = 6202
export const DVM_RESPONSE_TEXT_TO_SPEECH = 6250
export const DVM_RESPONSE_DISCOVER_CONTENT = 6300
export const DVM_RESPONSE_DISCOVER_PEOPLE = 6301
export const DVM_RESPONSE_SEARCH_CONTENT = 6302
export const DVM_RESPONSE_SEARCH_PEOPLE = 6303
export const DVM_RESPONSE_COUNT = 6400
export const DVM_RESPONSE_MALWARE_SCAN = 6500
export const DVM_RESPONSE_OTS = 6900
export const DVM_RESPONSE_OP_RETURN = 6901
export const DVM_RESPONSE_PUBLISH_SCHEDULE = 6905
export const DVM_FEEDBACK = 7000
export const ROOM_ADD_USER = 9000
export const ROOM_REMOVE_USER = 9001
export const ROOM_EDIT_META = 9002
export const ROOM_ADD_PERM = 9003
export const ROOM_REMOVE_PERM = 9004
export const ROOM_DELETE_EVENT = 9005
export const ROOM_EDIT_STATUS = 9006
export const ROOM_CREATE = 9007
export const ROOM_DELETE = 9008
export const ROOM_JOIN = 9021
export const ROOM_LEAVE = 9022
export const ZAP_GOAL = 9041
export const ZAP_REQUEST = 9734
export const ZAP_RESPONSE = 9735
export const HIGHLIGHT = 9802
export const MUTES = 10000
export const PINS = 10001
export const RELAYS = 10002
export const BOOKMARKS = 10003
export const COMMUNITIES = 10004
export const CHANNELS = 10005
export const BLOCKED_RELAYS = 10006
export const SEARCH_RELAYS = 10007
export const ROOMS = 10009
export const FEEDS = 10014
export const TOPICS = 10015
export const EMOJIS = 10030
export const INBOX_RELAYS = 10050
export const BLOSSOM_SERVERS = 10063
export const FILE_SERVERS = 10096
export const LIGHTNING_PUB_RPC = 21000
export const CLIENT_AUTH = 22242
export const BLOSSOM_AUTH = 24242
export const AUTH_JOIN = 28934
export const AUTH_INVITE = 28935
export const WALLET_INFO = 13194
export const WALLET_REQUEST = 23194
export const WALLET_RESPONSE = 23195
export const NOSTR_CONNECT = 24133
export const HTTP_AUTH = 27235
export const NAMED_PEOPLE = 30000
export const NAMED_RELAYS = 30002
export const NAMED_BOOKMARKS = 30003
export const NAMED_CURATIONS = 30004
export const NAMED_WIKI_AUTHORS = 30101
export const NAMED_WIKI_RELAYS = 30102
export const NAMED_EMOJIS = 30030
export const NAMED_TOPICS = 30015
export const NAMED_ARTIFACTS = 30063
export const NAMED_COMMUNITIES = 30064
export const BADGES = 30008
export const BADGE_DEFINITION = 30009
export const STALL = 30017
export const PRODUCT = 30018
export const MARKET_UI = 30019
export const PRODUCT_SOLD_AS_AUCTION = 30020
export const WIKI = 30818
export const LONG_FORM = 30023
export const LONG_FORM_DRAFT = 30024
export const APP_DATA = 30078
export const LIVE_EVENT = 30311
export const STATUS = 30315
export const CLASSIFIED = 30402
export const DRAFT_CLASSIFIED = 30403
export const AUDIO = 31337
export const FEED = 31890
export const CALENDAR = 31924
export const EVENT_DATE = 31922
export const EVENT_TIME = 31923
export const EVENT_RSVP = 31925
export const HANDLER_RECOMMENDATION = 31989
export const HANDLER_INFORMATION = 31990
export const ALERT_EMAIL = 32830
export const ALERT_STATUS = 32831
export const ALERT_WEB = 32832
export const ALERT_ANDROID = 32833
export const ALERT_IOS = 32834
export const COMMUNITY = 34550
export const ROOM = 35834
export const ROOM_META = 39000
export const ROOM_ADMINS = 39001
export const FOLLOW_PACK = 39089

export const DEPRECATED_RELAY_RECOMMENDATION = 2
export const DEPRECATED_DIRECT_MESSAGE = 4
export const DEPRECATED_NAMED_GENERIC = 30001
