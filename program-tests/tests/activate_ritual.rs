mod support;
use solana_sdk::clock::Clock;
use support::*;

async fn make_fully_funded(
    creator: &Keypair,
    other: &Keypair,
    nonce: u64,
    mode: FeePayerMode,
) -> ProgramTestContext {
    let mut context = start_with_members(creator, other, 250, 250).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), nonce, mode),
        ],
        &[creator],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            nonce,
            other.pubkey(),
            Pubkey::new_from_array([22; 32]),
        )],
        &[other],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            Pubkey::new_from_array([21; 32]),
        )],
        &[creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = context
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0].opens = now + 100;
        r.schedule[0].deadline = now + 101;
        r.schedule[0].resolution = now + 102;
    })
    .await;
    context
}

#[tokio::test]
async fn activate_host_transfers_exact_snapshotted_fee_and_preserves_dust() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 700;
    let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let stake = vault_pda(b"stake-vault", &ritual);
    let fee = vault_pda(b"fee-vault", &ritual);
    replace_token_amount(&mut context, stake, 207).await;
    replace_token_amount(&mut context, fee, 53).await;
    let before = deserialize(&get_account(&mut context, ritual).await.data);
    let clock_before = context
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), nonce)],
        &[],
    )
    .await
    .unwrap();
    let after = deserialize(&get_account(&mut context, ritual).await.data);
    let clock_after = context
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    assert_eq!(after.status, RitualStatus::Active);
    assert!(after.activated_at >= clock_before && after.activated_at <= clock_after);
    assert_eq!(after.funded_stake_total, before.funded_stake_total);
    assert_eq!(after.funded_fee_total, before.funded_fee_total);
    assert_eq!(amount(&mut context, stake).await, 207);
    assert_eq!(amount(&mut context, fee).await, 3);
    assert_eq!(amount(&mut context, RECIPIENT).await, 50);
}

#[tokio::test]
async fn activate_split_accepts_shuffled_funding_order() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 701;
    let mut context = start_with_members(&creator, &other, 250, 250).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), nonce, FeePayerMode::Split),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            Pubkey::new_from_array([21; 32]),
        )],
        &[&creator],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            nonce,
            other.pubkey(),
            Pubkey::new_from_array([22; 32]),
        )],
        &[&other],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = context
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0].opens = now + 100;
        r.schedule[0].deadline = now + 101;
        r.schedule[0].resolution = now + 102;
    })
    .await;
    let before = full_snapshot(&mut context, ritual, false).await;
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), nonce)],
        &[],
    )
    .await
    .unwrap();
    let after = full_snapshot(&mut context, ritual, false).await;
    assert_eq!(before.stake_vault, after.stake_vault);
    assert_eq!(amount_from_account(&before.fee_vault), 50);
    assert_eq!(amount_from_account(&after.fee_vault), 0);
    assert_eq!(amount_from_account(&before.locked_recipient), 0);
    assert_eq!(amount_from_account(&after.locked_recipient), 50);
    assert_eq!(
        deserialize(&get_account(&mut context, ritual).await.data).status,
        RitualStatus::Active
    );
    assert_eq!(amount(&mut context, RECIPIENT).await, 50);
}

#[tokio::test]
async fn activation_rejects_locked_fee_not_derived_from_full_bitmap() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 706;
    let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    replace_ritual(&mut context, ritual, |r| {
        r.locked_activation_fee = 0;
        r.funded_fee_total = 0;
    })
    .await;
    let before = funding_snapshot(&mut context, ritual).await;
    assert_error(
        submit(
            &mut context,
            vec![activate_ix_default(creator.pubkey(), nonce)],
            &[],
        )
        .await,
        6028,
    );
    assert_eq!(funding_snapshot(&mut context, ritual).await, before);
}

#[tokio::test]
async fn incomplete_and_malformed_funding_are_rejected_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 702;
    let mut context = start_with_members(&creator, &other, 250, 250).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), nonce, FeePayerMode::Host),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let before = get_account(&mut context, ritual).await.data;
    assert_error(
        submit(
            &mut context,
            vec![activate_ix_default(creator.pubkey(), nonce)],
            &[],
        )
        .await,
        6028,
    );
    assert_eq!(get_account(&mut context, ritual).await.data, before);
    replace_ritual(&mut context, ritual, |r| {
        r.funded_members_bitmap = 3;
        r.funded_member_count = 2;
        r.funded_stake_total = 200;
        r.funded_fee_total = 49;
    })
    .await;
    let before = get_account(&mut context, ritual).await.data;
    assert_error(
        submit(
            &mut context,
            vec![activate_ix_default(creator.pubkey(), nonce)],
            &[],
        )
        .await,
        6028,
    );
    assert_eq!(get_account(&mut context, ritual).await.data, before);
}

