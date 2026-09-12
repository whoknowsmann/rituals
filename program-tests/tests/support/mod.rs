pub(crate) use anchor_lang::solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult,
};
pub(crate) use anchor_lang::{
    AccountDeserialize, AccountSerialize, InstructionData, ToAccountMetas,
};
pub(crate) use anchor_spl::token::spl_token;
pub(crate) use rituals::{EventWindow, FeePayerMode, RitualStatus};
pub(crate) use solana_program_test::{processor, ProgramTest, ProgramTestContext};
pub(crate) use solana_sdk::program_pack::Pack;
pub(crate) use solana_sdk::{
    account::{Account, AccountSharedData},
    instruction::{Instruction, InstructionError},
    pubkey::Pubkey,
    rent::Rent,
    signature::{Keypair, Signer},
    system_program,
    transaction::{Transaction, TransactionError},
};

pub(crate) const PROGRAM_ID: Pubkey = rituals::ID;
pub(crate) const MINT: Pubkey = Pubkey::new_from_array([7; 32]);
pub(crate) const RECIPIENT: Pubkey = Pubkey::new_from_array([8; 32]);
pub(crate) const MINT_AUTHORITY: Pubkey = Pubkey::new_from_array([9; 32]);
pub(crate) const WRONG_MINT: Pubkey = Pubkey::new_from_array([13; 32]);
pub(crate) const OUTSIDER: Pubkey = Pubkey::new_from_array([14; 32]);

