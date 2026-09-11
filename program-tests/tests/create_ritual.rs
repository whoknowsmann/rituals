use anchor_lang::{AccountDeserialize, AccountSerialize, InstructionData, Space, ToAccountMetas};
use anchor_lang::solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use rituals::{EventWindow, FeePayerMode, RitualStatus};
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{instruction::{Instruction, InstructionError}, pubkey::Pubkey, signature::{Keypair, Signer}, system_program, transaction::{Transaction, TransactionError}};

const PROGRAM_ID: Pubkey = rituals::ID;
fn config_pda() -> Pubkey { Pubkey::find_program_address(&[b"protocol-config"], &PROGRAM_ID).0 }
fn ritual_pda(creator: &Pubkey, nonce: u64) -> (Pubkey, u8) { Pubkey::find_program_address(&[b"ritual", creator.as_ref(), &nonce.to_le_bytes()], &PROGRAM_ID) }
fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult { let accounts: &[AccountInfo<'_>] = unsafe { std::mem::transmute(accounts) }; rituals::entry(program_id, accounts, data) }
async fn start() -> (solana_program_test::BanksClient, Keypair, solana_sdk::hash::Hash) { ProgramTest::new("rituals", PROGRAM_ID, processor!(process_instruction)).start().await }
async fn submit(banks: &mut solana_program_test::BanksClient, payer: &Keypair, ix: Instruction, hash: solana_sdk::hash::Hash) -> Result<(), solana_program_test::BanksClientError> { let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey())); tx.sign(&[payer], hash); banks.process_transaction(tx).await }
fn initialize_ix(authority: &Pubkey, mint: Pubkey) -> Instruction {
    let accounts = rituals::accounts::InitializeProtocolConfig { protocol_config: config_pda(), authority: *authority, system_program: system_program::ID };
    Instruction { program_id: PROGRAM_ID, accounts: accounts.to_account_metas(None), data: rituals::instruction::InitializeProtocolConfig { allowed_stake_mint: mint, fee_recipient: Pubkey::new_unique(), fee_basis_points: 200, minimum_fee: 50, maximum_fee: 500, maximum_member_stake: 1_000 }.data() }
}

fn initialize_with_fee(authority: &Pubkey, mint: Pubkey, bps: u16, minimum: u64, maximum: u64, maximum_member_stake: u64) -> Instruction {
    let accounts = rituals::accounts::InitializeProtocolConfig { protocol_config: config_pda(), authority: *authority, system_program: system_program::ID };
    Instruction { program_id: PROGRAM_ID, accounts: accounts.to_account_metas(None), data: rituals::instruction::InitializeProtocolConfig { allowed_stake_mint: mint, fee_recipient: Pubkey::new_unique(), fee_basis_points: bps, minimum_fee: minimum, maximum_fee: maximum, maximum_member_stake }.data() }
}

fn create_ix_custom(creator: &Pubkey, nonce: u64, mint: Pubkey, members: Vec<Pubkey>, stake: u64, schedule: Vec<EventWindow>, digest: [u8; 32], threshold: u8) -> Instruction {
    let (ritual, _) = ritual_pda(creator, nonce);
    let accounts = rituals::accounts::CreateRitual { protocol_config: config_pda(), ritual, creator: *creator, stake_mint: mint, system_program: system_program::ID };
    Instruction { program_id: PROGRAM_ID, accounts: accounts.to_account_metas(None), data: rituals::instruction::CreateRitual { nonce, rule_digest: digest, members, member_total_stake: stake, schedule, additional_confirmation_threshold: threshold, fee_payer_mode: FeePayerMode::Host }.data() }
}

fn create_ix(creator: &Pubkey, nonce: u64, mint: Pubkey, members: Vec<Pubkey>, stake: u64, schedule: Vec<EventWindow>) -> Instruction {
    create_ix_custom(creator, nonce, mint, members, stake, schedule, [1; 32], 0)
}

fn one_event() -> Vec<EventWindow> { vec![EventWindow { opens: 1, deadline: 2, resolution: 3 }] }

fn assert_custom_error(result: Result<(), solana_program_test::BanksClientError>, expected: u32) {
    match result {
        Err(solana_program_test::BanksClientError::TransactionError(TransactionError::InstructionError(_, InstructionError::Custom(code)))) => assert_eq!(code, expected),
        other => panic!("expected custom transaction error {expected}, got {other:?}"),
    }
}

