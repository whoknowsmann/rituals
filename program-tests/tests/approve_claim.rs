mod support;
use support::*;

async fn ready(creator: &Keypair, friend: &Keypair, nonce: u64, threshold: u8) -> ProgramTestContext {
    let mut c = start_with_members(creator, friend, 250, 250).await;
    submit(&mut c, vec![
        initialize_ix(creator.pubkey()),
        create_ix(creator.pubkey(), friend.pubkey(), nonce, FeePayerMode::Host),
    ], &[creator]).await.unwrap();
    submit(&mut c, vec![fund_ix(creator.pubkey(), nonce, friend.pubkey(), Pubkey::new_from_array([22; 32]))], &[friend]).await.unwrap();
    submit(&mut c, vec![fund_ix(creator.pubkey(), nonce, creator.pubkey(), Pubkey::new_from_array([21; 32]))], &[creator]).await.unwrap();
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = c
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut c, ritual, |r| {
        r.additional_confirmation_threshold = threshold;
        r.schedule[0] = EventWindow {
            opens: now + 100,
            deadline: now + 200,
            resolution: now + 300,
        };
    })
    .await;
    submit(&mut c, vec![activate_ix_default(creator.pubkey(), nonce)], &[])
        .await
        .unwrap();
    let now = c
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut c, ritual, |r| {
        r.schedule[0] = EventWindow {
            opens: now - 1,
            deadline: now + 100,
            resolution: now + 200,
        };
    })
    .await;
    submit(&mut c, vec![initialize_event_ix(ritual, creator.pubkey(), 0)], &[creator]).await.unwrap();
    c
}

#[tokio::test]
async fn one_friend_approval_confirms_exactly_at_threshold() {
    let creator = Keypair::new();
    let friend = Keypair::new();
    let nonce = 2301;
    let mut c = ready(&creator, &friend, nonce, 1).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let event = event_pda(&ritual, 0);
    submit(&mut c, vec![claim_completion_ix(ritual, creator.pubkey(), 0, 0)], &[&creator]).await.unwrap();
    submit(&mut c, vec![approve_claim_ix(ritual, creator.pubkey(), friend.pubkey(), 0)], &[&friend]).await.unwrap();
    let claim = deserialize_claim(&get_account(&mut c, claim_pda(&event, &creator.pubkey(), 0)).await.data);
    let event_state = deserialize_event(&get_account(&mut c, event).await.data);
    assert_eq!(claim.status, ClaimStatus::Confirmed);
    assert_eq!(claim.approval_count, 1);
    assert_eq!(claim.approvals_bitmap, 1);
    assert_eq!(event_state.confirmed_members_bitmap, 2);
}

#[tokio::test]
async fn question_preserves_approvals_and_enters_resolving() {
    let creator = Keypair::new();
    let friend = Keypair::new();
    let nonce = 2302;
    let mut c = ready(&creator, &friend, nonce, 1).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let event = event_pda(&ritual, 0);
    submit(&mut c, vec![claim_completion_ix(ritual, creator.pubkey(), 0, 0)], &[&creator]).await.unwrap();
    submit(&mut c, vec![question_claim_ix(ritual, creator.pubkey(), friend.pubkey(), 0)], &[&friend]).await.unwrap();
    let claim = deserialize_claim(&get_account(&mut c, claim_pda(&event, &creator.pubkey(), 0)).await.data);
    let event_state = deserialize_event(&get_account(&mut c, event).await.data);
    assert_eq!(claim.status, ClaimStatus::Questioned);
    assert_eq!(claim.approvals_bitmap, 0);
    assert_eq!(claim.approval_count, 0);
    assert_eq!(event_state.questioned_members_bitmap, 2);
    assert_eq!(event_state.status, EventStatus::Resolving);
}
