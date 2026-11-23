# Buyesi Youth Verified

Verifiable certificates for **Buyesi Youth Initiative**, a goat-farming organisation in Puti-Puti,
Pallisa, Uganda. *Let's grow with goats.*

When a child, farmer, mentor, volunteer or supporter completes something with Buyesi, staff issue a
certificate. Anyone can scan its QR code to check that it is genuine and has not been altered. A
fingerprint of each certificate is recorded on the BSV blockchain, so it cannot be quietly changed or
faked later.

> **Status: working prototype.** It issues and verifies certificates and records them on BSV.
> We are adapting it to fit how Buyesi works. See the roadmap below.

## Why Buyesi needs this

- **Children's progress becomes portable proof.** Each child in *Every Goat, Every Child's Future*
  moves through goat care, herd growth, breed upgrading and commercial farming. Certificates give
  children, families, schools and mentors proof of every step.
- **Donors and partners can trust the numbers.** Certificates are checkable by anyone, and the
  staff screen produces a summary of certificates issued per programme for donor and grant reports.
- **Farmer groups** in the Rural Breeding Model can show training they have completed.
- **Goat Guardians** (sponsors) and volunteers can receive a certificate that proves their support.

## Certificate types

| Programme | Certificates |
|---|---|
| Every Goat, Every Child's Future | Goat Care and Animal Husbandry; Goat Nutrition and Feeding; Goat Breeding and Reproduction; Digital Herd Records (BIGA app); Financial Literacy and Money Management; Entrepreneurship and Goal-Setting; Goat Received; Herd Growth Milestone; Breed Upgrade Milestone; Young Commercial Goat Farmer; School Attendance and Learning Award |
| Buyesi Rural Breeding Model | Advanced Breeding and Husbandry Training; Pasture and Fodder Production; Animal Health Management; Farmer Group Membership |
| Community and supporters | Mentor Certificate; Volunteer Service; Goat Guardian (Sponsor) |

To change this list, edit the `<select id="prog">` block in `public/index.html`.

## Protecting children

Most holders are children aged 9 to 15, so privacy is the default. See [PRIVACY.md](PRIVACY.md).

- The public verify page shows a child's **first name and last initial only**, never notes.
- Staff must confirm that the **parent or guardian has agreed** before a child's certificate is issued.
- **No personal data goes on the blockchain.** Only a fingerprint does.

## How it works

1. Staff sign in and issue a certificate.
2. The server stores the record and creates a SHA-256 fingerprint of it.
3. The fingerprint is written to BSV in an `OP_RETURN` output (tag `BYV1`).
4. Scanning the QR code opens `/v/<ID>`, which recomputes the fingerprint and compares it with the one on-chain.

## Stack

Node.js 22.13+, TypeScript, Express, built-in `node:sqlite`, [`@bsv/sdk`](https://github.com/bsv-blockchain),
GorillaPool ARC for broadcasting, WhatsOnChain for reading the chain.

## Run it on your computer

```bash
npm install
cp .env.example .env     # then fill in BSV_WIF and STAFF_TOKEN
npm run test             # offline check, uses no money
npm run keygen           # creates a wallet key. Keep the WIF secret
npm run balance          # fund the printed address with a small amount of BSV
npm start
```

Open http://localhost:3000 and sign in with `STAFF_TOKEN`.

## Put it online

See `deploy/` for the service file, Caddy config, and backup script. The steps are in the project guide.
Run only **one** copy of the app per wallet, because two copies spending the same coins will clash.

## Roadmap

1. Put it online at `verify.buyesi.org` and link it from www.buyesi.org
2. Staff accounts for each person instead of one shared password
3. Goat handover records: anchor each goat given to a child, to pair with BIGA herd data
4. Goat Guardian donor certificates and an open ledger of donations and spending
5. SMS and WhatsApp delivery of certificate links

## Notes for developers

- `anchor.ts` has its own ARC broadcaster, because `@bsv/sdk` 4.1.1 reported `ERR_INVALID_RESPONSE`
  for broadcasts that had in fact succeeded.
- Never commit `.env` or `buyesi.db`. Both are in `.gitignore`.
- Keep only a small balance in the server wallet.

## Contact

Buyesi Youth Initiative, Puti-Puti Subcounty, Mpongi Parish, Buyesi Village, P.O. Box 260007,
Pallisa, Uganda. info@buyesi.org · +256 703 660 479 · https://www.buyesi.org

## Licence

MIT. See [LICENSE](LICENSE).
