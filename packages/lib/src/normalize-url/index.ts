export type Options = {
	/**
	@default 'http'
	*/
	readonly defaultProtocol?: 'https' | 'http';

	/**
	Prepends `defaultProtocol` to the URL if it's protocol-relative.

	@default true

	@example
	```
	normalizeUrl('//sindresorhus.com');
	//=> 'http://sindresorhus.com'

	normalizeUrl('//sindresorhus.com', {normalizeProtocol: false});
	//=> '//sindresorhus.com'
	```
	*/
	readonly normalizeProtocol?: boolean;

	/**
	Normalizes HTTPS URLs to HTTP.

	@default false

	@example
	```
	normalizeUrl('https://sindresorhus.com');
	//=> 'https://sindresorhus.com'

	normalizeUrl('https://sindresorhus.com', {forceHttp: true});
	//=> 'http://sindresorhus.com'
	```
	*/
	readonly forceHttp?: boolean;

	/**
	Normalizes HTTP URLs to HTTPS.

	This option cannot be used with the `forceHttp` option at the same time.

	@default false

	@example
	```
	normalizeUrl('http://sindresorhus.com');
	//=> 'http://sindresorhus.com'

	normalizeUrl('http://sindresorhus.com', {forceHttps: true});
	//=> 'https://sindresorhus.com'
	```
	*/
	readonly forceHttps?: boolean;

	/**
	Strip the [authentication](https://en.wikipedia.org/wiki/Basic_access_authentication) part of a URL.

	@default true

	@example
	```
	normalizeUrl('user:password@sindresorhus.com');
	//=> 'https://sindresorhus.com'

	normalizeUrl('user:password@sindresorhus.com', {stripAuthentication: false});
	//=> 'https://user:password@sindresorhus.com'
	```
	*/
	readonly stripAuthentication?: boolean;

	/**
	Removes hash from the URL.

	@default false

	@example
	```
	normalizeUrl('sindresorhus.com/about.html#contact');
	//=> 'http://sindresorhus.com/about.html#contact'

	normalizeUrl('sindresorhus.com/about.html#contact', {stripHash: true});
	//=> 'http://sindresorhus.com/about.html'
	```
	*/
	readonly stripHash?: boolean;

	/**
	Remove the protocol from the URL: `http://sindresorhus.com` → `sindresorhus.com`.

	It will only remove `https://` and `http://` protocols.

	@default false

	@example
	```
	normalizeUrl('https://sindresorhus.com');
	//=> 'https://sindresorhus.com'

	normalizeUrl('sindresorhus.com', {stripProtocol: true});
	//=> 'sindresorhus.com'
	```
	*/
	readonly stripProtocol?: boolean;

	/**
	Strip the [text fragment](https://web.dev/text-fragments/) part of the URL

	__Note:__ The text fragment will always be removed if the `stripHash` option is set to `true`, as the hash contains the text fragment.

	@default true

	@example
	```
	normalizeUrl('http://sindresorhus.com/about.html#:~:text=hello');
	//=> 'http://sindresorhus.com/about.html#'

	normalizeUrl('http://sindresorhus.com/about.html#section:~:text=hello');
	//=> 'http://sindresorhus.com/about.html#section'

	normalizeUrl('http://sindresorhus.com/about.html#:~:text=hello', {stripTextFragment: false});
	//=> 'http://sindresorhus.com/about.html#:~:text=hello'

	normalizeUrl('http://sindresorhus.com/about.html#section:~:text=hello', {stripTextFragment: false});
	//=> 'http://sindresorhus.com/about.html#section:~:text=hello'
	```
	*/
	readonly stripTextFragment?: boolean;

	/**
	Removes `www.` from the URL.

	@default true

	@example
	```
	normalizeUrl('http://www.sindresorhus.com');
	//=> 'http://sindresorhus.com'

	normalizeUrl('http://www.sindresorhus.com', {stripWWW: false});
	//=> 'http://www.sindresorhus.com'
	```
	*/
	readonly stripWWW?: boolean;

	/**
	Removes query parameters that matches any of the provided strings or regexes.

	@default [/^utm_\w+/i]

	@example
	```
	normalizeUrl('www.sindresorhus.com?foo=bar&ref=test_ref', {
		removeQueryParameters: ['ref']
	});
	//=> 'http://sindresorhus.com/?foo=bar'
	```

	If a boolean is provided, `true` will remove all the query parameters.

	```
	normalizeUrl('www.sindresorhus.com?foo=bar', {
		removeQueryParameters: true
	});
	//=> 'http://sindresorhus.com'
	```

	`false` will not remove any query parameter.

	```
	normalizeUrl('www.sindresorhus.com?foo=bar&utm_medium=test&ref=test_ref', {
		removeQueryParameters: false
	});
	//=> 'http://www.sindresorhus.com/?foo=bar&ref=test_ref&utm_medium=test'
	```
	*/
	readonly removeQueryParameters?: ReadonlyArray<RegExp | string> | boolean;

	/**
	Keeps only query parameters that matches any of the provided strings or regexes.

	__Note__: It overrides the `removeQueryParameters` option.

	@default undefined

	@example
	```
	normalizeUrl('https://sindresorhus.com?foo=bar&ref=unicorn', {
		keepQueryParameters: ['ref']
	});
	//=> 'https://sindresorhus.com/?ref=unicorn'
	```
	*/
	readonly keepQueryParameters?: ReadonlyArray<RegExp | string>;

	/**
	Removes trailing slash.

	__Note__: Trailing slash is always removed if the URL doesn't have a pathname unless the `removeSingleSlash` option is set to `false`.

	@default true

	@example
	```
	normalizeUrl('http://sindresorhus.com/redirect/');
	//=> 'http://sindresorhus.com/redirect'

	normalizeUrl('http://sindresorhus.com/redirect/', {removeTrailingSlash: false});
	//=> 'http://sindresorhus.com/redirect/'

	normalizeUrl('http://sindresorhus.com/', {removeTrailingSlash: false});
	//=> 'http://sindresorhus.com'
	```
	*/
	readonly removeTrailingSlash?: boolean;

	/**
	Remove a sole `/` pathname in the output. This option is independent of `removeTrailingSlash`.

	@default true

	@example
	```
	normalizeUrl('https://sindresorhus.com/');
	//=> 'https://sindresorhus.com'

	normalizeUrl('https://sindresorhus.com/', {removeSingleSlash: false});
	//=> 'https://sindresorhus.com/'
	```
	*/
	readonly removeSingleSlash?: boolean;

	/**
	Removes the default directory index file from path that matches any of the provided strings or regexes.
	When `true`, the regex `/^index\.[a-z]+$/` is used.

	@default false

	@example
	```
	normalizeUrl('www.sindresorhus.com/foo/default.php', {
		removeDirectoryIndex: [/^default\.[a-z]+$/]
	});
	//=> 'http://sindresorhus.com/foo'
	```
	*/
	readonly removeDirectoryIndex?: boolean | ReadonlyArray<RegExp | string>;

	/**
	Removes an explicit port number from the URL.

	Port 443 is always removed from HTTPS URLs and 80 is always removed from HTTP URLs regardless of this option.

	@default false

	@example
	```
	normalizeUrl('sindresorhus.com:123', {
		removeExplicitPort: true
	});
	//=> 'http://sindresorhus.com'
	```
	*/
	readonly removeExplicitPort?: boolean;

	/**
	Sorts the query parameters alphabetically by key.

	@default true

	@example
	```
	normalizeUrl('www.sindresorhus.com?b=two&a=one&c=three', {
		sortQueryParameters: false
	});
	//=> 'http://sindresorhus.com/?b=two&a=one&c=three'
	```
	*/
	readonly sortQueryParameters?: boolean;
};

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
const DATA_URL_DEFAULT_MIME_TYPE = 'text/plain'
const DATA_URL_DEFAULT_CHARSET = 'us-ascii'

