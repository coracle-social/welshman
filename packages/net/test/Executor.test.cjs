const assert = require('assert')
const {setContext} = require('@welshman/lib')
const {Executor, Echo, getDefaultNetContext} = require('@welshman/net')

const event = {
  "content": "👀",
  "created_at":1727389659,
  "id": "acaee505278bd8842ab6df906bf39bb143cf9905f36453c9bc13554cf5006e2d",
  "kind": 1,
  "pubkey": "6e468422dfb74a5738702a8823b9b28168abab8655faacb6853cd0ee15deee93",
  "sig": "3aa512e2dbcd704bd287e6a35eaa8c4388606d553d385e482cc94d536eea25585731c36da6658c941c4668a473860a12d75ba588ca50470df09f8827e164e640",
  "tags": [
    ["p","460c25e682fda7832b52d1f22d3d22b3176d972f60dcdc3212ed8c92ef85065c"],
    ["e","d423aa132e5dc741ddecbac5e67515b6fd900c2559058397ec7fd860b3d77ea6","wss://nostr.mom","root"]
  ]
}

setContext({net: getDefaultNetContext()})

describe('myFunction', () => {
  const target = new Echo()
  const executor = new Executor(target)

  it('should return the correct result', done => {
    const messages = []
    const neg = executor.diff({kinds: [1]}, [event], {})

    target.on('*', (...message) => messages.push(message))

    setTimeout(() => {
      neg.unsubscribe()
      assert.equal(messages[0][0], 'NEG-OPEN')
      assert.equal(messages[1][0], 'NEG-CLOSE')
      done()
    }, 10)
  })
})
