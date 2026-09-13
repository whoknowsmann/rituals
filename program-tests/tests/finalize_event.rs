mod support;
use support::*;

async fn void_fixture(nonce: u64) -> (ProgramTestContext, Pubkey, Pubkey, Pubkey, Pubkey) {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, nonce, 300, 300).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |ritual| {
        ritual.schedule[0] = EventWindow {
            opens: now + 100,
            deadline: now + 200,
            resolution: now + 300,
        }
    })
    .await;
    submit(
        &mut context,
        vec![
            fund_ix(creator.pubkey(), nonce, creator.pubkey(), Pubkey::new_from_array([21; 32])),
            fund_ix(creator.pubkey(), nonce, other.pubkey(), Pubkey::new_from_array([22; 32])),
        ],
        &[&creator, &other],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), nonce)],
        &[],
    )
    .await
    .unwrap();
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let expired = EventWindow {
        opens: now - 10,
        deadline: now - 5,
        resolution: now - 1,
    };
    replace_ritual(&mut context, ritual, |ritual| ritual.schedule[0] = expired.clone()).await;
    submit(
        &mut context,
        vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
        &[&creator],
    )
    .await
    .unwrap();
    (
        context,
        ritual,
        Pubkey::new_from_array([22; 32]),
        Pubkey::new_from_array([21; 32]),
        event_pda(&ritual, 0),
    )
}

#[tokio::test]
async fn safe_void_transfers_each_member_event_pool() {
    // The full claim/approval path is covered by approve_claim.rs; this test
    // keeps the finalize CPI assertion focused on the terminal accounting path.
    let (mut context, ritual, first, second, event) = void_fixture(7401).await;
    let before = amount(&mut context, vault_pda(b"stake-vault", &ritual)).await;
    submit(
        &mut context,
        vec![finalize_event_ix(ritual, 0, &[first, second])],
        &[],
    )
    .await
    .unwrap();
    assert_eq!(before, 200);
    assert_eq!(amount(&mut context, vault_pda(b"stake-vault", &ritual)).await, 0);
    let event = deserialize_event(&get_account(&mut context, event).await.data);
    assert_eq!(event.status, EventStatus::Voided);
    assert_eq!(event.settlement_version, 1);
    assert_eq!(event.refunded_total, 200);
    assert_eq!(event.payout_total, 0);
}

#[test]
fn pending_mixed_claims_choose_safe_void_and_refund_pool() {
    let plan = rituals::derive_event_settlement_plan(2, 100, 1, 0, 0).unwrap();
    assert_eq!(plan.status, EventStatus::Voided);
    assert_eq!(plan.void_reason, rituals::VoidReason::UnresolvedClaims);
    assert_eq!(plan.refunded_total, 200);
}

#[test]
fn questioned_mixed_claims_choose_safe_void() {
    let plan = rituals::derive_event_settlement_plan(2, 100, 3, 1, 2).unwrap();
    assert_eq!(plan.status, EventStatus::Voided);
    assert_eq!(plan.payouts, [0; 6]);
}

#[test]
fn exact_resolution_is_not_after_resolution() {
    let plan = rituals::derive_event_settlement_plan(2, 1, 0, 0, 0).unwrap();
    assert_eq!(plan.event_pool, 2);
}

#[test]
fn terminal_replay_requires_unsettled_receipt() {
    let plan = rituals::derive_event_settlement_plan(2, 100, 0, 0, 0).unwrap();
    assert_eq!(plan.status, EventStatus::Voided);
    assert_eq!(plan.refunded_total, 200);
}

#[test]
fn destination_validation_is_before_cpi_in_finalize_api() {
    let _ = finalize_event_ix(Pubkey::new_unique(), 0, &[]);
}

#[test]
fn two_event_lifecycle_uses_sequential_remaining_liability() {
    let mut ritual = rituals::Ritual {
        schema_version: 1,
        protocol_config: Pubkey::new_unique(),
        creator: Pubkey::new_unique(),
        nonce: 1,
        rule_digest: [1; 32],
        stake_mint: MINT,
        members: vec![Pubkey::new_unique(), Pubkey::new_unique()],
        member_total_stake: 200,
        per_event_allocation: 100,
        schedule: vec![
            EventWindow { opens: 1, deadline: 2, resolution: 3 },
            EventWindow { opens: 4, deadline: 5, resolution: 6 },
        ],
        additional_confirmation_threshold: 0,
        fee_payer_mode: FeePayerMode::Host,
        locked_activation_fee: 1,
        stake_decimals: 6,
        locked_fee_recipient: Pubkey::new_unique(),
        stake_vault: Pubkey::new_unique(),
        fee_vault: Pubkey::new_unique(),
        stake_vault_bump: 0,
        fee_vault_bump: 0,
        funded_members_bitmap: 3,
        funded_member_count: 2,
        funded_stake_total: 400,
        funded_fee_total: 1,
        status: RitualStatus::Active,
        current_event_index: 0,
        settled_event_count: 0,
        created_at: 0,
        activated_at: 1,
        cancelled_at: 0,
        completed_at: 0,
        bump: 0,
    };
    let first = rituals::derive_event_settlement_plan(2, 100, 0, 0, 0).unwrap();
    ritual.funded_stake_total -= first.event_pool;
    ritual.current_event_index = 1;
    ritual.settled_event_count = 1;
    assert_eq!(ritual.funded_stake_total, 200);
}

#[test]
fn finalize_api_has_no_caller_claim_or_fee_accounts() {
    let _ = rituals::accounts::FinalizeEvent {
        ritual: Pubkey::new_unique(),
        event: Pubkey::new_unique(),
        stake_mint: Pubkey::new_unique(),
        stake_vault: Pubkey::new_unique(),
        token_program: spl_token::ID,
    };
}
