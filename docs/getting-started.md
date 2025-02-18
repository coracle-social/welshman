# Getting Started

Welshman is modular - install only what you need:


```bash
# Core nostr utilities (events, filters, tags)
npm i @welshman/util

# Networking and relay management
npm i @welshman/net

# Content parsing and rendering
npm i @welshman/content

# Event signing and encryption
npm i @welshman/signer

# Dynamic feed compilation
npm i @welshman/feeds
```

For Svelte applications, additional packages provide reactive state management:

```bash
# Svelte stores and state management
npm i @welshman/store

# Full application framework (requires Svelte)
npm i @welshman/app

# Rich text editor component (requires Svelte)
npm i @welshman/editor
```

Choose packages based on your needs:

- Building a framework-agnostic client? Start with:
  ```bash
  npm i @welshman/util @welshman/net @welshman/signer @welshman/feeds
  ```

- Building a Svelte client? Add state management:
  ```bash
  npm i @welshman/store @welshman/app
  ```

- Need content features? Include:
  ```bash
  npm i @welshman/content
  ```

- Want the full Svelte stack used by Coracle.social and Flotilla?
  ```bash
  npm i @welshman/util @welshman/net @welshman/signer @welshman/feeds @welshman/store @welshman/app @welshman/content @welshman/editor
  ```
Each package is independent but integrates seamlessly. The core packages (`util`, `net`, `signer`, `feeds`, `content`) work with any framework, while `store`, `app` and `editor` are built for Svelte applications.
