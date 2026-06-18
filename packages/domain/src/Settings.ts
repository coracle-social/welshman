import {append, parseJson, remove} from "@welshman/lib"
import {APP_DATA} from "@welshman/util"
import type {EventTemplate, TrustedEvent} from "@welshman/util"
import {decrypt} from "@welshman/signer"
import type {ISigner} from "@welshman/signer"
import {DomainObject} from "./base.js"

// Literal d-tag identifying flotilla's single addressable settings event.
export const SETTINGS_IDENTIFIER = "flotilla/settings"

export type SpaceNotificationSettings = {
  url: string
  notify: boolean
  exceptions: string[]
}

export type SettingsValues = {
  show_media: boolean
  hide_sensitive: boolean
  trusted_relays: string[]
  report_usage: boolean
  report_errors: boolean
  relay_auth: "aggressive" | "conservative"
  send_delay: number
  font_size: number
  alerts: SpaceNotificationSettings[]
  zap_amounts: number[]
}

export const defaultSettings: SettingsValues = {
  show_media: true,
  hide_sensitive: true,
  trusted_relays: [],
  report_usage: true,
  report_errors: true,
  relay_auth: "conservative",
  send_delay: 0,
  font_size: 1.1,
  alerts: [],
  zap_amounts: [21, 210, 2100, 21000],
}

export const makeSettingsValues = (values: Partial<SettingsValues> = {}): SettingsValues => ({
  ...defaultSettings,
  ...values,
})

// FLOTILLA-SPECIFIC kind-30078 (NIP-78 app data) settings blob, addressable via the
// literal d-tag "flotilla/settings". The content is NIP-44 encrypted JSON, so `parse`
// needs the signer to decrypt and `toTemplate` needs it to encrypt: the values are
// stored to the author's own pubkey. Mutators stay synchronous over the decrypted
// `values`; encryption only happens on serialization.
export class Settings extends DomainObject<SettingsValues> {
  readonly kind = APP_DATA
  values = makeSettingsValues()

  protected normalizeValues(values: Partial<SettingsValues> = {}) {
    return makeSettingsValues(values)
  }

  protected async parseEvent(
    event: TrustedEvent,
    signer?: ISigner,
  ): Promise<Partial<SettingsValues>> {
    if (!event.content) return defaultSettings

    let plaintext = ""

    if (signer) {
      try {
        plaintext = await decrypt(signer, event.pubkey, event.content)
      } catch (e) {
        return defaultSettings
      }
    }

    return {...defaultSettings, ...(parseJson(plaintext) || {})}
  }

  showMedia() {
    return this.values.show_media
  }

  hideSensitive() {
    return this.values.hide_sensitive
  }

  trustedRelays() {
    return this.values.trusted_relays
  }

  reportUsage() {
    return this.values.report_usage
  }

  reportErrors() {
    return this.values.report_errors
  }

  relayAuth() {
    return this.values.relay_auth
  }

  sendDelay() {
    return this.values.send_delay
  }

  fontSize() {
    return this.values.font_size
  }

  alerts() {
    return this.values.alerts
  }

  zapAmounts() {
    return this.values.zap_amounts
  }

  // Port of flotilla's getShouldNotify branching: missing pref -> notify; space-level
  // (no room) -> the pref's notify flag; otherwise rooms in `exceptions` invert the flag.
  getShouldNotify(url: string, h?: string) {
    const pref = this.values.alerts.find(s => s.url === url)

    if (!pref) return true
    if (!h) return pref.notify
    if (pref.notify) return !pref.exceptions.includes(h)

    return pref.exceptions.includes(h)
  }

  addTrustedRelay(url: string) {
    this.values.trusted_relays = append(url, this.values.trusted_relays)

    return this
  }

  removeTrustedRelay(url: string) {
    this.values.trusted_relays = remove(url, this.values.trusted_relays)

    return this
  }

  // Upsert a space-level notification preference, resetting its room exceptions.
  setSpaceNotifications(url: string, notify: boolean) {
    const {alerts} = this.values
    const existing = alerts.find(s => s.url === url)

    if (existing) {
      this.values.alerts = alerts.map(s =>
        s.url === url ? {...s, notify, exceptions: []} : s,
      )
    } else {
      this.values.alerts = [...alerts, {url, notify, exceptions: []}]
    }

    return this
  }

  // Toggle a room (h) in a space's exception list, creating the pref if absent.
  toggleRoomNotifications(url: string, h: string) {
    const {alerts} = this.values
    const existing = alerts.find(s => s.url === url)

    if (!existing) {
      this.values.alerts = [...alerts, {url, notify: true, exceptions: [h]}]
    } else {
      const exceptions = existing.exceptions.includes(h)
        ? remove(h, existing.exceptions)
        : append(h, existing.exceptions)

      this.values.alerts = alerts.map(s => (s.url === url ? {...s, exceptions} : s))
    }

    return this
  }

  async toTemplate(signer?: ISigner): Promise<EventTemplate> {
    if (!signer) {
      throw new Error("A signer is required to serialize Settings")
    }

    const pubkey = await signer.getPubkey()
    const content = await signer.nip44.encrypt(pubkey, JSON.stringify(this.values))

    return {
      kind: this.kind,
      content,
      tags: [["d", SETTINGS_IDENTIFIER]],
    }
  }
}
