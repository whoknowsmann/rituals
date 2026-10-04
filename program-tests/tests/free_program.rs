//! Free-protocol coverage: a 0/0/0 fee configuration, the in-place
//! `update_protocol_config` instruction, and the zero-fee lifecycle paths
//! (solo kept/missed, group fund+activate, group cancel) with exact
//! conservation assertions. The fee recipient never receives anything when
//! the locked fee is zero; a ritual that locked a fee under the paid config
//! keeps paying that locked fee after the config is switched to free.
mod support;
use solana_sdk::clock::Clock;
use support::*;

/// Byte range of the three fee fields inside the ProtocolConfig account:
/// 8 (discriminator) + 1 (schema) + 32 (authority) + 32 (mint) + 32 (recipient)
/// = 105, then u16 bps + u64 min + u64 max = 18 bytes.
const FEE_FIELDS: std::ops::Range<usize> = 105..123;

async fn now(context: &mut ProgramTestContext) -> i64 {
    context
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp
}

fn config_fee_fields(config: &rituals::ProtocolConfig) -> (u16, u64, u64) {
    (
        config.fee_basis_points,
        config.minimum_fee,
        config.maximum_fee,
    )
}

/// Compare the user-visible parts of a token account. `rent_epoch` is
/// excluded: the bank rewrites it to `u64::MAX` the first time a genesis
/// account is stored as writable, even when nothing else changed.
fn assert_token_account_unchanged(before: &Account, after: &Account) {
    assert_eq!(after.owner, before.owner);
    assert_eq!(after.lamports, before.lamports);
    assert_eq!(after.data, before.data);
}

async fn start_paid(creator: &Keypair, other: &Keypair) -> ProgramTestContext {
    let mut context = start_with_members(creator, other, 250, 250).await;
    submit(
        &mut context,
        vec![initialize_ix(creator.pubkey())],
        &[creator],
    )
    .await
    .unwrap();
    context
}

// ---------------------------------------------------------------------------
// update_protocol_config
// ---------------------------------------------------------------------------

#[tokio::test]
async fn update_protocol_config_by_authority_changes_only_the_fee_fields() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = start_paid(&creator, &other).await;
    let before_account = get_account(&mut context, config_pda()).await;
    let before = deserialize_config(&before_account.data);
    assert_eq!(config_fee_fields(&before), (200, 50, 500));

    submit(
        &mut context,
        vec![update_config_ix(creator.pubkey(), 0, 0, 0)],
        &[&creator],
    )
    .await
    .unwrap();

    let after_account = get_account(&mut context, config_pda()).await;
    assert_eq!(after_account.data.len(), before_account.data.len());
    assert_eq!(after_account.lamports, before_account.lamports);
    assert_eq!(after_account.owner, before_account.owner);
    // Every byte outside the three fee fields is untouched.
    assert_eq!(
        after_account.data[..FEE_FIELDS.start],
        before_account.data[..FEE_FIELDS.start]
    );
    assert_eq!(
        after_account.data[FEE_FIELDS.end..],
        before_account.data[FEE_FIELDS.end..]
    );
    let after = deserialize_config(&after_account.data);
    assert_eq!(config_fee_fields(&after), (0, 0, 0));
    assert_eq!(after.schema_version, before.schema_version);
    assert_eq!(after.authority, before.authority);
    assert_eq!(after.allowed_stake_mint, before.allowed_stake_mint);
    assert_eq!(after.fee_recipient, before.fee_recipient);
    assert_eq!(after.maximum_member_stake, before.maximum_member_stake);
    assert_eq!(after.max_members, before.max_members);
    assert_eq!(after.max_events, before.max_events);
    assert_eq!(after.paused, before.paused);
    assert_eq!(after.bump, before.bump);

    // The live devnet values round-trip through the same instruction.
    submit(
        &mut context,
        vec![update_config_ix(creator.pubkey(), 200, 500_000, 5_000_000)],
        &[&creator],
    )
    .await
    .unwrap();
    let restored = deserialize_config(&get_account(&mut context, config_pda()).await.data);
    assert_eq!(config_fee_fields(&restored), (200, 500_000, 5_000_000));
}

