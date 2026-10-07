mod support;
use rituals::{RitualKind, RitualsError, VoidReason};
use support::*;

const NONCE: u64 = 10807;

fn eject_ix(
    ritual: Pubkey,
    creator: Pubkey,
    start: u8,
    count: u8,
    expected_forfeit: u64,
) -> Instruction {
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
        (start..count)
            .map(|i| solana_sdk::instruction::AccountMeta::new(event_pda(&ritual, i), false)),
    );
    Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data: rituals::instruction::EjectRitual { expected_forfeit }.data(),
    }
}

async fn fixture(count: u8) -> (ProgramTestContext, Keypair, Pubkey, i64) {
    let creator = Keypair::new();
    let mut c = start_with_member_set(&[&creator], &[2000]).await;
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

async fn clock(c: &mut ProgramTestContext, now: i64) {
    let mut value = c
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap();
    value.unix_timestamp = now;
    c.set_sysvar(&value);
}

async fn stamp(c: &mut ProgramTestContext, creator: &Keypair, ritual: Pubkey) {
    submit(
        c,
        vec![
            initialize_event_ix(ritual, creator.pubkey(), 0),
            claim_completion_ix(ritual, creator.pubkey(), 0, 0),
        ],
        &[creator],
    )
    .await
    .unwrap();
}

async fn assert_eject(
    c: &mut ProgramTestContext,
    creator: &Keypair,
    ritual: Pubkey,
    count: u8,
    forfeited: u64,
    settled: u8,
) {
    let before = get_account(c, ritual).await;
    let source = amount(c, source_for_member(0)).await;
    let cause = amount(c, SECOND_RECIPIENT).await;
    let stake = amount(c, vault_pda(b"stake-vault", &ritual)).await;
    let fee = amount(c, vault_pda(b"fee-vault", &ritual)).await;
    let start = deserialize(&before.data).current_event_index;
    submit(
        c,
        vec![eject_ix(ritual, creator.pubkey(), start, count, forfeited)],
        &[creator],
    )
    .await
    .unwrap();
    let after = get_account(c, ritual).await;
    assert_eq!(after.owner, PROGRAM_ID);
    assert_eq!(after.data.len(), before.data.len());
    let mut expected = deserialize(&before.data);
    expected.status = RitualStatus::Ended;
    expected.completed_at = c
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    expected.current_event_index = settled;
    expected.settled_event_count = settled;
    expected.funded_stake_total = 0;
    expected.funded_fee_total = 0;
    expected.vaults_closed = true;
    let mut bytes = Vec::new();
    expected.try_serialize(&mut bytes).unwrap();
    bytes.resize(before.data.len(), 0);
    assert_eq!(after.data, bytes); // Every field, immutable identity and bump included.
    let back = amount(c, source_for_member(0)).await - source;
    let sent = amount(c, SECOND_RECIPIENT).await - cause;
    assert_eq!(sent, forfeited);
    assert_eq!(back, stake + fee - forfeited);
    assert_eq!(back + sent, stake + fee);
    for seed in [b"stake-vault".as_slice(), b"fee-vault".as_slice()] {
        assert!(c
            .banks_client
            .get_account(vault_pda(seed, &ritual))
            .await
            .unwrap()
            .is_none());
    }
}

async fn reject(
    c: &mut ProgramTestContext,
    creator: &Keypair,
    ritual: Pubkey,
    ix: Instruction,
    code: u32,
) {
    let addresses = [
        ritual,
        source_for_member(0),
        SECOND_RECIPIENT,
        vault_pda(b"stake-vault", &ritual),
        vault_pda(b"fee-vault", &ritual),
    ];
    let mut before = Vec::new();
    for a in addresses {
        before.push(c.banks_client.get_account(a).await.unwrap());
    }
    let signers = if ix.accounts[1].pubkey == creator.pubkey() {
        vec![creator]
    } else {
        vec![]
    };
    assert_error(submit(c, vec![ix], &signers).await, code);
    for (a, expected) in addresses.into_iter().zip(before) {
        assert_eq!(c.banks_client.get_account(a).await.unwrap(), expected);
    }
}

#[tokio::test]
async fn eject_before_open_returns_all_and_vault_rent() {
    let (mut c, creator, ritual, _) = fixture(3).await;
    let lamports = get_account(&mut c, creator.pubkey()).await.lamports;
    let rent = get_account(&mut c, vault_pda(b"stake-vault", &ritual))
        .await
        .lamports
        + get_account(&mut c, vault_pda(b"fee-vault", &ritual))
            .await
            .lamports;
    assert_eject(&mut c, &creator, ritual, 3, 0, 0).await;
    assert_eq!(
        get_account(&mut c, creator.pubkey()).await.lamports,
        lamports + rent
    );
}

#[tokio::test]
async fn eject_open_unstamped_and_exact_deadline_return_current_week() {
    for offset in [1, 45] {
        let (mut c, creator, ritual, opens) = fixture(3).await;
        clock(&mut c, opens + offset).await;
        assert_eject(&mut c, &creator, ritual, 3, 0, 0).await;
    }
}

#[tokio::test]
async fn eject_stamped_unsettled_returns_all_with_kept_receipt() {
    let (mut c, creator, ritual, opens) = fixture(3).await;
    clock(&mut c, opens).await;
    stamp(&mut c, &creator, ritual).await;
    clock(&mut c, opens + 46).await; // Inside grace; must not wait for resolution.
    assert_eject(&mut c, &creator, ritual, 3, 0, 1).await;
    let e = deserialize_event(&get_account(&mut c, event_pda(&ritual, 0)).await.data);
    assert_eq!(
        (e.status, e.payout_total, e.forfeited_total, e.resolved_at),
        (EventStatus::Settled, 30, 0, opens + 46)
    );
}

#[tokio::test]
async fn eject_missing_or_initialized_past_week_forfeits_during_grace() {
    for initialized in [false, true] {
        let (mut c, creator, ritual, opens) = fixture(3).await;
        if initialized {
            submit(
                &mut c,
                vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
                &[&creator],
            )
            .await
            .unwrap();
        }
        clock(&mut c, opens + 46).await;
        assert_eject(&mut c, &creator, ritual, 3, 30, 1).await;
        let a = get_account(&mut c, event_pda(&ritual, 0)).await;
        assert_eq!(
            (a.owner, a.data.len()),
            (PROGRAM_ID, 8 + RitualEvent::INIT_SPACE)
        );
        let e = deserialize_event(&a.data);
        assert_eq!(
            (
                e.ritual,
                e.event_index,
                e.member_count,
                e.settlement_version
            ),
            (ritual, 0, 1, 1)
        );
        assert_eq!(
            (
                e.event_pool,
                e.forfeited_total,
                e.payout_total,
                e.refunded_total,
                e.remaining_stake_total_after
            ),
            (30, 30, 0, 0, 60)
        );
        assert_eq!(
            e.bump,
            Pubkey::find_program_address(&[b"event", ritual.as_ref(), &[0]], &PROGRAM_ID).1
        );
    }
}

#[tokio::test]
async fn eject_declared_skip_returns_all() {
    let (mut c, creator, ritual, opens) = fixture(3).await;
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: rituals::accounts::DeclareSkip {
            ritual,
            member: creator.pubkey(),
        }
        .to_account_metas(None),
        data: rituals::instruction::DeclareSkip { event_index: 0 }.data(),
    };
    submit(&mut c, vec![ix], &[&creator]).await.unwrap();
    clock(&mut c, opens + 46).await;
    assert_eject(&mut c, &creator, ritual, 3, 0, 1).await;
    let e = deserialize_event(&get_account(&mut c, event_pda(&ritual, 0)).await.data);
    assert_eq!(
        (e.status, e.void_reason, e.refunded_total),
        (EventStatus::Voided, VoidReason::DeclaredSkip, 30)
    );
}

