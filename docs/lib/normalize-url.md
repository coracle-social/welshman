# URL Normalization

A `normalizeUrl` function borrowed from [sindresorhus/normalize-url](https://github.com/sindresorhus/normalize-url) is included for convenience.

## Basic Usage

```typescript
normalizeUrl('example')
//=> 'http://example'

normalizeUrl('sindresorhus.com/about.html#contact', {stripHash: true});
//=> 'http://sindresorhus.com/about.html'
```

## API Reference

### Configuration

```typescript
export type Options = {
  // Default protocol to prepend
	readonly defaultProtocol?: 'https' | 'http'

	// Prepends `defaultProtocol` to the URL if it's protocol-relative.
	readonly normalizeProtocol?: boolean

	// Normalizes HTTPS URLs to HTTP.
	readonly forceHttp?: boolean

	// Normalizes HTTP URLs to HTTPS.
	readonly forceHttps?: boolean

	// Strip the [authentication](https://en.wikipedia.org/wiki/Basic_access_authentication) part of a URL.
	readonly stripAuthentication?: boolean

	// Removes hash from the URL.
	readonly stripHash?: boolean

	// Remove the protocol from the URL: `http://sindresorhus.com` → `sindresorhus.com`.
	readonly stripProtocol?: boolean

	// Strip the [text fragment](https://web.dev/text-fragments/) part of the URL
	readonly stripTextFragment?: boolean

	// Removes `www.` from the URL.
	readonly stripWWW?: boolean

	// Removes query parameters that matches any of the provided strings or regexes.
	readonly removeQueryParameters?: ReadonlyArray<RegExp | string> | boolean

	// Keeps only query parameters that matches any of the provided strings or regexes.
	readonly keepQueryParameters?: ReadonlyArray<RegExp | string>

	// Removes trailing slash.
	readonly removeTrailingSlash?: boolean

	// Remove a sole `/` pathname in the output. This option is independent of `removeTrailingSlash`.
	readonly removeSingleSlash?: boolean

	// Removes the default directory index file from path that matches any of the provided strings or regexes.
	readonly removeDirectoryIndex?: boolean | ReadonlyArray<RegExp | string>

	// Removes an explicit port number from the URL.
	readonly removeExplicitPort?: boolean

	// Sorts the query parameters alphabetically by key.
	readonly sortQueryParameters?: boolean
}
```
