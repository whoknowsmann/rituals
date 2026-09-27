mod support;
use std::str::FromStr;
use support::*;

const SEASON_ID: [u8; 32] = [41; 32];
const OTHER_SEASON_ID: [u8; 32] = [43; 32];
const TITLE_DIGEST: [u8; 32] = [42; 32];

fn season_pda(season_id: &[u8; 32]) -> Pubkey {
    Pubkey::find_program_address(&[b"season", season_id], &PROGRAM_ID).0
}

fn vector_season_pda(season_id: &[u8; 32]) -> Pubkey {
    let vector_program_id =
        Pubkey::from_str("8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB").unwrap();
    Pubkey::find_program_address(&[b"season", season_id], &vector_program_id).0
}

#[test]
fn season_pda_matches_typescript_vector() {
    assert_eq!(
        vector_season_pda(&SEASON_ID).to_string(),
        "12vZafX2HFmqzzam9cq3Znv1vnP19sPxfxF8VQC821Lj"
    );
}

fn schedule(opens: i64) -> Vec<EventWindow> {
    vec![EventWindow {
        opens,
        deadline: opens + 1,
        resolution: opens + 2,
    }]
}

fn initialize_season_ix(
    authority: Pubkey,
    season_id: [u8; 32],
    windows: Vec<EventWindow>,
) -> Instruction {
    let season = season_pda(&season_id);
    let accounts = rituals::accounts::InitializeSeason {
        protocol_config: config_pda(),
        season,
        authority,
        system_program: system_program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::InitializeSeason {
            season_id,
            title_digest: TITLE_DIGEST,
            schedule: windows.clone(),
            start_at: windows
                .first()
                .map(|window| window.opens.saturating_sub(1))
                .unwrap_or(0),
            end_at: windows
                .last()
                .map(|window| window.resolution.saturating_add(1))
                .unwrap_or(1),
        }
        .data(),
    }
}

fn create_solo_ix_with_season(
    creator: Pubkey,
    nonce: u64,
    season_id: Option<[u8; 32]>,
    schedule: Vec<EventWindow>,
    witness: Option<Pubkey>,
) -> Instruction {
    let ritual = ritual_pda(&creator, nonce);
    let accounts = rituals::accounts::CreateSoloRitual {
        protocol_config: config_pda(),
        ritual,
        creator,
        stake_mint: MINT,
        fee_recipient_token: RECIPIENT,
        forfeit_destination: SECOND_RECIPIENT,
        season: season_id.map(|id| season_pda(&id)),
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
            member_total_stake: 100,
            schedule,
            witness,
        }
        .data(),
    }
}

fn activate_ix_with_season(
    creator: Pubkey,
    nonce: u64,
    season_id: Option<[u8; 32]>,
) -> Instruction {
    let ritual = ritual_pda(&creator, nonce);
    let accounts = rituals::accounts::ActivateRitual {
        protocol_config: config_pda(),
        ritual,
        season: season_id.map(|id| season_pda(&id)),
        stake_mint: MINT,
        stake_vault: vault_pda(b"stake-vault", &ritual),
        fee_vault: vault_pda(b"fee-vault", &ritual),
        fee_recipient_token: RECIPIENT,
        token_program: spl_token::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::ActivateRitual {}.data(),
    }
}

fn claim_completion_ix_with_season(
    ritual: Pubkey,
    claimant: Pubkey,
    season_id: Option<[u8; 32]>,
) -> Instruction {
    let event = event_pda(&ritual, 0);
    let accounts = rituals::accounts::ClaimCompletion {
        ritual,
        event,
        claim: claim_pda(&event, &claimant, 0),
        claimant,
        season: season_id.map(|id| season_pda(&id)),
        system_program: system_program::ID,
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::ClaimCompletion {
            event_index: 0,
            claim_version: 0,
        }
        .data(),
    }
}

fn approve_claim_ix_with_season(
    ritual: Pubkey,
    claimant: Pubkey,
    approver: Pubkey,
    season_id: [u8; 32],
) -> Instruction {
    let event = event_pda(&ritual, 0);
    let claim = claim_pda(&event, &claimant, 0);
    let accounts = rituals::accounts::ApproveClaim {
        ritual,
        event,
        claim,
        approver,
        season: Some(season_pda(&season_id)),
    };
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts.to_account_metas(None),
        data: rituals::instruction::ApproveClaim { claim_version: 0 }.data(),
    }
}

#[tokio::test]
async fn season_initialization_requires_protocol_authority() {
    let creator = Keypair::new();
    let mut context = start_with_member_set(&[&creator], &[300]).await;
    submit(
        &mut context,
        vec![initialize_ix(creator.pubkey())],
        &[&creator],
    )
    .await
    .unwrap();
    let creator_pubkey = context.payer.pubkey();
    let result = submit(
        &mut context,
        vec![initialize_season_ix(creator_pubkey, SEASON_ID, schedule(1))],
        &[],
    )
    .await;
    assert!(result.is_err());
}

