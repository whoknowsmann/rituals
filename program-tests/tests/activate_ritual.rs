mod support;
use support::*;
use solana_sdk::clock::Clock;

async fn make_fully_funded(
    creator: &Keypair,
    other: &Keypair,
    nonce: u64,
    mode: FeePayerMode,
) -> ProgramTestContext {
    let mut context = start_with_members(creator, other, 250, 250).await;
    submit(
        &mut context,
        vec![initialize_ix(creator.pubkey()), create_ix(creator.pubkey(), other.pubkey(), nonce, mode)],
        &[creator],
    ).await.unwrap();
    submit(&mut context, vec![fund_ix(creator.pubkey(), nonce, other.pubkey(), Pubkey::new_from_array([22; 32]))], &[other]).await.unwrap();
    submit(&mut context, vec![fund_ix(creator.pubkey(), nonce, creator.pubkey(), Pubkey::new_from_array([21; 32]))], &[creator]).await.unwrap();
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = context.banks_client.get_sysvar::<Clock>().await.unwrap().unix_timestamp;
    replace_ritual(&mut context, ritual, |r| r.schedule[0].opens = now + 100).await;
    context
}

#[tokio::test]
async fn activate_host_transfers_exact_snapshotted_fee_and_preserves_dust() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 700;
    let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let stake = vault_pda(b"stake-vault", &ritual);
    let fee = vault_pda(b"fee-vault", &ritual);
    replace_token_amount(&mut context, stake, 207).await;
    replace_token_amount(&mut context, fee, 53).await;
    let before = deserialize(&get_account(&mut context, ritual).await.data);
    let clock_before = context.banks_client.get_sysvar::<Clock>().await.unwrap().unix_timestamp;
    submit(&mut context, vec![activate_ix_default(creator.pubkey(), nonce)], &[]).await.unwrap();
    let after = deserialize(&get_account(&mut context, ritual).await.data);
    let clock_after = context.banks_client.get_sysvar::<Clock>().await.unwrap().unix_timestamp;
    assert_eq!(after.status, RitualStatus::Active);
    assert!(after.activated_at >= clock_before && after.activated_at <= clock_after);
    assert_eq!(after.funded_stake_total, before.funded_stake_total);
    assert_eq!(after.funded_fee_total, before.funded_fee_total);
    assert_eq!(amount(&mut context, stake).await, 207);
    assert_eq!(amount(&mut context, fee).await, 3);
    assert_eq!(amount(&mut context, RECIPIENT).await, 50);
}

#[tokio::test]
async fn activate_split_accepts_shuffled_funding_order() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 701;
    let mut context = start_with_members(&creator, &other, 250, 250).await;
    submit(&mut context, vec![initialize_ix(creator.pubkey()), create_ix(creator.pubkey(), other.pubkey(), nonce, FeePayerMode::Split)], &[&creator]).await.unwrap();
    submit(&mut context, vec![fund_ix(creator.pubkey(), nonce, creator.pubkey(), Pubkey::new_from_array([21; 32]))], &[&creator]).await.unwrap();
    submit(&mut context, vec![fund_ix(creator.pubkey(), nonce, other.pubkey(), Pubkey::new_from_array([22; 32]))], &[&other]).await.unwrap();
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = context.banks_client.get_sysvar::<Clock>().await.unwrap().unix_timestamp;
    replace_ritual(&mut context, ritual, |r| r.schedule[0].opens = now + 100).await;
    submit(&mut context, vec![activate_ix_default(creator.pubkey(), nonce)], &[]).await.unwrap();
    assert_eq!(deserialize(&get_account(&mut context, ritual).await.data).status, RitualStatus::Active);
    assert_eq!(amount(&mut context, RECIPIENT).await, 50);
}

#[tokio::test]
async fn incomplete_and_malformed_funding_are_rejected_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 702;
    let mut context = start_with_members(&creator, &other, 250, 250).await;
    submit(&mut context, vec![initialize_ix(creator.pubkey()), create_ix(creator.pubkey(), other.pubkey(), nonce, FeePayerMode::Host)], &[&creator]).await.unwrap();
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let before = get_account(&mut context, ritual).await.data;
    assert_error(submit(&mut context, vec![activate_ix_default(creator.pubkey(), nonce)], &[]).await, 6028);
    assert_eq!(get_account(&mut context, ritual).await.data, before);
    replace_ritual(&mut context, ritual, |r| { r.funded_members_bitmap = 3; r.funded_member_count = 2; r.funded_stake_total = 200; r.funded_fee_total = 49; }).await;
    let before = get_account(&mut context, ritual).await.data;
    assert_error(submit(&mut context, vec![activate_ix_default(creator.pubkey(), nonce)], &[]).await, 6028);
    assert_eq!(get_account(&mut context, ritual).await.data, before);
}

#[tokio::test]
async fn short_vaults_reject_without_state_or_token_movement() {
    let creator = Keypair::new();
    let other = Keypair::new();
    for (nonce, short_stake, expected) in [(703, true, 6030), (704, false, 6031)] {
        let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
        let ritual = ritual_pda(&creator.pubkey(), nonce);
        let stake = vault_pda(b"stake-vault", &ritual);
        let fee = vault_pda(b"fee-vault", &ritual);
        if short_stake { replace_token_amount(&mut context, stake, 199).await; } else { replace_token_amount(&mut context, fee, 49).await; }
        let before = funding_snapshot(&mut context, ritual).await;
        assert_error(submit(&mut context, vec![activate_ix_default(creator.pubkey(), nonce)], &[]).await, expected);
        assert_eq!(funding_snapshot(&mut context, ritual).await, before);
    }
}

#[tokio::test]
async fn activation_rejects_open_boundary_and_replay() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let nonce = 705;
    let mut context = make_fully_funded(&creator, &other, nonce, FeePayerMode::Host).await;
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    let now = context.banks_client.get_sysvar::<Clock>().await.unwrap().unix_timestamp;
    replace_ritual(&mut context, ritual, |r| r.schedule[0].opens = now).await;
    assert_eq!(amount(&mut context, vault_pda(b"stake-vault", &ritual)).await, 200);
    assert_error(submit(&mut context, vec![activate_ix_default(creator.pubkey(), nonce)], &[]).await, 6029);
    let now = context.banks_client.get_sysvar::<Clock>().await.unwrap().unix_timestamp;
    replace_ritual(&mut context, ritual, |r| r.schedule[0].opens = now + 100).await;
    submit(&mut context, vec![activate_ix_default(creator.pubkey(), nonce)], &[]).await.unwrap();
    assert_error(submit(&mut context, vec![activate_ix_default(creator.pubkey(), nonce)], &[]).await, 6020);
}

#[test]
fn activate_ritual_api_has_no_user_authority_parameter() {
    let creator = Pubkey::new_unique();
    let ritual = ritual_pda(&creator, 1);
    let _ = rituals::accounts::ActivateRitual { protocol_config: config_pda(), ritual, stake_mint: MINT, stake_vault: vault_pda(b"stake-vault", &ritual), fee_vault: vault_pda(b"fee-vault", &ritual), fee_recipient_token: RECIPIENT, token_program: spl_token::ID };
}
