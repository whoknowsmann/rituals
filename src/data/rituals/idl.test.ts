import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import idl from './idl/rituals.json'
import { RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID } from './programIds'

describe('frozen Rituals IDL', () => {
  it('contains the exact current instruction and account/type surface', () => {
    const instructions = ['activate_ritual','approve_claim','cancel_unactivated','claim_completion','close_terminal_vaults','create_ritual','finalize_event','fund_member','initialize_current_event','initialize_protocol_config','question_claim']
    expect(idl.instructions.map(x => x.name)).toEqual(instructions)
    expect(idl.accounts.map(x => x.name).sort()).toEqual(['CompletionClaim','ProtocolConfig','Ritual','RitualEvent'].sort())
    expect(idl.types.map(x => x.name)).toEqual(expect.arrayContaining(['EventWindow','FeePayerMode','RitualStatus','EventStatus','ClaimStatus','VoidReason']))
    const ritual = idl.types.find(x => x.name === 'Ritual')
    expect(ritual && 'type' in ritual && ritual.type.kind === 'struct' && ritual.type.fields?.some((f: {name:string}) => f.name === 'vaults_closed')).toBe(true)
  })
  it('proves the frozen address matches declare_id without a second identity', () => {
    const rust = fs.readFileSync(path.resolve(__dirname, '../../../programs/rituals/src/lib.rs'), 'utf8')
    const match = rust.match(/declare_id!\("([^"]+)"\)/)
    expect(match?.[1]).toBe(RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID)
    expect(idl.address).toBe(RITUALS_LOCAL_PLACEHOLDER_PROGRAM_ID)
  })
})
