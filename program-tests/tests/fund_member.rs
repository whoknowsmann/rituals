use anchor_lang::solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use anchor_spl::token::spl_token;
use solana_sdk::program_pack::Pack;
use rituals::{EventWindow, FeePayerMode, RitualStatus};
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::Account,
    instruction::{Instruction, InstructionError},
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_program,
    transaction::{Transaction, TransactionError},
};

const PROGRAM_ID: Pubkey = rituals::ID;
const MINT: Pubkey = Pubkey::new_from_array([7; 32]);
const RECIPIENT: Pubkey = Pubkey::new_from_array([8; 32]);
const MINT_AUTHORITY: Pubkey = Pubkey::new_from_array([9; 32]);

fn process_instruction(id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let accounts: &[AccountInfo<'_>] = unsafe { std::mem::transmute(accounts) };
    rituals::entry(id, accounts, data)
}
fn config_pda() -> Pubkey { Pubkey::find_program_address(&[b"protocol-config"], &PROGRAM_ID).0 }
fn ritual_pda(creator: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(&[b"ritual", creator.as_ref(), &nonce.to_le_bytes()], &PROGRAM_ID).0
}
fn vault_pda(seed: &[u8], ritual: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[seed, ritual.as_ref()], &PROGRAM_ID).0
}
fn token_account(owner: Pubkey, amount: u64) -> Account {
    let state = spl_token::state::Account {
        mint: MINT, owner, amount, delegate: None.into(), state: spl_token::state::AccountState::Initialized,
        is_native: None.into(), delegated_amount: 0, close_authority: None.into(),
    };
    let mut data = vec![0; spl_token::state::Account::LEN];
    spl_token::state::Account::pack_into_slice(&state, &mut data);
    Account { lamports: Rent::default().minimum_balance(data.len()), data, owner: spl_token::ID, executable: false, rent_epoch: 0 }
}
fn mint_account(supply: u64) -> Account {
    let state = spl_token::state::Mint { mint_authority: Some(MINT_AUTHORITY).into(), supply, decimals: 6, is_initialized: true, freeze_authority: None.into() };
    let mut data = vec![0; spl_token::state::Mint::LEN];
    spl_token::state::Mint::pack_into_slice(&state, &mut data);
    Account { lamports: Rent::default().minimum_balance(data.len()), data, owner: spl_token::ID, executable: false, rent_epoch: 0 }
}
async fn start_with_members(creator: &Keypair, other: &Keypair, creator_amount: u64, other_amount: u64) -> ProgramTestContext {
    let creator_source = Pubkey::new_from_array([21; 32]);
    let other_source = Pubkey::new_from_array([22; 32]);
    let recipient = spl_token::state::Account { mint: MINT, owner: Pubkey::new_from_array([10; 32]), amount: 0, delegate: None.into(), state: spl_token::state::AccountState::Initialized, is_native: None.into(), delegated_amount: 0, close_authority: None.into() };
    let mut recipient_data = vec![0; spl_token::state::Account::LEN];
    spl_token::state::Account::pack_into_slice(&recipient, &mut recipient_data);
    let mut test = ProgramTest::new("rituals", PROGRAM_ID, processor!(process_instruction));
    test.add_program("spl_token", spl_token::ID, processor!(spl_token::processor::Processor::process));
    test.add_genesis_account(MINT, mint_account(creator_amount + other_amount));
    test.add_genesis_account(RECIPIENT, Account { lamports: Rent::default().minimum_balance(recipient_data.len()), data: recipient_data, owner: spl_token::ID, executable: false, rent_epoch: 0 });
    test.add_genesis_account(creator_source, token_account(creator.pubkey(), creator_amount));
    test.add_genesis_account(other_source, token_account(other.pubkey(), other_amount));
    test.add_genesis_account(creator.pubkey(), Account { lamports: 10_000_000_000, data: vec![], owner: system_program::ID, executable: false, rent_epoch: 0 });
    test.start_with_context().await
}
async fn submit(context: &mut ProgramTestContext, ixs: Vec<Instruction>, signers: &[&Keypair]) -> Result<(), solana_program_test::BanksClientError> {
    context.last_blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    let mut tx = Transaction::new_with_payer(&ixs, Some(&context.payer.pubkey()));
    let mut all = vec![&context.payer]; all.extend_from_slice(signers);
    tx.sign(&all, context.last_blockhash);
    context.banks_client.process_transaction(tx).await
}
fn initialize_ix(authority: Pubkey) -> Instruction {
    let accounts = rituals::accounts::InitializeProtocolConfig { protocol_config: config_pda(), authority, system_program: system_program::ID };
    Instruction { program_id: PROGRAM_ID, accounts: accounts.to_account_metas(None), data: rituals::instruction::InitializeProtocolConfig { allowed_stake_mint: MINT, fee_recipient: RECIPIENT, fee_basis_points: 200, minimum_fee: 50, maximum_fee: 500, maximum_member_stake: 1_000 }.data() }
}
fn create_ix(creator: Pubkey, other: Pubkey, nonce: u64, mode: FeePayerMode) -> Instruction {
    let ritual = ritual_pda(&creator, nonce);
    let accounts = rituals::accounts::CreateRitual { protocol_config: config_pda(), ritual, creator, stake_mint: MINT, fee_recipient_token: RECIPIENT, stake_vault: vault_pda(b"stake-vault", &ritual), fee_vault: vault_pda(b"fee-vault", &ritual), system_program: system_program::ID, token_program: spl_token::ID };
    Instruction { program_id: PROGRAM_ID, accounts: accounts.to_account_metas(None), data: rituals::instruction::CreateRitual { nonce, rule_digest: [1; 32], members: vec![other, creator], member_total_stake: 100, schedule: vec![EventWindow { opens: 1, deadline: 2, resolution: 3 }], additional_confirmation_threshold: 0, fee_payer_mode: mode }.data() }
}
fn fund_ix(creator: Pubkey, nonce: u64, member: Pubkey, source: Pubkey) -> Instruction {
    let ritual = ritual_pda(&creator, nonce);
    let accounts = rituals::accounts::FundMember { protocol_config: config_pda(), ritual, member, stake_mint: MINT, member_source: source, stake_vault: vault_pda(b"stake-vault", &ritual), fee_vault: vault_pda(b"fee-vault", &ritual), token_program: spl_token::ID };
    Instruction { program_id: PROGRAM_ID, accounts: accounts.to_account_metas(None), data: rituals::instruction::FundMember {}.data() }
}
fn assert_error(result: Result<(), solana_program_test::BanksClientError>, code: u32) {
    match result { Err(solana_program_test::BanksClientError::TransactionError(TransactionError::InstructionError(_, InstructionError::Custom(actual)))) => assert_eq!(actual, code), other => panic!("expected {code}, got {other:?}"), }
}
async fn amount(context: &mut ProgramTestContext, address: Pubkey) -> u64 {
    let account = context.banks_client.get_account(address).await.unwrap().unwrap();
    spl_token::state::Account::unpack(&account.data).unwrap().amount
}
fn deserialize(data: &[u8]) -> rituals::Ritual { let mut data = data; rituals::Ritual::try_deserialize(&mut data).unwrap() }

