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
    replace_ritual(&mut context, ritual, |r: &mut rituals::Ritual| {
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
    replace_ritual(&mut context, ritual, |r: &mut rituals::Ritual| {
        r.schedule[0] = EventWindow {
            opens: now - 1,
            deadline: now + 100,
            resolution: now + 101,
        }
    })
    .await;
    context
}

async fn init_event(context: &mut ProgramTestContext, creator: &Keypair, nonce: u64) {
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    submit(
        context,
        vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
        &[creator],
    )
    .await
    .unwrap();
}

fn claim_ix_with_signer(
    ritual: Pubkey,
    claimant: Pubkey,
    event_index: u8,
    version: u8,
    signer: bool,
) -> Instruction {
    let mut ix = claim_completion_ix(ritual, claimant, event_index, version);
    ix.accounts[3].is_signer = signer;
    ix
}

fn init_ix_with_signer(ritual: Pubkey, payer: Pubkey, index: u8, signer: bool) -> Instruction {
    let mut ix = initialize_event_ix(ritual, payer, index);
    ix.accounts[2].is_signer = signer;
    ix
}

async fn assert_absent(context: &mut ProgramTestContext, address: Pubkey) {
    assert!(
        context
            .banks_client
            .get_account(address)
            .await
            .unwrap()
            .is_none(),
        "account unexpectedly exists: {address}"
    );
}

#[tokio::test]
async fn initialize_event_status_window_table_fresh_fixtures() {
    for (name, offset, expected) in [
        ("before", 10, EventStatus::Scheduled),
        ("open", 0, EventStatus::Claiming),
        ("middle", 1, EventStatus::Claiming),
        ("deadline", 2, EventStatus::Claiming),
        ("after", 3, EventStatus::Resolving),
    ] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 1400 + offset as u64;
        let mut c = active_context(&creator, &other, nonce, 0).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        let now = c
            .banks_client
            .get_sysvar::<Clock>()
            .await
            .unwrap()
            .unix_timestamp;
        let window = match name {
            "before" => EventWindow {
                opens: now + 10,
                deadline: now + 20,
                resolution: now + 30,
            },
            "after" => EventWindow {
                opens: now - 20,
                deadline: now - 10,
                resolution: now + 10,
            },
            _ => EventWindow {
                opens: now - 1,
                deadline: now + 10,
                resolution: now + 20,
            },
        };
        replace_ritual(&mut c, ritual, move |r: &mut rituals::Ritual| {
            r.schedule[0] = window
        })
        .await;
        let before = ClaimFlowSnapshot::capture(
            &mut c,
            ritual,
            event_pda(&ritual, 0),
            claim_pda(&event_pda(&ritual, 0), &creator.pubkey(), 0),
            RECIPIENT,
        )
        .await;
        let result = submit(
            &mut c,
            vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
            &[&creator],
        )
        .await;
        assert!(result.is_ok(), "{name} initialization failed: {result:?}");
        let event = get_account(&mut c, event_pda(&ritual, 0)).await;
        let state = deserialize_event(&event.data);
        assert_eq!(event.owner, PROGRAM_ID);
        assert_eq!(event.data.len(), 8 + RitualEvent::INIT_SPACE);
        assert_eq!(state.ritual, ritual);
        assert_eq!(state.event_index, 0);
        assert_eq!(state.member_count, 2);
        assert_eq!(state.status, expected);
        assert_eq!(state.window, deserialize(&before.ritual.data).schedule[0]);
        assert_eq!(state.claimed_members_bitmap, 0);
        assert_eq!(state.confirmed_members_bitmap, 0);
        assert_eq!(state.questioned_members_bitmap, 0);
        assert_eq!(state.resolved_at, 0);
        assert_ne!(state.bump, 0);
        assert!(state.initialized_at != 0);
        let after = ClaimFlowSnapshot::capture(
            &mut c,
            ritual,
            event_pda(&ritual, 0),
            claim_pda(&event_pda(&ritual, 0), &creator.pubkey(), 0),
            RECIPIENT,
        )
        .await;
        assert_eq!(before.ritual, after.ritual);
        assert_eq!(before.stake_vault, after.stake_vault);
        assert_eq!(before.fee_vault, after.fee_vault);
        assert_eq!(before.recipient, after.recipient);
    }
}

