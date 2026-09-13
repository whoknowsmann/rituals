use anchor_lang::{AccountSerialize, AnchorSerialize, Discriminator, Space};
use rituals::{
    ClaimStatus, CompletionClaim, EventStatus, EventWindow, FeePayerMode, ProtocolConfig, Ritual,
    RitualEvent, RitualStatus, VoidReason,
};
use solana_sdk::pubkey::Pubkey;

const PROGRAM_ID: Pubkey = rituals::ID;

const ACCOUNT_DATA_LENGTHS: [(&str, usize); 4] = [
    ("ProtocolConfig", 8 + ProtocolConfig::INIT_SPACE),
    ("Ritual", 8 + Ritual::INIT_SPACE),
    ("RitualEvent", 8 + RitualEvent::INIT_SPACE),
    ("CompletionClaim", 8 + CompletionClaim::INIT_SPACE),
];

fn assert_pda(seeds: &[&[u8]], expected: &str, bump: u8) {
    let (address, actual_bump) = Pubkey::find_program_address(seeds, &PROGRAM_ID);
    assert_eq!(address.to_string(), expected);
    assert_eq!(actual_bump, bump);
}

#[test]
fn pda_vectors_are_independent_from_typescript() {
    let creator = Pubkey::new_from_array([1; 32]);
    let claimant = Pubkey::new_from_array([2; 32]);
    assert_pda(
        &[b"protocol-config"],
        "6m5qUBdZjKwsrx1jJpR84SnUVQq8hYUhsDLR8wr9sFri",
        255,
    );
    let nonce_zero = 0u64.to_le_bytes();
    let (ritual, bump) =
        Pubkey::find_program_address(&[b"ritual", creator.as_ref(), &nonce_zero], &PROGRAM_ID);
    assert_eq!(
        ritual.to_string(),
        "56qqYFSNL8DigDgJzzE69dACMkg8V6BM5soH2psZ31A"
    );
    assert_eq!(bump, 254);
    let nonce_seven = 7u64.to_le_bytes();
    let (ritual7, bump7) =
        Pubkey::find_program_address(&[b"ritual", creator.as_ref(), &nonce_seven], &PROGRAM_ID);
    assert_eq!(
        ritual7.to_string(),
        "7gBbsqQ6kDrezFt6tiLESXxfHtjdE42uHCHGdxLRDLvW"
    );
    assert_eq!(bump7, 255);
    assert_pda(
        &[b"stake-vault", ritual7.as_ref()],
        "EUfajH79J35Qf4MY1eCBFjnP3dSEeYnHKqGtVvHmE3Hh",
        253,
    );
    assert_pda(
        &[b"fee-vault", ritual7.as_ref()],
        "4NxDFE9RyjB8ubghexEGLiqK8DiQnGA9DPd911EyXBLs",
        252,
    );
    let (event, event_bump) =
        Pubkey::find_program_address(&[b"event", ritual7.as_ref(), &[1]], &PROGRAM_ID);
    assert_eq!(
        event.to_string(),
        "6NdFN2VzV61wi1bRYz6RATyjumBkhR7M6GfxtW47Nu7u"
    );
    assert_eq!(event_bump, 255);
    assert_pda(
        &[b"event", ritual7.as_ref(), &[15]],
        "H9PGU7zHkDskgyMk2oM6RUzT86pDGkjz7oT9G76Cj84w",
        255,
    );
    assert_pda(
        &[b"claim", event.as_ref(), claimant.as_ref(), &[0]],
        "3diycyyrPajbEtpf8dkCNuZsPqHaVWZH7TNswGdqr2TJ",
        253,
    );
}

#[test]
fn account_discriminators_are_the_frozen_anchor_bytes() {
    assert_eq!(
        ProtocolConfig::DISCRIMINATOR,
        &[207, 91, 250, 28, 152, 179, 215, 209]
    );
    assert_eq!(
        Ritual::DISCRIMINATOR,
        &[59, 144, 213, 109, 22, 234, 192, 75]
    );
    assert_eq!(
        RitualEvent::DISCRIMINATOR,
        &[20, 35, 155, 231, 156, 20, 94, 160]
    );
    assert_eq!(
        CompletionClaim::DISCRIMINATOR,
        &[233, 130, 153, 175, 66, 45, 112, 112]
    );
}

#[test]
fn account_data_lengths_are_the_frozen_allocations() {
    assert_eq!(
        ACCOUNT_DATA_LENGTHS,
        [
            ("ProtocolConfig", 135),
            ("Ritual", 909),
            ("RitualEvent", 139),
            ("CompletionClaim", 121),
        ]
    );
}

#[allow(dead_code)]
fn serialize<T: AnchorSerialize>(value: &T) -> Vec<u8> {
    let mut bytes = Vec::new();
    value
        .serialize(&mut bytes)
        .expect("serialization must succeed");
    bytes
}