#[tokio::test]
async fn host_funding_tracks_ordered_members_and_exact_liabilities() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let creator_source = Pubkey::new_from_array([21; 32]);
    let other_source = Pubkey::new_from_array([22; 32]);
    let mut context = start_with_members(&creator, &other, 200, 150).await;
    submit(&mut context, vec![initialize_ix(creator.pubkey()), create_ix(creator.pubkey(), other.pubkey(), 1, FeePayerMode::Host)], &[&creator]).await.unwrap();
    let ritual = ritual_pda(&creator.pubkey(), 1);
    let stake_vault = vault_pda(b"stake-vault", &ritual);
    let fee_vault = vault_pda(b"fee-vault", &ritual);
    submit(&mut context, vec![fund_ix(creator.pubkey(), 1, other.pubkey(), other_source)], &[&other]).await.unwrap();
    assert_eq!(amount(&mut context, other_source).await, 50);
    assert_eq!(amount(&mut context, stake_vault).await, 100);
    assert_eq!(amount(&mut context, fee_vault).await, 0);
    let account = context.banks_client.get_account(ritual).await.unwrap().unwrap();
    let state = deserialize(&account.data);
    assert_eq!((state.funded_members_bitmap, state.funded_member_count, state.funded_stake_total, state.funded_fee_total, state.status), (1, 1, 100, 0, RitualStatus::Funding));
    submit(&mut context, vec![fund_ix(creator.pubkey(), 1, creator.pubkey(), creator_source)], &[&creator]).await.unwrap();
    assert_eq!(amount(&mut context, creator_source).await, 50);
    assert_eq!(amount(&mut context, stake_vault).await, 200);
    assert_eq!(amount(&mut context, fee_vault).await, 50);
    let account = context.banks_client.get_account(ritual).await.unwrap().unwrap();
    let state = deserialize(&account.data);
    assert_eq!((state.funded_members_bitmap, state.funded_member_count, state.funded_stake_total, state.funded_fee_total), (3, 2, 200, 50));
    let before = account.data;
    assert_error(submit(&mut context, vec![fund_ix(creator.pubkey(), 1, creator.pubkey(), creator_source)], &[&creator]).await, 6022);
    assert_eq!(context.banks_client.get_account(ritual).await.unwrap().unwrap().data, before);
}

