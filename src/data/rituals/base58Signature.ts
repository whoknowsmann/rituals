const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/

export function decodeCanonicalBase58Signature(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || value.length > 90 || !BASE58.test(value)) throw new Error('invalid signature')
  const bytes: number[] = [0]
  for (const character of value) {
    const digit = ALPHABET.indexOf(character)
    if (digit < 0) throw new Error('invalid signature')
    let carry = digit
    for (let index = 0; index < bytes.length; index += 1) {
      const product = bytes[index] * 58 + carry
      bytes[index] = product & 0xff
      carry = product >>> 8
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>>= 8 }
  }
  let leadingZeros = 0
  while (leadingZeros < value.length && value[leadingZeros] === '1') leadingZeros += 1
  const decodedLength = bytes.length === 1 && bytes[0] === 0 ? leadingZeros : bytes.length + leadingZeros
  if (decodedLength !== 64) throw new Error('invalid signature')
  const output = new Uint8Array(64)
  for (let i = 0; i < bytes.length; i += 1) output[63 - i] = bytes[i]
  return output
}

export function canonicalBase58Signature(value: unknown): string {
  const bytes = decodeCanonicalBase58Signature(value)
  if (bytes.every(byte => byte === 0)) return '1'.repeat(64)
  let digits = [0]
  for (const byte of bytes) { let carry = byte; for (let i = 0; i < digits.length; i += 1) { const n = digits[i] * 256 + carry; digits[i] = n % 58; carry = Math.floor(n / 58) }; while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58) } }
  let result = ''
  for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) result += '1'
  for (let i = digits.length - 1; i >= 0; i -= 1) result += ALPHABET[digits[i]]
  if (result !== value) throw new Error('noncanonical signature')
  return value
}