#[tokio::test]
async fn solo_create_with_season_does_not_increment_participant_count() {
    let creator = Keypair::new();
    let mut context = start_with_member_set(&[&creator], &[300]).await;
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let windows = schedule(now + 100);
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            initialize_season_ix(creator.pubkey(), SEASON_ID, windows.clone()),
            create_solo_ix_with_season(creator.pubkey(), 9201, Some(SEASON_ID), windows, None),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let season = get_account(&mut context, season_pda(&SEASON_ID)).await;
    let state = deserialize_season(&season.data);
    assert_eq!(state.participant_count, 0);
}

#[tokio::test]
async fn solo_create_rejects_season_schedule_mismatch() {
    let creator = Keypair::new();
    let mut context = start_with_member_set(&[&creator], &[300]).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            initialize_season_ix(creator.pubkey(), SEASON_ID, schedule(100)),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let result = submit(
        &mut context,
        vec![create_solo_ix_with_season(
            creator.pubkey(),
            9202,
            Some(SEASON_ID),
            schedule(200),
            None,
        )],
        &[&creator],
    )
    .await;
    assert_error(result, 6072);
}

#[tokio::test]
async fn season_participant_count_increments_on_activation() {
    let creator = Keypair::new();
    let mut context = start_with_member_set(&[&creator], &[300]).await;
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let windows = schedule(now + 100);
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            initialize_season_ix(creator.pubkey(), SEASON_ID, windows.clone()),
            create_solo_ix_with_season(creator.pubkey(), 9207, Some(SEASON_ID), windows, None),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize_season(&get_account(&mut context, season_pda(&SEASON_ID)).await.data)
            .participant_count,
        0
    );
    submit(
        &mut context,
        vec![fund_ix(
            creator.pubkey(),
            9207,
            creator.pubkey(),
            source_for_member(0),
        )],
        &[&creator],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![activate_ix_with_season(creator.pubkey(), 9207, Some(SEASON_ID))],
        &[],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize_season(&get_account(&mut context, season_pda(&SEASON_ID)).await.data)
            .participant_count,
        1
    );
}

#[tokio::test]
async fn season_activation_requires_the_matching_optional_account() {
    for (nonce, activation_season) in [(9208, None), (9209, Some(OTHER_SEASON_ID))] {
        let creator = Keypair::new();
        let mut context = start_with_member_set(&[&creator], &[300]).await;
        let now = context
            .banks_client
            .get_sysvar::<solana_sdk::clock::Clock>()
            .await
            .unwrap()
            .unix_timestamp;
        let windows = schedule(now + 100);
        submit(
            &mut context,
            vec![
                initialize_ix(creator.pubkey()),
                initialize_season_ix(creator.pubkey(), SEASON_ID, windows.clone()),
                initialize_season_ix(creator.pubkey(), OTHER_SEASON_ID, windows.clone()),
                create_solo_ix_with_season(
                    creator.pubkey(),
                    nonce,
                    Some(SEASON_ID),
                    windows,
                    None,
                ),
                fund_ix(
                    creator.pubkey(),
                    nonce,
                    creator.pubkey(),
                    source_for_member(0),
                ),
            ],
            &[&creator],
        )
        .await
        .unwrap();
        let result = submit(
            &mut context,
            vec![activate_ix_with_season(
                creator.pubkey(),
                nonce,
                activation_season,
            )],
            &[],
        )
        .await;
        assert!(result.is_err());
        assert_eq!(
            deserialize_season(&get_account(&mut context, season_pda(&SEASON_ID)).await.data)
                .participant_count,
            0
        );
    }
}

#[tokio::test]
async fn cancelling_an_unactivated_season_ritual_does_not_increment_participant_count() {
    let creator = Keypair::new();
    let mut context = start_with_member_set(&[&creator], &[300]).await;
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let windows = schedule(now + 100);
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            initialize_season_ix(creator.pubkey(), SEASON_ID, windows.clone()),
            create_solo_ix_with_season(creator.pubkey(), 9210, Some(SEASON_ID), windows, None),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![cancel_ix(
            creator.pubkey(),
            9210,
            creator.pubkey(),
            &[source_for_member(0)],
        )],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize_season(&get_account(&mut context, season_pda(&SEASON_ID)).await.data)
            .participant_count,
        0
    );
}

