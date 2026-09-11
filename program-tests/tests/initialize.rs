use anchor_lang::solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use anchor_lang::{AccountDeserialize, InstructionData, Space, ToAccountMetas};
use solana_program_test::{processor, ProgramTest};
use solana_sdk::{
    instruction::{AccountMeta, Instruction, InstructionError},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::{Transaction, TransactionError},
};

const PROGRAM_ID: Pubkey = rituals::ID;

fn config_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"protocol-config"], &PROGRAM_ID)
}

async fn start() -> (
    solana_program_test::BanksClient,
    Keypair,
    solana_sdk::hash::Hash,
) {
    ProgramTest::new("rituals", PROGRAM_ID, processor!(process_instruction))
        .start()
        .await
}

fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Anchor's generated entrypoint ties AccountInfo's slice and inner
    // lifetime together; ProgramTest intentionally keeps them independent.
    // The adapter is safe here because AccountInfo values do not escape this
    // synchronous entry call.
    let accounts: &[AccountInfo<'_>] = unsafe { std::mem::transmute(accounts) };
    rituals::entry(program_id, accounts, data)
}

fn initialize_ix(
    authority: &Pubkey,
    allowed_stake_mint: Pubkey,
    fee_recipient: Pubkey,
    fee_basis_points: u16,
    minimum_fee: u64,
    maximum_fee: u64,
    maximum_member_stake: u64,
) -> Instruction {
    let (protocol_config, _) = config_pda();
    let accounts = rituals::accounts::InitializeProtocolConfig {
        protocol_config,
        authority: *authority,
        system_program: system_program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::InitializeProtocolConfig {
            allowed_stake_mint,
            fee_recipient,
            fee_basis_points,
            minimum_fee,
            maximum_fee,
            maximum_member_stake,
        }
        .data(),
    }
}

async fn submit(
    banks: &mut solana_program_test::BanksClient,
    payer: &Keypair,
    ix: Instruction,
    recent_blockhash: solana_sdk::hash::Hash,
) -> Result<(), solana_program_test::BanksClientError> {
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    tx.sign(&[payer], recent_blockhash);
    banks.process_transaction(tx).await
}

fn assert_custom_error(result: Result<(), solana_program_test::BanksClientError>, expected: u32) {
    match result {
        Err(solana_program_test::BanksClientError::TransactionError(
            TransactionError::InstructionError(_, InstructionError::Custom(code)),
        )) => assert_eq!(code, expected),
        other => panic!("expected custom transaction error {expected}, got {other:?}"),
    }
}

async fn read_config_snapshot(
    banks: &mut solana_program_test::BanksClient,
) -> (
    u8,
    Pubkey,
    Pubkey,
    Pubkey,
    u16,
    u64,
    u64,
    u64,
    u8,
    u8,
    bool,
    u8,
) {
    let (address, _) = config_pda();
    let account = banks.get_account(address).await.unwrap().unwrap();
    assert_eq!(account.owner, PROGRAM_ID);
    let mut data: &[u8] = &account.data;
    let config = rituals::state::ProtocolConfig::try_deserialize(&mut data).unwrap();
    (
        config.schema_version,
        config.authority,
        config.allowed_stake_mint,
        config.fee_recipient,
        config.fee_basis_points,
        config.minimum_fee,
        config.maximum_fee,
        config.maximum_member_stake,
        config.max_members,
        config.max_events,
        config.paused,
        config.bump,
    )
}