#[tokio::test]
async fn update_protocol_config_rejects_non_authority_and_missing_signature() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = start_paid(&creator, &other).await;
    let before = get_account(&mut context, config_pda()).await;

    // A signer that is not the stored authority fails `has_one = authority`.
    assert_error(
        submit(
            &mut context,
            vec![update_config_ix(other.pubkey(), 0, 0, 0)],
            &[&other],
        )
        .await,
        2001,
    );
    assert_eq!(get_account(&mut context, config_pda()).await, before);

    // The stored authority listed without its signature fails the signer check.
    let mut unsigned = update_config_ix(creator.pubkey(), 0, 0, 0);
    assert_eq!(unsigned.accounts[1].pubkey, creator.pubkey());
    unsigned.accounts[1].is_signer = false;
    assert_error(submit(&mut context, vec![unsigned], &[]).await, 3010);
    assert_eq!(get_account(&mut context, config_pda()).await, before);
}

#[tokio::test]
async fn update_protocol_config_rejects_invalid_values_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = start_paid(&creator, &other).await;
    let before = get_account(&mut context, config_pda()).await;
    for (bps, minimum, maximum, expected) in [
        (10_001, 0, 0, 6000),
        (u16::MAX, 50, 500, 6000),
        (0, 1, 0, 6003),
        (200, 501, 500, 6003),
    ] {
        assert_error(
            submit(
                &mut context,
                vec![update_config_ix(creator.pubkey(), bps, minimum, maximum)],
                &[&creator],
            )
            .await,
            expected,
        );
        assert_eq!(
            get_account(&mut context, config_pda()).await,
            before,
            "case {bps}/{minimum}/{maximum}"
        );
    }
}

// ---------------------------------------------------------------------------
// Solo ritual under the free configuration
// ---------------------------------------------------------------------------

/// Initialize 0/0/0, create a solo ritual (stake 100, no witness), fund and
/// activate it. Asserts the locked fee is zero and that no token moved
/// anywhere except stake into the stake vault.
async fn free_solo_fixture(nonce: u64) -> (ProgramTestContext, Keypair, Pubkey, Pubkey) {
    let creator = Keypair::new();
    let mut context = start_with_member_set(&[&creator], &[300]).await;
    let destination = SECOND_RECIPIENT;
    let opens = now(&mut context).await + 100;
    submit(
        &mut context,
        vec![
            initialize_free_ix(creator.pubkey()),
            create_solo_ix(creator.pubkey(), nonce, None, destination, 100, opens),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let config = deserialize_config(&get_account(&mut context, config_pda()).await.data);
    assert_eq!(config_fee_fields(&config), (0, 0, 0));
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let stake_vault = vault_pda(b"stake-vault", &ritual);
    let fee_vault = vault_pda(b"fee-vault", &ritual);
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(state.kind, rituals::RitualKind::Solo);
    assert_eq!(state.status, RitualStatus::Funding);
    assert_eq!(state.locked_activation_fee, 0);
    assert_eq!(state.funded_fee_total, 0);
    assert_eq!(state.locked_fee_recipient, RECIPIENT);

    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            source_for_member(0),
        )],
        &[&creator],
    )
    .await
    .unwrap();
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(state.funded_members_bitmap, 1);
    assert_eq!(state.funded_member_count, 1);
    assert_eq!(state.funded_stake_total, 100);
    assert_eq!(state.funded_fee_total, 0);
    assert_eq!(amount(&mut context, source_for_member(0)).await, 200);
    assert_eq!(amount(&mut context, stake_vault).await, 100);
    assert_eq!(amount(&mut context, fee_vault).await, 0);

    let recipient_before = get_account(&mut context, RECIPIENT).await;
    let clock_before = now(&mut context).await;
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), nonce)],
        &[],
    )
    .await
    .unwrap();
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(state.status, RitualStatus::Active);
    assert!(state.activated_at >= clock_before);
    assert_eq!(state.locked_activation_fee, 0);
    assert_eq!(state.funded_fee_total, 0);
    assert_token_account_unchanged(
        &recipient_before,
        &get_account(&mut context, RECIPIENT).await,
    );
    assert_eq!(amount(&mut context, RECIPIENT).await, 0);
    assert_eq!(amount(&mut context, stake_vault).await, 100);
    assert_eq!(amount(&mut context, fee_vault).await, 0);
    (context, creator, ritual, destination)
}

