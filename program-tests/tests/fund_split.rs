mod support;
use support::*;

fn source_for(index: usize) -> Pubkey {
    Pubkey::new_from_array([40 + index as u8; 32])
}

fn initialize_split_ix(authority: Pubkey, fee: u64) -> Instruction {
    let accounts = rituals::accounts::InitializeProtocolConfig {
        protocol_config: config_pda(),
        authority,
        system_program: system_program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::InitializeProtocolConfig {
            allowed_stake_mint: MINT,
            fee_recipient: RECIPIENT,
            fee_basis_points: 200,
            minimum_fee: fee,
            maximum_fee: fee,
            maximum_member_stake: 1_000,
        }
        .data(),
    }
}

fn create_split_ix(creator: Pubkey, members: Vec<Pubkey>, nonce: u64) -> Instruction {
    let ritual = ritual_pda(&creator, nonce);
    let accounts = rituals::accounts::CreateRitual {
        protocol_config: config_pda(),
        ritual,
        creator,
        stake_mint: MINT,
        fee_recipient_token: RECIPIENT,
        stake_vault: vault_pda(b"stake-vault", &ritual),
        fee_vault: vault_pda(b"fee-vault", &ritual),
        system_program: system_program::ID,
        token_program: spl_token::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::CreateRitual {
            nonce,
            rule_digest: [2; 32],
            members,
            member_total_stake: 100,
            schedule: vec![EventWindow {
                opens: 1,
                deadline: 2,
                resolution: 3,
            }],
            additional_confirmation_threshold: 0,
            fee_payer_mode: FeePayerMode::Split,
        }
        .data(),
    }
}

async fn start_split(members: &[Keypair], amounts: &[u64]) -> ProgramTestContext {
    let mut test = ProgramTest::new("rituals", PROGRAM_ID, processor!(process_instruction));
    test.add_program(
        "spl_token",
        spl_token::ID,
        processor!(spl_token::processor::Processor::process),
    );
    test.add_genesis_account(MINT, mint_account(amounts.iter().sum()));
    let recipient = spl_token::state::Account {
        mint: MINT,
        owner: Pubkey::new_from_array([10; 32]),
        amount: 0,
        delegate: None.into(),
        state: spl_token::state::AccountState::Initialized,
        is_native: None.into(),
        delegated_amount: 0,
        close_authority: None.into(),
    };
    let mut recipient_data = vec![0; spl_token::state::Account::LEN];
    spl_token::state::Account::pack_into_slice(&recipient, &mut recipient_data);
    test.add_genesis_account(
        RECIPIENT,
        Account {
            lamports: Rent::default().minimum_balance(recipient_data.len()),
            data: recipient_data,
            owner: spl_token::ID,
            executable: false,
            rent_epoch: 0,
        },
    );
    for (index, (member, amount)) in members.iter().zip(amounts).enumerate() {
        test.add_genesis_account(
            source_for(index),
            token_account_for(MINT, member.pubkey(), *amount),
        );
    }
    test.add_genesis_account(
        members[0].pubkey(),
        Account {
            lamports: 10_000_000_000,
            data: vec![],
            owner: system_program::ID,
            executable: false,
            rent_epoch: 0,
        },
    );
    test.start_with_context().await
}

