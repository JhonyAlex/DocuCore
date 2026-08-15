import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto'
const KEY_LENGTH = 64
const COST = 32_768
const BLOCK_SIZE = 8
const PARALLELIZATION = 1

export const PASSWORD_MIN_LENGTH = 12

function scrypt(password: string, salt: string, cost: number, blockSize: number, parallelization: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, KEY_LENGTH, { N: cost, r: blockSize, p: parallelization, maxmem: 64 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived))
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const derived = await scrypt(password, salt, COST, BLOCK_SIZE, PARALLELIZATION)
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt}$${derived.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, salt, encodedHash] = stored.split('$')
  if (algorithm !== 'scrypt' || !cost || !blockSize || !parallelization || !salt || !encodedHash) return false
  const expected = Buffer.from(encodedHash, 'base64url')
  if (expected.length !== KEY_LENGTH) return false
  try {
    const actual = await scrypt(password, salt, Number(cost), Number(blockSize), Number(parallelization))
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function passwordIsValid(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= 256
}