#[tokio::test]
async fn short_vaults_reject_without_state_or_token_movement() {
    let creator = Keypair::new();
    let other = Keypair::new();
    for (nonce, short_stake, expected) in [(703, true, 6030), (704, false, 6031)] {
        let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        let stake = vault_pda(b"stake-vault", &ritual);
        let fee = vault_pda(b"fee-vault", &ritual);
        if short_stake {
            replace_token_amount(&mut context, stake, 199).await;
        } else {
            replace_token_amount(&mut context, fee, 49).await;
        }
        let before = full_snapshot(&mut context, ritual, false).await;
        assert_error(
            submit(
                &mut context,
                vec![activate_ix_default(creator.pubkey(), nonce)],
                &[],
            )
            .await,
            expected,
        );
        assert_eq!(full_snapshot(&mut context, ritual, false).await, before);
    }
}

#[tokio::test]
async fn activation_rejects_open_boundary_and_replay() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 705;
    let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = context
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |r| r.schedule[0].opens = now).await;
    assert_eq!(
        amount(&mut context, vault_pda(b"stake-vault", &ritual)).await,
        200
    );
    assert_error(
        submit(
            &mut context,
            vec![activate_ix_default(creator.pubkey(), nonce)],
            &[],
        )
        .await,
        6029,
    );
    let now = context
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0].opens = now + 100;
        r.schedule[0].deadline = now + 101;
        r.schedule[0].resolution = now + 102;
    })
    .await;
    let before = full_snapshot(&mut context, ritual, false).await;
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), nonce)],
        &[],
    )
    .await
    .unwrap();
    assert_error(
        submit(
            &mut context,
            vec![activate_ix_default(creator.pubkey(), nonce)],
            &[],
        )
        .await,
        6020,
    );
}

async fn full_snapshot(
    context: &mut ProgramTestContext,
    ritual: Pubkey,
    include_second: bool,
) -> ActivationSnapshot {
    ActivationSnapshot::capture(
        context,
        ritual,
        RECIPIENT,
        &[
            Pubkey::new_from_array([21; 32]),
            Pubkey::new_from_array([22; 32]),
        ],
        include_second,
    )
    .await
}

fn assert_only_activation_changed(before: &ActivationSnapshot, after: &ActivationSnapshot) {
    assert_eq!(before.protocol_config, after.protocol_config);
    assert_eq!(before.stake_vault, after.stake_vault);
    assert_eq!(before.member_sources, after.member_sources);
    assert_eq!(before.second_recipient, after.second_recipient);
    let before_ritual = deserialize(&before.ritual.data);
    let after_ritual = deserialize(&after.ritual.data);
    let mut expected = before_ritual.clone();
    expected.status = after_ritual.status.clone();
    expected.activated_at = after_ritual.activated_at;
    let mut expected_bytes = Vec::new();
    expected.try_serialize(&mut expected_bytes).unwrap();
    let mut actual_bytes = Vec::new();
    after_ritual.try_serialize(&mut actual_bytes).unwrap();
    assert_eq!(expected_bytes, actual_bytes);
    assert_eq!(before.fee_vault.data.len(), after.fee_vault.data.len());
    assert_eq!(amount_from_account(&before.fee_vault), 53);
    assert_eq!(amount_from_account(&after.fee_vault), 3);
    assert_eq!(amount_from_account(&before.locked_recipient), 0);
    assert_eq!(amount_from_account(&after.locked_recipient), 50);
}

fn amount_from_account(account: &Account) -> u64 {
    spl_token::state::Account::unpack(&account.data)
        .unwrap()
        .amount
}

