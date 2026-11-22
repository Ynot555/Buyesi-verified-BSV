import { PrivateKey } from '@bsv/sdk'

const k = PrivateKey.fromRandom()
console.log('\nWIF (SECRET - save in a password manager, put in .env):')
console.log(k.toWif())
console.log('\nAddress (safe to share - send a small amount of BSV here):')
console.log(k.toAddress())
console.log()