#[tokio::test]
async fn initialize_event_rejects_funding_cancelled_wrong_index_and_out_of_range() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let ritual = ritual_pda(&creator.pubkey(), 1406);
    let mut funding = setup_host(&creator, &other, 1406, 250, 250).await;
    assert_error(
        submit(
            &mut funding,
            vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
            &[&creator],
        )
        .await,
        6020,
    );
    assert_absent(&mut funding, event_pda(&ritual, 0)).await;
    let mut active = active_context(&creator, &other, 1407, 0).await;
    let ritual2 = ritual_pda(&creator.pubkey(), 1407);
    for index in [1, 99] {
        assert_error(
            submit(
                &mut active,
                vec![initialize_event_ix(ritual2, creator.pubkey(), index)],
                &[&creator],
            )
            .await,
            6038,
        );
        assert_absent(&mut active, event_pda(&ritual2, index)).await;
    }
    replace_ritual(&mut active, ritual2, |r: &mut rituals::Ritual| {
        r.status = RitualStatus::Cancelled
    })
    .await;
    assert_error(
        submit(
            &mut active,
            vec![initialize_event_ix(ritual2, creator.pubkey(), 0)],
            &[&creator],
        )
        .await,
        6020,
    );
}

#[tokio::test]
async fn initialize_event_requires_signed_payer_and_duplicate_is_account_in_use() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1408;
    let mut c = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    assert_error(
        submit(
            &mut c,
            vec![init_ix_with_signer(ritual, creator.pubkey(), 0, false)],
            &[],
        )
        .await,
        3010,
    );
    init_event(&mut c, &creator, nonce).await;
    assert!(submit(
        &mut c,
        vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
        &[&creator]
    )
    .await
    .is_err());
}

#[tokio::test]
async fn initialize_event_pda_and_cross_ritual_substitution_are_rejected() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut c = active_context(&creator, &other, 1409, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), 1409);
    let mut ix = initialize_event_ix(ritual, creator.pubkey(), 0);
    ix.accounts[1].pubkey = event_pda(&ritual, 1);
    assert!(submit(&mut c, vec![ix], &[&creator]).await.is_err());
    let mut d = active_context(&creator, &other, 1410, 0).await;
    let other_ritual = ritual_pda(&creator.pubkey(), 1410);
    let mut cross = initialize_event_ix(ritual, creator.pubkey(), 0);
    cross.accounts[0].pubkey = other_ritual;
    assert!(submit(&mut d, vec![cross], &[&creator]).await.is_err());
}

#[tokio::test]
async fn pending_claim_full_readback_and_ritual_vault_recipient_are_unchanged() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1411;
    let mut c = active_context(&creator, &other, nonce, 1).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    init_event(&mut c, &creator, nonce).await;
    let event = event_pda(&ritual, 0);
    let claim = claim_pda(&event, &other.pubkey(), 0);
    let before = ClaimFlowSnapshot::capture(&mut c, ritual, event, claim, RECIPIENT).await;
    submit(
        &mut c,
        vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
        &[&other],
    )
    .await
    .unwrap();
    let ca = get_account(&mut c, claim).await;
    let state = deserialize_claim(&ca.data);
    assert_eq!(ca.owner, PROGRAM_ID);
    assert_eq!(ca.data.len(), 8 + CompletionClaim::INIT_SPACE);
    assert_eq!(state.schema_version, 1);
    assert_eq!(state.ritual, ritual);
    assert_eq!(state.event, event);
    assert_eq!(state.claimant, other.pubkey());
    assert_eq!(state.member_index, 0);
    assert_eq!(state.claim_version, 0);
    assert_eq!(state.status, ClaimStatus::Pending);
    assert_eq!(state.required_additional_confirmations, 1);
    assert_eq!(state.approvals_bitmap, 0);
    assert_eq!(state.approval_count, 0);
    assert_ne!(state.claimed_at, 0);
    assert_ne!(state.bump, 0);
    let ev = deserialize_event(&get_account(&mut c, event).await.data);
    assert_eq!(ev.claimed_members_bitmap, 1);
    assert_eq!(ev.confirmed_members_bitmap, 0);
    let after = ClaimFlowSnapshot::capture(&mut c, ritual, event, claim, RECIPIENT).await;
    assert_eq!(before.ritual, after.ritual);
    assert_eq!(before.stake_vault, after.stake_vault);
    assert_eq!(before.fee_vault, after.fee_vault);
    assert_eq!(before.recipient, after.recipient);
}

