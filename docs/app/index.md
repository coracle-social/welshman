# @welshman/app

The complete application framework powering [Coracle.social](https://coracle.social) and [Flotilla.social](https://flotilla.social). Provides everything needed to build a full-featured nostr client with:

## Core Features

1. **Session Management**
```typescript
// Real world example of handling NIP-07, NIP-46 logins
```

2. **Relay Router**
```typescript
// Example of smart relay selection for different operations
```

3. **Storage & Sync**
- IndexedDB integration
- Event caching
- Profile caching
- Relay stats tracking

4. **State Management**
- Profiles
- Follows/Mutes
- Relay selections
- Zappers
- Lists

5. **Command System**
- Follow/Unfollow
- Mute/Unmute
- Pin/Unpin

6. **Feed Management**
- Dynamic feed compilation
- DVM integration
- NIP-65 relay selection