pub(crate) fn process_instruction(
    id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    let accounts: &[AccountInfo<'_>] = unsafe { std::mem::transmute(accounts) };
    rituals::entry(id, accounts, data)
}
pub(crate) fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"protocol-config"], &PROGRAM_ID).0
}
pub(crate) fn ritual_pda(creator: &Pubkey, nonce: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[b"ritual", creator.as_ref(), &nonce.to_le_bytes()],
        &PROGRAM_ID,
    )
    .0
}
pub(crate) fn vault_pda(seed: &[u8], ritual: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[seed, ritual.as_ref()], &PROGRAM_ID).0
}
pub(crate) fn token_account_for(mint: Pubkey, owner: Pubkey, amount: u64) -> Account {
    let state = spl_token::state::Account {
        mint,
        owner,
        amount,
        delegate: None.into(),
        state: spl_token::state::AccountState::Initialized,
        is_native: None.into(),
        delegated_amount: 0,
        close_authority: None.into(),
    };
    let mut data = vec![0; spl_token::state::Account::LEN];
    spl_token::state::Account::pack_into_slice(&state, &mut data);
    Account {
        lamports: Rent::default().minimum_balance(data.len()),
        data,
        owner: spl_token::ID,
        executable: false,
        rent_epoch: 0,
    }
}
pub(crate) fn token_account(owner: Pubkey, amount: u64) -> Account {
    token_account_for(MINT, owner, amount)
}
pub(crate) fn mint_account(supply: u64) -> Account {
    let state = spl_token::state::Mint {
        mint_authority: Some(MINT_AUTHORITY).into(),
        supply,
        decimals: 6,
        is_initialized: true,
        freeze_authority: None.into(),
    };
    let mut data = vec![0; spl_token::state::Mint::LEN];
    spl_token::state::Mint::pack_into_slice(&state, &mut data);
    Account {
        lamports: Rent::default().minimum_balance(data.len()),
        data,
        owner: spl_token::ID,
        executable: false,
        rent_epoch: 0,
    }
}
pub(crate) async fn start_with_members(
    creator: &Keypair,
    other: &Keypair,
    creator_amount: u64,
    other_amount: u64,
) -> ProgramTestContext {
    let creator_source = Pubkey::new_from_array([21; 32]);
    let other_source = Pubkey::new_from_array([22; 32]);
    let recipient = spl_token::state::Account {
        mint: MINT,
        owner: Pubkey::new_from_array([10; 32]),
        amount: 0,
        delegate: None.into(),
        state: spl_token::state::AccountState::Initialized,
        is_native: None.into(),
        delegated_amount: 0,
        close_authority: None.into(),
    };
    let mut recipient_data = vec![0; spl_token::state::Account::LEN];
    spl_token::state::Account::pack_into_slice(&recipient, &mut recipient_data);
    let mut test = ProgramTest::new("rituals", PROGRAM_ID, processor!(process_instruction));
    test.add_program(
        "spl_token",
        spl_token::ID,
        processor!(spl_token::processor::Processor::process),
    );
    test.add_genesis_account(MINT, mint_account(creator_amount + other_amount));
    test.add_genesis_account(WRONG_MINT, mint_account(0));
    test.add_genesis_account(
        RECIPIENT,
        Account {
            lamports: Rent::default().minimum_balance(recipient_data.len()),
            data: recipient_data,
            owner: spl_token::ID,
            executable: false,
            rent_epoch: 0,
        },
    );
    test.add_genesis_account(
        creator_source,
        token_account(creator.pubkey(), creator_amount),
    );
    test.add_genesis_account(other_source, token_account(other.pubkey(), other_amount));
    test.add_genesis_account(OUTSIDER, token_account(OUTSIDER, 150));
    test.add_genesis_account(
        Pubkey::new_from_array([23; 32]),
        token_account_for(WRONG_MINT, creator.pubkey(), 150),
    );
    test.add_genesis_account(
        creator.pubkey(),
        Account {
            lamports: 10_000_000_000,
            data: vec![],
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        },
    );
    test.start_with_context().await
}
pub(crate) async fn submit(
    context: &mut ProgramTestContext,
    ixs: Vec<Instruction>,
    signers: &[&Keypair],
) -> Result<(), solana_program_test::BanksClientError> {
    context.last_blockhash = context.get_new_latest_blockhash().await.unwrap();
    let mut tx = Transaction::new_with_payer(&ixs, Some(&context.payer.pubkey()));
    let mut all = vec![&context.payer];
    all.extend_from_slice(signers);
    tx.sign(&all, context.last_blockhash);
    context.banks_client.process_transaction(tx).await
}
pub(crate) fn initialize_ix(authority: Pubkey) -> Instruction {
    let accounts = rituals::accounts::InitializeProtocolConfig {
        protocol_config: config_pda(),
        authority,
        system_program: system_program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::InitializeProtocolConfig {
            allowed_stake_mint: MINT,
            fee_recipient: RECIPIENT,
            fee_basis_points: 200,
            minimum_fee: 50,
            maximum_fee: 500,
            maximum_member_stake: 1_000,
        }
        .data(),
    }
}
pub(crate) fn create_ix(
    creator: Pubkey,
    other: Pubkey,
    nonce: u64,
    mode: FeePayerMode,
) -> Instruction {
    let ritual = ritual_pda(&creator, nonce);
    let accounts = rituals::accounts::CreateRitual {
        protocol_config: config_pda(),
        ritual,
        creator,
        stake_mint: MINT,
        fee_recipient_token: RECIPIENT,
        stake_vault: vault_pda(b"stake-vault", &ritual),
        fee_vault: vault_pda(b"fee-vault", &ritual),
        system_program: system_program::ID,
        token_program: spl_token::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::CreateRitual {
            nonce,
            rule_digest: [1; 32],
            members: vec![other, creator],
            member_total_stake: 100,
            schedule: vec![EventWindow {
                opens: 1,
                deadline: 2,
                resolution: 3,
            }],
            additional_confirmation_threshold: 0,
            fee_payer_mode: mode,
        }
        .data(),
    }
}
pub(crate) fn fund_ix(creator: Pubkey, nonce: u64, member: Pubkey, source: Pubkey) -> Instruction {
    let ritual = ritual_pda(&creator, nonce);
    let accounts = rituals::accounts::FundMember {
        protocol_config: config_pda(),
        ritual,
        member,
        stake_mint: MINT,
        member_source: source,
        stake_vault: vault_pda(b"stake-vault", &ritual),
        fee_vault: vault_pda(b"fee-vault", &ritual),
        token_program: spl_token::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::FundMember {}.data(),
    }
}
pub(crate) fn assert_error(result: Result<(), solana_program_test::BanksClientError>, code: u32) {
    match result {
        Err(solana_program_test::BanksClientError::TransactionError(
            TransactionError::InstructionError(_, InstructionError::Custom(actual)),
        )) => assert_eq!(actual, code),
        other => panic!("expected {code}, got {other:?}"),
    }
}
pub(crate) async fn amount(context: &mut ProgramTestContext, address: Pubkey) -> u64 {
    let account = context
        .banks_client
        .get_account(address)
        .await
        .unwrap()
        .unwrap();
    spl_token::state::Account::unpack(&account.data)
        .unwrap()
        .amount
}
pub(crate) fn deserialize(data: &[u8]) -> rituals::Ritual {
    let mut data = data;
    rituals::Ritual::try_deserialize(&mut data).unwrap()
}
pub(crate) async fn get_account(context: &mut ProgramTestContext, address: Pubkey) -> Account {
    context
        .banks_client
        .get_account(address)
        .await
        .unwrap()
        .unwrap()
}
pub(crate) async fn replace_ritual<F: FnOnce(&mut rituals::Ritual)>(
    context: &mut ProgramTestContext,
    address: Pubkey,
    mutate: F,
) {
    let original = get_account(context, address).await;
    let mut value = deserialize(&original.data);
    mutate(&mut value);
    let mut data = Vec::with_capacity(original.data.len());
    value.try_serialize(&mut data).unwrap();
    data.resize(original.data.len(), 0);
    assert_eq!(data.len(), original.data.len());
    context.set_account(
        &address,
        &AccountSharedData::from(Account {
            lamports: original.lamports,
            data,
            owner: original.owner,
            executable: original.executable,
            rent_epoch: original.rent_epoch,
        }),
    );
}
pub(crate) async fn replace_config<F: FnOnce(&mut rituals::ProtocolConfig)>(
    context: &mut ProgramTestContext,
    mutate: F,
) {
    let address = config_pda();
    let original = get_account(context, address).await;
    let mut bytes: &[u8] = &original.data;
    let mut value = rituals::ProtocolConfig::try_deserialize(&mut bytes).unwrap();
    mutate(&mut value);
    let mut data = Vec::with_capacity(original.data.len());
    value.try_serialize(&mut data).unwrap();
    data.resize(original.data.len(), 0);
    context.set_account(
        &address,
        &AccountSharedData::from(Account {
            lamports: original.lamports,
            data,
            owner: original.owner,
            executable: original.executable,
            rent_epoch: original.rent_epoch,
        }),
    );
}
pub(crate) async fn replace_token_amount(
    context: &mut ProgramTestContext,
    address: Pubkey,
    new_amount: u64,
) {
    let original = get_account(context, address).await;
    let mut token = spl_token::state::Account::unpack(&original.data).unwrap();
    token.amount = new_amount;
    let mut data = vec![0; spl_token::state::Account::LEN];
    spl_token::state::Account::pack_into_slice(&token, &mut data);
    context.set_account(
        &address,
        &AccountSharedData::from(Account {
            lamports: original.lamports,
            data,
            owner: original.owner,
            executable: original.executable,
            rent_epoch: original.rent_epoch,
        }),
    );
}
pub(crate) async fn replace_owner(
    context: &mut ProgramTestContext,
    address: Pubkey,
    owner: Pubkey,
) {
    let original = get_account(context, address).await;
    context.set_account(
        &address,
        &AccountSharedData::from(Account {
            lamports: original.lamports,
            data: original.data,
            owner,
            executable: original.executable,
            rent_epoch: original.rent_epoch,
        }),
    );
}
pub(crate) async fn funding_snapshot(
    context: &mut ProgramTestContext,
    ritual: Pubkey,
) -> Vec<Account> {
    let addresses = [
        ritual,
        Pubkey::new_from_array([21; 32]),
        Pubkey::new_from_array([22; 32]),
        OUTSIDER,
        Pubkey::new_from_array([23; 32]),
        vault_pda(b"stake-vault", &ritual),
        vault_pda(b"fee-vault", &ritual),
        RECIPIENT,
    ];
    let mut snapshot = Vec::with_capacity(addresses.len());
    for address in addresses {
        snapshot.push(get_account(context, address).await);
    }
    snapshot
}
pub(crate) async fn split_funding_snapshot(
    context: &mut ProgramTestContext,
    ritual: Pubkey,
    member_sources: &[Pubkey],
) -> Vec<Account> {
    let mut addresses = Vec::with_capacity(member_sources.len() + 4);
    addresses.push(ritual);
    addresses.extend_from_slice(member_sources);
    addresses.push(vault_pda(b"stake-vault", &ritual));
    addresses.push(vault_pda(b"fee-vault", &ritual));
    addresses.push(RECIPIENT);

    let mut snapshot = Vec::with_capacity(addresses.len());
    for address in addresses {
        snapshot.push(get_account(context, address).await);
    }
    snapshot
}

pub(crate) async fn setup_host(
    creator: &Keypair,
    other: &Keypair,
    nonce: u64,
    creator_amount: u64,
    other_amount: u64,
) -> ProgramTestContext {
    let mut context = start_with_members(creator, other, creator_amount, other_amount).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), nonce, FeePayerMode::Host),
        ],
        &[creator],
    )
    .await
    .unwrap();
    context
}
