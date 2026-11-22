import { PrivateKey, P2PKH, Transaction } from '@bsv/sdk'
import { buildAnchorTx, extractHash } from './anchor.js'
import { createHash } from 'node:crypto'

// Builds an anchor transaction without touching the network and checks it.
const key = PrivateKey.fromRandom()
const funding = new Transaction()
funding.addOutput({ satoshis: 10000, lockingScript: new P2PKH().lock(key.toAddress()) })

const hash = createHash('sha256').update('test certificate').digest('hex')
const tx = await buildAnchorTx(funding, 0, hash, key)

const back = Transaction.fromHex(tx.toHex())
const ok = extractHash(back) === hash
const change = back.outputs[1]?.satoshis ?? 0
console.log('txid:', tx.id('hex'))
console.log('size (bytes):', tx.toHex().length / 2)
console.log('hash round-trips through OP_RETURN:', ok)
console.log('fee paid (satoshis):', 10000 - change)
console.log('input is signed:', tx.inputs[0].unlockingScript!.toHex().length > 0)
console.log('extended format builds:', tx.toHexEF().length > 0)
if (!ok) process.exit(1)
