use anchor_lang::solana_program::{account_info::AccountInfo, entrypoint::ProgramResult};
use anchor_lang::{AccountDeserialize, AccountSerialize, InstructionData, Space, ToAccountMetas};
use rituals::{EventWindow, FeePayerMode, RitualStatus};
use solana_program_test::{processor, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::{Account, AccountSharedData},
    clock::Clock,
    instruction::{Instruction, InstructionError},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program,
    transaction::{Transaction, TransactionError},
};

const PROGRAM_ID: Pubkey = rituals::ID;
fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[b"protocol-config"], &PROGRAM_ID).0
}
fn ritual_pda(creator: &Pubkey, nonce: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"ritual", creator.as_ref(), &nonce.to_le_bytes()],
        &PROGRAM_ID,
    )
}
fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    // Safe because ProgramTest's synchronous entry call does not let these AccountInfo values escape.
    let accounts: &[AccountInfo<'_>] = unsafe { std::mem::transmute(accounts) };
    rituals::entry(program_id, accounts, data)
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
async fn start_with_context() -> ProgramTestContext {
    ProgramTest::new("rituals", PROGRAM_ID, processor!(process_instruction))
        .start_with_context()
        .await
}
async fn submit(
    banks: &mut solana_program_test::BanksClient,
    payer: &Keypair,
    ix: Instruction,
    hash: solana_sdk::hash::Hash,
) -> Result<(), solana_program_test::BanksClientError> {
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    tx.sign(&[payer], hash);
    banks.process_transaction(tx).await
}
async fn submit_context(
    context: &mut ProgramTestContext,
    ix: Instruction,
) -> Result<(), solana_program_test::BanksClientError> {
    let mut tx = Transaction::new_with_payer(&[ix], Some(&context.payer.pubkey()));
    tx.sign(&[&context.payer], context.last_blockhash);
    context.banks_client.process_transaction(tx).await
}

fn deserialize_ritual(data: &[u8]) -> rituals::Ritual {
    let mut data: &[u8] = data;
    rituals::Ritual::try_deserialize(&mut data).unwrap()
}

async fn replace_config<F>(context: &mut ProgramTestContext, mutate: F)
where
    F: FnOnce(&mut rituals::ProtocolConfig),
{
    let address = config_pda();
    let original = context
        .banks_client
        .get_account(address)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(original.owner, PROGRAM_ID);
    let mut data: &[u8] = &original.data;
    let mut config = rituals::ProtocolConfig::try_deserialize(&mut data).unwrap();
    mutate(&mut config);
    let mut serialized = Vec::with_capacity(original.data.len());
    config.try_serialize(&mut serialized).unwrap();
    assert_eq!(serialized.len(), original.data.len());
    let replacement = AccountSharedData::from(Account {
        lamports: original.lamports,
        data: serialized,
        owner: original.owner,
        executable: original.executable,
        rent_epoch: original.rent_epoch,
    });
    context.set_account(&address, &replacement);

    let readback = context
        .banks_client
        .get_account(address)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(readback.owner, PROGRAM_ID);
    assert_eq!(readback.lamports, original.lamports);
    assert_eq!(readback.executable, original.executable);
    assert_eq!(readback.rent_epoch, original.rent_epoch);
    let mut data: &[u8] = &readback.data;
    let actual = rituals::ProtocolConfig::try_deserialize(&mut data).unwrap();
    assert_eq!(actual.schema_version, config.schema_version);
    assert_eq!(actual.authority, config.authority);
    assert_eq!(actual.allowed_stake_mint, config.allowed_stake_mint);
    assert_eq!(actual.fee_recipient, config.fee_recipient);
    assert_eq!(actual.fee_basis_points, config.fee_basis_points);
    assert_eq!(actual.minimum_fee, config.minimum_fee);
    assert_eq!(actual.maximum_fee, config.maximum_fee);
    assert_eq!(actual.maximum_member_stake, config.maximum_member_stake);
    assert_eq!(actual.max_members, config.max_members);
    assert_eq!(actual.max_events, config.max_events);
    assert_eq!(actual.paused, config.paused);
    assert_eq!(actual.bump, config.bump);
}
fn initialize_ix(authority: &Pubkey, mint: Pubkey) -> Instruction {
    let accounts = rituals::accounts::InitializeProtocolConfig {
        protocol_config: config_pda(),
        authority: *authority,
        system_program: system_program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::InitializeProtocolConfig {
            allowed_stake_mint: mint,
            fee_recipient: Pubkey::new_unique(),
            fee_basis_points: 200,
            minimum_fee: 50,
            maximum_fee: 500,
            maximum_member_stake: 1_000,
        }
        .data(),
    }
}

fn initialize_with_fee(
    authority: &Pubkey,
    mint: Pubkey,
    bps: u16,
    minimum: u64,
    maximum: u64,
    maximum_member_stake: u64,
) -> Instruction {
    let accounts = rituals::accounts::InitializeProtocolConfig {
        protocol_config: config_pda(),
        authority: *authority,
        system_program: system_program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::InitializeProtocolConfig {
            allowed_stake_mint: mint,
            fee_recipient: Pubkey::new_unique(),
            fee_basis_points: bps,
            minimum_fee: minimum,
            maximum_fee: maximum,
            maximum_member_stake,
        }
        .data(),
    }
}

fn create_ix_custom(
    creator: &Pubkey,
    nonce: u64,
    mint: Pubkey,
    members: Vec<Pubkey>,
    stake: u64,
    schedule: Vec<EventWindow>,
    digest: [u8; 32],
    threshold: u8,
) -> Instruction {
    let (ritual, _) = ritual_pda(creator, nonce);
    let accounts = rituals::accounts::CreateRitual {
        protocol_config: config_pda(),
        ritual,
        creator: *creator,
        stake_mint: mint,
        system_program: system_program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::CreateRitual {
            nonce,
            rule_digest: digest,
            members,
            member_total_stake: stake,
            schedule,
            additional_confirmation_threshold: threshold,
            fee_payer_mode: FeePayerMode::Host,
        }
        .data(),
    }
}

fn create_ix(
    creator: &Pubkey,
    nonce: u64,
    mint: Pubkey,
    members: Vec<Pubkey>,
    stake: u64,
    schedule: Vec<EventWindow>,
) -> Instruction {
    create_ix_custom(creator, nonce, mint, members, stake, schedule, [1; 32], 0)
}

fn one_event() -> Vec<EventWindow> {
    vec![EventWindow {
        opens: 1,
        deadline: 2,
        resolution: 3,
    }]
}

fn assert_custom_error(result: Result<(), solana_program_test::BanksClientError>, expected: u32) {
    match result {
        Err(solana_program_test::BanksClientError::TransactionError(
            TransactionError::InstructionError(_, InstructionError::Custom(code)),
        )) => assert_eq!(code, expected),
        other => panic!("expected custom transaction error {expected}, got {other:?}"),
    }
}

#[tokio::test]
async fn create_ritual_uses_group_pool_for_fee_raw_calculation() {
    let (mut banks, creator, hash) = start().await;
    let second = Pubkey::new_unique();
    submit(
        &mut banks,
        &creator,
        initialize_with_fee(&creator.pubkey(), creator.pubkey(), 333, 1, 1_000, 1_000),
        hash,
    )
    .await
    .unwrap();
    let ix = create_ix(
        &creator.pubkey(),
        8,
        creator.pubkey(),
        vec![creator.pubkey(), second],
        101,
        one_event(),
    );
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
    submit(
        &mut banks,
        &creator,
        initialize_with_fee(&creator.pubkey(), creator.pubkey(), 1, 1, 1_000, u64::MAX),
        hash,
    )
    .await
    .unwrap();
    let ix = create_ix(
        &creator.pubkey(),
        9,
        creator.pubkey(),
        vec![creator.pubkey(), second],
        u64::MAX,
        one_event(),
    );
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
    submit(
        &mut banks,
        &creator,
        initialize_ix(&creator.pubkey(), allowed),
        hash,
    )
    .await
    .unwrap();
    let mut members = members;
    if let Some(first) = members.first_mut() {
        *first = creator.pubkey();
    }
    let ix = create_ix_custom(
        &creator.pubkey(),
        1,
        mint.unwrap_or(allowed),
        members,
        stake,
        schedule,
        digest,
        threshold,
    );
    assert_custom_error(submit(&mut banks, &creator, ix, hash).await, expected);
}

async fn assert_duplicate_error() {
    let (mut banks, creator, hash) = start().await;
    let allowed = creator.pubkey();
    submit(
        &mut banks,
        &creator,
        initialize_ix(&creator.pubkey(), allowed),
        hash,
    )
    .await
    .unwrap();
    let ix = create_ix_custom(
        &creator.pubkey(),
        1,
        allowed,
        vec![allowed, allowed],
        100,
        one_event(),
        [1; 32],
        0,
    );
    assert_custom_error(submit(&mut banks, &creator, ix, hash).await, 6007);
}

async fn assert_creator_absent_error() {
    let (mut banks, creator, hash) = start().await;
    let allowed = creator.pubkey();
    submit(
        &mut banks,
        &creator,
        initialize_ix(&creator.pubkey(), allowed),
        hash,
    )
    .await
    .unwrap();
    let members = vec![Pubkey::new_unique(), Pubkey::new_unique()];
    let ix = create_ix_custom(
        &creator.pubkey(),
        1,
        allowed,
        members,
        100,
        one_event(),
        [1; 32],
        0,
    );
    assert_custom_error(submit(&mut banks, &creator, ix, hash).await, 6008);
}

fn chronological_events(count: usize) -> Vec<EventWindow> {
    (0..count)
        .map(|i| {
            let opens = (i as i64) * 4 + 1;
            EventWindow {
                opens,
                deadline: opens + 1,
                resolution: opens + 2,
            }
        })
        .collect()
}

#[tokio::test]
async fn create_ritual_rejects_repeated_nonce_without_changing_original() {
    let (mut banks, creator, hash) = start().await;
    let second = Pubkey::new_unique();
    submit(
        &mut banks,
        &creator,
        initialize_ix(&creator.pubkey(), creator.pubkey()),
        hash,
    )
    .await
    .unwrap();
    let ix = create_ix(
        &creator.pubkey(),
        10,
        creator.pubkey(),
        vec![creator.pubkey(), second],
        100,
        one_event(),
    );
    submit(&mut banks, &creator, ix.clone(), hash)
        .await
        .unwrap();
    let (ritual, _) = ritual_pda(&creator.pubkey(), 10);
    let original = banks.get_account(ritual).await.unwrap().unwrap();
    let second_ix = create_ix_custom(
        &creator.pubkey(),
        10,
        creator.pubkey(),
        vec![creator.pubkey(), second],
        100,
        one_event(),
        [2; 32],
        0,
    );
    assert_custom_error(submit(&mut banks, &creator, second_ix, hash).await, 0);
    assert_eq!(
        banks.get_account(ritual).await.unwrap().unwrap().data,
        original.data
    );
}

#[tokio::test]
async fn create_ritual_reports_the_exact_structural_error_matrix() {
    let creator = Pubkey::new_unique();
    let member = Pubkey::new_unique();
    assert_create_error(vec![], 100, one_event(), [1; 32], 0, None, 6006).await;
    assert_create_error(vec![creator], 100, one_event(), [1; 32], 0, None, 6006).await;
    assert_create_error(
        vec![Pubkey::new_unique(), Pubkey::default()],
        100,
        one_event(),
        [1; 32],
        0,
        None,
        6019,
    )
    .await;
    assert_create_error(
        chronological_events(7)
            .iter()
            .enumerate()
            .map(|(i, _)| {
                if i == 0 {
                    creator
                } else {
                    Pubkey::new_unique()
                }
            })
            .collect(),
        100,
        one_event(),
        [1; 32],
        0,
        None,
        6006,
    )
    .await;
    assert_duplicate_error().await;
    assert_creator_absent_error().await;
    assert_create_error(
        vec![creator, member],
        100,
        one_event(),
        [0; 32],
        0,
        None,
        6009,
    )
    .await;
    assert_create_error(vec![creator, member], 100, vec![], [1; 32], 0, None, 6010).await;
    assert_create_error(
        vec![creator, member],
        100,
        chronological_events(17),
        [1; 32],
        0,
        None,
        6010,
    )
    .await;
    for schedule in [
        vec![EventWindow {
            opens: -1,
            deadline: 0,
            resolution: 1,
        }],
        vec![EventWindow {
            opens: 1,
            deadline: 1,
            resolution: 2,
        }],
        vec![EventWindow {
            opens: 2,
            deadline: 1,
            resolution: 3,
        }],
    ] {
        assert_create_error(vec![creator, member], 100, schedule, [1; 32], 0, None, 6011).await;
    }
    assert_create_error(
        vec![creator, member],
        100,
        vec![
            EventWindow {
                opens: 1,
                deadline: 2,
                resolution: 4,
            },
            EventWindow {
                opens: 4,
                deadline: 5,
                resolution: 6,
            },
        ],
        [1; 32],
        0,
        None,
        6012,
    )
    .await;
    assert_create_error(
        vec![creator, member],
        0,
        one_event(),
        [1; 32],
        0,
        None,
        6013,
    )
    .await;
    assert_create_error(
        vec![creator, member],
        1_001,
        one_event(),
        [1; 32],
        0,
        None,
        6013,
    )
    .await;
    assert_create_error(
        vec![creator, member],
        100,
        one_event(),
        [1; 32],
        2,
        None,
        6014,
    )
    .await;
    assert_create_error(
        vec![creator, member],
        101,
        vec![
            EventWindow {
                opens: 1,
                deadline: 2,
                resolution: 3,
            },
            EventWindow {
                opens: 4,
                deadline: 5,
                resolution: 6,
            },
        ],
        [1; 32],
        0,
        None,
        6016,
    )
    .await;
    assert_create_error(
        vec![creator, member],
        100,
        one_event(),
        [1; 32],
        0,
        Some(Pubkey::new_unique()),
        2012,
    )
    .await;
}

#[tokio::test]
async fn create_ritual_stores_immutable_configuration_and_locked_fee() {
    let (mut banks, creator, hash) = start().await;
    submit(
        &mut banks,
        &creator,
        initialize_ix(&creator.pubkey(), creator.pubkey()),
        hash,
    )
    .await
    .unwrap();
    let second = Pubkey::new_unique();
    let nonce = 7;
    let (ritual, bump) = ritual_pda(&creator.pubkey(), nonce);
    let members = vec![creator.pubkey(), second];
    let schedule = vec![
        EventWindow {
            opens: 1,
            deadline: 2,
            resolution: 3,
        },
        EventWindow {
            opens: 4,
            deadline: 5,
            resolution: 6,
        },
    ];
    let create_accounts = rituals::accounts::CreateRitual {
        protocol_config: config_pda(),
        ritual,
        creator: creator.pubkey(),
        stake_mint: creator.pubkey(),
        system_program: system_program::ID,
    };
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: create_accounts.to_account_metas(None),
        data: rituals::instruction::CreateRitual {
            nonce,
            rule_digest: [1; 32],
            members: members.clone(),
            member_total_stake: 100,
            schedule: schedule.clone(),
            additional_confirmation_threshold: 1,
            fee_payer_mode: FeePayerMode::Split,
        }
        .data(),
    };
    let clock_before: Clock = banks.get_sysvar().await.unwrap();
    submit(&mut banks, &creator, ix, hash).await.unwrap();
    let clock_after: Clock = banks.get_sysvar().await.unwrap();
    let account = banks.get_account(ritual).await.unwrap().unwrap();
    assert_eq!(account.owner, PROGRAM_ID);
    assert_eq!(account.data.len(), 8 + rituals::Ritual::INIT_SPACE);
    let mut data: &[u8] = &account.data;
    let state = rituals::Ritual::try_deserialize(&mut data).unwrap();
    assert_eq!(state.bump, bump);
    assert_eq!(state.protocol_config, config_pda());
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
    assert!(state.created_at >= clock_before.unix_timestamp);
    assert!(state.created_at <= clock_after.unix_timestamp);
}

