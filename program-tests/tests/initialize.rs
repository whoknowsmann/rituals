use anchor_lang::{AccountDeserialize, InstructionData, Space, ToAccountMetas};
use anchor_lang::solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use solana_program_test::{processor, ProgramTest};
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::Transaction,
};

const PROGRAM_ID: Pubkey = rituals::ID;

fn config_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"protocol-config"], &PROGRAM_ID)
}

async fn start() -> (solana_program_test::BanksClient, Keypair, solana_sdk::hash::Hash) {
    ProgramTest::new("rituals", PROGRAM_ID, processor!(process_instruction))
        .start()
        .await
}

fn process_instruction(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
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

#[tokio::test]
async fn initialize_protocol_config_stores_exact_state() {
    let (mut banks, payer, recent_blockhash) = start().await;
    let allowed = Pubkey::new_unique();
    let recipient = Pubkey::new_unique();
    let ix = initialize_ix(&payer.pubkey(), allowed, recipient, 200, 50, 500);
    submit(&mut banks, &payer, ix, recent_blockhash).await.unwrap();

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
    assert_eq!(config.max_members, 6);
    assert_eq!(config.max_events, 16);
    assert!(!config.paused);
    assert_eq!(config.bump, bump);
}

#[tokio::test]
async fn initialize_rejects_non_signing_authority() {
    let (mut banks, payer, recent_blockhash) = start().await;
    let authority = Keypair::new();
    let mut ix = initialize_ix(&authority.pubkey(), Pubkey::new_unique(), Pubkey::new_unique(), 1, 1, 2);
    ix.accounts[1].is_signer = false;
    assert!(submit(&mut banks, &payer, ix, recent_blockhash).await.is_err());
}

#[tokio::test]
async fn initialize_rejects_invalid_basis_points() {
    for bps in [0, 10_001] {
        let (mut banks, payer, recent_blockhash) = start().await;
        let ix = initialize_ix(&payer.pubkey(), Pubkey::new_unique(), Pubkey::new_unique(), bps, 1, 2);
        assert!(submit(&mut banks, &payer, ix, recent_blockhash).await.is_err());
    }
}

#[tokio::test]
async fn initialize_rejects_invalid_fee_bounds() {
    for (minimum, maximum) in [(0, 1), (1, 0), (2, 1)] {
        let (mut banks, payer, recent_blockhash) = start().await;
        let ix = initialize_ix(&payer.pubkey(), Pubkey::new_unique(), Pubkey::new_unique(), 1, minimum, maximum);
        assert!(submit(&mut banks, &payer, ix, recent_blockhash).await.is_err());
    }
}

#[tokio::test]
async fn initialize_rejects_repeated_pda_initialization() {
    let (mut banks, payer, recent_blockhash) = start().await;
    let first = initialize_ix(&payer.pubkey(), Pubkey::new_unique(), Pubkey::new_unique(), 1, 1, 2);
    submit(&mut banks, &payer, first, recent_blockhash).await.unwrap();
    let second = initialize_ix(&payer.pubkey(), Pubkey::new_unique(), Pubkey::new_unique(), 1, 1, 2);
    assert!(submit(&mut banks, &payer, second, recent_blockhash).await.is_err());
}

#[test]
fn wished_for_initialize_api_compiles_against_native_program_entrypoint() {
    let _ = initialize_ix(&Pubkey::new_unique(), Pubkey::new_unique(), Pubkey::new_unique(), 1, 1, 2);
    let _ = AccountMeta::new_readonly(Pubkey::new_unique(), false);
}