#[tokio::test]
async fn create_ritual_uses_group_pool_for_fee_raw_calculation() {
    let (mut banks, creator, hash) = start().await;
    let second = Pubkey::new_unique();
    submit(&mut banks, &creator, initialize_with_fee(&creator.pubkey(), creator.pubkey(), 333, 1, 1_000, 1_000), hash).await.unwrap();
    let ix = create_ix(&creator.pubkey(), 8, creator.pubkey(), vec![creator.pubkey(), second], 101, one_event());
    submit(&mut banks, &creator, ix, hash).await.unwrap();
    let (ritual, _) = ritual_pda(&creator.pubkey(), 8);
    let account = banks.get_account(ritual).await.unwrap().unwrap();
    let mut data: &[u8] = &account.data;
    let state = rituals::Ritual::try_deserialize(&mut data).unwrap();
    assert_eq!(state.locked_activation_fee, 6); // floor(101 * 2 * 333 / 10000)
    assert_eq!(state.per_event_allocation, 101); // per-member allocation
}

#[tokio::test]
async fn create_ritual_rejects_group_pool_overflow() {
    let (mut banks, creator, hash) = start().await;
    let second = Pubkey::new_unique();
    submit(&mut banks, &creator, initialize_with_fee(&creator.pubkey(), creator.pubkey(), 1, 1, 1_000, u64::MAX), hash).await.unwrap();
    let ix = create_ix(&creator.pubkey(), 9, creator.pubkey(), vec![creator.pubkey(), second], u64::MAX, one_event());
    assert_custom_error(submit(&mut banks, &creator, ix, hash).await, 6015);
}

async fn assert_create_error(
    members: Vec<Pubkey>,
    stake: u64,
    schedule: Vec<EventWindow>,
    digest: [u8; 32],
    threshold: u8,
    mint: Option<Pubkey>,
    expected: u32,
) {
    let (mut banks, creator, hash) = start().await;
    let allowed = creator.pubkey();
    submit(&mut banks, &creator, initialize_ix(&creator.pubkey(), allowed), hash).await.unwrap();
    let mut members = members;
    members[0] = creator.pubkey();
    let ix = create_ix_custom(&creator.pubkey(), 1, mint.unwrap_or(allowed), members, stake, schedule, digest, threshold);
    assert_custom_error(submit(&mut banks, &creator, ix, hash).await, expected);
}

async fn assert_duplicate_error() {
    let (mut banks, creator, hash) = start().await;
    let allowed = creator.pubkey();
    submit(&mut banks, &creator, initialize_ix(&creator.pubkey(), allowed), hash).await.unwrap();
    let ix = create_ix_custom(&creator.pubkey(), 1, allowed, vec![allowed, allowed], 100, one_event(), [1; 32], 0);
    assert_custom_error(submit(&mut banks, &creator, ix, hash).await, 6007);
}

async fn assert_creator_absent_error() {
    let (mut banks, creator, hash) = start().await;
    let allowed = creator.pubkey();
    submit(&mut banks, &creator, initialize_ix(&creator.pubkey(), allowed), hash).await.unwrap();
    let members = vec![Pubkey::new_unique(), Pubkey::new_unique()];
    let ix = create_ix_custom(&creator.pubkey(), 1, allowed, members, 100, one_event(), [1; 32], 0);
    assert_custom_error(submit(&mut banks, &creator, ix, hash).await, 6008);
}

fn chronological_events(count: usize) -> Vec<EventWindow> {
    (0..count).map(|i| {
        let opens = (i as i64) * 4 + 1;
        EventWindow { opens, deadline: opens + 1, resolution: opens + 2 }
    }).collect()
}

#[tokio::test]
async fn create_ritual_rejects_repeated_nonce_without_changing_original() {
    let (mut banks, creator, hash) = start().await;
    let second = Pubkey::new_unique();
    submit(&mut banks, &creator, initialize_ix(&creator.pubkey(), creator.pubkey()), hash).await.unwrap();
    let ix = create_ix(&creator.pubkey(), 10, creator.pubkey(), vec![creator.pubkey(), second], 100, one_event());
    submit(&mut banks, &creator, ix.clone(), hash).await.unwrap();
    let (ritual, _) = ritual_pda(&creator.pubkey(), 10);
    let original = banks.get_account(ritual).await.unwrap().unwrap();
    let second_ix = create_ix_custom(&creator.pubkey(), 10, creator.pubkey(), vec![creator.pubkey(), second], 100, one_event(), [2; 32], 0);
    assert_custom_error(submit(&mut banks, &creator, second_ix, hash).await, 0);
    assert_eq!(banks.get_account(ritual).await.unwrap().unwrap().data, original.data);
}