#[tokio::test]
async fn split_funding_is_explicitly_deferred_without_movement() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let source = Pubkey::new_from_array([22; 32]);
    let mut context = start_with_members(&creator, &other, 200, 150).await;
    submit(&mut context, vec![initialize_ix(creator.pubkey()), create_ix(creator.pubkey(), other.pubkey(), 2, FeePayerMode::Split)], &[&creator]).await.unwrap();
    let ritual = ritual_pda(&creator.pubkey(), 2); let before = context.banks_client.get_account(ritual).await.unwrap().unwrap().data;
    assert_error(submit(&mut context, vec![fund_ix(creator.pubkey(), 2, other.pubkey(), source)], &[&other]).await, 6023);
    assert_eq!(context.banks_client.get_account(ritual).await.unwrap().unwrap().data, before);
    assert_eq!(amount(&mut context, source).await, 150);
}

#[tokio::test]
async fn host_insufficient_total_is_atomic_before_stake_cpi() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let creator_source = Pubkey::new_from_array([21; 32]);
    let other_source = Pubkey::new_from_array([22; 32]);
    let mut context = start_with_members(&creator, &other, 120, 150).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), 3, FeePayerMode::Host),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), 3);
    submit(
        &mut context,
        vec![fund_ix(creator.pubkey(), 3, other.pubkey(), other_source)],
        &[&other],
    )
    .await
    .unwrap();
    let ritual_before = context
        .banks_client
        .get_account(ritual)
        .await
        .unwrap()
        .unwrap()
        .data;
    let source_before = amount(&mut context, creator_source).await;
    let stake_before = amount(&mut context, vault_pda(b"stake-vault", &ritual)).await;
    let fee_before = amount(&mut context, vault_pda(b"fee-vault", &ritual)).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(creator.pubkey(), 3, creator.pubkey(), creator_source)],
            &[&creator],
        )
        .await,
        6025,
    );
    assert_eq!(
        context
            .banks_client
            .get_account(ritual)
            .await
            .unwrap()
            .unwrap()
            .data,
        ritual_before
    );
    assert_eq!(amount(&mut context, creator_source).await, source_before);
    assert_eq!(amount(&mut context, vault_pda(b"stake-vault", &ritual)).await, stake_before);
    assert_eq!(amount(&mut context, vault_pda(b"fee-vault", &ritual)).await, fee_before);
}

#[test]
fn wished_for_host_fund_member_api_compiles() {
    let creator = Pubkey::new_unique(); let ritual = ritual_pda(&creator, 1);
    let accounts = rituals::accounts::FundMember { protocol_config: config_pda(), ritual, member: creator, stake_mint: MINT, member_source: Pubkey::new_unique(), stake_vault: vault_pda(b"stake-vault", &ritual), fee_vault: vault_pda(b"fee-vault", &ritual), token_program: spl_token::ID };
    let ix = Instruction { program_id: PROGRAM_ID, accounts: accounts.to_account_metas(None), data: rituals::instruction::FundMember {}.data() };
    assert_eq!(ix.program_id, PROGRAM_ID);
}