#[tokio::test]
async fn honor_claim_is_immediately_confirmed_and_sets_both_bitmaps() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1412;
    let mut c = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    init_event(&mut c, &creator, nonce).await;
    let event = event_pda(&ritual, 0);
    submit(
        &mut c,
        vec![claim_completion_ix(ritual, creator.pubkey(), 0, 0)],
        &[&creator],
    )
    .await
    .unwrap();
    let claim = deserialize_claim(
        &get_account(&mut c, claim_pda(&event, &creator.pubkey(), 0))
            .await
            .data,
    );
    assert_eq!(claim.status, ClaimStatus::Confirmed);
    let ev = deserialize_event(&get_account(&mut c, event).await.data);
    assert_eq!(ev.claimed_members_bitmap, 2);
    assert_eq!(ev.confirmed_members_bitmap, 2);
}

#[tokio::test]
async fn member_index_table_covers_both_members_and_claimant_derivation() {
    for (member, expected) in [(0usize, 1u8), (1usize, 2u8)] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 1413 + member as u64;
        let mut c = active_context(&creator, &other, nonce, 0).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        init_event(&mut c, &creator, nonce).await;
        let claimant = if member == 0 {
            other.pubkey()
        } else {
            creator.pubkey()
        };
        submit(
            &mut c,
            vec![claim_completion_ix(ritual, claimant, 0, 0)],
            &[if member == 0 { &other } else { &creator }],
        )
        .await
        .unwrap();
        let event = event_pda(&ritual, 0);
        let state = deserialize_claim(
            &get_account(&mut c, claim_pda(&event, &claimant, 0))
                .await
                .data,
        );
        assert_eq!(state.member_index, member as u8);
        assert_eq!(
            deserialize_event(&get_account(&mut c, event).await.data).claimed_members_bitmap,
            expected
        );
    }
}

#[tokio::test]
async fn nonmember_nonfunded_and_unsigned_claims_are_atomic() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1415;
    let mut c = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    init_event(&mut c, &creator, nonce).await;
    let event = event_pda(&ritual, 0);
    replace_ritual(&mut c, ritual, |r: &mut rituals::Ritual| {
        r.members = vec![other.pubkey(), OUTSIDER]
    })
    .await;
    let before = ClaimFlowSnapshot::capture(
        &mut c,
        ritual,
        event,
        claim_pda(&event, &creator.pubkey(), 0),
        RECIPIENT,
    )
    .await;
    assert!(submit(
        &mut c,
        vec![claim_completion_ix(ritual, creator.pubkey(), 0, 0)],
        &[&creator]
    )
    .await
    .is_err());
    assert_absent(&mut c, claim_pda(&event, &creator.pubkey(), 0)).await;
    replace_ritual(&mut c, ritual, |r: &mut rituals::Ritual| {
        r.funded_members_bitmap = 2
    })
    .await;
    assert!(submit(
        &mut c,
        vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
        &[&other]
    )
    .await
    .is_err());
    assert_absent(&mut c, claim_pda(&event, &other.pubkey(), 0)).await;
    let after = ClaimFlowSnapshot::capture(
        &mut c,
        ritual,
        event,
        claim_pda(&event, &creator.pubkey(), 0),
        RECIPIENT,
    )
    .await;
    assert_eq!(before.event, after.event);
    assert_eq!(before.stake_vault, after.stake_vault);
    assert_eq!(before.fee_vault, after.fee_vault);
    assert_eq!(before.recipient, after.recipient);
}

#[tokio::test]
async fn claim_window_table_and_resolving_event_rejection() {
    for (label, past) in [
        ("before", false),
        ("open", true),
        ("middle", true),
        ("deadline", true),
        ("after", false),
    ] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 1416 + label.len() as u64;
        let mut c = active_context(&creator, &other, nonce, 0).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        if !past {
            let now = c
                .banks_client
                .get_sysvar::<Clock>()
                .await
                .unwrap()
                .unix_timestamp;
            replace_ritual(&mut c, ritual, |r: &mut rituals::Ritual| {
                r.schedule[0] = EventWindow {
                    opens: now - 20,
                    deadline: now - 10,
                    resolution: now + 10,
                }
            })
            .await;
        }
        init_event(&mut c, &creator, nonce).await;
        let result = submit(
            &mut c,
            vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
            &[&other],
        )
        .await;
        assert_eq!(result.is_ok(), past, "{label}");
    }
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1420;
    let mut c = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = c
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut c, ritual, |r: &mut rituals::Ritual| {
        r.schedule[0] = EventWindow {
            opens: now - 10,
            deadline: now - 5,
            resolution: now + 10,
        }
    })
    .await;
    init_event(&mut c, &creator, nonce).await;
    assert_error(
        submit(
            &mut c,
            vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
            &[&other],
        )
        .await,
        6039,
    );
}

