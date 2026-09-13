mod support;
use support::*;

const NOT_EMPTY: u32 = 6057 + 1;
const VAULT_STATE: u32 = NOT_EMPTY + 1;
const INVALID_STATUS: u32 = VAULT_STATE + 1;
const TERMINAL_STATE: u32 = INVALID_STATUS + 1;

fn close_ix_with_accounts(
    ritual: Pubkey,
    stake_vault: Pubkey,
    fee_vault: Pubkey,
    creator: Pubkey,
    token_program: Pubkey,
) -> Instruction {
    let accounts = rituals::accounts::CloseTerminalVaults {
        ritual,
        stake_vault,
        fee_vault,
        creator_rent_destination: creator,
        token_program,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::CloseTerminalVaults {}.data(),
    }
}

async fn optional(context: &mut ProgramTestContext, address: Pubkey) -> Option<Account> {
    context.banks_client.get_account(address).await.unwrap()
}

async fn lamports(context: &mut ProgramTestContext, address: Pubkey) -> u64 {
    optional(context, address).await.unwrap().lamports
}

async fn valid_cancelled(nonce: u64) -> (ProgramTestContext, Keypair, Keypair, Pubkey) {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, nonce, 0, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |r| {
        r.status = RitualStatus::Cancelled;
        r.cancelled_at = now;
        r.activated_at = 0;
        r.completed_at = 0;
        r.current_event_index = 0;
        r.settled_event_count = 0;
        r.funded_members_bitmap = 0;
        r.funded_member_count = 0;
        r.funded_stake_total = 0;
        r.funded_fee_total = 0;
        r.vaults_closed = false;
    })
    .await;
    (context, creator, other, ritual)
}

async fn valid_completed(nonce: u64) -> (ProgramTestContext, Keypair, Keypair, Pubkey, Pubkey) {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, nonce, 300, 300).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let future = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp
        + 100;
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0] = EventWindow {
            opens: future,
            deadline: future + 100,
            resolution: future + 200,
        };
    })
    .await;
    submit(
        &mut context,
        vec![
            fund_ix(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                Pubkey::new_from_array([21; 32]),
            ),
            fund_ix(
                creator.pubkey(),
                nonce,
                other.pubkey(),
                Pubkey::new_from_array([22; 32]),
            ),
            activate_ix_default(creator.pubkey(), nonce),
        ],
        &[&creator, &other],
    )
    .await
    .unwrap();
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0] = EventWindow {
            opens: now - 100,
            deadline: now - 50,
            resolution: now - 1,
        };
    })
    .await;
    submit(
        &mut context,
        vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
        &[&creator],
    )
    .await
    .unwrap();
    let event = event_pda(&ritual, 0);
    replace_event(&mut context, event, |e| e.window.resolution = now - 1).await;
    submit(
        &mut context,
        vec![finalize_event_ix(
            ritual,
            0,
            &[
                Pubkey::new_from_array([22; 32]),
                Pubkey::new_from_array([21; 32]),
            ],
        )],
        &[],
    )
    .await
    .unwrap();
    (context, creator, other, ritual, event)
}

#[tokio::test]
async fn completed_real_path_closes_both_vaults_to_creator_not_payer() {
    let (mut c, creator, _other, ritual, event) = valid_completed(9100).await;
    let stake = vault_pda(b"stake-vault", &ritual);
    let fee = vault_pda(b"fee-vault", &ritual);
    assert_eq!(amount(&mut c, stake).await, 0);
    assert_eq!(amount(&mut c, fee).await, 0);
    let stake_rent = lamports(&mut c, stake).await;
    let fee_rent = lamports(&mut c, fee).await;
    let before_creator = lamports(&mut c, creator.pubkey()).await;
    let ritual_before = get_account(&mut c, ritual).await;
    let event_before = get_account(&mut c, event).await;
    let mint_before = get_account(&mut c, MINT).await;
    submit(
        &mut c,
        vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
        &[],
    )
    .await
    .unwrap();
    assert!(optional(&mut c, stake).await.is_none());
    assert!(optional(&mut c, fee).await.is_none());
    assert_eq!(
        lamports(&mut c, creator.pubkey()).await,
        before_creator + stake_rent + fee_rent
    );
    let r = deserialize(&get_account(&mut c, ritual).await.data);
    assert_eq!(r.status, RitualStatus::Completed);
    assert!(r.vaults_closed);
    let mut expected = deserialize(&ritual_before.data);
    expected.vaults_closed = true;
    let mut expected_data = Vec::new();
    expected.try_serialize(&mut expected_data).unwrap();
    expected_data.resize(ritual_before.data.len(), 0);
    assert_eq!(get_account(&mut c, ritual).await.data, expected_data);
    assert_eq!(get_account(&mut c, event).await, event_before);
    assert_eq!(get_account(&mut c, MINT).await, mint_before);
}

