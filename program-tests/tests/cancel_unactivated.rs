mod support;
use support::*;

#[tokio::test]
async fn creator_can_cancel_empty_funding_and_records_timestamp() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9001;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            &destinations,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(state.status, RitualStatus::Cancelled);
    assert!(state.cancelled_at >= 0);
    assert_eq!(state.funded_members_bitmap, 0);
    assert_eq!(state.funded_member_count, 0);
    assert_eq!(state.funded_stake_total, 0);
    assert_eq!(state.funded_fee_total, 0);
}

#[tokio::test]
async fn malformed_lifecycle_is_rejected_before_authority_check() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9000;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    replace_ritual(&mut context, ritual, |state| {
        state.schedule[0].opens = i64::MAX - 2;
        state.schedule[0].deadline = i64::MAX - 1;
        state.schedule[0].resolution = i64::MAX;
        state.activated_at = 1;
    })
    .await;
    let result = submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            nonce,
            other.pubkey(),
            &[
                Pubkey::new_from_array([22; 32]),
                Pubkey::new_from_array([21; 32]),
            ],
        )],
        &[&other],
    )
    .await;
    assert_error(result, 6035);
}

#[tokio::test]
async fn noncreator_before_first_window_is_rejected_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 9010, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), 9010);
    replace_ritual(&mut context, ritual, |state| {
        state.schedule[0] = EventWindow {
            opens: i64::MAX - 2,
            deadline: i64::MAX - 1,
            resolution: i64::MAX,
        };
    })
    .await;
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    assert_error(
        submit(
            &mut context,
            vec![cancel_ix(
                creator.pubkey(),
                9010,
                other.pubkey(),
                &destinations,
            )],
            &[&other],
        )
        .await,
        6032,
    );
    assert_eq!(
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await,
        before
    );
}

#[tokio::test]
async fn cancellation_after_first_window_allows_arbitrary_signer() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 9011, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), 9011);
    replace_ritual(&mut context, ritual, |state| {
        state.schedule[0] = EventWindow {
            opens: 0,
            deadline: 1,
            resolution: 2,
        };
    })
    .await;
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            9011,
            other.pubkey(),
            &destinations,
        )],
        &[&other],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize(&get_account(&mut context, ritual).await.data).status,
        RitualStatus::Cancelled
    );
}

#[tokio::test]
async fn cancellation_lifecycle_fields_are_each_rejected_atomically() {
    for (case, mutate) in [
        ("activated", 0u8),
        ("cancelled", 1),
        ("event", 2),
        ("settled", 3),
    ] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 9012 + u64::from(mutate);
        let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        replace_ritual(&mut context, ritual, |state| match mutate {
            0 => state.activated_at = 1,
            1 => state.cancelled_at = 1,
            2 => state.current_event_index = 1,
            _ => state.settled_event_count = 1,
        })
        .await;
        let destinations = [
            Pubkey::new_from_array([22; 32]),
            Pubkey::new_from_array([21; 32]),
        ];
        let before =
            CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
        assert_error(
            submit(
                &mut context,
                vec![cancel_ix(
                    creator.pubkey(),
                    nonce,
                    creator.pubkey(),
                    &destinations,
                )],
                &[&creator],
            )
            .await,
            6035,
        );
        assert_eq!(
            CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await,
            before,
            "{case}"
        );
    }
}

#[tokio::test]
async fn malformed_funding_equations_are_rejected_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9016;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    replace_ritual(&mut context, ritual, |state| state.funded_member_count = 1).await;
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    assert_error(
        submit(
            &mut context,
            vec![cancel_ix(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                &destinations,
            )],
            &[&creator],
        )
        .await,
        6035,
    );
    assert_eq!(
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await,
        before
    );
}

#[tokio::test]
async fn refund_destination_count_is_exact_and_atomic() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9017;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    for destinations in [
        vec![Pubkey::new_from_array([22; 32])],
        vec![
            Pubkey::new_from_array([22; 32]),
            Pubkey::new_from_array([21; 32]),
            OUTSIDER,
        ],
    ] {
        let before = CancellationSnapshot::capture(
            &mut context,
            ritual,
            RECIPIENT,
            &destinations[..destinations.len().min(2)],
        )
        .await;
        assert_error(
            submit(
                &mut context,
                vec![cancel_ix(
                    creator.pubkey(),
                    nonce,
                    creator.pubkey(),
                    &destinations,
                )],
                &[&creator],
            )
            .await,
            6033,
        );
        assert_eq!(
            CancellationSnapshot::capture(
                &mut context,
                ritual,
                RECIPIENT,
                &destinations[..destinations.len().min(2)]
            )
            .await,
            before
        );
    }
}

