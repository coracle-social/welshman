# Commands

Commands are functions which pull from app state to publish events on behalf of the user. Most are async and return a thunk

## Relay Management (NIP 65)

```typescript
removeRelay(url: string, mode: RelayMode): Promise<Thunk>
addRelay(url: string, mode: RelayMode): Promise<Thunk>
```

## Inbox Relay Management (NIP 17)

```typescript
removeInboxRelay(url: string): Promise<Thunk>
addInboxRelay(url: string): Promise<Thunk>
```

## Profile Management (NIP 01)

```typescript
setProfile(profile: Profile): Thunk
```

## Follow Management (NIP 02)

```typescript
unfollow(value: string): Promise<Thunk>
follow(tag: string[]): Promise<Thunk>
```

## Mute Management

```typescript
unmute(value: string): Promise<Thunk>
mutePublicly(tag: string[]): Promise<Thunk>
mutePrivately(tag: string[]): Promise<Thunk>
setMutes(options: {
  publicTags?: string[][]
  privateTags?: string[][]
}): Promise<Thunk>
```

## Pin Management

```typescript
unpin(value: string): Promise<Thunk>
pin(tag: string[]): Promise<Thunk>
```

## Wrapped Messages (NIP 59)

```typescript
type SendWrappedOptions = Omit<ThunkOptions, "event" | "relays"> & {
  template: EventTemplate
  pubkeys: string[]
}

sendWrapped(options: SendWrappedOptions): Promise<MergedThunk>
```

## Relay Management (NIP 86)

```typescript
manageRelay(url: string, request: ManagementRequest): Promise<Response>
```

## Room Management (NIP 29)

```typescript
createRoom(url: string, room: RoomMeta): Thunk
deleteRoom(url: string, room: RoomMeta): Thunk
editRoom(url: string, room: RoomMeta): Thunk
joinRoom(url: string, room: RoomMeta): Thunk
leaveRoom(url: string, room: RoomMeta): Thunk
```