#[tokio::test]
async fn claim_version_binding_rejects_v1_and_accepts_exact_v0_pda() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1421;
    let mut c = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    init_event(&mut c, &creator, nonce).await;
    let event = event_pda(&ritual, 0);
    assert_error(
        submit(
            &mut c,
            vec![claim_completion_ix(ritual, other.pubkey(), 0, 1)],
            &[&other],
        )
        .await,
        6044,
    );
    assert_absent(&mut c, claim_pda(&event, &other.pubkey(), 1)).await;
    submit(
        &mut c,
        vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
        &[&other],
    )
    .await
    .unwrap();
    assert_eq!(
        claim_pda(&event, &other.pubkey(), 0),
        Pubkey::find_program_address(
            &[b"claim", event.as_ref(), other.pubkey().as_ref(), &[0]],
            &PROGRAM_ID
        )
        .0
    );
    assert!(submit(
        &mut c,
        vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
        &[&other]
    )
    .await
    .is_err());
}

#[tokio::test]
async fn same_claimant_cross_event_isolation_and_account_constraints() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1422;
    let mut c = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    init_event(&mut c, &creator, nonce).await;
    let event = event_pda(&ritual, 0);
    let before = get_account(&mut c, event).await;
    let mut ix = claim_completion_ix(ritual, other.pubkey(), 0, 0);
    ix.accounts[1].pubkey = event_pda(&ritual, 1);
    assert!(submit(&mut c, vec![ix], &[&other]).await.is_err());
    assert_eq!(get_account(&mut c, event).await, before);
    let mut wrong = claim_completion_ix(ritual, other.pubkey(), 0, 0);
    wrong.accounts[2].pubkey = claim_pda(&event, &creator.pubkey(), 0);
    assert!(submit(&mut c, vec![wrong], &[&other]).await.is_err());
    assert_absent(&mut c, claim_pda(&event, &creator.pubkey(), 0)).await;
}

#[tokio::test]
async fn event_snapshot_corruption_table_rejects_every_field() {
    for name in [
        "schema", "ritual", "index", "members", "window", "status", "settled", "voided",
    ] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 1430 + name.len() as u64;
        let mut c = active_context(&creator, &other, nonce, 0).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        init_event(&mut c, &creator, nonce).await;
        let event = event_pda(&ritual, 0);
        replace_account_event(&mut c, event, |e| match name {
            "schema" => e.schema_version = 2,
            "ritual" => e.ritual = Pubkey::new_unique(),
            "index" => e.event_index = 1,
            "members" => e.member_count = 3,
            "window" => e.window.opens += 1,
            "status" => e.status = EventStatus::Resolving,
            "settled" => e.status = EventStatus::Settled,
            _ => e.status = EventStatus::Voided,
        })
        .await;
        assert_error(
            submit(
                &mut c,
                vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
                &[&other],
            )
            .await,
            6039,
        );
        assert_absent(&mut c, claim_pda(&event, &other.pubkey(), 0)).await;
    }
}

#[tokio::test]
async fn event_bitmap_corruption_table_rejects_out_of_range_overlap_and_preclaimed() {
    for name in [
        "claimed",
        "confirmed",
        "questioned",
        "confirmed_unclaimed",
        "questioned_unclaimed",
        "overlap",
        "preclaimed",
    ] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 1440 + name.len() as u64;
        let mut c = active_context(&creator, &other, nonce, 0).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        init_event(&mut c, &creator, nonce).await;
        let event = event_pda(&ritual, 0);
        replace_account_event(&mut c, event, |e| match name {
            "claimed" => e.claimed_members_bitmap = 4,
            "confirmed" => e.confirmed_members_bitmap = 4,
            "questioned" => e.questioned_members_bitmap = 4,
            "confirmed_unclaimed" => e.confirmed_members_bitmap = 1,
            "questioned_unclaimed" => e.questioned_members_bitmap = 1,
            "overlap" => {
                e.claimed_members_bitmap = 1;
                e.confirmed_members_bitmap = 1;
                e.questioned_members_bitmap = 1
            }
            _ => e.claimed_members_bitmap = 1,
        })
        .await;
        let err = submit(
            &mut c,
            vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
            &[&other],
        )
        .await;
        assert!(err.is_err(), "{name} unexpectedly succeeded");
        assert_absent(&mut c, claim_pda(&event, &other.pubkey(), 0)).await;
    }
}

