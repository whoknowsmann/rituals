import { readFileSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'

export type CliArgs = Readonly<Record<string, string | boolean>>

export function parseCli(argv: readonly string[]): CliArgs {
  const result: Record<string, string | boolean> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const name = token.slice(2)
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`invalid option: ${token}`)
    const next = argv[index + 1]
    if (next === undefined || next.startsWith('--')) {
      result[name] = true
    } else {
      result[name] = next
      index += 1
    }
  }
  return Object.freeze(result)
}

export function option(args: CliArgs, name: string, fallback?: string): string | undefined {
  const value = args[name]
  if (value === undefined) return fallback
  if (typeof value !== 'string' || value.length === 0) throw new Error(`--${name} requires a value`)
  return value
}

export function requiredOption(args: CliArgs, name: string): string {
  const value = option(args, name)
  if (value === undefined) throw new Error(`missing required --${name}`)
  return value
}

export function flag(args: CliArgs, name: string): boolean {
  const value = args[name]
  if (value === undefined) return false
  if (value !== true) throw new Error(`--${name} does not take a value`)
  return true
}

export function integerOption(args: CliArgs, name: string, fallback: number): number {
  const raw = option(args, name)
  if (raw === undefined) return fallback
  if (!/^\d+$/.test(raw)) throw new Error(`--${name} must be a nonnegative integer`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw new Error(`--${name} is outside the safe integer range`)
  return value
}

export function readKeypair(path: string): Keypair {
  let raw: unknown
  try { raw = JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error(`cannot read keypair file: ${path}`) }
  if (!Array.isArray(raw) || raw.length !== 64 || raw.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) throw new Error(`invalid keypair file: ${path}`)
  try { return Keypair.fromSecretKey(Uint8Array.from(raw as number[])) } catch { throw new Error(`invalid keypair file: ${path}`) }
}

export function publicKeyOption(args: CliArgs, name: string, fallback?: PublicKey): PublicKey | undefined {
  const raw = option(args, name)
  if (raw === undefined) return fallback
  try {
    const value = new PublicKey(raw)
    if (value.toBase58() !== raw || value.equals(PublicKey.default)) throw new Error('non-canonical')
    return value
  } catch { throw new Error(`--${name} must be a canonical non-default public key`) }
}

export function connectionFor(args: CliArgs): { url: string; connection: Connection } {
  const url = option(args, 'url', 'https://api.devnet.solana.com') as string
  try { new URL(url) } catch { throw new Error(`--url is not a valid URL: ${url}`) }
  return { url, connection: new Connection(url, 'confirmed') }
}

export function isLocalUrl(url: string): boolean {
  const host = new URL(url).hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export function isDevnetUrl(url: string): boolean {
  return /devnet/i.test(new URL(url).hostname)
}

export function printJsonSummary(summary: unknown): void {
  console.log(JSON.stringify(summary, (_key, value: unknown) => {
    if (typeof value === 'bigint') return `${value.toString()}n`
    if (value instanceof PublicKey) return value.toBase58()
    if (value instanceof Uint8Array) return Buffer.from(value).toString('hex')
    return value
  }, 2))
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
