mod support;
use support::*;

#[tokio::test]
async fn host_funding_tracks_ordered_members_and_exact_liabilities() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let creator_source = Pubkey::new_from_array([21; 32]);
    let other_source = Pubkey::new_from_array([22; 32]);
    let mut context = start_with_members(&creator, &other, 200, 150).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), 1, FeePayerMode::Host),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), 1);
    let stake_vault = vault_pda(b"stake-vault", &ritual);
    let fee_vault = vault_pda(b"fee-vault", &ritual);
    submit(
        &mut context,
        vec![fund_ix(creator.pubkey(), 1, other.pubkey(), other_source)],
        &[&other],
    )
    .await
    .unwrap();
    assert_eq!(amount(&mut context, other_source).await, 50);
    assert_eq!(amount(&mut context, stake_vault).await, 100);
    assert_eq!(amount(&mut context, fee_vault).await, 0);
    let account = context
        .banks_client
        .get_account(ritual)
        .await
        .unwrap()
        .unwrap();
    let state = deserialize(&account.data);
    assert_eq!(
        (
            state.funded_members_bitmap,
            state.funded_member_count,
            state.funded_stake_total,
            state.funded_fee_total,
            state.status
        ),
        (1, 1, 100, 0, RitualStatus::Funding)
    );
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            1,
            creator.pubkey(),
            creator_source,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(amount(&mut context, creator_source).await, 50);
    assert_eq!(amount(&mut context, stake_vault).await, 200);
    assert_eq!(amount(&mut context, fee_vault).await, 50);
    let account = context
        .banks_client
        .get_account(ritual)
        .await
        .unwrap()
        .unwrap();
    let state = deserialize(&account.data);
    assert_eq!(
        (
            state.funded_members_bitmap,
            state.funded_member_count,
            state.funded_stake_total,
            state.funded_fee_total
        ),
        (3, 2, 200, 50)
    );
    let before = account.data;
    let source_before = amount(&mut context, creator_source).await;
    let stake_before = amount(&mut context, stake_vault).await;
    let fee_before = amount(&mut context, fee_vault).await;
    let recipient_before = amount(&mut context, RECIPIENT).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(
                creator.pubkey(),
                1,
                creator.pubkey(),
                creator_source,
            )],
            &[&creator],
        )
        .await,
        6022,
    );
    assert_eq!(
        context
            .banks_client
            .get_account(ritual)
            .await
            .unwrap()
            .unwrap()
            .data,
        before
    );
    assert_eq!(amount(&mut context, creator_source).await, source_before);
    assert_eq!(amount(&mut context, stake_vault).await, stake_before);
    assert_eq!(amount(&mut context, fee_vault).await, fee_before);
    assert_eq!(amount(&mut context, RECIPIENT).await, recipient_before);
}

#[tokio::test]
async fn split_funding_uses_exact_member_share() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let source = Pubkey::new_from_array([22; 32]);
    let mut context = start_with_members(&creator, &other, 200, 150).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), 2, FeePayerMode::Split),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), 2);
    submit(
        &mut context,
        vec![fund_ix(creator.pubkey(), 2, other.pubkey(), source)],
        &[&other],
    )
    .await
    .unwrap();
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(
        (state.funded_members_bitmap, state.funded_fee_total),
        (1, 25)
    );
    assert_eq!(amount(&mut context, source).await, 25);
}

#[tokio::test]
async fn host_insufficient_total_is_atomic_before_stake_cpi() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let creator_source = Pubkey::new_from_array([21; 32]);
    let other_source = Pubkey::new_from_array([22; 32]);
    let mut context = start_with_members(&creator, &other, 120, 150).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_ix(creator.pubkey(), other.pubkey(), 3, FeePayerMode::Host),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), 3);
    submit(
        &mut context,
        vec![fund_ix(creator.pubkey(), 3, other.pubkey(), other_source)],
        &[&other],
    )
    .await
    .unwrap();
    let ritual_before = context
        .banks_client
        .get_account(ritual)
        .await
        .unwrap()
        .unwrap()
        .data;
    let source_before = amount(&mut context, creator_source).await;
    let stake_before = amount(&mut context, vault_pda(b"stake-vault", &ritual)).await;
    let fee_before = amount(&mut context, vault_pda(b"fee-vault", &ritual)).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(
                creator.pubkey(),
                3,
                creator.pubkey(),
                creator_source,
            )],
            &[&creator],
        )
        .await,
        6025,
    );
    assert_eq!(
        context
            .banks_client
            .get_account(ritual)
            .await
            .unwrap()
            .unwrap()
            .data,
        ritual_before
    );
    assert_eq!(amount(&mut context, creator_source).await, source_before);
    assert_eq!(
        amount(&mut context, vault_pda(b"stake-vault", &ritual)).await,
        stake_before
    );
    assert_eq!(
        amount(&mut context, vault_pda(b"fee-vault", &ritual)).await,
        fee_before
    );
}