#[tokio::test]
async fn solo_season_create_fund_activate_succeeds_in_one_transaction() {
    let creator = Keypair::new();
    let mut context = start_with_member_set(&[&creator], &[300]).await;
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let windows = schedule(now + 100);
    let nonce = 9211;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            initialize_season_ix(creator.pubkey(), SEASON_ID, windows.clone()),
            create_solo_ix_with_season(creator.pubkey(), nonce, Some(SEASON_ID), windows, None),
            fund_ix(
                creator.pubkey(),
                nonce,
                creator.pubkey(),
                source_for_member(0),
            ),
            activate_ix_with_season(creator.pubkey(), nonce, Some(SEASON_ID)),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize(&get_account(&mut context, ritual_pda(&creator.pubkey(), nonce)).await.data)
            .status,
        RitualStatus::Active
    );
    assert_eq!(
        deserialize_season(&get_account(&mut context, season_pda(&SEASON_ID)).await.data)
            .participant_count,
        1
    );
}

async fn active_season_fixture(
    witness: Option<&Keypair>,
    nonce: u64,
) -> (ProgramTestContext, Keypair, Pubkey, Pubkey) {
    let creator = Keypair::new();
    let mut context = start_with_member_set(&[&creator], &[300]).await;
    let witness_pubkey = witness.map(|value| value.pubkey());
    if let Some(witness) = witness {
        context.set_account(
            &witness.pubkey(),
            &AccountSharedData::from(Account {
                lamports: 10_000_000_000,
                data: vec![],
                owner: system_program::ID,
                executable: false,
                rent_epoch: 0,
            }),
        );
    }
    let now = context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let windows = schedule(now + 100);
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            initialize_season_ix(creator.pubkey(), SEASON_ID, windows.clone()),
            create_solo_ix_with_season(
                creator.pubkey(),
                nonce,
                Some(SEASON_ID),
                windows,
                witness_pubkey,
            ),
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
            creator.pubkey(),
            source_for_member(0),
        )],
        &[&creator],
    )
    .await
    .unwrap();
    submit(
        &mut context,
        vec![activate_ix_with_season(
            creator.pubkey(),
            nonce,
            Some(SEASON_ID),
        )],
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
    replace_ritual(&mut context, ritual, |value| {
        value.schedule[0] = EventWindow {
            opens: now - 100,
            deadline: now + 100,
            resolution: now + 200,
        }
    })
    .await;
    replace_season(&mut context, season_pda(&SEASON_ID), |season| {
        season.schedule[0] = EventWindow {
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
    (context, creator, ritual, event_pda(&ritual, 0))
}

#[tokio::test]
async fn honor_confirmation_increments_once_and_replay_does_not_double_count() {
    let (mut context, creator, ritual, event) = active_season_fixture(None, 9203).await;
    submit(
        &mut context,
        vec![claim_completion_ix_with_season(
            ritual,
            creator.pubkey(),
            Some(SEASON_ID),
        )],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize_season(&get_account(&mut context, season_pda(&SEASON_ID)).await.data)
            .checked_in_count[0],
        1
    );
    let replay = submit(
        &mut context,
        vec![claim_completion_ix_with_season(
            ritual,
            creator.pubkey(),
            Some(SEASON_ID),
        )],
        &[&creator],
    )
    .await;
    assert!(replay.is_err());
    assert_eq!(
        deserialize_season(&get_account(&mut context, season_pda(&SEASON_ID)).await.data)
            .checked_in_count[0],
        1
    );
    let _ = event;
}

#[tokio::test]
async fn witness_confirmation_increments_only_on_approval() {
    let witness = Keypair::new();
    let (mut context, creator, ritual, _) = active_season_fixture(Some(&witness), 9204).await;
    submit(
        &mut context,
        vec![claim_completion_ix_with_season(
            ritual,
            creator.pubkey(),
            Some(SEASON_ID),
        )],
        &[&creator],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize_season(&get_account(&mut context, season_pda(&SEASON_ID)).await.data)
            .checked_in_count[0],
        0
    );
    submit(
        &mut context,
        vec![approve_claim_ix_with_season(
            ritual,
            creator.pubkey(),
            witness.pubkey(),
            SEASON_ID,
        )],
        &[&witness],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize_season(&get_account(&mut context, season_pda(&SEASON_ID)).await.data)
            .checked_in_count[0],
        1
    );
}

#[tokio::test]
async fn non_season_solo_and_group_rituals_have_no_season_counter() {
    let creator = Keypair::new();
    let mut context = start_with_member_set(&[&creator], &[300]).await;
    submit(
        &mut context,
        vec![
            initialize_ix(creator.pubkey()),
            create_solo_ix_with_season(creator.pubkey(), 9205, None, schedule(100), None),
        ],
        &[&creator],
    )
    .await
    .unwrap();
    let solo = deserialize(
        &get_account(&mut context, ritual_pda(&creator.pubkey(), 9205))
            .await
            .data,
    );
    assert_eq!(solo.season, None);

    let other = Keypair::new();
    let mut group_context = setup_host(&creator, &other, 9206, 300, 300).await;
    let group = deserialize(
        &get_account(&mut group_context, ritual_pda(&creator.pubkey(), 9206))
            .await
            .data,
    );
    assert_eq!(group.season, None);
}