const testParameter = (name: string, filters: any[]) => filters.some(filter => filter instanceof RegExp ? filter.test(name) : filter === name)

const supportedProtocols = new Set([
	'https:',
	'http:',
	'file:',
])

const hasCustomProtocol = (urlString: string) => {
	try {
		const {protocol} = new URL(urlString)
		return protocol.endsWith(':') && !supportedProtocols.has(protocol)
	} catch {
		return false
	}
}

const normalizeDataURL = (urlString: string, {stripHash}: {stripHash: boolean}) => {
	const match = /^data:(?<type>[^,]*?),(?<data>[^#]*?)(?:#(?<hash>.*))?$/.exec(urlString)

	if (!match) {
		throw new Error(`Invalid URL: ${urlString}`)
	}

	let {type, data, hash} = match.groups as any
	const mediaType = type.split(';')
	hash = stripHash ? '' : hash

	let isBase64 = false
	if (mediaType[mediaType.length - 1] === 'base64') {
		mediaType.pop()
		isBase64 = true
	}

	// Lowercase MIME type
	const mimeType = mediaType.shift()?.toLowerCase() ?? ''
	const attributes = mediaType
		.map((attribute: string) => {
			let [key, value = ''] = attribute.split('=').map((s: string) => s.trim())

			// Lowercase `charset`
			if (key === 'charset') {
				value = value.toLowerCase()

				if (value === DATA_URL_DEFAULT_CHARSET) {
					return ''
				}
			}

			return `${key}${value ? `=${value}` : ''}`
		})
		.filter(Boolean)

	const normalizedMediaType = [
		...attributes,
	]

	if (isBase64) {
		normalizedMediaType.push('base64')
	}

	if (normalizedMediaType.length > 0 || (mimeType && mimeType !== DATA_URL_DEFAULT_MIME_TYPE)) {
		normalizedMediaType.unshift(mimeType)
	}

	return `data:${normalizedMediaType.join(';')},${isBase64 ? data.trim() : data}${hash ? `#${hash}` : ''}`
}

/**
[Normalize](https://en.wikipedia.org/wiki/URL_normalization) a URL.

URLs with custom protocols are not normalized and just passed through by default. Supported protocols are: `https`, `http`, `file`, and `data`.

@param url - URL to normalize, including [data URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs).

@example
```
import normalizeUrl from 'normalize-url';

normalizeUrl('sindresorhus.com');
//=> 'http://sindresorhus.com'

normalizeUrl('//www.sindresorhus.com:80/../baz?b=bar&a=foo');
//=> 'http://sindresorhus.com/baz?a=foo&b=bar'
```
*/

export default function normalizeUrl(urlString: string, opts?: Options): string {
	const options = {
		defaultProtocol: 'http',
		normalizeProtocol: true,
		forceHttp: false,
		forceHttps: false,
		stripAuthentication: true,
		stripHash: false,
		stripTextFragment: true,
		stripWWW: true,
		removeQueryParameters: [/^utm_\w+/i],
		removeTrailingSlash: true,
		removeSingleSlash: true,
		removeDirectoryIndex: false,
		removeExplicitPort: false,
		sortQueryParameters: true,
		...opts,
	}

	// Legacy: Append `:` to the protocol if missing.
	if (typeof options.defaultProtocol === 'string' && !options.defaultProtocol.endsWith(':')) {
		options.defaultProtocol = `${options.defaultProtocol}:`
	}

	urlString = urlString.trim()

	// Data URL
	if (/^data:/i.test(urlString)) {
		return normalizeDataURL(urlString, options)
	}

	if (hasCustomProtocol(urlString)) {
		return urlString
	}

	const hasRelativeProtocol = urlString.startsWith('//')
	const isRelativeUrl = !hasRelativeProtocol && /^\.*\//.test(urlString)

	// Prepend protocol
	if (!isRelativeUrl) {
		urlString = urlString.replace(/^(?!(?:\w+:)?\/\/)|^\/\//, options.defaultProtocol)
	}

	const urlObject = new URL(urlString)

	if (options.forceHttp && options.forceHttps) {
		throw new Error('The `forceHttp` and `forceHttps` options cannot be used together')
	}

	if (options.forceHttp && urlObject.protocol === 'https:') {
		urlObject.protocol = 'http:'
	}

	if (options.forceHttps && urlObject.protocol === 'http:') {
		urlObject.protocol = 'https:'
	}

	// Remove auth
	if (options.stripAuthentication) {
		urlObject.username = ''
		urlObject.password = ''
	}

	// Remove hash
	if (options.stripHash) {
		urlObject.hash = ''
	} else if (options.stripTextFragment) {
		urlObject.hash = urlObject.hash.replace(/#?:~:text.*?$/i, '')
	}

	// Remove duplicate slashes if not preceded by a protocol
	// NOTE: This could be implemented using a single negative lookbehind
	// regex, but we avoid that to maintain compatibility with older js engines
	// which do not have support for that feature.
	if (urlObject.pathname) {
		// TODO: Replace everything below with `urlObject.pathname = urlObject.pathname.replace(/(?<!\b[a-z][a-z\d+\-.]{1,50}:)\/{2,}/g, '/');` when Safari supports negative lookbehind.

		// Split the string by occurrences of this protocol regex, and perform
		// duplicate-slash replacement on the strings between those occurrences
		// (if any).
		const protocolRegex = /\b[a-z][a-z\d+\-.]{1,50}:\/\//g

		let lastIndex = 0
		let result = ''
		for (;;) {
			const match = protocolRegex.exec(urlObject.pathname)
			if (!match) {
				break
			}

			const protocol = match[0]
			const protocolAtIndex = match.index
			const intermediate = urlObject.pathname.slice(lastIndex, protocolAtIndex)

			result += intermediate.replace(/\/{2,}/g, '/')
			result += protocol
			lastIndex = protocolAtIndex + protocol.length
		}

		const remnant = urlObject.pathname.slice(lastIndex, urlObject.pathname.length)
		result += remnant.replace(/\/{2,}/g, '/')

		urlObject.pathname = result
	}

	// Decode URI octets
	if (urlObject.pathname) {
		try {
			urlObject.pathname = decodeURI(urlObject.pathname)
		} catch {}
	}

	// Remove directory index
	if (options.removeDirectoryIndex === true) {
		options.removeDirectoryIndex = [/^index\.[a-z]+$/]
	}

	if (Array.isArray(options.removeDirectoryIndex) && options.removeDirectoryIndex.length > 0) {
		let pathComponents = urlObject.pathname.split('/')
		const lastComponent = pathComponents[pathComponents.length - 1]

		if (testParameter(lastComponent, options.removeDirectoryIndex)) {
			pathComponents = pathComponents.slice(0, -1)
			urlObject.pathname = pathComponents.slice(1).join('/') + '/'
		}
	}

	if (urlObject.hostname) {
		// Remove trailing dot
		urlObject.hostname = urlObject.hostname.replace(/\.$/, '')

		// Remove `www.`
		if (options.stripWWW && /^www\.(?!www\.)[a-z\-\d]{1,63}\.[a-z.\-\d]{2,63}$/.test(urlObject.hostname)) {
			// Each label should be max 63 at length (min: 1).
			// Source: https://en.wikipedia.org/wiki/Hostname#Restrictions_on_valid_host_names
			// Each TLD should be up to 63 characters long (min: 2).
			// It is technically possible to have a single character TLD, but none currently exist.
			urlObject.hostname = urlObject.hostname.replace(/^www\./, '')
		}
	}

	// Remove query unwanted parameters
	if (Array.isArray(options.removeQueryParameters)) {
		// @ts-ignore
		for (const key of [...urlObject.searchParams.keys()]) {
			if (testParameter(key, options.removeQueryParameters)) {
				urlObject.searchParams.delete(key)
			}
		}
	}

	if (!Array.isArray(options.keepQueryParameters) && options.removeQueryParameters === true) {
		urlObject.search = ''
	}

	// Keep wanted query parameters
	if (Array.isArray(options.keepQueryParameters) && options.keepQueryParameters.length > 0) {
		// @ts-ignore
		for (const key of [...urlObject.searchParams.keys()]) {
			if (!testParameter(key, options.keepQueryParameters)) {
				urlObject.searchParams.delete(key)
			}
		}
	}

	// Sort query parameters
	if (options.sortQueryParameters) {
		urlObject.searchParams.sort()

		// Calling `.sort()` encodes the search parameters, so we need to decode them again.
		try {
			urlObject.search = decodeURIComponent(urlObject.search)
		} catch {}
	}

	if (options.removeTrailingSlash) {
		urlObject.pathname = urlObject.pathname.replace(/\/$/, '')
	}

	// Remove an explicit port number, excluding a default port number, if applicable
	if (options.removeExplicitPort && urlObject.port) {
		urlObject.port = ''
	}

	const oldUrlString = urlString

	// Take advantage of many of the Node `url` normalizations
	urlString = urlObject.toString()

	if (!options.removeSingleSlash && urlObject.pathname === '/' && !oldUrlString.endsWith('/') && urlObject.hash === '') {
		urlString = urlString.replace(/\/$/, '')
	}

	// Remove ending `/` unless removeSingleSlash is false
	if ((options.removeTrailingSlash || urlObject.pathname === '/') && urlObject.hash === '' && options.removeSingleSlash) {
		urlString = urlString.replace(/\/$/, '')
	}

	// Restore relative protocol, if applicable
	if (hasRelativeProtocol && !options.normalizeProtocol) {
		urlString = urlString.replace(/^http:\/\//, '//')
	}

	// Remove http/https
	if (options.stripProtocol) {
		urlString = urlString.replace(/^(?:https?:)?\/\//, '')
	}

	return urlString
}
