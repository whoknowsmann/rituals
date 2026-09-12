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
