import {now, bytesToHex, hexToBytes} from "@welshman/lib"
import {BLOSSOM_AUTH} from "./Kinds.js"
import {makeEvent, SignedEvent} from "./Events.js"
import {makeHttpAuthHeader} from "./Nip98.js"

export type BlossomAuthAction = "get" | "upload" | "list" | "delete"

export type BlossomAuthEventOpts = {
  action: BlossomAuthAction
  server: string
  hashes?: string[]
  expiration?: number
  content?: string
}

export type BlossomServer = {
  url: string
  pubkey?: string
}

export type BlossomErrorResponse = {
  message: string
  reason?: string
}

export const makeBlossomAuthEvent = ({
  action,
  server,
  hashes = [],
  expiration = now() + 60,
  content = `Authorization for ${action} at ${server}`,
}: BlossomAuthEventOpts) => {
  const tags: string[][] = [
    ["t", action],
    ["expiration", expiration.toString()],
  ]

  if (server) {
    tags.push(["u", server])
  }

  if (hashes) {
    for (const hash of hashes) {
      tags.push(["x", hash])
    }
  }

  return makeEvent(BLOSSOM_AUTH, {content, tags})
}

export const buildBlobUrl = (server: string, sha256: string, extension?: string): string => {
  const url = new URL(server)
  const filename = extension ? `${sha256}.${extension}` : sha256
  return `${url.origin}/${filename}`
}

export const checkBlobExists = async (
  server: string,
  sha256: string,
  {
    headers = {},
    authEvent,
  }: {
    headers?: Record<string, string>
    authEvent?: SignedEvent
  } = {},
): Promise<{exists: boolean; size?: number}> => {
  const url = buildBlobUrl(server, sha256)

  if (authEvent) {
    headers.Authorization = makeHttpAuthHeader(authEvent)
  }

  try {
    const response = await fetch(url, {method: "HEAD", headers})

    if (response.status === 200) {
      const contentLength = response.headers.get("content-length")
      return {
        exists: true,
        size: contentLength ? parseInt(contentLength, 10) : undefined,
      }
    }

    return {exists: false}
  } catch (error) {
    throw new Error(`Failed to check blob existence: ${error}`)
  }
}

export const getBlob = async (
  server: string,
  sha256: string,
  {
    headers = {},
    authEvent,
    range,
  }: {
    headers?: Record<string, string>
    authEvent?: SignedEvent
    range?: {start: number; end?: number}
  } = {},
) => {
  const url = buildBlobUrl(server, sha256)

  if (authEvent) {
    headers.Authorization = makeHttpAuthHeader(authEvent)
  }

  if (range) {
    const {end, start} = range

    headers.Range = end !== undefined ? `bytes=${start}-${end}` : `bytes=${start}-`
  }

  return fetch(url, {headers})
}

export const canUploadBlob = async (
  server: string,
  {
    headers = {},
    authEvent,
  }: {
    headers?: Record<string, string>
    authEvent?: SignedEvent
  } = {},
) => {
  const url = new URL(server)
  const uploadUrl = `${url.origin}/upload`

  if (authEvent) {
    headers.Authorization = makeHttpAuthHeader(authEvent)
  }

  return fetch(uploadUrl, {method: "HEAD", headers})
}

export const uploadBlob = async (
  server: string,
  blob: Blob | ArrayBuffer,
  {
    headers = {},
    authEvent,
  }: {
    headers?: Record<string, string>
    authEvent?: SignedEvent
  } = {},
) => {
  const url = new URL(server)
  const uploadUrl = `${url.origin}/upload`
  const body = blob instanceof Blob ? blob : new Blob([blob])

  if (authEvent) {
    headers.Authorization = makeHttpAuthHeader(authEvent)
  }

  return fetch(uploadUrl, {method: "PUT", headers, body})
}

export const deleteBlob = async (
  server: string,
  sha256: string,
  {
    headers = {},
    authEvent,
  }: {
    headers?: Record<string, string>
    authEvent?: SignedEvent
  } = {},
) => {
  const url = buildBlobUrl(server, sha256)

  if (authEvent) {
    headers.Authorization = makeHttpAuthHeader(authEvent)
  }

  return fetch(url, {method: "DELETE", headers})
}

export const listBlobs = async (
  server: string,
  pubkey: string,
  {
    headers = {},
    authEvent,
    since,
    until,
  }: {
    headers?: Record<string, string>
    authEvent?: SignedEvent
    since?: number
    until?: number
  } = {},
) => {
  const url = new URL(server)
  const listUrl = `${url.origin}/list/${pubkey}`

  const searchParams = new URLSearchParams()

  if (since !== undefined) {
    searchParams.append("since", since.toString())
  }

  if (until !== undefined) {
    searchParams.append("until", until.toString())
  }

  const fullUrl = searchParams.toString() ? `${listUrl}?${searchParams.toString()}` : listUrl

  if (authEvent) {
    headers.Authorization = makeHttpAuthHeader(authEvent)
  }

  return fetch(fullUrl, {headers})
}

export interface EncryptedFile {
  key: string
  nonce: string
  ciphertext: Uint8Array
  algorithm: string
}

export async function encryptFile(file: Blob): Promise<EncryptedFile> {
  const key = await crypto.subtle.generateKey({name: "AES-GCM", length: 256}, true, [
    "encrypt",
    "decrypt",
  ])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const fileBuffer = await file.arrayBuffer()
  const ciphertext = await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, fileBuffer)
  const keyBytes = await crypto.subtle.exportKey("raw", key)

  return {
    ciphertext: new Uint8Array(ciphertext),
    key: bytesToHex(keyBytes),
    nonce: bytesToHex(iv),
    algorithm: "aes-gcm",
  }
}

export async function decryptFile({
  key,
  nonce,
  ciphertext,
  algorithm,
}: EncryptedFile): Promise<Uint8Array> {
  if (algorithm !== "aes-gcm") {
    throw new Error(`Unknown algorithm ${algorithm}`)
  }

  const keyBytes = hexToBytes(key)
  const iv = hexToBytes(nonce)
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, {name: "AES-GCM"}, false, [
    "decrypt",
  ])
  const decryptedBuffer = await crypto.subtle.decrypt({name: "AES-GCM", iv}, cryptoKey, ciphertext)

  return new Uint8Array(decryptedBuffer)
}