#[tokio::test]
async fn split_exact_matrix_two_through_six_members_all_remainders() {
    for member_count in 2usize..=6 {
        for remainder in 0usize..member_count {
            let locked_fee = 2 * member_count as u64 + remainder as u64;
            let base = locked_fee / member_count as u64;
            let members: Vec<Keypair> = (0..member_count).map(|_| Keypair::new()).collect();
            let shares: Vec<u64> = (0..member_count)
                .map(|i| base + u64::from(i < remainder))
                .collect();
            let initial: Vec<u64> = shares.iter().map(|share| 100 + share + 7).collect();
            let mut context = start_split(&members, &initial).await;
            let member_keys: Vec<Pubkey> = members.iter().map(Keypair::pubkey).collect();
            let nonce = 1000 + (member_count * 10 + remainder) as u64;
            submit(
                &mut context,
                vec![
                    initialize_split_ix(members[0].pubkey(), locked_fee),
                    create_split_ix(members[0].pubkey(), member_keys.clone(), nonce),
                ],
                &[&members[0]],
            )
            .await
            .unwrap();
            let ritual = ritual_pda(&members[0].pubkey(), nonce);
            let stake_vault = vault_pda(b"stake-vault", &ritual);
            let fee_vault = vault_pda(b"fee-vault", &ritual);
            for index in (0..member_count).rev() {
                submit(
                    &mut context,
                    vec![fund_ix(
                        members[0].pubkey(),
                        nonce,
                        members[index].pubkey(),
                        source_for(index),
                    )],
                    &[&members[index]],
                )
                .await
                .unwrap();
                let state = deserialize(&get_account(&mut context, ritual).await.data);
                let funded: Vec<usize> = (0..member_count)
                    .filter(|i| state.funded_members_bitmap & (1 << i) != 0)
                    .collect();
                let expected_fee: u64 = funded.iter().map(|i| shares[*i]).sum();
                assert_eq!(state.funded_member_count as usize, funded.len());
                assert_eq!(state.funded_stake_total, funded.len() as u64 * 100);
                assert_eq!(state.funded_fee_total, expected_fee);
                assert_eq!(
                    amount(&mut context, stake_vault).await,
                    funded.len() as u64 * 100
                );
                assert_eq!(amount(&mut context, fee_vault).await, expected_fee);
                assert_eq!(amount(&mut context, source_for(index)).await, 7);
                assert_eq!(state.status, RitualStatus::Funding);
            }
            let state = deserialize(&get_account(&mut context, ritual).await.data);
            assert_eq!(state.funded_members_bitmap, (1u8 << member_count) - 1);
            assert_eq!(state.funded_member_count as usize, member_count);
            assert_eq!(state.funded_fee_total, locked_fee);
            assert_eq!(
                amount(&mut context, stake_vault).await,
                member_count as u64 * 100
            );
            assert_eq!(amount(&mut context, fee_vault).await, locked_fee);
            assert_eq!(amount(&mut context, RECIPIENT).await, 0);
            if member_count == 3 && remainder == 2 {
                assert_eq!(shares, vec![3, 3, 2]);
            }
            if member_count == 6 && remainder == 5 {
                assert_eq!(shares, vec![3, 3, 3, 3, 3, 2]);
            }
        }
    }
}


#[tokio::test]
async fn split_cancellation_refunds_n3_fee_remainder_atomically() {
    let members: Vec<Keypair> = (0..3).map(|_| Keypair::new()).collect();
    let amounts = [110, 110, 110];
    let mut context = start_split(&members, &amounts).await;
    let keys: Vec<Pubkey> = members.iter().map(Keypair::pubkey).collect();
    let nonce = 3003;
    submit(
        &mut context,
        vec![
            initialize_split_ix(keys[0], 5),
            create_split_ix(keys[0], keys.clone(), nonce),
        ],
        &[&members[0]],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&keys[0], nonce);
    for index in [2usize, 0] {
        submit(
            &mut context,
            vec![fund_ix(keys[0], nonce, keys[index], source_for(index))],
            &[&members[index]],
        )
        .await
        .unwrap();
    }
    let destinations = [source_for(0), source_for(1), source_for(2)];
    submit(
        &mut context,
        vec![cancel_ix(keys[0], nonce, keys[1], &destinations)],
        &[&members[1]],
    )
    .await
    .unwrap();
    for destination in destinations {
        assert_eq!(amount(&mut context, destination).await, 110);
    }
    assert_eq!(amount(&mut context, vault_pda(b"stake-vault", &ritual)).await, 0);
    assert_eq!(amount(&mut context, vault_pda(b"fee-vault", &ritual)).await, 0);
    assert_eq!(amount(&mut context, RECIPIENT).await, 0);
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(state.status, RitualStatus::Cancelled);
    assert_eq!(state.funded_members_bitmap, 0);
    assert_eq!(state.funded_member_count, 0);
}

