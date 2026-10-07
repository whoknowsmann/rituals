//! Compute units of eject_ritual measured on the built SBF program (the
//! native suite runs the host processor, which does not meter compute).
//! Ignored by default because it needs target/deploy/rituals.so:
//! SBF_OUT_DIR=../target/deploy cargo test --locked --test eject_compute -- --ignored --nocapture
mod support;
use solana_sdk::compute_budget::ComputeBudgetInstruction;
use support::*;

/// The client's compute limit for eject (src/data/rituals/ritualPreparedAction.ts).
const CLIENT_LIMIT: u64 = 400_000;
const NONCE: u64 = 10809;

fn eject_ix(ritual: Pubkey, creator: Pubkey, count: u8, expected_forfeit: u64) -> Instruction {
    let mut accounts = rituals::accounts::EjectRitual {
        ritual,
        creator,
        stake_mint: MINT,
        stake_vault: vault_pda(b"stake-vault", &ritual),
        fee_vault: vault_pda(b"fee-vault", &ritual),
        creator_destination: source_for_member(0),
        forfeit_destination: SECOND_RECIPIENT,
        token_program: spl_token::ID,
        system_program: system_program::ID,
    }
    .to_account_metas(None);
    accounts.extend(
        (0..count).map(|i| solana_sdk::instruction::AccountMeta::new(event_pda(&ritual, i), false)),
    );
    Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data: rituals::instruction::EjectRitual { expected_forfeit }.data(),
    }
}

async fn sbf_fixture(count: u8) -> (ProgramTestContext, Keypair, Pubkey, i64) {
    let creator = Keypair::new();
    let mut test = ProgramTest::new("rituals", PROGRAM_ID, None);
    test.prefer_bpf(true);
    test.add_genesis_account(MINT, mint_account(1_000_000));
    test.add_genesis_account(
        RECIPIENT,
        token_account_for(MINT, Pubkey::new_from_array([10; 32]), 0),
    );
    test.add_genesis_account(SECOND_RECIPIENT, token_account(SECOND_RECIPIENT, 0));
    test.add_genesis_account(source_for_member(0), token_account(creator.pubkey(), 2000));
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
    let mut c = test.start_with_context().await;
    let now = c
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let opens = now + 100;
    let mut create = create_solo_ix(
        creator.pubkey(),
        NONCE,
        None,
        SECOND_RECIPIENT,
        u64::from(count) * 30,
        opens,
    );
    create.data = rituals::instruction::CreateSoloRitual {
        nonce: NONCE,
        rule_digest: [7; 32],
        member_total_stake: u64::from(count) * 30,
        schedule: (0..count)
            .map(|i| EventWindow {
                opens: opens + i64::from(i) * 60,
                deadline: opens + i64::from(i) * 60 + 45,
                resolution: opens + i64::from(i) * 60 + 55,
            })
            .collect(),
        witness: None,
    }
    .data();
    submit(
        &mut c,
        vec![
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
            initialize_free_ix(creator.pubkey()),
            create,
            fund_ix(
                creator.pubkey(),
                NONCE,
                creator.pubkey(),
                source_for_member(0),
            ),
            activate_ix_default(creator.pubkey(), NONCE),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), NONCE);
    (c, creator, ritual, opens)
}

async fn set_clock(c: &mut ProgramTestContext, now: i64) {
    let mut value = c
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap();
    value.unix_timestamp = now;
    c.set_sysvar(&value);
}

async fn measured_eject(
    c: &mut ProgramTestContext,
    creator: &Keypair,
    ritual: Pubkey,
    count: u8,
    forfeit: u64,
) -> u64 {
    c.last_blockhash = c.get_new_latest_blockhash().await.unwrap();
    let tx = Transaction::new_signed_with_payer(
        &[
            ComputeBudgetInstruction::set_compute_unit_limit(1_400_000),
            eject_ix(ritual, creator.pubkey(), count, forfeit),
        ],
        Some(&c.payer.pubkey()),
        &[&c.payer, creator],
        c.last_blockhash,
    );
    let outcome = c
        .banks_client
        .process_transaction_with_metadata(tx)
        .await
        .unwrap();
    assert!(outcome.result.is_ok(), "{:?}", outcome.result);
    let ritual_after = deserialize(&get_account(c, ritual).await.data);
    assert_eq!(ritual_after.status, RitualStatus::Ended);
    outcome.metadata.unwrap().compute_units_consumed
}

#[tokio::test]
#[ignore = "needs the SBF build: SBF_OUT_DIR=../target/deploy"]
async fn eject_compute_units_on_sbf() {
    // Worst case: sixteen lapsed weeks nobody opened, so sixteen receipts are created.
    let (mut c, creator, ritual, opens) = sbf_fixture(16).await;
    set_clock(&mut c, opens + 16 * 60).await;
    let worst = measured_eject(&mut c, &creator, ritual, 16, 480).await;

    // Before week 1 opens: everything back, no receipts.
    let (mut c, creator, ritual, _) = sbf_fixture(16).await;
    let before_open = measured_eject(&mut c, &creator, ritual, 16, 0).await;

    // The demo shape: week 1 stamped, week 2 lapsed unstamped, week 3 open.
    let (mut c, creator, ritual, opens) = sbf_fixture(3).await;
    set_clock(&mut c, opens).await;
    submit(
        &mut c,
        vec![
            initialize_event_ix(ritual, creator.pubkey(), 0),
            claim_completion_ix(ritual, creator.pubkey(), 0, 0),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    set_clock(&mut c, opens + 125).await;
    let demo = measured_eject(&mut c, &creator, ritual, 3, 30).await;

    println!("eject_ritual SBF compute units: worst (16 missing receipts) {worst}, before week 1 opens (16 weeks) {before_open}, kept + missed + open (3 weeks) {demo}");
    assert!(
        worst < CLIENT_LIMIT,
        "worst case {worst} must fit the client's limit {CLIENT_LIMIT}"
    );
}