#[tokio::test]
async fn create_ritual_reports_the_exact_structural_error_matrix() {
    let creator = Pubkey::new_unique();
    let member = Pubkey::new_unique();
    assert_create_error(vec![creator], 100, one_event(), [1; 32], 0, None, 6006).await;
    assert_create_error(chronological_events(7).iter().enumerate().map(|(i, _)| if i == 0 { creator } else { Pubkey::new_unique() }).collect(), 100, one_event(), [1; 32], 0, None, 6006).await;
    assert_duplicate_error().await;
    assert_creator_absent_error().await;
    assert_create_error(vec![creator, member], 100, one_event(), [0; 32], 0, None, 6009).await;
    assert_create_error(vec![creator, member], 100, vec![], [1; 32], 0, None, 6010).await;
    assert_create_error(vec![creator, member], 100, chronological_events(17), [1; 32], 0, None, 6010).await;
    for schedule in [
        vec![EventWindow { opens: -1, deadline: 0, resolution: 1 }],
        vec![EventWindow { opens: 1, deadline: 1, resolution: 2 }],
        vec![EventWindow { opens: 2, deadline: 1, resolution: 3 }],
    ] {
        assert_create_error(vec![creator, member], 100, schedule, [1; 32], 0, None, 6011).await;
    }
    assert_create_error(vec![creator, member], 100, vec![EventWindow { opens: 1, deadline: 2, resolution: 4 }, EventWindow { opens: 4, deadline: 5, resolution: 6 }], [1; 32], 0, None, 6012).await;
    assert_create_error(vec![creator, member], 0, one_event(), [1; 32], 0, None, 6013).await;
    assert_create_error(vec![creator, member], 1_001, one_event(), [1; 32], 0, None, 6013).await;
    assert_create_error(vec![creator, member], 100, one_event(), [1; 32], 2, None, 6014).await;
    assert_create_error(vec![creator, member], 101, vec![EventWindow { opens: 1, deadline: 2, resolution: 3 }, EventWindow { opens: 4, deadline: 5, resolution: 6 }], [1; 32], 0, None, 6016).await;
    assert_create_error(vec![creator, member], 100, one_event(), [1; 32], 0, Some(Pubkey::new_unique()), 2012).await;
}

#[tokio::test]
async fn create_ritual_stores_immutable_configuration_and_locked_fee() {
    let (mut banks, creator, hash) = start().await;
    submit(&mut banks, &creator, initialize_ix(&creator.pubkey(), creator.pubkey()), hash).await.unwrap();
    let second = Pubkey::new_unique();
    let nonce = 7;
    let (ritual, bump) = ritual_pda(&creator.pubkey(), nonce);
    let members = vec![creator.pubkey(), second];
    let schedule = vec![EventWindow { opens: 1, deadline: 2, resolution: 3 }, EventWindow { opens: 4, deadline: 5, resolution: 6 }];
    let create_accounts = rituals::accounts::CreateRitual { protocol_config: config_pda(), ritual, creator: creator.pubkey(), stake_mint: creator.pubkey(), system_program: system_program::ID };
    let ix = Instruction { program_id: PROGRAM_ID, accounts: create_accounts.to_account_metas(None), data: rituals::instruction::CreateRitual { nonce, rule_digest: [1; 32], members: members.clone(), member_total_stake: 100, schedule: schedule.clone(), additional_confirmation_threshold: 1, fee_payer_mode: FeePayerMode::Split }.data() };
    submit(&mut banks, &creator, ix, hash).await.unwrap();
    let account = banks.get_account(ritual).await.unwrap().unwrap();
    assert_eq!(account.owner, PROGRAM_ID);
    assert_eq!(account.data.len(), 8 + rituals::Ritual::INIT_SPACE);
    let mut data: &[u8] = &account.data;
    let state = rituals::Ritual::try_deserialize(&mut data).unwrap();
    assert_eq!(state.bump, bump);
    assert_eq!(state.schema_version, 1);
    assert_eq!(state.creator, creator.pubkey());
    assert_eq!(state.nonce, nonce);
    assert_eq!(state.rule_digest, [1; 32]);
    assert_eq!(state.stake_mint, creator.pubkey());
    assert_eq!(state.members, members);
    assert_eq!(state.member_total_stake, 100);
    assert_eq!(state.per_event_allocation, 50);
    assert_eq!(state.schedule, schedule);
    assert_eq!(state.additional_confirmation_threshold, 1);
    assert_eq!(state.fee_payer_mode, FeePayerMode::Split);
    assert_eq!(state.locked_activation_fee, 50); // floor(100*200/10000), clamped to minimum
    assert_eq!(state.status, RitualStatus::Funding);
    assert_eq!(state.current_event_index, 0);
    assert_eq!(state.settled_event_count, 0);
    assert_eq!(state.activated_at, 0);
    assert!(state.created_at >= 0);
}

#[test]
fn wished_for_create_ritual_api_compiles() {
    let creator = Pubkey::new_unique();
    let _ = ritual_pda(&creator, 7);
    let _ = InstructionError::Custom(6004);
    let _ = TransactionError::InstructionError(0, InstructionError::Custom(6004));
}
