mod support;
use support::*;

async fn one_event_fixture(threshold: u8, nonce: u64) -> (ProgramTestContext, Keypair, Keypair, Pubkey, Pubkey) {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, nonce, 300, 300).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = context.banks_client.get_sysvar::<solana_sdk::clock::Clock>().await.unwrap().unix_timestamp;
    replace_ritual(&mut context, ritual, |r| {
        r.additional_confirmation_threshold = threshold;
        r.schedule[0] = EventWindow { opens: now + 100, deadline: now + 200, resolution: now + 300 };
    }).await;
    submit(&mut context, vec![
        fund_ix(creator.pubkey(), nonce, creator.pubkey(), Pubkey::new_from_array([21; 32])),
        fund_ix(creator.pubkey(), nonce, other.pubkey(), Pubkey::new_from_array([22; 32])),
        activate_ix_default(creator.pubkey(), nonce),
    ], &[&creator, &other]).await.unwrap();
    let now = context.banks_client.get_sysvar::<solana_sdk::clock::Clock>().await.unwrap().unix_timestamp;
    let open = EventWindow { opens: now - 100, deadline: now + 100, resolution: now + 200 };
    replace_ritual(&mut context, ritual, |r| r.schedule[0] = open.clone()).await;
    submit(&mut context, vec![initialize_event_ix(ritual, creator.pubkey(), 0)], &[&creator]).await.unwrap();
    (context, creator, other, ritual, event_pda(&ritual, 0))
}

async fn resolve_window(context: &mut ProgramTestContext, ritual: Pubkey, event: Pubkey) {
    let now = context.banks_client.get_sysvar::<solana_sdk::clock::Clock>().await.unwrap().unix_timestamp;
    let closed = EventWindow { opens: now - 200, deadline: now - 100, resolution: now - 1 };
    replace_ritual(context, ritual, |r| r.schedule[0] = closed.clone()).await;
    replace_event(context, event, |e| e.window = closed).await;
}


#[tokio::test]
async fn settled_n2_transfers_pool_and_records_receipt() {
    let (mut c, creator, other, ritual, event) = one_event_fixture(1, 7402).await;
    submit(&mut c, vec![
        claim_completion_ix(ritual, other.pubkey(), 0, 0),
        claim_completion_ix(ritual, creator.pubkey(), 0, 0),
    ], &[&other, &creator]).await.unwrap();
    submit(&mut c, vec![
        approve_claim_ix(ritual, other.pubkey(), creator.pubkey(), 0),
        approve_claim_ix(ritual, creator.pubkey(), other.pubkey(), 0),
    ], &[&creator, &other]).await.unwrap();
    resolve_window(&mut c, ritual, event).await;
    let before = amount(&mut c, vault_pda(b"stake-vault", &ritual)).await;
    submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await.unwrap();
    assert_eq!(amount(&mut c, Pubkey::new_from_array([22; 32])).await, 300);
    assert_eq!(amount(&mut c, Pubkey::new_from_array([21; 32])).await, 250);
    assert_eq!(amount(&mut c, vault_pda(b"stake-vault", &ritual)).await, before - 200);
    let e = deserialize_event(&get_account(&mut c, event).await.data);
    assert_eq!((e.status, e.settlement_version, e.event_pool, e.forfeited_total, e.payout_total, e.refunded_total, e.confirmed_member_count, e.remainder_units, e.remaining_stake_total_after), (EventStatus::Settled, 1, 200, 0, 200, 0, 2, 0, 0));
    let r = deserialize(&get_account(&mut c, ritual).await.data);
    assert_eq!((r.status, r.current_event_index, r.settled_event_count, r.funded_stake_total), (RitualStatus::Completed, 1, 1, 0));
}

#[tokio::test]
async fn all_confirmed_n2_pays_each_allocation() {
    let (mut c, creator, other, ritual, event) = one_event_fixture(0, 7403).await;
    submit(&mut c, vec![claim_completion_ix(ritual, other.pubkey(), 0, 0), claim_completion_ix(ritual, creator.pubkey(), 0, 0)], &[&other, &creator]).await.unwrap();
    resolve_window(&mut c, ritual, event).await;
    submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await.unwrap();
    let e = deserialize_event(&get_account(&mut c, event).await.data);
    assert_eq!((e.status, e.payout_total, e.forfeited_total, e.confirmed_member_count), (EventStatus::Settled, 200, 0, 2));
}

