# Welshman

A nostr toolkit focused on creating highly a configurable client system, extracted from the [Coracle](https://github.com/coracle-social/coracle) nostr client.

This is a monorepo which is split into several different packages:

- [@welshman/app](packages/app/README.MD) - a framework for building nostr apps
- [@welshman/content](packages/content/README.MD) - utilities for parsing and rendering notes.
- [@welshman/dvm](packages/dvm/README.MD) - utilities for creating and making request against dvms.
- [@welshman/feeds](packages/feeds/README.MD) - an interpreter for custom nostr feeds.
- [@welshman/lib](packages/lib/README.MD) - generic utility functions.
- [@welshman/net](packages/net/README.MD) - framework for interacting with relays.
- [@welshman/signer](packages/signer/README.MD) - signers and utilities for signing/encryption/decryption
- [@welshman/store](packages/store/README.MD) - utilities for building svelte stores for welshman apps
- [@welshman/util](packages/util/README.MD) - various nostr-specific utilities.

# Linking

If you're developing an application which requires changes to welshman, you'll need to use `npm link` to link the two. This is an annoying process, and is only supported if using `npm`.

- Clone welshman and the repository that depends on it
- Within each `package` directory in welshman, run `npm link`
- Within your application directory, link all welshman dependencies _simultaneously_ (or else only one will get linked. A command that does this is: `rm -rf node_modules; npm i; cat package.json|js '.depedencies|keys[]'|grep welshman|xargs npm link`.

If you run `npm install` in your application directory, you'll need to repeat the final step above.