#[tokio::test]
async fn nonmember_source_is_rejected_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 10, 250, 250).await;
    let outsider = Keypair::new();
    context.set_account(
        &outsider.pubkey(),
        &AccountSharedData::from(token_account(outsider.pubkey(), 150)),
    );
    let ritual = ritual_pda(&creator.pubkey(), 10);
    let before = get_account(&mut context, ritual).await.data;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(
                creator.pubkey(),
                10,
                outsider.pubkey(),
                outsider.pubkey(),
            )],
            &[&outsider],
        )
        .await,
        6021,
    );
    assert_eq!(get_account(&mut context, ritual).await.data, before);
}

#[tokio::test]
async fn wrong_source_authority_and_mint_are_rejected() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 11, 250, 250).await;
    let source = Pubkey::new_from_array([22; 32]);
    let ritual = ritual_pda(&creator.pubkey(), 11);
    let before = get_account(&mut context, ritual).await.data;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(creator.pubkey(), 11, creator.pubkey(), source)],
            &[&creator],
        )
        .await,
        2003,
    );
    assert_eq!(get_account(&mut context, ritual).await.data, before);
    let wrong_mint = Pubkey::new_from_array([23; 32]);
    let ix = fund_ix(creator.pubkey(), 11, creator.pubkey(), wrong_mint);
    assert_error(submit(&mut context, vec![ix], &[&creator]).await, 2003);
    assert_eq!(get_account(&mut context, ritual).await.data, before);
}

#[tokio::test]
async fn wrong_vault_addresses_are_rejected_atomically() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 12, 250, 250).await;
    let ritual = ritual_pda(&creator.pubkey(), 12);
    let stake = vault_pda(b"stake-vault", &ritual);
    let fee = vault_pda(b"fee-vault", &ritual);
    let before = get_account(&mut context, ritual).await.data;
    for index in [5usize, 6usize] {
        let mut ix = fund_ix(
            creator.pubkey(),
            12,
            other.pubkey(),
            Pubkey::new_from_array([22; 32]),
        );
        ix.accounts[index].pubkey = if index == 5 { fee } else { stake };
        assert_error(submit(&mut context, vec![ix], &[&other]).await, 2006);
        assert_eq!(get_account(&mut context, ritual).await.data, before);
    }
}

#[tokio::test]
async fn paused_and_nonfunding_statuses_are_rejected() {
    for (nonce, paused, status, code) in [
        (13, true, None, 6005),
        (14, false, Some(RitualStatus::Active), 6020),
        (15, false, Some(RitualStatus::Cancelled), 6020),
    ] {
        let creator = Keypair::new();
        let other = Keypair::new();
        let mut context = setup_host(&creator, &other, nonce, 250, 250).await;
        if paused {
            replace_config(&mut context, |config| config.paused = true).await;
        }
        if let Some(status) = status {
            replace_ritual(
                &mut context,
                ritual_pda(&creator.pubkey(), nonce),
                |ritual| ritual.status = status,
            )
            .await;
        }
        assert_error(
            submit(
                &mut context,
                vec![fund_ix(
                    creator.pubkey(),
                    nonce,
                    other.pubkey(),
                    Pubkey::new_from_array([22; 32]),
                )],
                &[&other],
            )
            .await,
            code,
        );
        assert_eq!(
            amount(&mut context, Pubkey::new_from_array([22; 32])).await,
            250
        );
    }
}

#[tokio::test]
async fn unsolicited_dust_is_not_counted_as_liability() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 16, 250, 250).await;
    let ritual = ritual_pda(&creator.pubkey(), 16);
    let stake = vault_pda(b"stake-vault", &ritual);
    let fee = vault_pda(b"fee-vault", &ritual);
    // Direct amount replacement intentionally simulates unsolicited dust, not a supply-consistent mint event; tracked liabilities remain unchanged.
    replace_token_amount(&mut context, stake, 5).await;
    replace_token_amount(&mut context, fee, 3).await;
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            16,
            other.pubkey(),
            Pubkey::new_from_array([22; 32]),
        )],
        &[&other],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            16,
            creator.pubkey(),
            Pubkey::new_from_array([21; 32]),
        )],
        &[&creator],
    )
    .await
    .unwrap();
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(
        (
            amount(&mut context, stake).await,
            amount(&mut context, fee).await,
            state.funded_stake_total,
            state.funded_fee_total,
            state.funded_member_count
        ),
        (205, 53, 200, 50, 2)
    );
}

