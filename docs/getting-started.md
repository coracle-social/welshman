# Getting Started

Welshman is modular, so you install only the packages you need:

```bash
# Core nostr utilities (events, filters, tags)
npm i @welshman/util

# General-purpose utilities
npm i @welshman/lib

# Networking and relay management
npm i @welshman/net

# Event signing and encryption
npm i @welshman/signer

# Typed readers and writers per event kind
npm i @welshman/domain

# Dynamic feed compilation
npm i @welshman/feeds

# Content parsing and rendering
npm i @welshman/content

# Rich text editor
npm i @welshman/editor

# Svelte stores and state management
npm i @welshman/store

# Complete application framework
npm i @welshman/app
```

A conventional client starts from the framework:

```bash
npm i @welshman/app
```

A client assembled by hand starts from the lower-level packages:

```bash
npm i @welshman/util @welshman/net @welshman/signer
```

Parsing and rendering note content needs only `@welshman/content`.

The packages are framework-agnostic, but they expose state as Svelte stores, so they fit Svelte applications best.