#[tokio::test]
async fn create_ritual_rejects_paused_protocol_without_creating_ritual() {
    let mut context = start_with_context().await;
    let creator = context.payer.insecure_clone();
    let mint = creator.pubkey();
    submit_context(&mut context, initialize_ix(&creator.pubkey(), mint))
        .await
        .unwrap();
    replace_config(&mut context, |config| config.paused = true).await;

    let nonce = 20;
    let (ritual, _) = ritual_pda(&creator.pubkey(), nonce);
    assert_custom_error(
        submit_context(
            &mut context,
            create_ix(
                &creator.pubkey(),
                nonce,
                mint,
                vec![creator.pubkey(), Pubkey::new_unique()],
                100,
                one_event(),
            ),
        )
        .await,
        6005,
    );
    assert!(context
        .banks_client
        .get_account(ritual)
        .await
        .unwrap()
        .is_none());
}

#[tokio::test]
async fn create_ritual_locks_fee_against_future_config_replacement() {
    let mut context = start_with_context().await;
    let creator = context.payer.insecure_clone();
    let mint = creator.pubkey();
    submit_context(
        &mut context,
        initialize_with_fee(&creator.pubkey(), mint, 333, 1, 1_000, 1_000),
    )
    .await
    .unwrap();
    let second = Pubkey::new_unique();
    let members = vec![creator.pubkey(), second];
    let schedule = one_event();

    let nonce_a = 21;
    let (ritual_a, _) = ritual_pda(&creator.pubkey(), nonce_a);
    submit_context(
        &mut context,
        create_ix(
            &creator.pubkey(),
            nonce_a,
            mint,
            members.clone(),
            101,
            schedule.clone(),
        ),
    )
    .await
    .unwrap();
    let account_a = context
        .banks_client
        .get_account(ritual_a)
        .await
        .unwrap()
        .unwrap();
    let state_a = deserialize_ritual(&account_a.data);
    assert_eq!(state_a.protocol_config, config_pda());
    assert_eq!(state_a.locked_activation_fee, 6);
    assert_eq!(state_a.fee_payer_mode, FeePayerMode::Host);
    let account_a_before = account_a.clone();

    replace_config(&mut context, |config| {
        config.fee_basis_points = 10_000;
        config.minimum_fee = 1;
        config.maximum_fee = 5;
    })
    .await;
    let account_a_after = context
        .banks_client
        .get_account(ritual_a)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(account_a_after, account_a_before);
    assert_eq!(
        deserialize_ritual(&account_a_after.data).locked_activation_fee,
        6
    );

    let nonce_b = 22;
    let (ritual_b, _) = ritual_pda(&creator.pubkey(), nonce_b);
    submit_context(
        &mut context,
        create_ix(&creator.pubkey(), nonce_b, mint, members, 101, schedule),
    )
    .await
    .unwrap();
    let account_b = context
        .banks_client
        .get_account(ritual_b)
        .await
        .unwrap()
        .unwrap();
    let state_b = deserialize_ritual(&account_b.data);
    assert_eq!(state_b.protocol_config, config_pda());
    assert_eq!(state_b.locked_activation_fee, 5);
    assert_eq!(state_b.status, RitualStatus::Funding);
    assert_eq!(
        context
            .banks_client
            .get_account(ritual_a)
            .await
            .unwrap()
            .unwrap(),
        account_a_before
    );
}

#[test]
fn wished_for_create_ritual_api_compiles() {
    let creator = Pubkey::new_unique();
    let _ = ritual_pda(&creator, 7);
    let _ = InstructionError::Custom(6004);
    let _ = TransactionError::InstructionError(0, InstructionError::Custom(6004));
}