#[tokio::test]
async fn pending_claim_is_real_safe_void_and_refunds_pool() {
    let (mut c, creator, other, ritual, event) = one_event_fixture(1, 7404).await;
    submit(&mut c, vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)], &[&other]).await.unwrap();
    resolve_window(&mut c, ritual, event).await;
    submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await.unwrap();
    let e = deserialize_event(&get_account(&mut c, event).await.data);
    assert_eq!((e.status, e.void_reason, e.payout_total, e.refunded_total), (EventStatus::Voided, rituals::VoidReason::UnresolvedClaims, 0, 200));
}

#[tokio::test]
async fn questioned_claim_is_real_safe_void() {
    let (mut c, creator, other, ritual, event) = one_event_fixture(1, 7405).await;
    submit(&mut c, vec![claim_completion_ix(ritual, other.pubkey(), 0, 0), question_claim_ix(ritual, other.pubkey(), creator.pubkey(), 0)], &[&other, &creator]).await.unwrap();
    resolve_window(&mut c, ritual, event).await;
    submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await.unwrap();
    let e = deserialize_event(&get_account(&mut c, event).await.data);
    assert_eq!((e.status, e.void_reason, e.refunded_total), (EventStatus::Voided, rituals::VoidReason::UnresolvedClaims, 200));
}

#[tokio::test]
async fn no_claims_can_finalize_to_no_confirmed_void() {
    let (mut c, _creator, _other, ritual, event) = one_event_fixture(0, 7406).await;
    replace_event(&mut c, event, |e| e.status = EventStatus::Scheduled).await;
    resolve_window(&mut c, ritual, event).await;
    submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await.unwrap();
    let e = deserialize_event(&get_account(&mut c, event).await.data);
    assert_eq!(e.void_reason, rituals::VoidReason::NoConfirmedMembers);
}

#[tokio::test]
async fn exact_resolution_replay_and_receipt_corruption_are_rejected_atomically() {
    let (mut c, creator, _other, ritual, event) = one_event_fixture(0, 7407).await;
    let now = c.banks_client.get_sysvar::<solana_sdk::clock::Clock>().await.unwrap().unix_timestamp;
    let exact = EventWindow { opens: now - 20, deadline: now - 10, resolution: now };
    replace_ritual(&mut c, ritual, |r| r.schedule[0] = exact.clone()).await;
    replace_event(&mut c, event, |e| e.window = exact).await;
    let before = get_account(&mut c, ritual).await;
    assert_error(submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await, 6054);
    assert_eq!(get_account(&mut c, ritual).await, before);
    resolve_window(&mut c, ritual, event).await;
    submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await.unwrap();
    let terminal = get_account(&mut c, ritual).await;
    assert_error(submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await, 6020);
    assert_eq!(get_account(&mut c, ritual).await, terminal);
    let _ = creator;
}

#[tokio::test]
async fn receipt_prefields_and_future_initialization_reject_with_6039() {
    for (nonce, mutate) in [(7408, 0u8), (7409, 1u8)] {
        let (mut c, _creator, _other, ritual, event) = one_event_fixture(0, nonce).await;
        resolve_window(&mut c, ritual, event).await;
        if mutate == 0 { replace_event(&mut c, event, |e| e.resolved_at = 1).await; }
        else { let now = c.banks_client.get_sysvar::<solana_sdk::clock::Clock>().await.unwrap().unix_timestamp; replace_event(&mut c, event, |e| e.initialized_at = now + 1000).await; }
        let snapshot = (
            get_account(&mut c, ritual).await,
            get_account(&mut c, event).await,
            get_account(&mut c, vault_pda(b"stake-vault", &ritual)).await,
            get_account(&mut c, vault_pda(b"fee-vault", &ritual)).await,
            get_account(&mut c, RECIPIENT).await,
            get_account(&mut c, Pubkey::new_from_array([22; 32])).await,
            get_account(&mut c, Pubkey::new_from_array([21; 32])).await,
        );
        assert_error(submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await, 6039);
        assert_eq!(snapshot, (
            get_account(&mut c, ritual).await,
            get_account(&mut c, event).await,
            get_account(&mut c, vault_pda(b"stake-vault", &ritual)).await,
            get_account(&mut c, vault_pda(b"fee-vault", &ritual)).await,
            get_account(&mut c, RECIPIENT).await,
            get_account(&mut c, Pubkey::new_from_array([22; 32])).await,
            get_account(&mut c, Pubkey::new_from_array([21; 32])).await,
        ));
    }
}