async fn open_solo_event(
    context: &mut ProgramTestContext,
    ritual: Pubkey,
    creator: &Keypair,
) -> Pubkey {
    let now = now(context).await;
    replace_ritual(context, ritual, |r| {
        r.schedule[0] = EventWindow {
            opens: now - 100,
            deadline: now + 100,
            resolution: now + 200,
        }
    })
    .await;
    submit(
        context,
        vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
        &[creator],
    )
    .await
    .unwrap();
    event_pda(&ritual, 0)
}

async fn expire_event(context: &mut ProgramTestContext, ritual: Pubkey, event: Pubkey) {
    let now = now(context).await;
    replace_ritual(context, ritual, |r| {
        r.schedule[0].deadline = now - 2;
        r.schedule[0].resolution = now - 1;
    })
    .await;
    replace_event(context, event, |e| {
        e.window.deadline = now - 2;
        e.window.resolution = now - 1;
    })
    .await;
}

async fn assert_terminal_vaults_close(
    context: &mut ProgramTestContext,
    ritual: Pubkey,
    creator: &Keypair,
) {
    let stake_vault = vault_pda(b"stake-vault", &ritual);
    let fee_vault = vault_pda(b"fee-vault", &ritual);
    assert_eq!(amount(context, stake_vault).await, 0);
    assert_eq!(amount(context, fee_vault).await, 0);
    submit(
        context,
        vec![close_terminal_vaults_ix(ritual, creator.pubkey())],
        &[],
    )
    .await
    .unwrap();
    assert!(context
        .banks_client
        .get_account(stake_vault)
        .await
        .unwrap()
        .is_none());
    assert!(context
        .banks_client
        .get_account(fee_vault)
        .await
        .unwrap()
        .is_none());
    assert!(deserialize(&get_account(context, ritual).await.data).vaults_closed);
}

#[tokio::test]
async fn free_solo_kept_returns_the_whole_stake_and_closes_the_empty_fee_vault() {
    let (mut context, creator, ritual, destination) = free_solo_fixture(9201).await;
    let event = open_solo_event(&mut context, ritual, &creator).await;
    let claim = claim_pda(&event, &creator.pubkey(), 0);
    submit(
        &mut context,
        vec![claim_completion_ix(ritual, creator.pubkey(), 0, 0)],
        &[&creator],
    )
    .await
    .unwrap();
    expire_event(&mut context, ritual, event).await;
    submit(
        &mut context,
        vec![finalize_solo_ix(
            ritual,
            0,
            source_for_member(0),
            destination,
        )],
        &[],
    )
    .await
    .unwrap();

    // Exact conservation: all 300 units are back with the host; the cause and
    // the protocol recipient received nothing.
    assert_eq!(amount(&mut context, source_for_member(0)).await, 300);
    assert_eq!(amount(&mut context, destination).await, 0);
    assert_eq!(amount(&mut context, RECIPIENT).await, 0);
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(state.status, RitualStatus::Completed);
    assert_eq!(state.funded_stake_total, 0);
    assert_eq!(state.funded_fee_total, 0);
    assert_eq!(state.locked_activation_fee, 0);
    let settled = deserialize_event(&get_account(&mut context, event).await.data);
    assert_eq!(settled.status, EventStatus::Settled);
    assert_eq!(settled.payout_total, 100);
    assert_eq!(settled.forfeited_total, 0);
    let claim_state = deserialize_claim(&get_account(&mut context, claim).await.data);
    assert_eq!(claim_state.status, ClaimStatus::Confirmed);
    assert_terminal_vaults_close(&mut context, ritual, &creator).await;
}