#[tokio::test]
async fn duplicate_refund_destinations_are_rejected_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9018;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([22; 32]),
    ];
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &[destinations[0]]).await;
    assert_error(
        submit(
            &mut context,
            vec![cancel_ix(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                &destinations,
            )],
            &[&creator],
        )
        .await,
        6034,
    );
    assert_eq!(
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &[destinations[0]]).await,
        before
    );
}

#[tokio::test]
async fn cancellation_preserves_untracked_stake_and_fee_dust() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9019;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
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
    replace_token_amount(&mut context, vault_pda(b"stake-vault", &ritual), 103).await;
    replace_token_amount(&mut context, vault_pda(b"fee-vault", &ritual), 7).await;
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            &destinations,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(
        amount(&mut context, vault_pda(b"stake-vault", &ritual)).await,
        3
    );
    assert_eq!(
        amount(&mut context, vault_pda(b"fee-vault", &ritual)).await,
        7
    );
}

#[tokio::test]
async fn cancellation_replay_is_rejected_without_mutation() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9020;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            &destinations,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    assert_error(
        submit(
            &mut context,
            vec![cancel_ix(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                &destinations,
            )],
            &[&creator],
        )
        .await,
        6020,
    );
    assert_eq!(
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await,
        before
    );
}

#[tokio::test]
async fn active_ritual_rejects_cancellation_without_mutation() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9021;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    replace_ritual(&mut context, ritual, |state| {
        state.status = RitualStatus::Active;
    })
    .await;
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    assert_error(
        submit(
            &mut context,
            vec![cancel_ix(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                &destinations,
            )],
            &[&creator],
        )
        .await,
        6020,
    );
    assert_eq!(
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await,
        before
    );
}

#[tokio::test]
async fn host_cancellation_refunds_tracked_partial_stake_and_fee_only() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9002;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let other_source = Pubkey::new_from_array([22; 32]);
    let creator_source = Pubkey::new_from_array([21; 32]);
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            nonce,
            other.pubkey(),
            other_source,
        )],
        &[&other],
    )
    .await
    .unwrap();
    assert_eq!(
        amount(&mut context, vault_pda(b"stake-vault", &ritual)).await,
        100
    );
    assert_eq!(
        amount(&mut context, vault_pda(b"fee-vault", &ritual)).await,
        0
    );
    submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            &[other_source, creator_source],
        )],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(amount(&mut context, other_source).await, 200);
    assert_eq!(amount(&mut context, creator_source).await, 200);
    assert_eq!(
        amount(&mut context, vault_pda(b"stake-vault", &ritual)).await,
        0
    );
    assert_eq!(
        amount(&mut context, vault_pda(b"fee-vault", &ritual)).await,
        0
    );
    assert_eq!(amount(&mut context, RECIPIENT).await, 0);
    assert_eq!(
        deserialize(&get_account(&mut context, ritual).await.data).status,
        RitualStatus::Cancelled
    );
}

#[tokio::test]
async fn exact_open_allows_arbitrary_signer() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9030;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    replace_ritual(&mut context, ritual, |state| {
        state.schedule[0] = EventWindow {
            opens: 0,
            deadline: 1,
            resolution: 2,
        }
    })
    .await;
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            nonce,
            other.pubkey(),
            &destinations,
        )],
        &[&other],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize(&get_account(&mut context, ritual).await.data).status,
        RitualStatus::Cancelled
    );
}

#[tokio::test]
async fn host_refund_matrix_nonhost_host_and_both_restores_exact_sources() {
    for (nonce, fund_creator, fund_other) in
        [(9031, false, true), (9032, true, false), (9033, true, true)]
    {
        let creator = Keypair::new();
        let other = Keypair::new();
        let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        if fund_creator {
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
        }
        if fund_other {
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
        }
        let destinations = [
            Pubkey::new_from_array([22; 32]),
            Pubkey::new_from_array([21; 32]),
        ];
        let before = CancellationSnapshot::capture(
            &mut context,
            ritual,
            RECIPIENT,
            &[destinations[0], destinations[1], OUTSIDER, SECOND_RECIPIENT],
        )
        .await;
        submit(
            &mut context,
            vec![cancel_ix(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                &destinations,
            )],
            &[&creator],
        )
        .await
        .unwrap();
        assert_eq!(amount(&mut context, destinations[0]).await, 200);
        assert_eq!(amount(&mut context, destinations[1]).await, 200);
        assert_eq!(
            amount(&mut context, vault_pda(b"stake-vault", &ritual)).await,
            0
        );
        assert_eq!(
            amount(&mut context, vault_pda(b"fee-vault", &ritual)).await,
            0
        );
        assert_eq!(amount(&mut context, RECIPIENT).await, 0);
        assert_eq!(
            amount(&mut context, OUTSIDER).await,
            amount_from_snapshot(&before, OUTSIDER)
        );
        assert_eq!(
            deserialize(&get_account(&mut context, ritual).await.data).status,
            RitualStatus::Cancelled
        );
    }
}

