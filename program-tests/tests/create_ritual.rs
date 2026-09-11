use anchor_lang::{AccountDeserialize, InstructionData, Space, ToAccountMetas};
use anchor_lang::solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use rituals::{EventWindow, FeePayerMode, RitualStatus};
use solana_program_test::{processor, ProgramTest};
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
