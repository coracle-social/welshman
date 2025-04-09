# Getting Started

Welshman is modular - install only what you need:


```bash
# Core nostr utilities (events, filters, tags)
npm i @welshman/util

# In-memory event store and relay adapter
npm i @welshman/relay

# Networking and relay management
npm i @welshman/net

# Event signing and encryption
npm i @welshman/signer

# Dynamic feed compilation
npm i @welshman/feeds

# Content parsing and rendering
npm i @welshman/content

# Rich text editor component
npm i @welshman/editor

# Svelte stores and state management
npm i @welshman/store

# Complete application framework
npm i @welshman/app
```

Choose packages based on your needs:

- Building a conventional client? Use the framework:
  ```bash
  npm i @welshman/app
  ```

- Prefer to put things together yourself? Start with:
  ```bash
  npm i @welshman/util @welshman/net @welshman/signer
  ```

- Just parsing and rendering content? Include:
  ```bash
  npm i @welshman/content
  ```

Each package is independent but integrates seamlessly. All packages are framework-agnostic, but work best with Svelte due to svelte stores being a common pattern for state management.
