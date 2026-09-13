mod support;
use solana_sdk::clock::Clock;
use support::*;

async fn active_context(
    creator: &Keypair,
    other: &Keypair,
    nonce: u64,
    threshold: u8,
) -> ProgramTestContext {
    let mut context = start_with_members(creator, other, 250, 250).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), nonce, FeePayerMode::Host),
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
        r.additional_confirmation_threshold = threshold;
        r.schedule[0] = EventWindow {
            opens: now + 100,
            deadline: now + 101,
            resolution: now + 102,
        };
    })
    .await;
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), nonce)],
        &[],
    )
    .await
    .unwrap();
    let now = context
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0] = EventWindow {
            opens: now - 1,
            deadline: now + 100,
            resolution: now + 101,
        };
    })
    .await;
    context
}

#[tokio::test]
async fn current_event_and_pending_claim_are_bound_to_snapshot_and_member_index() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1300;
    let mut context = active_context(&creator, &other, nonce, 1).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let event = event_pda(&ritual, 0);
    submit(
        &mut context,
        vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
        &[&creator],
    )
    .await
    .unwrap();
    let event_account = get_account(&mut context, event).await;
    let event_state = deserialize_event(&event_account.data);
    assert_eq!(event_account.owner, PROGRAM_ID);
    assert_eq!(event_account.data.len(), 8 + RitualEvent::INIT_SPACE);
    assert_eq!(event_state.ritual, ritual);
    assert_eq!(event_state.event_index, 0);
    assert_eq!(event_state.member_count, 2);
    assert_eq!(event_state.status, EventStatus::Claiming);
    let ritual_before = get_account(&mut context, ritual).await;
    let claim = claim_pda(&event, &other.pubkey(), 0);
    submit(
        &mut context,
        vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
        &[&other],
    )
    .await
    .unwrap();
    let claim_state = deserialize_claim(&get_account(&mut context, claim).await.data);
    assert_eq!(claim_state.ritual, ritual);
    assert_eq!(claim_state.event, event);
    assert_eq!(claim_state.claimant, other.pubkey());
    assert_eq!(claim_state.member_index, 0);
    assert_eq!(claim_state.claim_version, 0);
    assert_eq!(claim_state.status, ClaimStatus::Pending);
    assert_eq!(claim_state.required_additional_confirmations, 1);
    assert_eq!(claim_state.approvals_bitmap, 0);
    assert_eq!(claim_state.approval_count, 0);
    let after_event = deserialize_event(&get_account(&mut context, event).await.data);
    assert_eq!(after_event.claimed_members_bitmap, 1);
    assert_eq!(after_event.confirmed_members_bitmap, 0);
    assert_eq!(
        get_account(&mut context, ritual).await.data,
        ritual_before.data
    );
}

#[tokio::test]
async fn honor_claim_is_immediately_confirmed() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1301;
    let mut context = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let event = event_pda(&ritual, 0);
    submit(
        &mut context,
        vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
        &[&creator],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![claim_completion_ix(ritual, creator.pubkey(), 0, 0)],
        &[&creator],
    )
    .await
    .unwrap();
    let claim = deserialize_claim(
        &get_account(&mut context, claim_pda(&event, &creator.pubkey(), 0))
            .await
            .data,
    );
    assert_eq!(claim.status, ClaimStatus::Confirmed);
    let event = deserialize_event(&get_account(&mut context, event).await.data);
    assert_eq!(event.claimed_members_bitmap, 2);
    assert_eq!(event.confirmed_members_bitmap, 2);
}

#[tokio::test]
async fn duplicate_claim_replay_is_rejected_without_mutating_event() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1302;
    let mut context = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let event = event_pda(&ritual, 0);
    submit(
        &mut context,
        vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
        &[&creator],
    )
    .await
    .unwrap();
    let ix = claim_completion_ix(ritual, other.pubkey(), 0, 0);
    submit(&mut context, vec![ix.clone()], &[&other])
        .await
        .unwrap();
    let before = get_account(&mut context, event).await;
    assert!(submit(&mut context, vec![ix], &[&other]).await.is_err());
    assert_eq!(get_account(&mut context, event).await.data, before.data);
}