#[tokio::test]
async fn free_solo_missed_sends_the_whole_stake_to_the_cause_with_no_protocol_cut() {
    let (mut context, creator, ritual, destination) = free_solo_fixture(9202).await;
    let event = open_solo_event(&mut context, ritual, &creator).await;
    expire_event(&mut context, ritual, event).await;
    submit(
        &mut context,
        vec![finalize_solo_ix(
            ritual,
            0,
            source_for_member(0),
            destination,
        )],
        &[],
    )
    .await
    .unwrap();

    // Exact conservation: 200 stayed with the host, 100 went to the cause,
    // nothing to the protocol recipient.
    assert_eq!(amount(&mut context, source_for_member(0)).await, 200);
    assert_eq!(amount(&mut context, destination).await, 100);
    assert_eq!(amount(&mut context, RECIPIENT).await, 0);
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(state.status, RitualStatus::Completed);
    assert_eq!(state.funded_stake_total, 0);
    assert_eq!(state.funded_fee_total, 0);
    let settled = deserialize_event(&get_account(&mut context, event).await.data);
    assert_eq!(settled.status, EventStatus::Settled);
    assert_eq!(settled.payout_total, 0);
    assert_eq!(settled.forfeited_total, 100);
    assert_terminal_vaults_close(&mut context, ritual, &creator).await;
}

// ---------------------------------------------------------------------------
// Group ritual under the free configuration
// ---------------------------------------------------------------------------

#[tokio::test]
async fn free_group_funds_and_activates_without_any_fee_transfer() {
    for (index, mode) in [FeePayerMode::Host, FeePayerMode::Split]
        .into_iter()
        .enumerate()
    {
        let creator = Keypair::new();
        let other = Keypair::new();
        let nonce = 9300 + index as u64;
        let creator_source = Pubkey::new_from_array([21; 32]);
        let other_source = Pubkey::new_from_array([22; 32]);
        let mut context = start_with_members(&creator, &other, 250, 250).await;
        submit(
            &mut context,
            vec![
                initialize_free_ix(creator.pubkey()),
                create_ix(creator.pubkey(), other.pubkey(), nonce, mode.clone()),
            ],
            &[&creator],
        )
        .await
        .unwrap();
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        let stake_vault = vault_pda(b"stake-vault", &ritual);
        let fee_vault = vault_pda(b"fee-vault", &ritual);
        let state = deserialize(&get_account(&mut context, ritual).await.data);
        assert_eq!(state.fee_payer_mode, mode, "mode {mode:?}");
        assert_eq!(state.locked_activation_fee, 0, "mode {mode:?}");

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
        submit(
            &mut context,
            vec![fund_ix(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                creator_source,
            )],
            &[&creator],
        )
        .await
        .unwrap();
        let state = deserialize(&get_account(&mut context, ritual).await.data);
        assert_eq!(state.funded_members_bitmap, 3, "mode {mode:?}");
        assert_eq!(state.funded_member_count, 2, "mode {mode:?}");
        assert_eq!(state.funded_stake_total, 200, "mode {mode:?}");
        assert_eq!(state.funded_fee_total, 0, "mode {mode:?}");
        // Each member paid exactly the stake, nothing more.
        assert_eq!(amount(&mut context, creator_source).await, 150);
        assert_eq!(amount(&mut context, other_source).await, 150);
        assert_eq!(amount(&mut context, stake_vault).await, 200);
        assert_eq!(amount(&mut context, fee_vault).await, 0);

        let now = now(&mut context).await;
        replace_ritual(&mut context, ritual, |r| {
            r.schedule[0].opens = now + 100;
            r.schedule[0].deadline = now + 101;
            r.schedule[0].resolution = now + 102;
        })
        .await;
        let recipient_before = get_account(&mut context, RECIPIENT).await;
        submit(
            &mut context,
            vec![activate_ix_default(creator.pubkey(), nonce)],
            &[],
        )
        .await
        .unwrap();
        let state = deserialize(&get_account(&mut context, ritual).await.data);
        assert_eq!(state.status, RitualStatus::Active, "mode {mode:?}");
        assert!(state.activated_at >= now, "mode {mode:?}");
        assert_token_account_unchanged(
            &recipient_before,
            &get_account(&mut context, RECIPIENT).await,
        );
        assert_eq!(amount(&mut context, RECIPIENT).await, 0);
        assert_eq!(amount(&mut context, stake_vault).await, 200);
        assert_eq!(amount(&mut context, fee_vault).await, 0);
    }
}

