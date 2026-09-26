mod support;
use support::*;

fn create_solo_ix(
    creator: Pubkey,
    nonce: u64,
    witness: Option<Pubkey>,
    destination: Pubkey,
    stake: u64,
) -> Instruction {
    let ritual = ritual_pda(&creator, nonce);
    let accounts = rituals::accounts::CreateSoloRitual {
        protocol_config: config_pda(),
        ritual,
        creator,
        stake_mint: MINT,
        fee_recipient_token: RECIPIENT,
        forfeit_destination: destination,
        stake_vault: vault_pda(b"stake-vault", &ritual),
        fee_vault: vault_pda(b"fee-vault", &ritual),
        system_program: system_program::ID,
        token_program: spl_token::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::CreateSoloRitual {
            nonce,
            rule_digest: [7; 32],
            member_total_stake: stake,
            schedule: vec![EventWindow {
                opens: 1,
                deadline: 2,
                resolution: 3,
            }],
            witness,
        }
        .data(),
    }
}

fn declare_skip_ix(ritual: Pubkey, member: Pubkey, event_index: u8) -> Instruction {
    let accounts = rituals::accounts::DeclareSkip { ritual, member };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::DeclareSkip { event_index }.data(),
    }
}

fn finalize_solo_ix(ritual: Pubkey, event_index: u8, member_destination: Pubkey, forfeit_destination: Pubkey) -> Instruction {
    let accounts = rituals::accounts::FinalizeEvent {
        ritual,
        event: event_pda(&ritual, event_index),
        stake_mint: MINT,
        stake_vault: vault_pda(b"stake-vault", &ritual),
        token_program: spl_token::ID,
    };
    let mut metas = accounts.to_account_metas(None);
    metas.extend([
        solana_sdk::instruction::AccountMeta::new(member_destination, false),
        solana_sdk::instruction::AccountMeta::new(forfeit_destination, false),
    ]);
    Instruction {
        program_id: PROGRAM_ID,
        accounts: metas,
        data: rituals::instruction::FinalizeEvent { event_index }.data(),
    }
}

async fn solo_fixture(witness: Option<&Keypair>, nonce: u64) -> (ProgramTestContext, Keypair, Pubkey, Pubkey, Pubkey) {
    let creator = Keypair::new();
    let witness_key = witness.map(|_| Keypair::new());
    let members = [&creator];
    let mut context = start_with_member_set(&members, &[300]).await;
    let destination = SECOND_RECIPIENT;
    let witness_pubkey = witness_key.as_ref().map(Keypair::pubkey);
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_solo_ix(creator.pubkey(), nonce, witness_pubkey, destination, 100),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator.pubkey(), nonce);
    submit(
        &mut context,
        vec![fund_ix(creator.pubkey(), nonce, creator.pubkey(), source_for_member(0))],
        &[&creator],
    )
    .await
    .unwrap();
    submit(&mut context, vec![activate_ix_default(creator.pubkey(), nonce)], &[])
        .await
        .unwrap();
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0] = EventWindow {
            opens: now - 100,
            deadline: now + 100,
            resolution: now + 200,
        }
    })
    .await;
    submit(
        &mut context,
        vec![initialize_event_ix(ritual, creator.pubkey(), 0)],
        &[&creator],
    )
    .await
    .unwrap();
    (context, creator, ritual, event_pda(&ritual, 0), destination)
}

#[tokio::test]
async fn solo_create_has_one_host_and_locks_witness_and_destination() {
    let (mut context, creator, ritual, _, destination) = solo_fixture(None, 9101).await;
    let state = deserialize(&get_account(&mut context, ritual).await.data);
    assert_eq!(state.members, vec![creator.pubkey()]);
    assert_eq!(state.witness, None);
    assert_eq!(state.forfeit_destination, destination);
    assert_eq!(state.kind, rituals::RitualKind::Solo);
}

