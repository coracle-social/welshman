# Profile

The Profile module provides utilities for handling Nostr user profiles (kind 0 events), including profile creation, reading, and display formatting.

## Core Types

### Profile Structure
```typescript
interface Profile {
  name?: string             // Display name
  nip05?: string            // NIP-05 verification
  lud06?: string            // Legacy Lightning address
  lud16?: string            // Lightning address
  lnurl?: string            // Lightning URL
  about?: string            // Bio/description
  banner?: string           // Banner image URL
  picture?: string          // Profile picture URL
  website?: string          // Website URL
  display_name?: string     // Alternative display name
  event?: TrustedEvent      // Original profile event
}
```

### Published Profile
```typescript
interface PublishedProfile extends Omit<Profile, "event"> {
  event: TrustedEvent       // Required event for published profiles
}
```

## Core Functions

### Profile Creation & Reading
```typescript
// Create new profile
function makeProfile(profile: Partial<Profile>): Profile

// Read profile from event
function readProfile(event: TrustedEvent): PublishedProfile

// Create profile event
function createProfile(profile: Profile): EventTemplate

// Edit existing profile
function editProfile(profile: PublishedProfile): EventTemplate
```

### Display Formatting
```typescript
// Format pubkey for display
function displayPubkey(pubkey: string): string

// Format profile name for display
function displayProfile(
  profile?: Profile,
  fallback = ""
): string

// Check if profile has name
function profileHasName(profile?: Profile): boolean
```

## Usage Examples

### Creating New Profile
```typescript
// Create basic profile
const profile = makeProfile({
  name: "Alice",
  about: "Nostr user",
  picture: "https://example.com/avatar.jpg",
  lud16: "alice@getalby.com"
})

// Create profile event
const profileEvent = createProfile(profile)
```

### Reading Profile
```typescript
// Read profile from event
const profile = readProfile(profileEvent)

// Access profile data
console.log(profile.name)
console.log(profile.about)
console.log(profile.lnurl) // Auto-generated from lud16/lud06
```

### Displaying Profile
```typescript
// Display profile name
const name = displayProfile(profile, "Anonymous")

// Display pubkey
const shortPubkey = displayPubkey(profile.event.pubkey)
// => "npub1abc...xyz"

// Check for name
if (profileHasName(profile)) {
  showName(profile)
} else {
  showPubkey(profile)
}
```

### Updating Profile
```typescript
// Edit existing profile
const profileEvent = editProfile({
  ...existingProfile,
  name: "New Name",
  about: "Updated bio"
})
```
