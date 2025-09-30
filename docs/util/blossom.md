# Blossom

Client library for interacting with Blossom media servers. Provides utilities for authentication, blob operations, and file encryption.

## Types

```typescript
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

export interface EncryptedFile {
  key: string
  nonce: string
  ciphertext: Uint8Array
  algorithm: string
}
```

## Authentication

```typescript
// Creates a Blossom auth event for server operations
export declare const makeBlossomAuthEvent: (opts: BlossomAuthEventOpts) => Event
```

## Blob Operations

```typescript
// Builds URL for accessing a blob
export declare const buildBlobUrl: (server: string, sha256: string, extension?: string) => string

// Checks if a blob exists on server
export declare const checkBlobExists: (server: string, sha256: string, options?: { headers?: Record<string, string>; authEvent?: SignedEvent }) => Promise<{exists: boolean; size?: number}>

// Downloads blob from server
export declare const getBlob: (server: string, sha256: string, options?: { headers?: Record<string, string>; authEvent?: SignedEvent; range?: {start: number; end?: number} }) => Promise<Response>

// Checks if uploads are allowed (HEAD request to /upload)
export declare const canUploadBlob: (server: string, options?: { headers?: Record<string, string>; authEvent?: SignedEvent }) => Promise<Response>

// Uploads blob to server
export declare const uploadBlob: (server: string, blob: Blob | ArrayBuffer, options?: { headers?: Record<string, string>; authEvent?: SignedEvent }) => Promise<Response>

// Deletes blob from server
export declare const deleteBlob: (server: string, sha256: string, options?: { headers?: Record<string, string>; authEvent?: SignedEvent }) => Promise<Response>

// Lists blobs for a pubkey
export declare const listBlobs: (server: string, pubkey: string, options?: { headers?: Record<string, string>; authEvent?: SignedEvent; since?: number; until?: number }) => Promise<Response>
```

## File Encryption

```typescript
// Encrypts a file using AES-GCM
export declare function encryptFile(file: Blob): Promise<EncryptedFile>

// Decrypts an encrypted file
export declare function decryptFile(encryptedFile: EncryptedFile): Promise<Uint8Array>
```

## Example

```typescript
import { uploadBlob, makeBlossomAuthEvent } from '@welshman/util'

// Create auth event for upload
const authEvent = makeBlossomAuthEvent({
  action: "upload",
  server: "https://blossom.example.com"
})

// Sign the auth event with your signer
const signedAuthEvent = await signer.sign(authEvent)

// Upload a file
const file = new File(["Hello world"], "hello.txt", { type: "text/plain" })
const response = await uploadBlob("https://blossom.example.com", file, {
  authEvent: signedAuthEvent
})
```