#[tokio::test]
async fn extra_source_balance_is_preserved() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 17, 250, 250).await;
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            17,
            other.pubkey(),
            Pubkey::new_from_array([22; 32]),
        )],
        &[&other],
    )
    .await
    .unwrap();
    assert_eq!(
        amount(&mut context, Pubkey::new_from_array([22; 32])).await,
        150
    );
}
#[tokio::test]
async fn nonhost_stake_below_minimum_is_atomic() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 19, 250, 99).await;
    let ritual = ritual_pda(&creator.pubkey(), 19);
    let source = Pubkey::new_from_array([22; 32]);
    let before = (
        get_account(&mut context, ritual).await.data,
        amount(&mut context, source).await,
        amount(&mut context, vault_pda(b"stake-vault", &ritual)).await,
        amount(&mut context, vault_pda(b"fee-vault", &ritual)).await,
    );
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(creator.pubkey(), 19, other.pubkey(), source)],
            &[&other],
        )
        .await,
        6025,
    );
    assert_eq!(
        (
            get_account(&mut context, ritual).await.data,
            amount(&mut context, source).await,
            amount(&mut context, vault_pda(b"stake-vault", &ritual)).await,
            amount(&mut context, vault_pda(b"fee-vault", &ritual)).await
        ),
        before
    );
}
#[tokio::test]
async fn classic_token_account_owner_and_program_are_required() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 18, 250, 250).await;
    let source = Pubkey::new_from_array([22; 32]);
    replace_owner(&mut context, source, system_program::ID).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(creator.pubkey(), 18, other.pubkey(), source)],
            &[&other],
        )
        .await,
        3007,
    );
    replace_owner(
        &mut context,
        source,
        anchor_spl::token_2022::spl_token_2022::ID,
    )
    .await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(creator.pubkey(), 18, other.pubkey(), source)],
            &[&other],
        )
        .await,
        3007,
    );
    replace_owner(&mut context, source, spl_token::ID).await;
    let mut ix = fund_ix(creator.pubkey(), 18, other.pubkey(), source);
    ix.accounts[7].pubkey = system_program::ID;
    assert_error(submit(&mut context, vec![ix], &[&other]).await, 3008);
}

#[tokio::test]
async fn host_total_overflow_is_6024_and_fully_atomic() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = start_with_members(&creator, &other, 200, 150).await;
    submit(
        &mut context,
        vec![initialize_ix(creator.pubkey())],
        &[&creator],
    )
    .await
    .unwrap();
    replace_config(&mut context, |config| {
        config.minimum_fee = u64::MAX;
        config.maximum_fee = u64::MAX;
    })
    .await;
    submit(
        &mut context,
        vec![create_ix(
            creator.pubkey(),
            other.pubkey(),
            20,
            FeePayerMode::Host,
        )],
        &[&creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), 20);
    let before = funding_snapshot(&mut context, ritual).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(
                creator.pubkey(),
                20,
                creator.pubkey(),
                Pubkey::new_from_array([21; 32]),
            )],
            &[&creator],
        )
        .await,
        6024,
    );
    assert_eq!(funding_snapshot(&mut context, ritual).await, before);
}

#[tokio::test]
async fn inconsistent_funding_state_is_6027_and_fully_atomic() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 21, 250, 250).await;
    let ritual = ritual_pda(&creator.pubkey(), 21);
    replace_ritual(&mut context, ritual, |ritual| ritual.funded_stake_total = 1).await;
    let before = funding_snapshot(&mut context, ritual).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(
                creator.pubkey(),
                21,
                other.pubkey(),
                Pubkey::new_from_array([22; 32]),
            )],
            &[&other],
        )
        .await,
        6027,
    );
    assert_eq!(funding_snapshot(&mut context, ritual).await, before);
}

#[tokio::test]
async fn checked_next_accounting_overflow_is_6026_and_fully_atomic() {
    let creator = Keypair::new();
    let other = Keypair::new();
    let mut context = setup_host(&creator, &other, 22, 250, 250).await;
    let ritual = ritual_pda(&creator.pubkey(), 22);
    replace_ritual(&mut context, ritual, |ritual| {
        ritual.member_total_stake = u64::MAX;
        ritual.funded_members_bitmap = 2;
        ritual.funded_member_count = 1;
        ritual.funded_stake_total = u64::MAX;
        ritual.funded_fee_total = 50;
    })
    .await;
    replace_token_amount(&mut context, Pubkey::new_from_array([22; 32]), u64::MAX).await;
    let before = funding_snapshot(&mut context, ritual).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(
                creator.pubkey(),
                22,
                other.pubkey(),
                Pubkey::new_from_array([22; 32]),
            )],
            &[&other],
        )
        .await,
        6026,
    );
    assert_eq!(funding_snapshot(&mut context, ritual).await, before);
}

#[test]
fn wished_for_host_fund_member_api_compiles() {
    let creator = Pubkey::new_unique();
    let ritual = ritual_pda(&creator, 1);
    let accounts = rituals::accounts::FundMember {
        protocol_config: config_pda(),
        ritual,
        member: creator,
        stake_mint: MINT,
        member_source: Pubkey::new_unique(),
        stake_vault: vault_pda(b"stake-vault", &ritual),
        fee_vault: vault_pda(b"fee-vault", &ritual),
        token_program: spl_token::ID,
    };
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::FundMember {}.data(),
    };
    assert_eq!(ix.program_id, PROGRAM_ID);
}