fn amount_from_snapshot(snapshot: &CancellationSnapshot, address: Pubkey) -> u64 {
    if address == RECIPIENT {
        return spl_token::state::Account::unpack(&snapshot.fee_recipient.data)
            .unwrap()
            .amount;
    }
    snapshot
        .accounts
        .iter()
        .find(|(key, _)| *key == address)
        .map(|(_, account)| {
            spl_token::state::Account::unpack(&account.data)
                .unwrap()
                .amount
        })
        .unwrap()
}

#[tokio::test]
async fn split_cancellation_n3_remainder_shuffled_full_and_partial_are_exact() {
    let members: Vec<Keypair> = (0..3).map(|_| Keypair::new()).collect();
    let keys: Vec<Pubkey> = members.iter().map(Keypair::pubkey).collect();
    let nonce = 9034;
    let mut test = ProgramTest::new("rituals", PROGRAM_ID, processor!(process_instruction));
    test.add_program(
        "spl_token",
        spl_token::ID,
        processor!(spl_token::processor::Processor::process),
    );
    test.add_genesis_account(MINT, mint_account(330));
    test.add_genesis_account(
        RECIPIENT,
        token_account(Pubkey::new_from_array([10; 32]), 0),
    );
    for (index, member) in members.iter().enumerate() {
        test.add_genesis_account(
            Pubkey::new_from_array([40 + index as u8; 32]),
            token_account_for(MINT, member.pubkey(), 110),
        );
    }
    test.add_genesis_account(
        keys[0],
        Account {
            lamports: 10_000_000_000,
            data: vec![],
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        },
    );
    let mut context = test.start_with_context().await;
    let accounts = rituals::accounts::InitializeProtocolConfig {
        protocol_config: config_pda(),
        authority: keys[0],
        system_program: system_program::ID,
    };
    let init = Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::InitializeProtocolConfig {
            allowed_stake_mint: MINT,
            fee_recipient: RECIPIENT,
            fee_basis_points: 200,
            minimum_fee: 5,
            maximum_fee: 5,
            maximum_member_stake: 1000,
        }
        .data(),
    };
    let ritual = ritual_pda(&keys[0], nonce);
    let create_accounts = rituals::accounts::CreateRitual {
        protocol_config: config_pda(),
        ritual,
        creator: keys[0],
        stake_mint: MINT,
        fee_recipient_token: RECIPIENT,
        stake_vault: vault_pda(b"stake-vault", &ritual),
        fee_vault: vault_pda(b"fee-vault", &ritual),
        system_program: system_program::ID,
        token_program: spl_token::ID,
    };
    let create = Instruction {
        program_id: PROGRAM_ID,
        accounts: create_accounts.to_account_metas(None),
        data: rituals::instruction::CreateRitual {
            nonce,
            rule_digest: [2; 32],
            members: keys.clone(),
            member_total_stake: 100,
            schedule: vec![EventWindow {
                opens: 1,
                deadline: 2,
                resolution: 3,
            }],
            additional_confirmation_threshold: 0,
            fee_payer_mode: FeePayerMode::Split,
        }
        .data(),
    };
    submit(&mut context, vec![init, create], &[&members[0]])
        .await
        .unwrap();
    for index in [2usize, 0, 1] {
        submit(
            &mut context,
            vec![fund_ix(
                keys[0],
                nonce,
                keys[index],
                Pubkey::new_from_array([40 + index as u8; 32]),
            )],
            &[&members[index]],
        )
        .await
        .unwrap();
    }
    let destinations = [
        Pubkey::new_from_array([40; 32]),
        Pubkey::new_from_array([41; 32]),
        Pubkey::new_from_array([42; 32]),
    ];
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    submit(
        &mut context,
        vec![cancel_ix(keys[0], nonce, keys[1], &destinations)],
        &[&members[1]],
    )
    .await
    .unwrap();
    assert_eq!(amount(&mut context, destinations[0]).await, 110);
    assert_eq!(amount(&mut context, destinations[1]).await, 110);
    assert_eq!(amount(&mut context, destinations[2]).await, 110);
    assert_eq!(
        amount(&mut context, vault_pda(b"stake-vault", &ritual)).await,
        0
    );
    assert_eq!(
        amount(&mut context, vault_pda(b"fee-vault", &ritual)).await,
        0
    );
    assert_eq!(
        amount(&mut context, RECIPIENT).await,
        amount_from_snapshot(&before, RECIPIENT)
    );
    assert_eq!(
        deserialize(&get_account(&mut context, ritual).await.data).status,
        RitualStatus::Cancelled
    );
}