#[tokio::test]
async fn eject_preserves_prior_settlement_and_refunds_fee_dust() {
    let (mut c, creator, ritual, opens) = fixture(3).await;
    clock(&mut c, opens).await;
    stamp(&mut c, &creator, ritual).await;
    clock(&mut c, opens + 56).await;
    submit(
        &mut c,
        vec![finalize_solo_ix(
            ritual,
            0,
            source_for_member(0),
            SECOND_RECIPIENT,
        )],
        &[],
    )
    .await
    .unwrap();
    let receipt = get_account(&mut c, event_pda(&ritual, 0)).await;
    submit(
        &mut c,
        vec![spl_token::instruction::transfer(
            &spl_token::ID,
            &source_for_member(0),
            &vault_pda(b"fee-vault", &ritual),
            &creator.pubkey(),
            &[],
            7,
        )
        .unwrap()],
        &[&creator],
    )
    .await
    .unwrap();
    clock(&mut c, opens + 65).await;
    assert_eject(&mut c, &creator, ritual, 3, 0, 1).await;
    assert_eq!(get_account(&mut c, event_pda(&ritual, 0)).await, receipt);
}

#[tokio::test]
async fn eject_all_sixteen_missing_weeks_conserves_and_records_receipts() {
    let (mut c, creator, ritual, opens) = fixture(16).await;
    clock(&mut c, opens + 16 * 60).await;
    assert_eject(&mut c, &creator, ritual, 16, 480, 16).await;
    for i in 0..16 {
        assert_eq!(
            deserialize_event(&get_account(&mut c, event_pda(&ritual, i)).await.data)
                .forfeited_total,
            30
        );
    }
}

