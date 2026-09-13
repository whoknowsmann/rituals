use anchor_lang::{prelude::Pubkey, InstructionData};

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[test]
fn ritual_instruction_data_matches_frozen_vectors() {
    let key = |byte| Pubkey::new_from_array([byte; 32]);
    let vectors = [
        ("activate_ritual", rituals::instruction::ActivateRitual {}.data(), "bc6dc539757759fb"),
        ("approve_claim", rituals::instruction::ApproveClaim { claim_version: 0 }.data(), "4ae4d33f8cff45d200"),
        ("cancel_unactivated", rituals::instruction::CancelUnactivated {}.data(), "add9e27172c7ef52"),
        ("claim_completion", rituals::instruction::ClaimCompletion { event_index: 3, claim_version: 0 }.data(), "59095345b0037a240300"),
        ("close_terminal_vaults", rituals::instruction::CloseTerminalVaults {}.data(), "e50aa451c77bdb15"),
        ("finalize_event", rituals::instruction::FinalizeEvent { event_index: 3 }.data(), "58f67b696494aaec03"),
        ("fund_member", rituals::instruction::FundMember {}.data(), "ea9ccffc9418a2ee"),
        ("initialize_current_event", rituals::instruction::InitializeCurrentEvent { event_index: 3 }.data(), "3138bc0b0b0efd8f03"),
        ("question_claim", rituals::instruction::QuestionClaim { claim_version: 0 }.data(), "3229d6a8f52dfb9800"),
        ("initialize_protocol_config", rituals::instruction::InitializeProtocolConfig { allowed_stake_mint: key(22), fee_recipient: key(23), fee_basis_points: 250, minimum_fee: 11, maximum_fee: 999, maximum_member_stake: 1000 }.data(), "1c322be9f4627b7616161616161616161616161616161616161616161616161616161616161616161717171717171717171717171717171717171717171717171717171717171717fa000b00000000000000e703000000000000e803000000000000"),
        ("create_ritual", rituals::instruction::CreateRitual { nonce: 7, rule_digest: [31; 32], members: vec![key(11), key(12), key(13)], member_total_stake: 200, schedule: vec![rituals::EventWindow { opens: 100, deadline: 200, resolution: 300 }, rituals::EventWindow { opens: 400, deadline: 500, resolution: 600 }], additional_confirmation_threshold: 2, fee_payer_mode: rituals::FeePayerMode::Host }.data(), "613422ab19aa103a07000000000000001f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f030000000b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0dc800000000000000020000006400000000000000c8000000000000002c010000000000009001000000000000f40100000000000058020000000000000200"),
    ];
    for (name, actual, expected) in vectors {
        assert_eq!(hex(&actual), expected, "{name}");
    }
}