#[tokio::test]
async fn terminal_finalize_replay_is_a_real_unchanged_transaction() {
    let (mut c, _creator, _other, ritual, event) = one_event_fixture(0, 7411).await;
    resolve_window(&mut c, ritual, event).await;
    let destinations = [Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])];
    submit(&mut c, vec![finalize_event_ix(ritual, 0, &destinations)], &[]).await.unwrap();
    let before = (
        get_account(&mut c, ritual).await,
        get_account(&mut c, event).await,
        get_account(&mut c, vault_pda(b"stake-vault", &ritual)).await,
        get_account(&mut c, vault_pda(b"fee-vault", &ritual)).await,
        get_account(&mut c, RECIPIENT).await,
        get_account(&mut c, destinations[0]).await,
        get_account(&mut c, destinations[1]).await,
    );
    assert_error(submit(&mut c, vec![finalize_event_ix(ritual, 0, &destinations)], &[]).await, 6020);
    assert_eq!(before, (
        get_account(&mut c, ritual).await,
        get_account(&mut c, event).await,
        get_account(&mut c, vault_pda(b"stake-vault", &ritual)).await,
        get_account(&mut c, vault_pda(b"fee-vault", &ritual)).await,
        get_account(&mut c, RECIPIENT).await,
        get_account(&mut c, destinations[0]).await,
        get_account(&mut c, destinations[1]).await,
    ));
}

#[tokio::test]
async fn two_event_programtest_lifecycle_reaches_completed() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut c = setup_host(&creator, &other, 7410, 300, 300).await;
    let ritual = ritual_pda(&creator.pubkey(), 7410);
    let now = c.banks_client.get_sysvar::<solana_sdk::clock::Clock>().await.unwrap().unix_timestamp;
    replace_ritual(&mut c, ritual, |r| {
        r.member_total_stake = 200;
        r.per_event_allocation = 100;
        r.schedule = vec![
            EventWindow { opens: now + 100, deadline: now + 200, resolution: now + 300 },
            EventWindow { opens: now + 400, deadline: now + 500, resolution: now + 600 },
        ];
    }).await;
    submit(&mut c, vec![
        fund_ix(creator.pubkey(), 7410, creator.pubkey(), Pubkey::new_from_array([21; 32])),
        fund_ix(creator.pubkey(), 7410, other.pubkey(), Pubkey::new_from_array([22; 32])),
        activate_ix_default(creator.pubkey(), 7410),
    ], &[&creator, &other]).await.unwrap();
    let now = c.banks_client.get_sysvar::<solana_sdk::clock::Clock>().await.unwrap().unix_timestamp;
    let first = EventWindow { opens: now - 200, deadline: now - 100, resolution: now - 1 };
    let second = EventWindow { opens: now + 100, deadline: now + 200, resolution: now + 300 };
    replace_ritual(&mut c, ritual, |r| r.schedule = vec![first.clone(), second.clone()]).await;
    submit(&mut c, vec![initialize_event_ix(ritual, creator.pubkey(), 0)], &[&creator]).await.unwrap();
    let event0 = event_pda(&ritual, 0);
    submit(&mut c, vec![finalize_event_ix(ritual, 0, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await.unwrap();
    let r = deserialize(&get_account(&mut c, ritual).await.data);
    assert_eq!((r.status, r.current_event_index, r.settled_event_count, r.funded_stake_total), (RitualStatus::Active, 1, 1, 200));
    let e0 = deserialize_event(&get_account(&mut c, event0).await.data);
    assert_eq!(e0.status, EventStatus::Voided);
    submit(&mut c, vec![initialize_event_ix(ritual, creator.pubkey(), 1)], &[&creator]).await.unwrap();
    let event1 = event_pda(&ritual, 1);
    let now = c.banks_client.get_sysvar::<solana_sdk::clock::Clock>().await.unwrap().unix_timestamp;
    let second_closed = EventWindow { opens: now - 200, deadline: now - 100, resolution: now - 1 };
    let old_first = EventWindow { opens: now - 500, deadline: now - 400, resolution: now - 300 };
    replace_ritual(&mut c, ritual, |r| r.schedule = vec![old_first, second_closed.clone()]).await;
    replace_event(&mut c, event1, |e| e.window = second_closed).await;
    submit(&mut c, vec![finalize_event_ix(ritual, 1, &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])])], &[]).await.unwrap();
    let r = deserialize(&get_account(&mut c, ritual).await.data);
    assert_eq!((r.status, r.current_event_index, r.settled_event_count, r.funded_stake_total), (RitualStatus::Completed, 2, 2, 0));
    assert!(r.completed_at >= r.activated_at);
}

#[tokio::test]
async fn finalize_api_has_no_caller_claim_or_fee_accounts() {
    let _ = finalize_event_ix(Pubkey::new_unique(), 0, &[]);
}

#[test]
fn settlement_plan_mixed_remainder_goes_to_lowest_confirmed_index() {
    let plan = rituals::derive_event_settlement_plan(3, 101, 5, 5, 0).unwrap();
    assert_eq!(plan.payouts[..3], [152, 0, 151]);
}