#[tokio::test]
async fn destination_validation_table_rejects_wrong_order_owner_mint_and_uninitialized() {
    for (offset, case) in ["wrong-order", "wrong-owner", "wrong-mint", "uninitialized"]
        .iter()
        .enumerate()
    {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 9040 + offset as u64;
        let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        let first = Pubkey::new_from_array([22; 32]);
        let second = Pubkey::new_from_array([21; 32]);
        if *case == "wrong-owner" {
            replace_token_owner_for_cancel(&mut context, first, OUTSIDER).await;
        }
        if *case == "uninitialized" {
            replace_account(
                &mut context,
                first,
                Account {
                    lamports: 1,
                    data: vec![0; spl_token::state::Account::LEN],
                    owner: spl_token::ID,
                    executable: false,
                    rent_epoch: 0,
                },
            )
            .await;
        }
        let destinations = if *case == "wrong-order" {
            vec![second, first]
        } else if *case == "wrong-mint" {
            vec![Pubkey::new_from_array([23; 32]), second]
        } else {
            vec![first, second]
        };
        let before = CancellationSnapshot::capture(
            &mut context,
            ritual,
            RECIPIENT,
            &[first, second, OUTSIDER],
        )
        .await;
        assert_error(
            submit(
                &mut context,
                vec![cancel_ix(
                    creator.pubkey(),
                    nonce,
                    creator.pubkey(),
                    &destinations,
                )],
                &[&creator],
            )
            .await,
            6034,
        );
        assert_eq!(
            CancellationSnapshot::capture(
                &mut context,
                ritual,
                RECIPIENT,
                &[first, second, OUTSIDER]
            )
            .await,
            before,
            "{case}"
        );
    }
}

async fn replace_token_owner_for_cancel(
    context: &mut ProgramTestContext,
    address: Pubkey,
    owner: Pubkey,
) {
    let original = get_account(context, address).await;
    let mut token = spl_token::state::Account::unpack(&original.data).unwrap();
    token.owner = owner;
    let mut data = vec![0; spl_token::state::Account::LEN];
    spl_token::state::Account::pack_into_slice(&token, &mut data);
    replace_account(context, address, Account { data, ..original }).await;
}

#[tokio::test]
async fn invalid_second_destination_has_no_first_transfer_movement() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9048;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let first = Pubkey::new_from_array([22; 32]);
    let second = Pubkey::new_from_array([21; 32]);
    submit(
        &mut context,
        vec![fund_ix(creator.pubkey(), nonce, other.pubkey(), first)],
        &[&other],
    )
    .await
    .unwrap();
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &[first, second]).await;
    assert_error(
        submit(
            &mut context,
            vec![cancel_ix(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                &[first, Pubkey::new_from_array([23; 32])],
            )],
            &[&creator],
        )
        .await,
        6034,
    );
    assert_eq!(
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &[first, second]).await,
        before
    );
}

#[tokio::test]
async fn short_stake_vault_is_6036_and_short_fee_vault_is_6037_atomically() {
    for (nonce, stake_short) in [(9049, true), (9050, false)] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        let fund_source = if stake_short {
            Pubkey::new_from_array([22; 32])
        } else {
            Pubkey::new_from_array([21; 32])
        };
        if stake_short {
            submit(
                &mut context,
                vec![fund_ix(
                    creator.pubkey(),
                    nonce,
                    other.pubkey(),
                    fund_source,
                )],
                &[&other],
            )
            .await
            .unwrap();
        } else {
            submit(
                &mut context,
                vec![fund_ix(
                    creator.pubkey(),
                    nonce,
                    creator.pubkey(),
                    fund_source,
                )],
                &[&creator],
            )
            .await
            .unwrap();
        }
        let stake = vault_pda(b"stake-vault", &ritual);
        let fee = vault_pda(b"fee-vault", &ritual);
        replace_token_amount(&mut context, if stake_short { stake } else { fee }, 0).await;
        let destinations = [
            Pubkey::new_from_array([22; 32]),
            Pubkey::new_from_array([21; 32]),
        ];
        let before =
            CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
        assert_error(
            submit(
                &mut context,
                vec![cancel_ix(
                    creator.pubkey(),
                    nonce,
                    creator.pubkey(),
                    &destinations,
                )],
                &[&creator],
            )
            .await,
            if stake_short { 6036 } else { 6037 },
        );
        assert_eq!(
            CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await,
            before
        );
    }
}