#[tokio::test]
async fn malformed_locked_activation_states_are_independently_rejected_with_full_rollback() {
    let cases: Vec<(&str, Box<dyn Fn(&mut rituals::Ritual)>)> = vec![
        ("schema", Box::new(|r| r.schema_version = 2)),
        ("members_len", Box::new(|r| r.members.truncate(1))),
        (
            "default_member",
            Box::new(|r| r.members[0] = Pubkey::default()),
        ),
        (
            "duplicate_member",
            Box::new(|r| r.members[1] = r.members[0]),
        ),
        ("creator_absent", Box::new(|r| r.members[1] = OUTSIDER)),
        ("zero_digest", Box::new(|r| r.rule_digest = [0; 32])),
        ("empty_schedule", Box::new(|r| r.schedule.clear())),
        ("opens_negative", Box::new(|r| r.schedule[0].opens = -1)),
        (
            "opens_after_deadline",
            Box::new(|r| r.schedule[0].opens = r.schedule[0].deadline),
        ),
        (
            "deadline_after_resolution",
            Box::new(|r| r.schedule[0].deadline = r.schedule[0].resolution),
        ),
        (
            "nonchronological",
            Box::new(|r| {
                r.schedule = vec![
                    EventWindow {
                        opens: 10,
                        deadline: 11,
                        resolution: 12,
                    },
                    EventWindow {
                        opens: 11,
                        deadline: 13,
                        resolution: 14,
                    },
                ]
            }),
        ),
        ("stake_zero", Box::new(|r| r.member_total_stake = 0)),
        (
            "stake_nondivisible",
            Box::new(|r| r.member_total_stake = 99),
        ),
        ("allocation_zero", Box::new(|r| r.per_event_allocation = 0)),
        (
            "allocation_wrong",
            Box::new(|r| r.per_event_allocation = 99),
        ),
        (
            "threshold",
            Box::new(|r| r.additional_confirmation_threshold = 2),
        ),
        (
            "recipient_default",
            Box::new(|r| r.locked_fee_recipient = Pubkey::default()),
        ),
        ("fee_zero", Box::new(|r| r.locked_activation_fee = 0)),
        ("bitmap_missing", Box::new(|r| r.funded_members_bitmap = 1)),
        (
            "bitmap_out_of_range",
            Box::new(|r| r.funded_members_bitmap = 7),
        ),
        ("count_wrong", Box::new(|r| r.funded_member_count = 1)),
        (
            "funded_stake_wrong",
            Box::new(|r| r.funded_stake_total = 201),
        ),
        ("funded_fee_wrong", Box::new(|r| r.funded_fee_total = 48)),
    ];
    for (index, (name, mutation)) in cases.into_iter().enumerate() {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 800 + index as u64;
        let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        replace_ritual(&mut context, ritual, mutation).await;
        let before = full_snapshot(&mut context, ritual, false).await;
        let expected = if name == "recipient_default" {
            2012
        } else {
            6028
        };
        assert_error(
            submit(
                &mut context,
                vec![activate_ix_default(creator.pubkey(), nonce)],
                &[],
            )
            .await,
            expected,
        );
        let after = full_snapshot(&mut context, ritual, false).await;
        assert_eq!(before, after, "mutation {name}");
    }
}

#[tokio::test]
async fn activation_success_preserves_everything_except_status_and_timestamp() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 850;
    let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    replace_token_amount(&mut context, vault_pda(b"stake-vault", &ritual), 207).await;
    replace_token_amount(&mut context, vault_pda(b"fee-vault", &ritual), 53).await;
    let before = full_snapshot(&mut context, ritual, false).await;
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), nonce)],
        &[],
    )
    .await
    .unwrap();
    let after = full_snapshot(&mut context, ritual, false).await;
    assert_only_activation_changed(&before, &after);
    assert_eq!(
        deserialize(&before.ritual.data).funded_stake_total,
        deserialize(&after.ritual.data).funded_stake_total
    );
    assert_eq!(
        deserialize(&before.ritual.data).funded_fee_total,
        deserialize(&after.ritual.data).funded_fee_total
    );
}

#[tokio::test]
async fn activation_timing_rejects_past_and_exact_open_with_full_rollback() {
    for (index, offset) in [-1i64, 0].into_iter().enumerate() {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 880 + index as u64;
        let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        let now = context
            .banks_client
            .get_sysvar::<Clock>()
            .await
            .unwrap()
            .unix_timestamp;
        replace_ritual(&mut context, ritual, |r| r.schedule[0].opens = now + offset).await;
        let before = full_snapshot(&mut context, ritual, false).await;
        assert_error(
            submit(
                &mut context,
                vec![activate_ix_default(creator.pubkey(), nonce)],
                &[],
            )
            .await,
            6029,
        );
        assert_eq!(before, full_snapshot(&mut context, ritual, false).await);
    }
}

