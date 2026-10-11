// Force IPv4-only DNS lookups for Node scripts run from WSL.
// Why: WSL's DNS proxy (nameserver 10.255.255.254) hangs ~20s on AAAA queries
// for names that have no IPv6 record (api.devnet.solana.com, github.com, ...).
// Node's dual-stack lookup waits on it, so every fresh connection takes 11-15s
// and undici's 10s connect timeout fires -> "RPC request failed" /
// UND_ERR_CONNECT_TIMEOUT, while curl and the solana CLI appear to work.
// `--dns-result-order=ipv4first` does NOT help (both queries still run).
// Usage: NODE_OPTIONS="--require /path/to/ipv4-only.cjs" npx tsx scripts/x.ts
const dns = require('node:dns')
const orig = dns.lookup
dns.lookup = function (hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {} }
  if (typeof options === 'number') options = { family: options }
  options = Object.assign({}, options)
  if (!options.family) options.family = 4
  return orig.call(dns, hostname, options, callback)
}
