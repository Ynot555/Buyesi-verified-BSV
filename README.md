# Buyesi Youth Verified

Verifiable skills certificates for Buyesi Youth Initiative (Uganda), anchored on the BSV blockchain.

Staff issue a certificate. The server stores the details in a local database and writes only a
SHA-256 fingerprint of the record to BSV in an OP_RETURN output. Anyone can scan the certificate's
QR code to check that it is genuine and unchanged. No personal data goes on-chain.

## How it works
1. Staff sign in and issue a certificate (name, programme, date).
2. The server hashes the record and broadcasts the hash to BSV through ARC.
3. The public page `/v/<ID>` recomputes the hash and compares it with the one on-chain.

## Stack
Node.js 22.13+, TypeScript, Express, built-in `node:sqlite`, `@bsv/sdk`, GorillaPool ARC, WhatsOnChain.

## Run locally
```bash
npm install
cp .env.example .env     # then fill in BSV_WIF and STAFF_TOKEN
npm run keygen           # creates a wallet key
npm run balance          # fund the printed address with a small amount of BSV
npm start
```
Open http://localhost:3000 and sign in with your STAFF_TOKEN.

## Notes
- Keep only a small balance in the server wallet and never commit `.env`.
- `anchor.ts` includes a tolerant ARC broadcaster because `@bsv/sdk` 4.1.1 reported
  `ERR_INVALID_RESPONSE` for broadcasts that had in fact succeeded.

## Licence
MIT