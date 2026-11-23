import 'dotenv/config'
import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import QRCode from 'qrcode'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { anchor, readAnchor } from './anchor.js'

const PORT = Number(process.env.PORT ?? 3000)
const HOST = process.env.HOST ?? '0.0.0.0' // set HOST=127.0.0.1 on the server (Caddy sits in front)
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`

const db = new DatabaseSync('buyesi.db')
db.exec(`CREATE TABLE IF NOT EXISTS certs(
  id TEXT PRIMARY KEY, name TEXT, programme TEXT, completed TEXT,
  details TEXT, issued TEXT, hash TEXT, txid TEXT, status TEXT,
  minor INTEGER DEFAULT 0, consent INTEGER DEFAULT 0)`)
// Databases created by the first version lack the two newest columns
for (const col of ['minor', 'consent']) {
  const cols = db.prepare('PRAGMA table_info(certs)').all() as any[]
  if (!cols.some(c => c.name === col)) db.exec(`ALTER TABLE certs ADD COLUMN ${col} INTEGER DEFAULT 0`)
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
// The fingerprint covers these fields only. minor/consent are NOT part of it, so old records stay valid.
const canon = (c: any) => JSON.stringify([c.id, c.name, c.programme, c.completed, c.details, c.issued])
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newId = () => 'BYV-' + [...randomBytes(6)].map(b => ALPHABET[b % ALPHABET.length]).join('')
const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c])

// Children's names are shortened on the public page: "Amina Nakato" becomes "Amina N."
function publicName(name: string, minor: boolean): string {
  if (!minor) return name
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0]
}

const app = express()
app.set('trust proxy', 1) // we run behind exactly one proxy (Caddy)
app.use(express.json())
app.use(express.static('public'))

// ---- Staff login with a limit on wrong guesses ----
const fails = new Map<string, { n: number; until: number }>()
const sameText = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

const staff: express.RequestHandler = (req, res, next) => {
  const ip = req.ip ?? 'unknown'
  const now = Date.now()
  const f = fails.get(ip)
  if (f && f.n >= 10 && now < f.until)
    return void res.status(429).json({ error: 'Too many wrong attempts. Please try again in 15 minutes.' })
  const token = process.env.STAFF_TOKEN
  if (token && sameText(String(req.headers.authorization ?? ''), `Bearer ${token}`)) {
    fails.delete(ip)
    return next()
  }
  fails.set(ip, { n: (f && now < f.until ? f.n : 0) + 1, until: now + 15 * 60_000 })
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
  const minor = c.minor === 1
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
    id: c.id as string, minor,
    name: publicName(c.name, minor),                  // public: shortened for children
    programme: c.programme as string, completed: c.completed as string,
    details: minor ? '' : (c.details as string)       // free-text notes are never shown for children
  }
}

// ---- Staff endpoints ----
app.post('/api/certificates', staff, (req, res) => {
  const { name, programme, completed, details = '' } = req.body ?? {}
  const minor = req.body?.minor !== false // children's privacy is the default
  const consent = req.body?.consent === true
  if (!name || !programme || !completed)
    return void res.status(400).json({ error: 'Name, programme and completion date are required.' })
  if (minor && !consent)
    return void res.status(400).json({ error: "Confirm that the child's parent or guardian has agreed before issuing." })
  const c = {
    id: newId(), name: String(name).trim(), programme: String(programme).trim(),
    completed: String(completed).trim(), details: String(details).trim(), issued: new Date().toISOString()
  }
  const hash = sha(canon(c))
  db.prepare(`INSERT INTO certs(id,name,programme,completed,details,issued,hash,txid,status,minor,consent)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(c.id, c.name, c.programme, c.completed, c.details, c.issued, hash, null, 'pending', minor ? 1 : 0, consent ? 1 : 0)
  runAnchor(c.id, hash) // runs in the background so staff are never kept waiting
  res.status(201).json({ id: c.id, hash, verifyUrl: `${BASE_URL}/v/${c.id}` })
})

app.get('/api/certificates', staff, (_req, res) => {
  res.json(db.prepare(
    'SELECT id, name, programme, completed, status, txid, minor FROM certs ORDER BY issued DESC LIMIT 100').all())
})

// Totals for donor and grant reports. Contains no names.
app.get('/api/report', staff, (_req, res) => {
  const n = (sql: string) => (db.prepare(sql).get() as any).n as number
  res.json({
    total: n('SELECT COUNT(*) n FROM certs'),
    anchored: n("SELECT COUNT(*) n FROM certs WHERE status='anchored'"),
    children: n('SELECT COUNT(*) n FROM certs WHERE minor=1'),
    byProgramme: db.prepare('SELECT programme, COUNT(*) n FROM certs GROUP BY programme ORDER BY n DESC, programme').all(),
    byMonth: db.prepare('SELECT substr(issued,1,7) AS month, COUNT(*) n FROM certs GROUP BY month ORDER BY month').all()
  })
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
    body = '<h1>Certificate not found</h1><p>No certificate has this ID. Check the ID and try again, or contact us at <a href="mailto:info@buyesi.org">info@buyesi.org</a>.</p>'
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
      ${r.minor ? '<p class="small">The name is shortened to protect the child\u2019s privacy.</p>' : ''}
      <p class="small">Certificate ID ${esc(r.id)}<br>${anchorLine}</p>`
  }
  res.send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Buyesi Youth Verified</title>
<style>body{font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:560px;margin:0 auto;padding:0 18px 40px;color:#17231c;background:#f7f6f1}
.top{height:8px;background:linear-gradient(90deg,#2E8B57 75%,#f2b705 75%);margin:0 -18px 22px}
.ok{color:#14663f}.bad{color:#a3261c}.who{font-size:1.8rem;font-weight:800;margin:.2em 0}.small{color:#5d6b62;font-size:.9rem;word-break:break-word}
h1{font-size:1.5rem}a{color:#14663f}footer{margin-top:36px;padding-top:14px;border-top:1px solid #d9dcd3;color:#5d6b62;font-size:.88rem}
@media(prefers-color-scheme:dark){body{background:#0f1713;color:#eef2ec}.ok{color:#7fd3a4}.bad{color:#ff8a7e}.small,footer{color:#9bab9f}a{color:#7fd3a4}footer{border-color:#2b3b32}}</style>
<body><div class="top"></div><p><b>Buyesi Youth Initiative</b><br><span class="small">Puti-Puti, Pallisa, Uganda</span></p>${body}
<footer>Let\u2019s grow with goats. <a href="https://www.buyesi.org">www.buyesi.org</a> · <a href="mailto:info@buyesi.org">info@buyesi.org</a></footer></body></html>`)
})

app.listen(PORT, HOST, () => console.log(`Buyesi Verified running at ${BASE_URL}`))
