import 'dotenv/config'
import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import QRCode from 'qrcode'
import { createHash, randomBytes } from 'node:crypto'
import { anchor, readAnchor } from './anchor.js'

const PORT = Number(process.env.PORT ?? 3000)
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`

const db = new DatabaseSync('buyesi.db')
db.exec(`CREATE TABLE IF NOT EXISTS certs(
  id TEXT PRIMARY KEY, name TEXT, programme TEXT, completed TEXT,
  details TEXT, issued TEXT, hash TEXT, txid TEXT, status TEXT)`)

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const canon = (c: any) => JSON.stringify([c.id, c.name, c.programme, c.completed, c.details, c.issued])
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newId = () => 'BYV-' + [...randomBytes(6)].map(b => ALPHABET[b % ALPHABET.length]).join('')
const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c])

const app = express()
app.use(express.json())
app.use(express.static('public'))

const staff: express.RequestHandler = (req, res, next) => {
  const token = process.env.STAFF_TOKEN
  if (token && req.headers.authorization === `Bearer ${token}`) return next()
  res.status(401).json({ error: 'Wrong or missing staff password.' })
}

function runAnchor(id: string, hash: string) {
  anchor(hash)
    .then(txid => db.prepare('UPDATE certs SET txid=?, status=? WHERE id=?').run(txid, 'anchored', id))
    .catch(e => {
      console.error(`Anchor failed for ${id}:`, e.message)
      db.prepare('UPDATE certs SET status=? WHERE id=?').run('failed', id)
    })
}

async function verifyData(rawId: string) {
  const c = db.prepare('SELECT * FROM certs WHERE id=?').get(rawId.toUpperCase()) as any
  if (!c) return { found: false as const }
  const intact = sha(canon(c)) === c.hash
  // onChain: true = matches blockchain, false = blockchain hash differs, null = cannot confirm right now
  let onChain: boolean | null = null
  if (c.txid) {
    try {
      const h = await readAnchor(c.txid)
      onChain = h === null ? null : h === c.hash
    } catch {
      onChain = null
    }
  }
  return {
    found: true as const, intact, onChain, status: c.status as string, txid: c.txid as string | null,
    id: c.id as string, name: c.name as string, programme: c.programme as string,
    completed: c.completed as string, details: c.details as string
  }
}

// ---- Staff endpoints ----
app.post('/api/certificates', staff, (req, res) => {
  const { name, programme, completed, details = '' } = req.body ?? {}
  if (!name || !programme || !completed)
    return void res.status(400).json({ error: 'Name, programme and completion date are required.' })
  const c = {
    id: newId(), name: String(name).trim(), programme: String(programme).trim(),
    completed: String(completed).trim(), details: String(details).trim(), issued: new Date().toISOString()
  }
  const hash = sha(canon(c))
  db.prepare('INSERT INTO certs VALUES (?,?,?,?,?,?,?,?,?)')
    .run(c.id, c.name, c.programme, c.completed, c.details, c.issued, hash, null, 'pending')
  runAnchor(c.id, hash) // runs in the background so staff are never kept waiting
  res.status(201).json({ id: c.id, hash, verifyUrl: `${BASE_URL}/v/${c.id}` })
})

app.get('/api/certificates', staff, (_req, res) => {
  res.json(db.prepare(
    'SELECT id, name, programme, completed, status, txid FROM certs ORDER BY issued DESC LIMIT 100').all())
})

app.post('/api/retry', staff, (_req, res) => {
  const rows = db.prepare("SELECT id, hash FROM certs WHERE txid IS NULL AND status IN ('failed','pending')").all() as any[]
  rows.forEach(r => runAnchor(r.id, r.hash))
  res.json({ retrying: rows.length })
})

// ---- Public endpoints ----
app.get('/api/verify/:id', async (req, res) => {
  const r = await verifyData(req.params.id)
  res.status(r.found ? 200 : 404).json(r)
})

app.get('/qr/:id', async (req, res) => {
  res.type('png').send(await QRCode.toBuffer(`${BASE_URL}/v/${req.params.id}`, { width: 360, margin: 2 }))
})

app.get('/v/:id', async (req, res) => {
  const r = await verifyData(req.params.id)
  let body: string
  if (!r.found) {
    body = '<h1>Certificate not found</h1><p>No certificate has this ID. Check the ID and try again.</p>'
  } else {
    const bad = !r.intact || r.onChain === false
    const anchorLine = r.txid
      ? r.onChain === true
        ? `Confirmed on the BSV blockchain: <a href="https://whatsonchain.com/tx/${esc(r.txid)}">${esc(r.txid.slice(0, 16))}…</a>`
        : r.onChain === false
          ? 'The blockchain record does not match this certificate.'
          : 'Blockchain confirmation is not available right now. Try again in a few minutes.'
      : 'Being recorded on the blockchain. Check again in a few minutes.'
    body = `<h1 class="${bad ? 'bad' : 'ok'}">${bad ? 'Warning: this record does not match' : 'Genuine certificate'}</h1>
      <p class="who">${esc(r.name)}</p>
      <p>completed <b>${esc(r.programme)}</b> on ${esc(r.completed)}.</p>
      ${r.details ? `<p>${esc(r.details)}</p>` : ''}
      <p class="small">Certificate ID ${esc(r.id)}<br>${anchorLine}</p>`
  }
  res.send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Buyesi Youth Verified</title>
<style>body{font:17px/1.5 system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 18px;color:#17231c;background:#f7f6f1}
.ok{color:#14663f}.bad{color:#a3261c}.who{font-size:1.8rem;font-weight:800;margin:.2em 0}.small{color:#5d6b62;font-size:.9rem;word-break:break-word}
h1{font-size:1.5rem}@media(prefers-color-scheme:dark){body{background:#0f1713;color:#eef2ec}.ok{color:#7fd3a4}.bad{color:#ff8a7e}.small{color:#9bab9f}}</style>
<body><p><b>Buyesi Youth Initiative</b></p>${body}</body></html>`)
})

app.listen(PORT, () => console.log(`Buyesi Verified running at ${BASE_URL}`))