#[tokio::test]
async fn config_replacement_cannot_redirect_a_locked_recipient_or_pause_activation() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 900;
    let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    replace_config(&mut context, |c| {
        c.paused = true;
        c.fee_recipient = SECOND_RECIPIENT;
    })
    .await;
    let before = full_snapshot(&mut context, ritual, true).await;
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), nonce)],
        &[],
    )
    .await
    .unwrap();
    let after = full_snapshot(&mut context, ritual, true).await;
    assert_eq!(amount_from_account(&after.locked_recipient), 50);
    assert_eq!(amount_from_account(&after.second_recipient.unwrap()), 0);
    assert_eq!(before.stake_vault, after.stake_vault);
}

#[tokio::test]
async fn frozen_fee_cpi_rolls_back_before_activation_state_is_written() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 910;
    let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let fee = vault_pda(b"fee-vault", &ritual);
    replace_token_amount(&mut context, fee, 53).await;
    freeze_token_account(&mut context, fee).await;
    let before = full_snapshot(&mut context, ritual, false).await;
    assert_error(
        submit(
            &mut context,
            vec![activate_ix_default(creator.pubkey(), nonce)],
            &[],
        )
        .await,
        17,
    );
    assert_eq!(before, full_snapshot(&mut context, ritual, false).await);
}

#[tokio::test]
async fn account_binding_rejections_are_atomic_for_recipient_mints_vaults_and_programs() {
    let cases = [
        "recipient_address",
        "recipient_mint",
        "recipient_owner",
        "stake_mint",
        "stake_vault",
        "fee_vault",
        "swapped_vaults",
        "token_program",
        "config",
    ];
    for (index, case) in cases.into_iter().enumerate() {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 930 + index as u64;
        let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        let stake = vault_pda(b"stake-vault", &ritual);
        let fee = vault_pda(b"fee-vault", &ritual);
        if case == "recipient_mint" {
            let original = get_account(&mut context, RECIPIENT).await;
            replace_account(
                &mut context,
                RECIPIENT,
                token_account_for(WRONG_MINT, Pubkey::new_from_array([10; 32]), 0),
            )
            .await;
            assert_eq!(original.owner, spl_token::ID);
        } else if case == "recipient_owner" {
            replace_owner(&mut context, RECIPIENT, system_program::ID).await;
        }
        let before = full_snapshot(&mut context, ritual, false).await;
        let mut ix = activate_ix_default(creator.pubkey(), nonce);
        let metas = &mut ix.accounts;
        match case {
            "recipient_address" => metas[5].pubkey = OUTSIDER,
            "stake_mint" => metas[2].pubkey = WRONG_MINT,
            "stake_vault" => metas[3].pubkey = OUTSIDER,
            "fee_vault" => metas[4].pubkey = OUTSIDER,
            "swapped_vaults" => {
                metas[3].pubkey = fee;
                metas[4].pubkey = stake;
            }
            "token_program" => metas[6].pubkey = system_program::ID,
            "config" => metas[0].pubkey = OUTSIDER,
            _ => {}
        }
        let result = submit(&mut context, vec![ix], &[]).await;
        assert!(
            result.is_err(),
            "binding case {case} unexpectedly succeeded"
        );
        assert_eq!(
            before,
            full_snapshot(&mut context, ritual, false).await,
            "binding case {case}"
        );
    }
}

#[tokio::test]
async fn replay_after_success_returns_exact_6020_and_full_rollback() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 980;
    let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), nonce)],
        &[],
    )
    .await
    .unwrap();
    let before = full_snapshot(&mut context, ritual, false).await;
    assert_error(
        submit(
            &mut context,
            vec![activate_ix_default(creator.pubkey(), nonce)],
            &[],
        )
        .await,
        6020,
    );
    assert_eq!(before, full_snapshot(&mut context, ritual, false).await);
}

#[test]
fn activate_ritual_api_has_no_user_authority_parameter() {
    let creator = Pubkey::new_unique();
    let ritual = ritual_pda(&creator, 1);
    let _ = rituals::accounts::ActivateRitual {
        protocol_config: config_pda(),
        ritual,
        stake_mint: MINT,
        stake_vault: vault_pda(b"stake-vault", &ritual),
        fee_vault: vault_pda(b"fee-vault", &ritual),
        fee_recipient_token: RECIPIENT,
        token_program: spl_token::ID,
    };
}