#[tokio::test]
async fn split_insufficient_total_is_6025_and_atomic() {
    let members: Vec<Keypair> = (0..2).map(|_| Keypair::new()).collect();
    let mut context = start_split(&members, &[200, 101]).await;
    let keys: Vec<Pubkey> = members.iter().map(Keypair::pubkey).collect();
    let nonce = 2001;
    submit(
        &mut context,
        vec![
            initialize_split_ix(keys[0], 4),
            create_split_ix(keys[0], keys.clone(), nonce),
        ],
        &[&members[0]],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&keys[0], nonce);
    let sources = vec![source_for(0), source_for(1)];
    let before = split_funding_snapshot(&mut context, ritual, &sources).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(keys[0], nonce, keys[1], source_for(1))],
            &[&members[1]],
        )
        .await,
        6025,
    );
    assert_eq!(
        split_funding_snapshot(&mut context, ritual, &sources).await,
        before
    );
}

#[tokio::test]
async fn split_duplicate_is_6022_and_atomic() {
    let members: Vec<Keypair> = (0..2).map(|_| Keypair::new()).collect();
    let mut context = start_split(&members, &[200, 200]).await;
    let keys: Vec<Pubkey> = members.iter().map(Keypair::pubkey).collect();
    let nonce = 2002;
    submit(
        &mut context,
        vec![
            initialize_split_ix(keys[0], 4),
            create_split_ix(keys[0], keys.clone(), nonce),
        ],
        &[&members[0]],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&keys[0], nonce);
    submit(
        &mut context,
        vec![fund_ix(keys[0], nonce, keys[1], source_for(1))],
        &[&members[1]],
    )
    .await
    .unwrap();
    let sources = vec![source_for(0), source_for(1)];
    let before = split_funding_snapshot(&mut context, ritual, &sources).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(keys[0], nonce, keys[1], source_for(1))],
            &[&members[1]],
        )
        .await,
        6022,
    );
    assert_eq!(
        split_funding_snapshot(&mut context, ritual, &sources).await,
        before
    );
}

#[tokio::test]
async fn split_inconsistent_state_is_6027_and_atomic() {
    let members: Vec<Keypair> = (0..2).map(|_| Keypair::new()).collect();
    let mut context = start_split(&members, &[200, 200]).await;
    let keys: Vec<Pubkey> = members.iter().map(Keypair::pubkey).collect();
    let nonce = 2003;
    submit(
        &mut context,
        vec![
            initialize_split_ix(keys[0], 4),
            create_split_ix(keys[0], keys.clone(), nonce),
        ],
        &[&members[0]],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&keys[0], nonce);
    submit(
        &mut context,
        vec![fund_ix(keys[0], nonce, keys[1], source_for(1))],
        &[&members[1]],
    )
    .await
    .unwrap();
    replace_ritual(&mut context, ritual, |ritual| ritual.funded_fee_total += 1).await;
    let sources = vec![source_for(0), source_for(1)];
    let before = split_funding_snapshot(&mut context, ritual, &sources).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(keys[0], nonce, keys[0], source_for(0))],
            &[&members[0]],
        )
        .await,
        6027,
    );
    assert_eq!(
        split_funding_snapshot(&mut context, ritual, &sources).await,
        before
    );

    let members: Vec<Keypair> = (0..2).map(|_| Keypair::new()).collect();
    let mut context = start_split(&members, &[200, 200]).await;
    let keys: Vec<Pubkey> = members.iter().map(Keypair::pubkey).collect();
    let nonce = 2004;
    submit(
        &mut context,
        vec![
            initialize_split_ix(keys[0], 4),
            create_split_ix(keys[0], keys.clone(), nonce),
        ],
        &[&members[0]],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&keys[0], nonce);
    replace_ritual(&mut context, ritual, |ritual| {
        ritual.funded_members_bitmap |= 1 << members.len();
    })
    .await;
    let sources = vec![source_for(0), source_for(1)];
    let before = split_funding_snapshot(&mut context, ritual, &sources).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(keys[0], nonce, keys[0], source_for(0))],
            &[&members[0]],
        )
        .await,
        6027,
    );
    assert_eq!(
        split_funding_snapshot(&mut context, ritual, &sources).await,
        before
    );
}