#[tokio::test]
async fn cancelled_empty_funding_closes_exact_rent_and_preserves_ritual() {
    let (mut c, creator, _other, ritual) = valid_cancelled(9101).await;
    let stake = vault_pda(b"stake-vault", &ritual);
    let fee = vault_pda(b"fee-vault", &ritual);
    let expected = lamports(&mut c, stake).await + lamports(&mut c, fee).await;
    let before = lamports(&mut c, creator.pubkey()).await;
    submit(
        &mut c,
        vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
        &[],
    )
    .await
    .unwrap();
    assert_eq!(lamports(&mut c, creator.pubkey()).await, before + expected);
    assert!(optional(&mut c, stake).await.is_none());
    assert!(optional(&mut c, fee).await.is_none());
    assert!(deserialize(&get_account(&mut c, ritual).await.data).vaults_closed);
}

#[tokio::test]
async fn partially_funded_cancelled_and_refunded_path_closes() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut c = setup_host(&creator, &other, 9102, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), 9102);
    submit(
        &mut c,
        vec![fund_ix(
            creator.pubkey(),
            9102,
            creator.pubkey(),
            Pubkey::new_from_array([21; 32]),
        )],
        &[&creator],
    )
    .await
    .unwrap();
    submit(
        &mut c,
        vec![cancel_ix(
            creator.pubkey(),
            9102,
            other.pubkey(),
            &[
                Pubkey::new_from_array([22; 32]),
                Pubkey::new_from_array([21; 32]),
            ],
        )],
        &[&other],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize(&get_account(&mut c, ritual).await.data).status,
        RitualStatus::Cancelled
    );
    submit(
        &mut c,
        vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
        &[],
    )
    .await
    .unwrap();
    assert!(optional(&mut c, vault_pda(b"stake-vault", &ritual))
        .await
        .is_none());
    assert!(optional(&mut c, vault_pda(b"fee-vault", &ritual))
        .await
        .is_none());
}

#[tokio::test]
async fn stake_and_fee_dust_are_rejected_without_burn_or_close() {
    for (nonce, stake_amount, fee_amount) in [(9103, 1, 0), (9104, 0, 1)] {
        let (mut c, creator, _other, ritual) = valid_cancelled(nonce).await;
        replace_token_amount(&mut c, vault_pda(b"stake-vault", &ritual), stake_amount).await;
        replace_token_amount(&mut c, vault_pda(b"fee-vault", &ritual), fee_amount).await;
        let before = (
            get_account(&mut c, ritual).await,
            get_account(&mut c, MINT).await,
        );
        assert_error(
            submit(
                &mut c,
                vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
                &[],
            )
            .await,
            NOT_EMPTY,
        );
        assert_eq!(get_account(&mut c, ritual).await, before.0);
        assert_eq!(get_account(&mut c, MINT).await, before.1);
        assert!(!deserialize(&before.0.data).vaults_closed);
    }
}

#[tokio::test]
async fn funding_and_active_statuses_are_not_terminal() {
    for (nonce, status) in [(9105, RitualStatus::Funding), (9106, RitualStatus::Active)] {
        let (mut c, creator, _other, ritual) = valid_cancelled(nonce).await;
        replace_ritual(&mut c, ritual, |r| r.status = status).await;
        assert_error(
            submit(
                &mut c,
                vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
                &[],
            )
            .await,
            INVALID_STATUS,
        );
    }
}

