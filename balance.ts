import 'dotenv/config'
import { getAddress, WOC } from './anchor.js'

const address = getAddress()
const b: any = await (await fetch(`${WOC}/address/${address}/balance`)).json()
console.log('Address:', address)
console.log('Balance (satoshis):', (b.confirmed ?? 0) + (b.unconfirmed ?? 0))
