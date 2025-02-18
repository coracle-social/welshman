---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Welshman"
  text: Nostr building blocks for the web
  tagline: A series of independent libraries for managing every aspect of your Nostr application.
  actions:
    - theme: brand
      text: What is Welshman?
      link: /what-is-welshman
    - theme: alt
      text: Quickstart
      link: /what-is-welshman
    - theme: alt
      text: Github
      link: https://github.com/coracle-social/welshman

features:
  - title: "@welshman/content"
    details: Parser and renderer for nostr note content with customizable formatting options.
  - title: "@welshman/dvm"
    details: Tools for building and interacting with nostr Data Vending Machines (DVMs)
  - title: "@welshman/editor"
    details: Rich text editor component for Nostr with support for mentions and embeds.
  - title: "@welshman/feeds"
    details: Dynamic feed compiler and loader for nostr with filtering and composition.
  - title: "@welshman/util"
    details: Core nostr utilities for events, filters, and data structures.
  - title: "@welshman/net"
    details: Networking layer for nostr with relay connection management and message status handling.
  - title: "@welshman/signer"
    details: Implementations of various nostr signing methods (NIP-01, NIP-07, NIP-46, NIP-55).
  - title: "@welshman/store"
    details: Svelte store utilities optimized for nostr state management.
---
