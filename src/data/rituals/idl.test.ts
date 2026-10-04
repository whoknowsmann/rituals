import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import idl from './idl/rituals.json'
import { ACCOUNT_DISCRIMINATORS } from './accounts'
import { RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'
import { INSTRUCTION_DISCRIMINATORS } from './instructionData'

const idlType = (type: unknown): string => {
  if (typeof type === 'string') return type === 'pubkey' ? 'Pubkey' : type
  const t = type as { vec?: unknown; array?: unknown; defined?: unknown }
  if (t.vec !== undefined) return `Vec<${idlType(t.vec) === 'pubkey' ? 'Pubkey' : idlType(t.vec)}>`
  if (t.array !== undefined) return '[u8;32]'
  if (t.defined !== undefined) return typeof t.defined === 'string' ? t.defined : (t.defined as { name: string }).name
  return 'unknown'
}

describe('frozen Rituals IDL', () => {
  it('contains the exact current instruction and account/type surface', () => {
    const instructions = ['activate_ritual','approve_claim','cancel_unactivated','claim_completion','close_terminal_vaults','create_ritual','create_solo_ritual','declare_skip','finalize_event','fund_member','initialize_current_event','initialize_protocol_config','initialize_season','question_claim','update_protocol_config']
    expect(idl.instructions.map(x => x.name)).toEqual(instructions)
    expect(idl.accounts.map(x => x.name).sort()).toEqual(['CompletionClaim','ProtocolConfig','Ritual','RitualEvent','Season'].sort())
    expect(idl.types.map(x => x.name)).toEqual(expect.arrayContaining(['EventWindow','FeePayerMode','RitualStatus','EventStatus','ClaimStatus','VoidReason']))
    const ritual = idl.types.find(x => x.name === 'Ritual')
    expect(ritual && 'type' in ritual && ritual.type.kind === 'struct' && ritual.type.fields?.some((f: { name: string }) => f.name === 'vaults_closed')).toBe(true)
  })

  it('keeps instruction discriminators and ordered argument types synchronized', () => {
    const manifest: Record<string, readonly [string, string][]> = {
      activate_ritual: [], approve_claim: [['claim_version', 'u8']], cancel_unactivated: [], claim_completion: [['event_index', 'u8'], ['claim_version', 'u8']], close_terminal_vaults: [],
      create_ritual: [['nonce', 'u64'], ['rule_digest', '[u8;32]'], ['members', 'Vec<Pubkey>'], ['member_total_stake', 'u64'], ['schedule', 'Vec<EventWindow>'], ['additional_confirmation_threshold', 'u8'], ['fee_payer_mode', 'FeePayerMode']],
      create_solo_ritual: [['nonce', 'u64'], ['rule_digest', '[u8;32]'], ['member_total_stake', 'u64'], ['schedule', 'Vec<EventWindow>'], ['witness', 'unknown']], declare_skip: [['event_index', 'u8']],
      finalize_event: [['event_index', 'u8']], fund_member: [], initialize_current_event: [['event_index', 'u8']], initialize_protocol_config: [['allowed_stake_mint', 'Pubkey'], ['fee_recipient', 'Pubkey'], ['fee_basis_points', 'u16'], ['minimum_fee', 'u64'], ['maximum_fee', 'u64'], ['maximum_member_stake', 'u64']], initialize_season: [['season_id', '[u8;32]'], ['title_digest', '[u8;32]'], ['schedule', 'Vec<EventWindow>'], ['start_at', 'i64'], ['end_at', 'i64']], question_claim: [['claim_version', 'u8']],
      update_protocol_config: [['fee_basis_points', 'u16'], ['minimum_fee', 'u64'], ['maximum_fee', 'u64']],
    }
    for (const instruction of idl.instructions) {
      expect(Array.from(instruction.discriminator)).toEqual(Array.from(INSTRUCTION_DISCRIMINATORS[instruction.name as keyof typeof INSTRUCTION_DISCRIMINATORS]))
      expect(instruction.args.map(arg => [arg.name, idlType(arg.type)])).toEqual(manifest[instruction.name])
    }
  })
  it('keeps decoder discriminators and ordered account fields synchronized with IDL', () => {
    for (const account of idl.accounts) {
      const key = account.name as keyof typeof ACCOUNT_DISCRIMINATORS
      expect(Array.from(account.discriminator)).toEqual(Array.from(ACCOUNT_DISCRIMINATORS[key]))
    }
    const fields = (name: string) => {
      const item = idl.types.find(type => type.name === name)
      return item && 'type' in item && item.type.kind === 'struct' && item.type.fields ? item.type.fields.map(field => field.name) : []
    }
    expect(idl.instructions.find(instruction => instruction.name === 'activate_ritual')?.accounts.map(account => [account.name, Boolean((account as { optional?: boolean }).optional)]))
      .toEqual([['protocol_config', false], ['ritual', false], ['season', true], ['stake_mint', false], ['stake_vault', false], ['fee_vault', false], ['fee_recipient_token', false], ['token_program', false]])
    expect(fields('ProtocolConfig')).toEqual(['schema_version','authority','allowed_stake_mint','fee_recipient','fee_basis_points','minimum_fee','maximum_fee','maximum_member_stake','max_members','max_events','paused','bump'])
    expect(fields('Ritual')).toContain('season')
    expect(fields('Ritual')).toContain('vaults_closed')
    expect(fields('Season')).toEqual(['schema_version','protocol_config','season_id','title_digest','schedule','start_at','end_at','authority','participant_count','checked_in_count','bump'])
    expect(fields('CompletionClaim')).toContain('claim_version')
    expect(idl.instructions.find(instruction => instruction.name === 'claim_completion')?.args.map(arg => arg.name)).toContain('claim_version')
  })

  it('proves the frozen address matches declare_id without a second identity', () => {
    const rust = fs.readFileSync(path.resolve(__dirname, '../../../programs/rituals/src/lib.rs'), 'utf8')
    const match = rust.match(/declare_id!\("([^"]+)"\)/)
    expect(match?.[1]).toBe(RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID)
    expect(idl.address).toBe(RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID)
  })
})