#[tokio::test]
async fn frozen_second_destination_rolls_back_first_stake_and_fee_cpis() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9051;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let first = Pubkey::new_from_array([22; 32]);
    let second = Pubkey::new_from_array([21; 32]);
    submit(
        &mut context,
        vec![
            fund_ix(creator.pubkey(), nonce, other.pubkey(), first),
            fund_ix(creator.pubkey(), nonce, creator.pubkey(), second),
        ],
        &[&other, &creator],
    )
    .await
    .unwrap();
    freeze_token_account(&mut context, second).await;
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &[first, second]).await;
    let result = submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            &[first, second],
        )],
        &[&creator],
    )
    .await;
    assert_error(result, 17);
    assert_eq!(
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &[first, second]).await,
        before
    );
}

#[tokio::test]
async fn malformed_cancellation_locked_terms_each_roll_back() {
    for (offset, mutation) in [0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].into_iter().enumerate() {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 9060 + offset as u64;
        let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        replace_ritual(&mut context, ritual, |r| match mutation {
            0 => r.schema_version = 2,
            1 => r.members[0] = Pubkey::default(),
            2 => r.schedule.clear(),
            3 => r.member_total_stake = 0,
            4 => r.per_event_allocation = 0,
            5 => r.additional_confirmation_threshold = 2,
            6 => r.rule_digest = [0; 32],
            7 => r.locked_fee_recipient = Pubkey::default(),
            8 => r.funded_members_bitmap = 4,
            9 => r.funded_member_count = 1,
            _ => r.funded_fee_total += 1,
        })
        .await;
        let destinations = [
            Pubkey::new_from_array([22; 32]),
            Pubkey::new_from_array([21; 32]),
        ];
        let before =
            CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
        assert_error(
            submit(
                &mut context,
                vec![cancel_ix(
                    creator.pubkey(),
                    nonce,
                    creator.pubkey(),
                    &destinations,
                )],
                &[&creator],
            )
            .await,
            6035,
        );
        assert_eq!(
            CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await,
            before
        );
    }
}

#[tokio::test]
async fn cancellation_binding_matrix_rejects_wrong_mint_and_vault_without_movement() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9072;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    for (mint, stake, fee) in [
        (
            WRONG_MINT,
            vault_pda(b"stake-vault", &ritual),
            vault_pda(b"fee-vault", &ritual),
        ),
        (MINT, OUTSIDER, vault_pda(b"fee-vault", &ritual)),
        (MINT, vault_pda(b"stake-vault", &ritual), OUTSIDER),
    ] {
        let result = submit(
            &mut context,
            vec![cancel_ix_with_accounts(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                mint,
                stake,
                fee,
                spl_token::ID,
                &destinations,
            )],
            &[&creator],
        )
        .await;
        assert!(result.is_err());
        assert_eq!(
            CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await,
            before
        );
    }
}

#[tokio::test]
async fn cancellation_requires_signing_caller_and_has_no_extra_config_or_recipient_accounts() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9073;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    let mut ix = cancel_ix(creator.pubkey(), nonce, creator.pubkey(), &destinations);
    ix.accounts[1].is_signer = false;
    assert_error(submit(&mut context, vec![ix], &[]).await, 3010);
    assert_eq!(
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await,
        before
    );
}

#[tokio::test]
async fn cancellation_uses_locked_terms_after_protocol_config_mutation() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9074;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    replace_config(&mut context, |c| {
        c.paused = true;
        c.fee_recipient = SECOND_RECIPIENT;
        c.minimum_fee = 499;
    })
    .await;
    let destinations = [
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
    ];
    let before =
        CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            &destinations,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(
        amount(&mut context, RECIPIENT).await,
        amount_from_snapshot(&before, RECIPIENT)
    );
    assert_eq!(amount(&mut context, SECOND_RECIPIENT).await, 0);
    assert_eq!(
        get_account(&mut context, config_pda()).await,
        before.protocol_config.unwrap()
    );
    assert_eq!(
        deserialize(&get_account(&mut context, ritual).await.data).status,
        RitualStatus::Cancelled
    );
}