#[tokio::test]
async fn malformed_completed_and_cancelled_terminal_states_fail_closed_as_a_table() {
    for (nonce, status, mutation) in [
        (9107, RitualStatus::Completed, 0u8),
        (9108, RitualStatus::Completed, 1),
        (9109, RitualStatus::Cancelled, 2),
        (9110, RitualStatus::Cancelled, 3),
    ] {
        let (mut c, creator, _other, ritual) = valid_cancelled(nonce).await;
        let now = c
            .banks_client
            .get_sysvar::<solana_sdk::clock::Clock>()
            .await
            .unwrap()
            .unix_timestamp;
        replace_ritual(&mut c, ritual, |r| {
            r.status = status.clone();
            r.cancelled_at = if status == RitualStatus::Cancelled {
                now
            } else {
                0
            };
            r.activated_at = if status == RitualStatus::Completed {
                now
            } else {
                0
            };
            r.completed_at = if status == RitualStatus::Completed {
                now
            } else {
                0
            };
            r.current_event_index = if status == RitualStatus::Completed {
                1
            } else {
                0
            };
            r.settled_event_count = if status == RitualStatus::Completed {
                1
            } else {
                0
            };
            r.funded_members_bitmap = if status == RitualStatus::Completed {
                3
            } else {
                0
            };
            r.funded_member_count = if status == RitualStatus::Completed {
                2
            } else {
                0
            };
            r.funded_stake_total = if mutation == 0 { 1 } else { 0 };
            if mutation == 1 {
                r.schedule[0].opens = r.schedule[0].deadline;
            }
            if mutation == 2 {
                r.funded_member_count = 1;
            }
            if mutation == 3 {
                r.cancelled_at = now - 1;
            }
        })
        .await;
        assert_error(
            submit(
                &mut c,
                vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
                &[],
            )
            .await,
            TERMINAL_STATE,
        );
    }
}

#[tokio::test]
async fn terminal_timestamps_must_be_positive_and_preserve_failed_close_state() {
    for (nonce, mutation) in [
        (9120, 0u8),
        (9121, 1),
        (9122, 2),
        (9123, 3),
        (9124, 4),
        (9125, 5),
    ] {
        let (mut c, creator, _other, ritual, _event) = valid_completed(nonce).await;
        replace_ritual(&mut c, ritual, |r| match mutation {
            0 => r.created_at = 0,
            1 => r.created_at = -1,
            2 => r.activated_at = 0,
            3 => r.activated_at = -1,
            4 => r.completed_at = 0,
            _ => r.completed_at = -1,
        })
        .await;
        let stake = vault_pda(b"stake-vault", &ritual);
        let fee = vault_pda(b"fee-vault", &ritual);
        let before = (
            get_account(&mut c, ritual).await,
            get_account(&mut c, stake).await,
            get_account(&mut c, fee).await,
            lamports(&mut c, creator.pubkey()).await,
        );
        assert_error(
            submit(
                &mut c,
                vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
                &[],
            )
            .await,
            TERMINAL_STATE,
        );
        assert_eq!(get_account(&mut c, ritual).await, before.0);
        assert_eq!(get_account(&mut c, stake).await, before.1);
        assert_eq!(get_account(&mut c, fee).await, before.2);
        assert_eq!(lamports(&mut c, creator.pubkey()).await, before.3);
    }

    for (nonce, mutation) in [(9126, 0i8), (9127, -1)] {
        let (mut c, creator, _other, ritual) = valid_cancelled(nonce).await;
        replace_ritual(&mut c, ritual, |r| r.created_at = i64::from(mutation)).await;
        let stake = vault_pda(b"stake-vault", &ritual);
        let fee = vault_pda(b"fee-vault", &ritual);
        let before = (
            get_account(&mut c, ritual).await,
            get_account(&mut c, stake).await,
            get_account(&mut c, fee).await,
            lamports(&mut c, creator.pubkey()).await,
        );
        assert_error(
            submit(
                &mut c,
                vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
                &[],
            )
            .await,
            TERMINAL_STATE,
        );
        assert_eq!(get_account(&mut c, ritual).await, before.0);
        assert_eq!(get_account(&mut c, stake).await, before.1);
        assert_eq!(get_account(&mut c, fee).await, before.2);
        assert_eq!(lamports(&mut c, creator.pubkey()).await, before.3);
    }

    for (nonce, mutation) in [(9128, 0i8), (9129, -1)] {
        let (mut c, creator, _other, ritual) = valid_cancelled(nonce).await;
        replace_ritual(&mut c, ritual, |r| r.cancelled_at = i64::from(mutation)).await;
        let stake = vault_pda(b"stake-vault", &ritual);
        let fee = vault_pda(b"fee-vault", &ritual);
        let before = (
            get_account(&mut c, ritual).await,
            get_account(&mut c, stake).await,
            get_account(&mut c, fee).await,
            lamports(&mut c, creator.pubkey()).await,
        );
        assert_error(
            submit(
                &mut c,
                vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
                &[],
            )
            .await,
            TERMINAL_STATE,
        );
        assert_eq!(get_account(&mut c, ritual).await, before.0);
        assert_eq!(get_account(&mut c, stake).await, before.1);
        assert_eq!(get_account(&mut c, fee).await, before.2);
        assert_eq!(lamports(&mut c, creator.pubkey()).await, before.3);
    }
}