#[tokio::test]
async fn eject_rejects_double_noncreator_group_and_funding() {
    let (mut c, creator, ritual, _) = fixture(3).await;
    let outsider = c.payer.pubkey();
    reject(
        &mut c,
        &creator,
        ritual,
        eject_ix(ritual, outsider, 0, 3, 0),
        6000 + RitualsError::EjectCreatorOnly as u32,
    )
    .await;
    replace_ritual(&mut c, ritual, |r| r.kind = RitualKind::Group).await;
    reject(
        &mut c,
        &creator,
        ritual,
        eject_ix(ritual, creator.pubkey(), 0, 3, 0),
        6064,
    )
    .await;
    replace_ritual(&mut c, ritual, |r| {
        r.kind = RitualKind::Solo;
        r.status = RitualStatus::Funding;
    })
    .await;
    reject(
        &mut c,
        &creator,
        ritual,
        eject_ix(ritual, creator.pubkey(), 0, 3, 0),
        6000 + RitualsError::EjectActiveOnly as u32,
    )
    .await;
    replace_ritual(&mut c, ritual, |r| r.status = RitualStatus::Active).await;
    assert_eject(&mut c, &creator, ritual, 3, 0, 0).await;
    // Anchor deserializes the now-closed vaults before checking constraints.
    reject(
        &mut c,
        &creator,
        ritual,
        eject_ix(ritual, creator.pubkey(), 0, 3, 0),
        3012,
    )
    .await;
}

#[tokio::test]
async fn eject_rejects_wrong_destination_owner_mint_events_and_changed_quote() {
    let (mut c, creator, ritual, opens) = fixture(3).await;
    clock(&mut c, opens + 46).await;
    let ix = eject_ix(ritual, creator.pubkey(), 0, 3, 30);
    let mut wrong = ix.clone();
    wrong.accounts[6].pubkey = RECIPIENT;
    reject(&mut c, &creator, ritual, wrong, 6056).await;
    let mut wrong = ix.clone();
    wrong.accounts[5].pubkey = SECOND_RECIPIENT;
    reject(&mut c, &creator, ritual, wrong, 6034).await;
    replace_token_destination_fields(&mut c, source_for_member(0), Some(WRONG_MINT), None, None)
        .await;
    reject(&mut c, &creator, ritual, ix.clone(), 6034).await;
    replace_token_destination_fields(&mut c, source_for_member(0), Some(MINT), None, None).await;
    let mut wrong = ix.clone();
    wrong.accounts.swap(9, 10);
    reject(
        &mut c,
        &creator,
        ritual,
        wrong,
        6000 + RitualsError::EjectEventAccounts as u32,
    )
    .await;
    let mut wrong = ix.clone();
    wrong.accounts.pop();
    reject(
        &mut c,
        &creator,
        ritual,
        wrong,
        6000 + RitualsError::EjectEventAccounts as u32,
    )
    .await;
    reject(
        &mut c,
        &creator,
        ritual,
        eject_ix(ritual, creator.pubkey(), 0, 3, 0),
        6000 + RitualsError::EjectQuoteChanged as u32,
    )
    .await;
    assert!(c
        .banks_client
        .get_account(event_pda(&ritual, 0))
        .await
        .unwrap()
        .is_none());
}
