import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SCRYPT_N = 16384
const KEYLEN = 64

/** Format: scrypt$n$saltHex$hashHex */
export function hashPassword(password: string): string {
  if (password.length < 8) throw new Error('password must be at least 8 characters')
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEYLEN, { N: SCRYPT_N })
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false
  const n = Number(parts[1])
  const salt = Buffer.from(parts[2]!, 'hex')
  const expected = Buffer.from(parts[3]!, 'hex')
  const actual = scryptSync(password, salt, expected.length, { N: n })
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