async fn replace_account_event<F: FnOnce(&mut RitualEvent)>(
    c: &mut ProgramTestContext,
    address: Pubkey,
    f: F,
) {
    let original = get_account(c, address).await;
    let mut value = deserialize_event(&original.data);
    f(&mut value);
    let mut data = Vec::new();
    value.try_serialize(&mut data).unwrap();
    data.resize(original.data.len(), 0);
    replace_account(c, address, Account { data, ..original }).await;
}

#[tokio::test]
async fn active_ritual_corruption_table_is_rejected_before_claim_creation() {
    for name in [
        "status",
        "funding",
        "count",
        "mint",
        "digest",
        "threshold",
        "schedule",
        "cancelled",
        "activated",
    ] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 1450 + name.len() as u64;
        let mut c = active_context(&creator, &other, nonce, 0).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        init_event(&mut c, &creator, nonce).await;
        let event = event_pda(&ritual, 0);
        let before = get_account(&mut c, event).await;
        replace_ritual(&mut c, ritual, |r| match name {
            "status" => r.status = RitualStatus::Cancelled,
            "funding" => r.funded_members_bitmap = 0,
            "count" => r.funded_member_count = 1,
            "mint" => r.stake_mint = Pubkey::default(),
            "digest" => r.rule_digest = [0; 32],
            "threshold" => r.additional_confirmation_threshold = 9,
            "schedule" => r.schedule.clear(),
            "cancelled" => r.cancelled_at = 1,
            _ => r.activated_at = r.created_at - 1,
        })
        .await;
        assert!(submit(
            &mut c,
            vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
            &[&other]
        )
        .await
        .is_err());
        assert_eq!(get_account(&mut c, event).await, before);
        assert_absent(&mut c, claim_pda(&event, &other.pubkey(), 0)).await;
    }
}

#[test]
fn initialize_and_claim_account_structs_have_no_custody_accounts() {
    let init = rituals::accounts::InitializeCurrentEvent::to_account_metas;
    let claim = rituals::accounts::ClaimCompletion::to_account_metas;
    let _ = (init, claim);
}

#[tokio::test]
async fn failed_initialization_and_claim_do_not_mutate_ritual_or_tokens() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1460;
    let mut c = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let before = ClaimFlowSnapshot::capture(
        &mut c,
        ritual,
        event_pda(&ritual, 0),
        claim_pda(&event_pda(&ritual, 0), &other.pubkey(), 0),
        RECIPIENT,
    )
    .await;
    assert_error(
        submit(
            &mut c,
            vec![initialize_event_ix(ritual, creator.pubkey(), 1)],
            &[&creator],
        )
        .await,
        6038,
    );
    let after = ClaimFlowSnapshot::capture(
        &mut c,
        ritual,
        event_pda(&ritual, 0),
        claim_pda(&event_pda(&ritual, 0), &other.pubkey(), 0),
        RECIPIENT,
    )
    .await;
    assert_eq!(before, after);
}