fn account_bytes<T: AccountSerialize + Discriminator + Space>(value: &T) -> Vec<u8> {
    let mut bytes = Vec::new();
    value
        .try_serialize(&mut bytes)
        .expect("account serialization must succeed");
    bytes.resize(8 + T::INIT_SPACE, 0);
    bytes
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[test]
fn real_anchor_account_vectors_are_frozen() {
    let creator = Pubkey::new_from_array([11; 32]);
    let member_two = Pubkey::new_from_array([12; 32]);
    let member_three = Pubkey::new_from_array([13; 32]);
    let authority = Pubkey::new_from_array([21; 32]);
    let mint = Pubkey::new_from_array([22; 32]);
    let fee_recipient = Pubkey::new_from_array([23; 32]);
    let locked_fee_recipient = Pubkey::new_from_array([24; 32]);
    let nonce = 7u64;
    let (ritual_key, ritual_bump) = Pubkey::find_program_address(
        &[b"ritual", creator.as_ref(), &nonce.to_le_bytes()],
        &PROGRAM_ID,
    );
    let (stake_vault, stake_vault_bump) =
        Pubkey::find_program_address(&[b"stake-vault", ritual_key.as_ref()], &PROGRAM_ID);
    let (fee_vault, fee_vault_bump) =
        Pubkey::find_program_address(&[b"fee-vault", ritual_key.as_ref()], &PROGRAM_ID);
    let (event_key, event_bump) =
        Pubkey::find_program_address(&[b"event", ritual_key.as_ref(), &[0]], &PROGRAM_ID);
    let claimant = member_two;
    let (_claim_key, claim_bump) = Pubkey::find_program_address(
        &[b"claim", event_key.as_ref(), claimant.as_ref(), &[0]],
        &PROGRAM_ID,
    );
    let schedule = vec![
        EventWindow {
            opens: 100,
            deadline: 200,
            resolution: 300,
        },
        EventWindow {
            opens: 400,
            deadline: 500,
            resolution: 600,
        },
    ];
    let protocol = ProtocolConfig {
        schema_version: 1,
        authority,
        allowed_stake_mint: mint,
        fee_recipient,
        fee_basis_points: 250,
        minimum_fee: 11,
        maximum_fee: 999,
        maximum_member_stake: u64::MAX,
        max_members: 6,
        max_events: 16,
        paused: false,
        bump: 255,
    };
    let ritual = Ritual {
        schema_version: 1,
        protocol_config: Pubkey::find_program_address(&[b"protocol-config"], &PROGRAM_ID).0,
        creator,
        nonce,
        rule_digest: [31; 32],
        stake_mint: mint,
        members: vec![creator, member_two, member_three],
        member_total_stake: 200,
        per_event_allocation: 100,
        schedule: schedule.clone(),
        additional_confirmation_threshold: 2,
        fee_payer_mode: FeePayerMode::Host,
        locked_activation_fee: 777,
        stake_decimals: 6,
        locked_fee_recipient,
        stake_vault,
        fee_vault,
        stake_vault_bump,
        fee_vault_bump,
        funded_members_bitmap: 0b111,
        funded_member_count: 3,
        funded_stake_total: 600,
        funded_fee_total: 777,
        status: RitualStatus::Active,
        current_event_index: 0,
        settled_event_count: 0,
        created_at: 10,
        activated_at: 20,
        cancelled_at: 0,
        completed_at: 0,
        vaults_closed: false,
        bump: ritual_bump,
    };
    let event = RitualEvent {
        schema_version: 1,
        ritual: ritual_key,
        event_index: 0,
        window: schedule[0].clone(),
        member_count: 3,
        status: EventStatus::Claiming,
        claimed_members_bitmap: 0b010,
        confirmed_members_bitmap: 0,
        questioned_members_bitmap: 0,
        initialized_at: 100,
        resolved_at: 0,
        settlement_version: 0,
        void_reason: VoidReason::None,
        event_pool: 0,
        forfeited_total: 0,
        payout_total: 0,
        refunded_total: 0,
        confirmed_member_count: 0,
        remainder_units: 0,
        remaining_stake_total_after: 0,
        bump: event_bump,
    };
    let claim = CompletionClaim {
        schema_version: 1,
        ritual: ritual_key,
        event: event_key,
        event_index: 0,
        claimant,
        member_index: 1,
        claim_version: 0,
        status: ClaimStatus::Pending,
        required_additional_confirmations: 2,
        approvals_bitmap: 0b001,
        approval_count: 1,
        claimed_at: 150,
        bump: claim_bump,
    };
    let vectors = [
        ("protocolConfig", account_bytes(&protocol), "cf5bfa1c98b3d7d101151515151515151515151515151515151515151515151515151515151515151516161616161616161616161616161616161616161616161616161616161616161717171717171717171717171717171717171717171717171717171717171717fa000b00000000000000e703000000000000ffffffffffffffff061000ff"),
        ("ritual", account_bytes(&ritual), "3b90d56d16eac04b015595753b5c00180ef5af3f28060f86e77219e8463c47d1b2786f96656691cc2b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b07000000000000001f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1616161616161616161616161616161616161616161616161616161616161616030000000b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0dc8000000000000006400000000000000020000006400000000000000c8000000000000002c010000000000009001000000000000f40100000000000058020000000000000200090300000000000006181818181818181818181818181818181818181818181818181818181818181883ccb67ee2cf18f4417438d1a1727db71544027bd3a9609c2daa212bad8512fd4d93fe53035a8f9fa21b6188e29dfca83c477c4e686f0e59313523ee6f2826a3fefd0703580200000000000009030000000000000100000a0000000000000014000000000000000000000000000000000000000000000000ff000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"),
        ("ritualEvent", account_bytes(&event), "14239be79c145ea0011fc778a5f2de57d101e9f9dfa62e95250c20b536721d950a508e809e0604e56a006400000000000000c8000000000000002c01000000000000030102000064000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000fe"),
        ("completionClaim", account_bytes(&claim), "e98299af422d7070011fc778a5f2de57d101e9f9dfa62e95250c20b536721d950a508e809e0604e56ada46e95edf373886af11aa2aa43b9162379c8789ab273342674385ed0acb29e5000c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0100000201019600000000000000fd"),
    ];
    for (name, bytes, expected) in vectors {
        assert_eq!(hex(&bytes), expected, "{name} bytes changed");
    }
}