#[tokio::test]
async fn solo_success_returns_stake_to_host_and_witness_approval_is_non_staking() {
    let witness = Keypair::new();
    let (mut context, creator, ritual, event, destination) = solo_fixture(Some(&witness), 9102).await;
    let claim = claim_pda(&event, &creator.pubkey(), 0);
    submit(
        &mut context,
        vec![claim_completion_ix(ritual, creator.pubkey(), 0, 0)],
        &[&creator],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![approve_claim_ix(ritual, creator.pubkey(), witness.pubkey(), 0)],
        &[&witness],
    )
    .await
    .unwrap();
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0].resolution = r.schedule[0].resolution - 1
    })
    .await;
    let before_host = amount(&mut context, source_for_member(0)).await;
    submit(
        &mut context,
        vec![finalize_solo_ix(ritual, 0, source_for_member(0), destination)],
        &[],
    )
    .await
    .unwrap();
    assert_eq!(amount(&mut context, source_for_member(0)).await, before_host + 100);
    assert_eq!(amount(&mut context, destination).await, 0);
    assert_eq!(amount(&mut context, witness.pubkey()).await, 0);
    let claim_state = deserialize_claim(&get_account(&mut context, claim).await.data);
    assert_eq!(claim_state.status, ClaimStatus::Confirmed);
}

#[tokio::test]
async fn solo_miss_pays_locked_destination_and_pending_claim_is_void() {
    let (mut context, creator, ritual, event, destination) = solo_fixture(None, 9103).await;
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0].resolution = r.schedule[0].resolution - 1
    })
    .await;
    submit(
        &mut context,
        vec![finalize_solo_ix(ritual, 0, source_for_member(0), destination)],
        &[],
    )
    .await
    .unwrap();
    assert_eq!(amount(&mut context, destination).await, 100);

    let (mut context, creator, ritual, event, destination) = solo_fixture(Some(&Keypair::new()), 9104).await;
    submit(
        &mut context,
        vec![claim_completion_ix(ritual, creator.pubkey(), 0, 0)],
        &[&creator],
    )
    .await
    .unwrap();
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0].resolution = r.schedule[0].resolution - 1
    })
    .await;
    let before_destination = amount(&mut context, destination).await;
    submit(
        &mut context,
        vec![finalize_solo_ix(ritual, 0, source_for_member(0), destination)],
        &[],
    )
    .await
    .unwrap();
    assert_eq!(amount(&mut context, destination).await, before_destination);
    let e = deserialize_event(&get_account(&mut context, event).await.data);
    assert_eq!(e.status, EventStatus::Voided);
    assert_eq!(e.refunded_total, 100);
}

#[tokio::test]
async fn declare_skip_is_one_shot_and_member_only() {
    let (mut context, creator, ritual, _, _) = solo_fixture(None, 9105).await;
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut context, ritual, |r| {
        r.schedule[0] = EventWindow {
            opens: now + 100,
            deadline: now + 200,
            resolution: now + 300,
        }
    })
    .await;
    submit(
        &mut context,
        vec![declare_skip_ix(ritual, creator.pubkey(), 0)],
        &[&creator],
    )
    .await
    .unwrap();
    assert_error(
        submit(
            &mut context,
            vec![declare_skip_ix(ritual, creator.pubkey(), 0)],
            &[&creator],
        )
        .await,
        6045,
    );
    let outsider = Keypair::new();
    assert_error(
        submit(
            &mut context,
            vec![declare_skip_ix(ritual, outsider.pubkey(), 0)],
            &[&outsider],
        )
        .await,
        6022,
    );
}

#[tokio::test]
async fn witness_cannot_fund_or_claim() {
    let witness = Keypair::new();
    let (mut context, creator, ritual, _, _) = solo_fixture(Some(&witness), 9106).await;
    assert_error(
        submit(
            &mut context,
            vec![fund_ix(creator.pubkey(), 9106, witness.pubkey(), source_for_member(0))],
            &[&witness],
        )
        .await,
        6022,
    );
    assert_error(
        submit(
            &mut context,
            vec![claim_completion_ix(ritual, witness.pubkey(), 0, 0)],
            &[&witness],
        )
        .await,
        6022,
    );
}