// These ordering cases are already rejected by the existing comparisons;
// they are regression coverage, not RED cases for the positivity fix.
#[tokio::test]
async fn terminal_timestamp_ordering_is_rejected() {
    let (mut c, creator, _other, ritual, _event) = valid_completed(9130).await;
    replace_ritual(&mut c, ritual, |r| r.completed_at = r.activated_at - 1).await;
    let before = get_account(&mut c, ritual).await;
    assert_error(
        submit(
            &mut c,
            vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
            &[],
        )
        .await,
        TERMINAL_STATE,
    );
    assert_eq!(get_account(&mut c, ritual).await, before);

    let (mut c, creator, _other, ritual) = valid_cancelled(9131).await;
    replace_ritual(&mut c, ritual, |r| r.cancelled_at = r.created_at - 1).await;
    let before = get_account(&mut c, ritual).await;
    assert_error(
        submit(
            &mut c,
            vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
            &[],
        )
        .await,
        TERMINAL_STATE,
    );
    assert_eq!(get_account(&mut c, ritual).await, before);
}

#[tokio::test]
async fn completed_close_preserves_historical_activation_fee_accounting() {
    let (mut c, creator, _other, ritual, _event) = valid_completed(9132).await;
    let fee = vault_pda(b"fee-vault", &ritual);
    let ritual_before = deserialize(&get_account(&mut c, ritual).await.data);
    assert_eq!(amount(&mut c, fee).await, 0);
    assert!(ritual_before.funded_fee_total == ritual_before.locked_activation_fee);
    assert!(ritual_before.funded_fee_total > 0);
    replace_ritual(&mut c, ritual, |r| r.funded_fee_total = 0).await;
    assert_error(
        submit(
            &mut c,
            vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
            &[],
        )
        .await,
        TERMINAL_STATE,
    );
}

#[tokio::test]
async fn creator_destination_is_immutable_and_wrong_destination_is_rejected() {
    let (mut c, creator, other, ritual) = valid_cancelled(9111).await;
    let before = lamports(&mut c, other.pubkey()).await;
    let ix = {
        let accounts = rituals::accounts::CloseTerminalVaults {
            ritual,
            stake_vault: vault_pda(b"stake-vault", &ritual),
            fee_vault: vault_pda(b"fee-vault", &ritual),
            creator_rent_destination: other.pubkey(),
            token_program: spl_token::ID,
        };
        Instruction {
            program_id: PROGRAM_ID,
            accounts: accounts.to_account_metas(None),
            data: rituals::instruction::CloseTerminalVaults {}.data(),
        }
    };
    assert_error(submit(&mut c, vec![ix], &[]).await, 2012);
    assert_eq!(lamports(&mut c, other.pubkey()).await, before);
    assert!(optional(&mut c, vault_pda(b"stake-vault", &ritual))
        .await
        .is_some());
    let _ = creator;
}

#[tokio::test]
async fn vault_mint_owner_and_token_program_substitutions_are_rejected() {
    let cases = [0u8, 1, 2, 3];
    for (n, case) in cases.into_iter().enumerate() {
        let (mut c, creator, _other, ritual) = valid_cancelled(9112 + n as u64).await;
        let stake = vault_pda(b"stake-vault", &ritual);
        let fee = vault_pda(b"fee-vault", &ritual);
        let (stake_arg, fee_arg, token) = match case {
            0 => {
                let other_ritual = ritual_pda(&creator.pubkey(), 20_000 + n as u64);
                submit(
                    &mut c,
                    vec![create_ix(
                        creator.pubkey(),
                        OUTSIDER,
                        20_000 + n as u64,
                        FeePayerMode::Host,
                    )],
                    &[&creator],
                )
                .await
                .unwrap();
                assert_eq!(
                    other_ritual,
                    ritual_pda(&creator.pubkey(), 20_000 + n as u64)
                );
                (vault_pda(b"stake-vault", &other_ritual), fee, spl_token::ID)
            }
            1 => (stake, fee, spl_token::ID),
            2 => (stake, fee, spl_token::ID),
            _ => (stake, fee, anchor_spl::token_2022::spl_token_2022::ID),
        };
        if case == 1 {
            replace_token_destination_fields(&mut c, stake, Some(WRONG_MINT), None, None).await;
        }
        if case == 2 {
            replace_owner(&mut c, fee, system_program::ID).await;
        }
        assert!(submit(
            &mut c,
            vec![close_ix_with_accounts(
                ritual,
                stake_arg,
                fee_arg,
                creator.pubkey(),
                token
            )],
            &[]
        )
        .await
        .is_err());
        assert!(optional(&mut c, stake).await.is_some());
        assert!(optional(&mut c, fee).await.is_some());
    }
}

