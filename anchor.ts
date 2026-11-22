import { PrivateKey, P2PKH, Transaction, Script } from '@bsv/sdk'

export const WOC = 'https://api.whatsonchain.com/v1/bsv/main'

let _key: PrivateKey | null = null
export function getKey(): PrivateKey {
  if (!_key) {
    const wif = process.env.BSV_WIF
    if (!wif) throw new Error('BSV_WIF is not set. Add it to your .env file.')
    _key = PrivateKey.fromWif(wif)
  }
  return _key
}
export const getAddress = () => getKey().toAddress().toString()

// Tolerant ARC broadcaster. The SDK's built-in one rejects some valid answers from GorillaPool.
const ARC_OK = new Set(['SUCCESS','RECEIVED','QUEUED','STORED','REQUESTED_BY_NETWORK','SENT_TO_NETWORK',
  'ANNOUNCED_TO_NETWORK','ACCEPTED_BY_NETWORK','SEEN_ON_NETWORK','MINED','IMMUTABLE'])

export async function broadcastLenient(tx: Transaction, baseUrl?: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'XDeployment-ID': 'buyesi-verified' }
  if (process.env.ARC_API_KEY) headers.Authorization = `Bearer ${process.env.ARC_API_KEY}`
  let rawTx: string
  try { rawTx = tx.toHexEF() } catch { rawTx = tx.toHex() }
  const res = await fetch(`${baseUrl ?? process.env.ARC_URL ?? 'https://arc.gorillapool.io'}/v1/tx`,
    { method: 'POST', headers, body: JSON.stringify({ rawTx }) })
  const text = await res.text()
  let d: any = {}
  try { d = JSON.parse(text) } catch {}
  if (!res.ok) throw new Error(`ARC refused the transaction (HTTP ${res.status}): ${text.slice(0, 300)}`)
  if (d.txid && String(d.txid).toLowerCase() !== tx.id('hex'))
    throw new Error('ARC acknowledged a different transaction than the one sent')
  if (Array.isArray(d.competingTxs) && d.competingTxs.length > 0)
    throw new Error('Possible double spend: ' + text.slice(0, 300))
  const status = String(d.txStatus ?? '').toUpperCase()
  if (!ARC_OK.has(status)) throw new Error(`ARC status "${status || 'missing'}": ${text.slice(0, 300)}`)
}

// OP_FALSE OP_RETURN <"BYV1"> <32-byte hash>
export function opReturnScript(hashHex: string): Script {
  return new Script([
    { op: 0 },
    { op: 106 },
    { op: 4, data: Array.from(Buffer.from('BYV1')) },
    { op: 32, data: Array.from(Buffer.from(hashHex, 'hex')) }
  ])
}

export async function buildAnchorTx(
  src: Transaction,
  idx: number,
  hashHex: string,
  key: PrivateKey
): Promise<Transaction> {
  const tx = new Transaction()
  tx.addInput({
    sourceTransaction: src,
    sourceOutputIndex: idx,
    unlockingScriptTemplate: new P2PKH().unlock(key),
    sequence: 0xffffffff
  })
  tx.addOutput({ satoshis: 0, lockingScript: opReturnScript(hashHex) })
  tx.addOutput({ lockingScript: new P2PKH().lock(key.toAddress()), change: true })
  await tx.fee()
  await tx.sign()
  return tx
}

export function extractHash(tx: Transaction): string | null {
  // After parsing, the SDK keeps everything after OP_RETURN as one block, so match on the raw script.
  // Layout: 00 6a | 04 "BYV1" | 20 <32-byte hash>
  for (const o of tx.outputs) {
    const m = /^006a044259563120([0-9a-f]{64})$/.exec(o.lockingScript.toHex())
    if (m) return m[1]
  }
  return null
}

let last: Transaction | null = null // our most recent transaction (its change output is next input)
let chain: Promise<unknown> = Promise.resolve()

// Runs one anchor at a time so two requests never spend the same coin.
export function anchor(hashHex: string): Promise<string> {
  const p = chain.then(() => doAnchor(hashHex))
  chain = p.catch(() => {})
  return p
}

async function doAnchor(hashHex: string): Promise<string> {
  const key = getKey()
  const address = getAddress()
  let src: Transaction
  let idx: number

  if (last && last.outputs[1]) {
    src = last
    idx = 1
  } else {
    const res = await fetch(`${WOC}/address/${address}/unspent`)
    if (!res.ok) throw new Error(`Could not read wallet coins (${res.status})`)
    const utxos: any[] = await res.json()
    if (!utxos.length) throw new Error('Server wallet has no funds. Send a small amount of BSV to its address.')
    const u = utxos.sort((a, b) => b.value - a.value)[0]
    const hexRes = await fetch(`${WOC}/tx/${u.tx_hash}/hex`)
    if (!hexRes.ok) throw new Error(`Could not read source transaction (${hexRes.status})`)
    src = Transaction.fromHex(await hexRes.text())
    idx = u.tx_pos
  }

  const tx = await buildAnchorTx(src, idx, hashHex, key)
  try {
    await broadcastLenient(tx)
  } catch (e) {
    last = null
    throw e
  }
  last = Transaction.fromHex(tx.toHex()) // detach from history to keep memory small
  return tx.id('hex')
}

// Reads the hash back from the blockchain. Returns null if the transaction is not found yet.
// Throws if the chain service cannot be reached.
export async function readAnchor(txid: string): Promise<string | null> {
  const r = await fetch(`${WOC}/tx/${txid}/hex`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`Chain lookup failed (${r.status})`)
  return extractHash(Transaction.fromHex(await r.text()))
}