#[tokio::test]
async fn initialize_protocol_config_stores_exact_state() {
    let (mut banks, payer, recent_blockhash) = start().await;
    let allowed = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let ix = initialize_ix(&payer.pubkey(), allowed, recipient, 200, 50, 500, 1_000);
    submit(&mut banks, &payer, ix, recent_blockhash)
        .await
        .unwrap();

    let (address, bump) = config_pda();
    let account = banks.get_account(address).await.unwrap().unwrap();
    assert_eq!(account.owner, PROGRAM_ID);
    assert_eq!(account.data.len(), 8 + rituals::ProtocolConfig::INIT_SPACE);
    let mut data: &[u8] = &account.data;
    let config = rituals::state::ProtocolConfig::try_deserialize(&mut data).unwrap();
    assert_eq!(config.schema_version, 1);
    assert_eq!(config.authority, payer.pubkey());
    assert_eq!(config.allowed_stake_mint, allowed);
    assert_eq!(config.fee_recipient, recipient);
    assert_eq!(config.fee_basis_points, 200);
    assert_eq!(config.minimum_fee, 50);
    assert_eq!(config.maximum_fee, 500);
    assert_eq!(config.maximum_member_stake, 1_000);
    assert_eq!(config.max_members, 6);
    assert_eq!(config.max_events, 16);
    assert!(!config.paused);
    assert_eq!(config.bump, bump);
}

#[tokio::test]
async fn initialize_rejects_non_signing_authority() {
    let (mut banks, payer, recent_blockhash) = start().await;
    let authority = Keypair::new();
    let mut ix = initialize_ix(
        &authority.pubkey(),
        Pubkey::new_unique(),
        Pubkey::new_unique(),
        1,
        1,
        2,
        1_000,
    );
    ix.accounts[1].is_signer = false;
    assert_custom_error(submit(&mut banks, &payer, ix, recent_blockhash).await, 3010);
}

#[tokio::test]
async fn initialize_rejects_invalid_basis_points() {
    for bps in [0, 10_001] {
        let (mut banks, payer, recent_blockhash) = start().await;
        let ix = initialize_ix(
            &payer.pubkey(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            bps,
            1,
            2,
            1_000,
        );
        assert_custom_error(submit(&mut banks, &payer, ix, recent_blockhash).await, 6000);
    }
}

#[tokio::test]
async fn initialize_rejects_invalid_fee_bounds() {
    for (minimum, maximum, expected) in [(0, 1, 6001), (1, 0, 6002), (2, 1, 6003)] {
        let (mut banks, payer, recent_blockhash) = start().await;
        let ix = initialize_ix(
            &payer.pubkey(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            1,
            minimum,
            maximum,
            1_000,
        );
        assert_custom_error(
            submit(&mut banks, &payer, ix, recent_blockhash).await,
            expected,
        );
    }
}

#[tokio::test]
async fn initialize_rejects_zero_maximum_member_stake() {
    let (mut banks, payer, recent_blockhash) = start().await;
    let ix = initialize_ix(
        &payer.pubkey(),
        Pubkey::new_unique(),
        Pubkey::new_unique(),
        1,
        1,
        2,
        0,
    );
    assert_custom_error(submit(&mut banks, &payer, ix, recent_blockhash).await, 6004);
}

#[tokio::test]
async fn initialize_rejects_repeated_pda_initialization() {
    let (mut banks, payer, recent_blockhash) = start().await;
    let first = initialize_ix(
        &payer.pubkey(),
        Pubkey::new_unique(),
        Pubkey::new_unique(),
        1,
        1,
        2,
        1_000,
    );
    submit(&mut banks, &payer, first, recent_blockhash)
        .await
        .unwrap();
    let original = read_config_snapshot(&mut banks).await;
    let second = initialize_ix(
        &payer.pubkey(),
        Pubkey::new_unique(),
        Pubkey::new_unique(),
        1,
        1,
        2,
        1_000,
    );
    assert_custom_error(
        submit(&mut banks, &payer, second, recent_blockhash).await,
        0,
    );
    assert_eq!(read_config_snapshot(&mut banks).await, original);
}

#[test]
fn wished_for_initialize_api_compiles_against_native_program_entrypoint() {
    let _ = initialize_ix(
        &Pubkey::new_unique(),
        Pubkey::new_unique(),
        Pubkey::new_unique(),
        1,
        1,
        2,
        1_000,
    );
    let _ = AccountMeta::new_readonly(Pubkey::new_unique(), false);
}