#[tokio::test]
async fn outsider_close_authority_is_rejected_but_none_and_ritual_authority_work() {
    let (mut c, creator, _other, ritual) = valid_cancelled(9116).await;
    replace_token_close_authority(&mut c, vault_pda(b"stake-vault", &ritual), Some(OUTSIDER)).await;
    assert_error(
        submit(
            &mut c,
            vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
            &[],
        )
        .await,
        VAULT_STATE,
    );
    let (mut c, creator, _other, ritual) = valid_cancelled(9117).await;
    replace_token_close_authority(&mut c, vault_pda(b"stake-vault", &ritual), Some(ritual)).await;
    replace_token_close_authority(&mut c, vault_pda(b"fee-vault", &ritual), Some(ritual)).await;
    submit(
        &mut c,
        vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
        &[],
    )
    .await
    .unwrap();
}

#[tokio::test]
async fn replay_after_success_cannot_credit_creator_twice() {
    let (mut c, creator, _other, ritual) = valid_cancelled(9118).await;
    submit(
        &mut c,
        vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
        &[],
    )
    .await
    .unwrap();
    let after = lamports(&mut c, creator.pubkey()).await;
    assert_error(
        submit(
            &mut c,
            vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
            &[],
        )
        .await,
        3012,
    );
    assert_eq!(lamports(&mut c, creator.pubkey()).await, after);
    assert!(deserialize(&get_account(&mut c, ritual).await.data).vaults_closed);
}

#[tokio::test]
async fn six_member_terminal_fixture_closes_without_account_looping() {
    let members: Vec<Keypair> = (0..6).map(|_| Keypair::new()).collect();
    let refs: Vec<&Keypair> = members.iter().collect();
    let amounts = vec![0; 6];
    let mut c = start_with_member_set(&refs, &amounts).await;
    submit(
        &mut c,
        vec![
            initialize_ix(members[0].pubkey()),
            create_ix_with_members(
                members[0].pubkey(),
                members.iter().map(Keypair::pubkey).collect(),
                9119,
                0,
            ),
        ],
        &[&members[0]],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&members[0].pubkey(), 9119);
    let now = c
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut c, ritual, |r| {
        r.status = RitualStatus::Cancelled;
        r.cancelled_at = now;
    })
    .await;
    submit(
        &mut c,
        vec![close_terminal_vaults_ix(ritual, members[0].pubkey())],
        &[],
    )
    .await
    .unwrap();
    assert!(deserialize(&get_account(&mut c, ritual).await.data).vaults_closed);
}

#[test]
fn close_api_has_only_fixed_creator_destination_and_two_vaults() {
    let ritual = Pubkey::new_from_array([42; 32]);
    let creator = Pubkey::new_from_array([43; 32]);
    let ix = close_terminal_vaults_ix(ritual, creator);
    assert_eq!(ix.accounts.len(), 5);
    assert_eq!(ix.accounts[0].pubkey, ritual);
    assert_eq!(ix.accounts[1].pubkey, vault_pda(b"stake-vault", &ritual));
    assert_eq!(ix.accounts[2].pubkey, vault_pda(b"fee-vault", &ritual));
    assert_eq!(ix.accounts[3].pubkey, creator);
    assert_eq!(ix.accounts[4].pubkey, spl_token::ID);
    assert!(ix.accounts.iter().all(|meta| meta.pubkey != MINT));
    assert!(!ix.accounts.iter().any(|meta| meta.pubkey == RECIPIENT));
}
