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
    }).await;
    let result = submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(), nonce, other.pubkey(),
            &[Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])],
        )],
        &[&other],
    ).await;
    assert_error(result, 6035);
}


#[tokio::test]
async fn noncreator_before_first_window_is_rejected_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 9010, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), 9010);
    replace_ritual(&mut context, ritual, |state| {
        state.schedule[0] = EventWindow { opens: i64::MAX - 2, deadline: i64::MAX - 1, resolution: i64::MAX };
    }).await;
    let destinations = [Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])];
    let before = CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    assert_error(submit(&mut context, vec![cancel_ix(creator.pubkey(), 9010, other.pubkey(), &destinations)], &[&other]).await, 6032);
    assert_eq!(CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await, before);
}

#[tokio::test]
async fn cancellation_after_first_window_allows_arbitrary_signer() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 9011, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), 9011);
    replace_ritual(&mut context, ritual, |state| {
        state.schedule[0] = EventWindow { opens: 0, deadline: 1, resolution: 2 };
    }).await;
    let destinations = [Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])];
    submit(&mut context, vec![cancel_ix(creator.pubkey(), 9011, other.pubkey(), &destinations)], &[&other]).await.unwrap();
    assert_eq!(deserialize(&get_account(&mut context, ritual).await.data).status, RitualStatus::Cancelled);
}

#[tokio::test]
async fn cancellation_lifecycle_fields_are_each_rejected_atomically() {
    for (case, mutate) in [
        ("activated", 0u8), ("cancelled", 1), ("event", 2), ("settled", 3),
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
        }).await;
        let destinations = [Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])];
        let before = CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
        assert_error(submit(&mut context, vec![cancel_ix(creator.pubkey(), nonce, creator.pubkey(), &destinations)], &[&creator]).await, 6035);
        assert_eq!(CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await, before, "{case}");
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
    let destinations = [Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])];
    let before = CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    assert_error(submit(&mut context, vec![cancel_ix(creator.pubkey(), nonce, creator.pubkey(), &destinations)], &[&creator]).await, 6035);
    assert_eq!(CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await, before);
}

#[tokio::test]
async fn refund_destination_count_is_exact_and_atomic() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9017;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    for destinations in [vec![Pubkey::new_from_array([22; 32])], vec![Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32]), OUTSIDER]] {
        let before = CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations[..destinations.len().min(2)]).await;
        assert_error(submit(&mut context, vec![cancel_ix(creator.pubkey(), nonce, creator.pubkey(), &destinations)], &[&creator]).await, 6033);
        assert_eq!(CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations[..destinations.len().min(2)]).await, before);
    }
}

#[tokio::test]
async fn duplicate_refund_destinations_are_rejected_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9018;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let destinations = [Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([22; 32])];
    let before = CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &[destinations[0]]).await;
    assert_error(submit(&mut context, vec![cancel_ix(creator.pubkey(), nonce, creator.pubkey(), &destinations)], &[&creator]).await, 6034);
    assert_eq!(CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &[destinations[0]]).await, before);
}

#[tokio::test]
async fn cancellation_preserves_untracked_stake_and_fee_dust() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9019;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    submit(&mut context, vec![fund_ix(creator.pubkey(), nonce, other.pubkey(), Pubkey::new_from_array([22; 32]))], &[&other]).await.unwrap();
    replace_token_amount(&mut context, vault_pda(b"stake-vault", &ritual), 103).await;
    replace_token_amount(&mut context, vault_pda(b"fee-vault", &ritual), 7).await;
    let destinations = [Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])];
    submit(&mut context, vec![cancel_ix(creator.pubkey(), nonce, creator.pubkey(), &destinations)], &[&creator]).await.unwrap();
    assert_eq!(amount(&mut context, vault_pda(b"stake-vault", &ritual)).await, 3);
    assert_eq!(amount(&mut context, vault_pda(b"fee-vault", &ritual)).await, 7);
}

#[tokio::test]
async fn cancellation_replay_is_rejected_without_mutation() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9020;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let destinations = [Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])];
    submit(&mut context, vec![cancel_ix(creator.pubkey(), nonce, creator.pubkey(), &destinations)], &[&creator]).await.unwrap();
    let before = CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    assert_error(submit(&mut context, vec![cancel_ix(creator.pubkey(), nonce, creator.pubkey(), &destinations)], &[&creator]).await, 6020);
    assert_eq!(CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await, before);
}

#[tokio::test]
async fn active_ritual_rejects_cancellation_without_mutation() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9021;
    let mut context = setup_host(&creator, &other, nonce, 200, 200).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    replace_ritual(&mut context, ritual, |state| { state.status = RitualStatus::Active; }).await;
    let destinations = [Pubkey::new_from_array([22; 32]), Pubkey::new_from_array([21; 32])];
    let before = CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await;
    assert_error(submit(&mut context, vec![cancel_ix(creator.pubkey(), nonce, creator.pubkey(), &destinations)], &[&creator]).await, 6020);
    assert_eq!(CancellationSnapshot::capture(&mut context, ritual, RECIPIENT, &destinations).await, before);
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