#[tokio::test]
async fn free_group_cancel_refunds_exact_stake_with_an_empty_fee_vault() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 9310;
    let creator_source = Pubkey::new_from_array([21; 32]);
    let other_source = Pubkey::new_from_array([22; 32]);
    let mut context = start_with_members(&creator, &other, 250, 250).await;
    submit(
        &mut context,
        vec![
            initialize_free_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), nonce, FeePayerMode::Host),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), nonce);
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
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            nonce,
            creator.pubkey(),
            creator_source,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(amount(&mut context, creator_source).await, 150);
    assert_eq!(amount(&mut context, other_source).await, 150);

    // Members are [other, creator]; refund destinations follow that order.
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
    assert_eq!(amount(&mut context, creator_source).await, 250);
    assert_eq!(amount(&mut context, other_source).await, 250);
    assert_eq!(amount(&mut context, RECIPIENT).await, 0);
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(state.status, RitualStatus::Cancelled);
    assert_eq!(state.funded_members_bitmap, 0);
    assert_eq!(state.funded_member_count, 0);
    assert_eq!(state.funded_stake_total, 0);
    assert_eq!(state.funded_fee_total, 0);
    assert_eq!(state.locked_activation_fee, 0);
    assert_terminal_vaults_close(&mut context, ritual, &creator).await;
}

// ---------------------------------------------------------------------------
// Paid-config ritual survives the switch to free
// ---------------------------------------------------------------------------

#[tokio::test]
async fn ritual_locked_under_paid_config_still_pays_its_locked_fee_after_update_to_free() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let paid_nonce = 9400;
    let free_nonce = 9401;
    let creator_source = Pubkey::new_from_array([21; 32]);
    let other_source = Pubkey::new_from_array([22; 32]);
    let mut context = start_with_members(&creator, &other, 250, 250).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(
                creator.pubkey(),
                other.pubkey(),
                paid_nonce,
                FeePayerMode::Host,
            ),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let paid = ritual_pda(&creator.pubkey(), paid_nonce);
    // pool 200 * 200 bps / 10_000 = 4, clamped up to the 50 minimum.
    assert_eq!(
        deserialize(&get_account(&mut context, paid).await.data).locked_activation_fee,
        50
    );

    submit(
        &mut context,
        vec![update_config_ix(creator.pubkey(), 0, 0, 0)],
        &[&creator],
    )
    .await
    .unwrap();
    let config = deserialize_config(&get_account(&mut context, config_pda()).await.data);
    assert_eq!(config_fee_fields(&config), (0, 0, 0));
    // The existing ritual keeps its snapshot.
    assert_eq!(
        deserialize(&get_account(&mut context, paid).await.data).locked_activation_fee,
        50
    );

    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            paid_nonce,
            other.pubkey(),
            other_source,
        )],
        &[&other],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            paid_nonce,
            creator.pubkey(),
            creator_source,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    // Host mode: the creator funded stake 100 plus the locked fee 50.
    assert_eq!(amount(&mut context, creator_source).await, 100);
    assert_eq!(amount(&mut context, other_source).await, 150);
    assert_eq!(
        amount(&mut context, vault_pda(b"fee-vault", &paid)).await,
        50
    );

    let now = now(&mut context).await;
    replace_ritual(&mut context, paid, |r| {
        r.schedule[0].opens = now + 100;
        r.schedule[0].deadline = now + 101;
        r.schedule[0].resolution = now + 102;
    })
    .await;
    submit(
        &mut context,
        vec![activate_ix_default(creator.pubkey(), paid_nonce)],
        &[],
    )
    .await
    .unwrap();
    let state = deserialize(&get_account(&mut context, paid).await.data);
    assert_eq!(state.status, RitualStatus::Active);
    assert_eq!(state.locked_activation_fee, 50);
    assert_eq!(state.funded_fee_total, 50);
    assert_eq!(amount(&mut context, RECIPIENT).await, 50);
    assert_eq!(
        amount(&mut context, vault_pda(b"fee-vault", &paid)).await,
        0
    );
    assert_eq!(
        amount(&mut context, vault_pda(b"stake-vault", &paid)).await,
        200
    );

    // A ritual created after the switch locks no fee at all.
    submit(
        &mut context,
        vec![create_ix(
            creator.pubkey(),
            other.pubkey(),
            free_nonce,
            FeePayerMode::Host,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    let free = ritual_pda(&creator.pubkey(), free_nonce);
    assert_eq!(
        deserialize(&get_account(&mut context, free).await.data).locked_activation_fee,
        0
    );
}