#[tokio::test]
async fn prefunded_event_and_claim_pdas_remain_initializable() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 1461;
    let mut c = active_context(&creator, &other, nonce, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let event = event_pda(&ritual, 0);
    let prefund = Rent::default().minimum_balance(0) + 7;
    submit(
        &mut c,
        vec![solana_sdk::system_instruction::transfer(
            &creator.pubkey(),
            &event,
            prefund,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    let raw = get_account(&mut c, event).await;
    assert_eq!(raw.owner, system_program::ID);
    assert!(raw.data.is_empty());
    init_event(&mut c, &creator, nonce).await;
    let initialized = get_account(&mut c, event).await;
    assert_eq!(initialized.owner, PROGRAM_ID);
    assert_eq!(initialized.data.len(), 8 + RitualEvent::INIT_SPACE);
    assert_eq!(
        initialized.lamports,
        Rent::default().minimum_balance(initialized.data.len())
    );
    let claim = claim_pda(&event, &other.pubkey(), 0);
    submit(
        &mut c,
        vec![solana_sdk::system_instruction::transfer(
            &other.pubkey(),
            &claim,
            prefund,
        )],
        &[&other],
    )
    .await
    .unwrap();
    let raw = get_account(&mut c, claim).await;
    assert_eq!(raw.owner, system_program::ID);
    assert!(raw.data.is_empty());
    submit(
        &mut c,
        vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
        &[&other],
    )
    .await
    .unwrap();
    let initialized = get_account(&mut c, claim).await;
    assert_eq!(initialized.owner, PROGRAM_ID);
    assert_eq!(initialized.data.len(), 8 + CompletionClaim::INIT_SPACE);
    assert_eq!(
        initialized.lamports,
        Rent::default().minimum_balance(initialized.data.len())
    );
}

#[tokio::test]
async fn exact_open_and_deadline_boundaries_are_claiming_and_claimable() {
    for (nonce, deadline) in [(1462, false), (1463, true)] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let mut c = active_context(&creator, &other, nonce, 0).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        let now = c
            .banks_client
            .get_sysvar::<Clock>()
            .await
            .unwrap()
            .unix_timestamp;
        let window = if deadline {
            EventWindow {
                opens: now - 10,
                deadline: now,
                resolution: now + 10,
            }
        } else {
            EventWindow {
                opens: now,
                deadline: now + 10,
                resolution: now + 20,
            }
        };
        replace_ritual(&mut c, ritual, |r| r.schedule[0] = window).await;
        init_event(&mut c, &creator, nonce).await;
        let event = event_pda(&ritual, 0);
        assert_eq!(
            deserialize_event(&get_account(&mut c, event).await.data).status,
            EventStatus::Claiming
        );
        submit(
            &mut c,
            vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
            &[&other],
        )
        .await
        .unwrap();
    }
}

#[tokio::test]
async fn authorization_and_rent_rollback_errors_are_exact() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let outsider = Keypair::new();
    let nonce = 1464;
    let mut c = active_context(&creator, &other, nonce, 0).await;
    c.set_account(
        &outsider.pubkey(),
        &AccountSharedData::from(Account {
            lamports: 1_000_000_000,
            data: vec![],
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        }),
    );
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    init_event(&mut c, &creator, nonce).await;
    let event = event_pda(&ritual, 0);
    let before = ClaimFlowSnapshot::capture(
        &mut c,
        ritual,
        event,
        claim_pda(&event, &outsider.pubkey(), 0),
        RECIPIENT,
    )
    .await;
    assert_error(
        submit(
            &mut c,
            vec![claim_completion_ix(ritual, outsider.pubkey(), 0, 0)],
            &[&outsider],
        )
        .await,
        6021,
    );
    assert_eq!(
        before,
        ClaimFlowSnapshot::capture(
            &mut c,
            ritual,
            event,
            claim_pda(&event, &outsider.pubkey(), 0),
            RECIPIENT
        )
        .await
    );
    replace_account_event(&mut c, event, |e| e.status = EventStatus::Resolving).await;
    let claimant = get_account(&mut c, other.pubkey()).await;
    let claim = claim_pda(&event, &other.pubkey(), 0);
    assert_error(
        submit(
            &mut c,
            vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
            &[&other],
        )
        .await,
        6039,
    );
    assert_eq!(claimant, get_account(&mut c, other.pubkey()).await);
    assert_absent(&mut c, claim).await;
}

#[tokio::test]
async fn valid_state_rejects_unsigned_claimant_exactly() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut c = active_context(&creator, &other, 1465, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), 1465);
    init_event(&mut c, &creator, 1465).await;
    assert_error(
        submit(
            &mut c,
            vec![claim_ix_with_signer(ritual, other.pubkey(), 0, 0, false)],
            &[],
        )
        .await,
        3010,
    );
}

#[tokio::test]
async fn synthetic_nonfunding_corruption_is_active_state_inconsistent() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut c = active_context(&creator, &other, 1466, 0).await;
    let ritual = ritual_pda(&creator.pubkey(), 1466);
    init_event(&mut c, &creator, 1466).await;
    replace_ritual(&mut c, ritual, |r| r.funded_members_bitmap = 1).await;
    assert_error(
        submit(
            &mut c,
            vec![claim_completion_ix(ritual, other.pubkey(), 0, 0)],
            &[&other],
        )
        .await,
        6045,
    );
}
