mod support;
use support::*;

struct ApprovalFixture {
    context: ProgramTestContext,
    members: Vec<Keypair>,
    ritual: Pubkey,
    event: Pubkey,
    claim: Pubkey,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AttestationSnapshot {
    ritual: Account,
    event: Account,
    claim: Account,
    stake_vault: Account,
    fee_vault: Account,
    recipient: Account,
    signers: Vec<(Pubkey, Account)>,
}

impl ApprovalFixture {
    async fn snapshot(&mut self) -> AttestationSnapshot {
        let mut signers = Vec::new();
        for member in &self.members {
            signers.push((
                member.pubkey(),
                get_account(&mut self.context, member.pubkey()).await,
            ));
        }
        AttestationSnapshot {
            ritual: get_account(&mut self.context, self.ritual).await,
            event: get_account(&mut self.context, self.event).await,
            claim: get_account(&mut self.context, self.claim).await,
            stake_vault: get_account(&mut self.context, vault_pda(b"stake-vault", &self.ritual))
                .await,
            fee_vault: get_account(&mut self.context, vault_pda(b"fee-vault", &self.ritual)).await,
            recipient: get_account(&mut self.context, RECIPIENT).await,
            signers,
        }
    }
}

async fn fixture(member_count: usize, threshold: u8, nonce: u64) -> ApprovalFixture {
    let members: Vec<Keypair> = (0..member_count).map(|_| Keypair::new()).collect();
    let member_refs: Vec<&Keypair> = members.iter().collect();
    let mut c = start_with_member_set(&member_refs, &vec![300; member_count]).await;
    let creator = members[0].pubkey();
    submit(
        &mut c,
        vec![
            initialize_ix(creator),
            create_ix_with_members(
                creator,
                members.iter().map(Keypair::pubkey).collect(),
                nonce,
                threshold,
            ),
        ],
        &[&members[0]],
    )
    .await
    .unwrap();
    let ritual = ritual_pda(&creator, nonce);
    let now = c
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    replace_ritual(&mut c, ritual, |r| {
        r.schedule[0] = EventWindow {
            opens: now + 100,
            deadline: now + 200,
            resolution: now + 300,
        }
    })
    .await;
    for (index, member) in members.iter().enumerate() {
        submit(
            &mut c,
            vec![fund_ix(
                creator,
                nonce,
                member.pubkey(),
                source_for_member(index),
            )],
            &[member],
        )
        .await
        .unwrap();
    }
    submit(&mut c, vec![activate_ix_default(creator, nonce)], &[])
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
        }
    })
    .await;
    submit(
        &mut c,
        vec![initialize_event_ix(ritual, creator, 0)],
        &[&members[0]],
    )
    .await
    .unwrap();
    let event = event_pda(&ritual, 0);
    let claim = claim_pda(&event, &creator, 0);
    submit(
        &mut c,
        vec![claim_completion_ix(ritual, creator, 0, 0)],
        &[&members[0]],
    )
    .await
    .unwrap();
    ApprovalFixture {
        context: c,
        members,
        ritual,
        event,
        claim,
    }
}

async fn assert_unchanged_error(
    fixture: &mut ApprovalFixture,
    approver_index: Option<usize>,
    code: u32,
) {
    let approver = approver_index
        .map(|i| fixture.members[i].pubkey())
        .unwrap_or_else(Pubkey::new_unique);
    let before = fixture.snapshot().await;
    let result = if let Some(index) = approver_index {
        submit(
            &mut fixture.context,
            vec![approve_claim_ix(
                fixture.ritual,
                fixture.members[0].pubkey(),
                approver,
                0,
            )],
            &[&fixture.members[index]],
        )
        .await
    } else {
        submit(
            &mut fixture.context,
            vec![approve_claim_ix(
                fixture.ritual,
                fixture.members[0].pubkey(),
                approver,
                0,
            )],
            &[],
        )
        .await
    };
    assert_error(result, code);
    assert_eq!(before, fixture.snapshot().await);
}

#[tokio::test]
async fn one_friend_approval_confirms_exactly_at_threshold() {
    let mut f = fixture(2, 1, 2301).await;
    let before_ritual = get_account(&mut f.context, f.ritual).await;
    let before_stake = get_account(&mut f.context, vault_pda(b"stake-vault", &f.ritual)).await;
    let before_fee = get_account(&mut f.context, vault_pda(b"fee-vault", &f.ritual)).await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let claim = deserialize_claim(&get_account(&mut f.context, f.claim).await.data);
    let event = deserialize_event(&get_account(&mut f.context, f.event).await.data);
    assert_eq!(claim.status, ClaimStatus::Confirmed);
    assert_eq!((claim.approval_count, claim.approvals_bitmap), (1, 2));
    assert_eq!(event.confirmed_members_bitmap, 1);
    assert_eq!(before_ritual, get_account(&mut f.context, f.ritual).await);
    assert_eq!(
        before_stake,
        get_account(&mut f.context, vault_pda(b"stake-vault", &f.ritual)).await
    );
    assert_eq!(
        before_fee,
        get_account(&mut f.context, vault_pda(b"fee-vault", &f.ritual)).await
    );
}

#[tokio::test]
async fn n4_majority_confirms_only_on_second_different_member_in_shuffled_order() {
    let mut f = fixture(4, 2, 2302).await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[3].pubkey(),
            0,
        )],
        &[&f.members[3]],
    )
    .await
    .unwrap();
    let pending = deserialize_claim(&get_account(&mut f.context, f.claim).await.data);
    assert_eq!(
        (
            pending.status,
            pending.approval_count,
            pending.approvals_bitmap
        ),
        (ClaimStatus::Pending, 1, 8)
    );
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let claim = deserialize_claim(&get_account(&mut f.context, f.claim).await.data);
    let event = deserialize_event(&get_account(&mut f.context, f.event).await.data);
    assert_eq!(
        (claim.status, claim.approval_count, claim.approvals_bitmap),
        (ClaimStatus::Confirmed, 2, 10)
    );
    assert_eq!(event.confirmed_members_bitmap, 1);
}

#[tokio::test]
async fn n4_unanimous_requires_all_three_other_members() {
    let mut f = fixture(4, 3, 2303).await;
    for index in [1usize, 3] {
        submit(
            &mut f.context,
            vec![approve_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                f.members[index].pubkey(),
                0,
            )],
            &[&f.members[index]],
        )
        .await
        .unwrap();
    }
    let pending = deserialize_claim(&get_account(&mut f.context, f.claim).await.data);
    assert_eq!(
        (
            pending.status,
            pending.approval_count,
            pending.approvals_bitmap
        ),
        (ClaimStatus::Pending, 2, 10)
    );
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[2].pubkey(),
            0,
        )],
        &[&f.members[2]],
    )
    .await
    .unwrap();
    let claim = deserialize_claim(&get_account(&mut f.context, f.claim).await.data);
    assert_eq!(
        (claim.status, claim.approval_count, claim.approvals_bitmap),
        (ClaimStatus::Confirmed, 3, 14)
    );
}

#[tokio::test]
async fn duplicate_approval_before_threshold_is_rejected_without_mutation() {
    let mut f = fixture(4, 3, 2304).await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    assert_unchanged_error(&mut f, Some(1), 6049).await;
}

#[tokio::test]
async fn self_approval_is_rejected_without_mutation() {
    let mut f = fixture(4, 2, 2305).await;
    assert_unchanged_error(&mut f, Some(0), 6048).await;
}

#[tokio::test]
async fn nonmember_approval_is_rejected_without_mutation() {
    let mut f = fixture(4, 2, 2306).await;
    let outsider = Keypair::new();
    let before = f.snapshot().await;
    assert_error(
        submit(
            &mut f.context,
            vec![approve_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                outsider.pubkey(),
                0,
            )],
            &[&outsider],
        )
        .await,
        6047,
    );
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn unsigned_approval_is_rejected_without_mutation() {
    let mut f = fixture(4, 2, 2307).await;
    let before = f.snapshot().await;
    let mut ix = approve_claim_ix(f.ritual, f.members[0].pubkey(), f.members[1].pubkey(), 0);
    ix.accounts
        .iter_mut()
        .find(|meta| meta.pubkey == f.members[1].pubkey())
        .unwrap()
        .is_signer = false;
    assert_error(submit(&mut f.context, vec![ix], &[]).await, 3010);
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn corrupted_nonfunded_active_state_is_not_reported_as_nonmember() {
    let mut f = fixture(4, 2, 2308).await;
    replace_ritual(&mut f.context, f.ritual, |r| {
        r.funded_members_bitmap &= !(1 << 1)
    })
    .await;
    assert_unchanged_error(&mut f, Some(1), 6045).await;
}

#[tokio::test]
async fn confirmed_claim_is_honored_as_6046() {
    let mut f = fixture(2, 1, 2309).await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    assert_unchanged_error(&mut f, Some(1), 6046).await;
}

#[tokio::test]
async fn confirmed_replay_and_extra_approver_are_rejected_as_6046() {
    let mut f = fixture(4, 2, 2310).await;
    for i in [1usize, 2] {
        submit(
            &mut f.context,
            vec![approve_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                f.members[i].pubkey(),
                0,
            )],
            &[&f.members[i]],
        )
        .await
        .unwrap();
    }
    assert_unchanged_error(&mut f, Some(3), 6046).await;
}

#[tokio::test]
async fn approval_after_claim_deadline_before_resolution_succeeds_and_resolves_event() {
    let mut f = fixture(2, 1, 2311).await;
    let now = f
        .context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let window = EventWindow {
        opens: now - 3,
        deadline: now - 1,
        resolution: now + 100,
    };
    replace_ritual(&mut f.context, f.ritual, |r| r.schedule[0] = window.clone()).await;
    replace_event(&mut f.context, f.event, |e| e.window = window.clone()).await;
    replace_claim(&mut f.context, f.claim, |claim| claim.claimed_at = now - 2).await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize_event(&get_account(&mut f.context, f.event).await.data).status,
        EventStatus::Resolving
    );
}

#[tokio::test]
async fn approval_at_resolution_succeeds_but_after_resolution_is_rejected() {
    let mut f = fixture(4, 2, 2312).await;
    let now = f
        .context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let window = EventWindow {
        opens: now - 3,
        deadline: now - 1,
        resolution: now,
    };
    replace_ritual(&mut f.context, f.ritual, |r| r.schedule[0] = window.clone()).await;
    replace_event(&mut f.context, f.event, |e| e.window = window.clone()).await;
    replace_claim(&mut f.context, f.claim, |claim| claim.claimed_at = now - 2).await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let now = f
        .context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let expired = EventWindow {
        opens: now - 12,
        deadline: now - 10,
        resolution: now - 1,
    };
    replace_ritual(&mut f.context, f.ritual, |r| {
        r.schedule[0] = expired.clone()
    })
    .await;
    replace_event(&mut f.context, f.event, |e| e.window = expired.clone()).await;
    replace_claim(&mut f.context, f.claim, |claim| claim.claimed_at = now - 11).await;
    assert_unchanged_error(&mut f, Some(2), 6050).await;
}

#[tokio::test]
async fn claim_version_one_and_cross_account_substitution_reject_without_mutation() {
    let mut f = fixture(4, 2, 2313).await;
    let before = f.snapshot().await;
    let result = submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            1,
        )],
        &[&f.members[1]],
    )
    .await;
    assert!(result.is_err());
    assert_eq!(before, f.snapshot().await);
    for ix in [
        approve_claim_ix_with_accounts(
            f.ritual,
            event_pda(&f.ritual, 1),
            f.claim,
            f.members[1].pubkey(),
            0,
        ),
        approve_claim_ix_with_accounts(
            Pubkey::new_unique(),
            f.event,
            f.claim,
            f.members[1].pubkey(),
            0,
        ),
        approve_claim_ix_with_accounts(
            f.ritual,
            f.event,
            claim_pda(&f.event, &f.members[0].pubkey(), 1),
            f.members[1].pubkey(),
            0,
        ),
    ] {
        assert!(submit(&mut f.context, vec![ix], &[&f.members[1]])
            .await
            .is_err());
        assert_eq!(before, f.snapshot().await);
    }
}

#[tokio::test]
async fn successful_approval_has_no_custody_accounts_and_preserves_external_balances() {
    let mut f = fixture(4, 2, 2314).await;
    let before = f.snapshot().await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let after = f.snapshot().await;
    assert_eq!(before.ritual, after.ritual);
    assert_eq!(before.stake_vault, after.stake_vault);
    assert_eq!(before.fee_vault, after.fee_vault);
    assert_eq!(before.recipient, after.recipient);
    assert_eq!(before.signers, after.signers);
}

#[tokio::test]
async fn question_preserves_approvals_and_enters_resolving() {
    let mut f = fixture(4, 2, 2315).await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let before_question = f.snapshot().await;
    assert_eq!(
        (
            deserialize_claim(&before_question.claim.data).approval_count,
            deserialize_claim(&before_question.claim.data).approvals_bitmap,
        ),
        (1, 2)
    );

    submit(
        &mut f.context,
        vec![question_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[2].pubkey(),
            0,
        )],
        &[&f.members[2]],
    )
    .await
    .unwrap();
    let after = f.snapshot().await;
    let claim = deserialize_claim(&after.claim.data);
    let event = deserialize_event(&after.event.data);
    assert_eq!(claim.status, ClaimStatus::Questioned);
    assert_eq!((claim.approval_count, claim.approvals_bitmap), (1, 2));
    assert_eq!(event.status, EventStatus::Resolving);
    assert_eq!(event.questioned_members_bitmap, 1);
    assert_eq!(event.confirmed_members_bitmap, 0);
    assert_eq!(before_question.ritual, after.ritual);
    assert_eq!(before_question.stake_vault, after.stake_vault);
    assert_eq!(before_question.fee_vault, after.fee_vault);
}

#[tokio::test]
async fn prior_approver_cannot_question_the_claim() {
    let mut f = fixture(4, 2, 2316).await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let before = f.snapshot().await;
    assert_error(
        submit(
            &mut f.context,
            vec![question_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                f.members[1].pubkey(),
                0,
            )],
            &[&f.members[1]],
        )
        .await,
        6052,
    );
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn question_pending_claim_with_no_approvals_is_valid() {
    let mut f = fixture(2, 1, 2317).await;
    let before = f.snapshot().await;
    submit(
        &mut f.context,
        vec![question_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let claim = deserialize_claim(&get_account(&mut f.context, f.claim).await.data);
    assert_eq!(
        (claim.status, claim.approval_count, claim.approvals_bitmap),
        (ClaimStatus::Questioned, 0, 0)
    );
    assert_eq!(before.ritual, get_account(&mut f.context, f.ritual).await);
}

#[tokio::test]
async fn self_question_is_rejected_without_mutation() {
    let mut f = fixture(4, 2, 2318).await;
    let before = f.snapshot().await;
    assert_error(
        submit(
            &mut f.context,
            vec![question_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                f.members[0].pubkey(),
                0,
            )],
            &[&f.members[0]],
        )
        .await,
        6048,
    );
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn nonmember_question_is_rejected_without_mutation() {
    let mut f = fixture(4, 2, 2319).await;
    let outsider = Keypair::new();
    let before = f.snapshot().await;
    assert_error(
        submit(
            &mut f.context,
            vec![question_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                outsider.pubkey(),
                0,
            )],
            &[&outsider],
        )
        .await,
        6047,
    );
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn unsigned_question_is_rejected_without_mutation() {
    let mut f = fixture(4, 2, 2320).await;
    let mut ix = question_claim_ix(f.ritual, f.members[0].pubkey(), f.members[1].pubkey(), 0);
    ix.accounts
        .iter_mut()
        .find(|meta| meta.pubkey == f.members[1].pubkey())
        .unwrap()
        .is_signer = false;
    let before = f.snapshot().await;
    assert_error(submit(&mut f.context, vec![ix], &[]).await, 3010);
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn question_replay_after_questioned_is_rejected_as_6046() {
    let mut f = fixture(4, 2, 2321).await;
    submit(
        &mut f.context,
        vec![question_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let before = f.snapshot().await;
    assert_error(
        submit(
            &mut f.context,
            vec![question_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                f.members[2].pubkey(),
                0,
            )],
            &[&f.members[2]],
        )
        .await,
        6046,
    );
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn approval_after_questioned_is_rejected_as_6046() {
    let mut f = fixture(4, 2, 2322).await;
    submit(
        &mut f.context,
        vec![question_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let before = f.snapshot().await;
    assert_error(
        submit(
            &mut f.context,
            vec![approve_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                f.members[2].pubkey(),
                0,
            )],
            &[&f.members[2]],
        )
        .await,
        6046,
    );
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn questioned_claim_is_honored_as_6046_for_both_actions() {
    let mut f = fixture(4, 2, 2323).await;
    submit(
        &mut f.context,
        vec![question_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    let before = f.snapshot().await;
    assert_error(
        submit(
            &mut f.context,
            vec![question_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                f.members[2].pubkey(),
                0,
            )],
            &[&f.members[2]],
        )
        .await,
        6046,
    );
    assert_eq!(before, f.snapshot().await);
    assert_error(
        submit(
            &mut f.context,
            vec![approve_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                f.members[3].pubkey(),
                0,
            )],
            &[&f.members[3]],
        )
        .await,
        6046,
    );
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn question_at_exact_resolution_succeeds() {
    let mut f = fixture(4, 2, 2324).await;
    let now = f
        .context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let window = EventWindow {
        opens: now - 3,
        deadline: now - 1,
        resolution: now,
    };
    replace_ritual(&mut f.context, f.ritual, |r| r.schedule[0] = window.clone()).await;
    replace_event(&mut f.context, f.event, |e| e.window = window.clone()).await;
    replace_claim(&mut f.context, f.claim, |claim| claim.claimed_at = now - 2).await;
    submit(
        &mut f.context,
        vec![question_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize_claim(&get_account(&mut f.context, f.claim).await.data).status,
        ClaimStatus::Questioned
    );
}

#[tokio::test]
async fn question_after_resolution_is_rejected_without_mutation() {
    let mut f = fixture(4, 2, 2325).await;
    let now = f
        .context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let window = EventWindow {
        opens: now - 4,
        deadline: now - 3,
        resolution: now - 1,
    };
    replace_ritual(&mut f.context, f.ritual, |r| r.schedule[0] = window.clone()).await;
    replace_event(&mut f.context, f.event, |e| e.window = window.clone()).await;
    replace_claim(&mut f.context, f.claim, |claim| claim.claimed_at = now - 3).await;
    let before = f.snapshot().await;
    assert_error(
        submit(
            &mut f.context,
            vec![question_claim_ix(
                f.ritual,
                f.members[0].pubkey(),
                f.members[1].pubkey(),
                0,
            )],
            &[&f.members[1]],
        )
        .await,
        6050,
    );
    assert_eq!(before, f.snapshot().await);
}

#[tokio::test]
async fn claim_corruption_table_is_rejected_and_unchanged() {
    let mutations: Vec<(&str, Box<dyn Fn(&mut CompletionClaim)>)> = vec![
        ("schema", Box::new(|c| c.schema_version = 2)),
        ("ritual", Box::new(|c| c.ritual = Pubkey::new_unique())),
        ("event", Box::new(|c| c.event = Pubkey::new_unique())),
        ("index", Box::new(|c| c.event_index = 1)),
        ("member", Box::new(|c| c.claimant = Pubkey::new_unique())),
        ("version", Box::new(|c| c.claim_version = 1)),
        (
            "threshold",
            Box::new(|c| c.required_additional_confirmations = 1),
        ),
        ("claimed_at", Box::new(|c| c.claimed_at -= 100)),
    ];
    for (offset, (_name, mutation)) in mutations.into_iter().enumerate() {
        let mut f = fixture(4, 2, 2326 + offset as u64).await;
        replace_claim(&mut f.context, f.claim, mutation).await;
        let before = f.snapshot().await;
        let expected = [6051, 6051, 6051, 6051, 2006, 6051, 6051, 6050][offset];
        assert_error(
            submit(
                &mut f.context,
                vec![approve_claim_ix(
                    f.ritual,
                    f.members[0].pubkey(),
                    f.members[1].pubkey(),
                    0,
                )],
                &[&f.members[1]],
            )
            .await,
            expected,
        );
        assert_eq!(before, f.snapshot().await);
    }
}

#[tokio::test]
async fn event_corruption_table_is_rejected_and_unchanged() {
    let mutations: Vec<(&str, Box<dyn Fn(&mut RitualEvent)>)> = vec![
        ("schema", Box::new(|e| e.schema_version = 2)),
        ("ritual", Box::new(|e| e.ritual = Pubkey::new_unique())),
        ("member", Box::new(|e| e.member_count = 2)),
        ("window", Box::new(|e| e.window.deadline += 1)),
        ("scheduled", Box::new(|e| e.status = EventStatus::Scheduled)),
        ("settled", Box::new(|e| e.status = EventStatus::Settled)),
        ("voided", Box::new(|e| e.status = EventStatus::Voided)),
        ("missing_claim", Box::new(|e| e.claimed_members_bitmap = 0)),
        (
            "overlap",
            Box::new(|e| {
                e.confirmed_members_bitmap = 1;
                e.questioned_members_bitmap = 1;
            }),
        ),
        (
            "out_of_range",
            Box::new(|e| e.claimed_members_bitmap = 0x80),
        ),
    ];
    for (offset, (_name, mutation)) in mutations.into_iter().enumerate() {
        let mut f = fixture(4, 2, 2335 + offset as u64).await;
        replace_event(&mut f.context, f.event, mutation).await;
        let before = f.snapshot().await;
        let expected = [6046, 6046, 6046, 6046, 6046, 6046, 6046, 6051, 6051, 6051][offset];
        assert_error(
            submit(
                &mut f.context,
                vec![approve_claim_ix(
                    f.ritual,
                    f.members[0].pubkey(),
                    f.members[1].pubkey(),
                    0,
                )],
                &[&f.members[1]],
            )
            .await,
            expected,
        );
        assert_eq!(before, f.snapshot().await);
    }
}

#[tokio::test]
async fn question_after_claim_deadline_before_resolution_succeeds_and_resolves_event() {
    let mut f = fixture(2, 1, 2346).await;
    let now = f
        .context
        .banks_client
        .get_sysvar::<solana_sdk::clock::Clock>()
        .await
        .unwrap()
        .unix_timestamp;
    let window = EventWindow {
        opens: now - 4,
        deadline: now - 2,
        resolution: now + 10,
    };
    replace_ritual(&mut f.context, f.ritual, |r| r.schedule[0] = window.clone()).await;
    replace_event(&mut f.context, f.event, |e| e.window = window.clone()).await;
    replace_claim(&mut f.context, f.claim, |claim| claim.claimed_at = now - 3).await;
    submit(
        &mut f.context,
        vec![question_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[1].pubkey(),
            0,
        )],
        &[&f.members[1]],
    )
    .await
    .unwrap();
    assert_eq!(
        deserialize_event(&get_account(&mut f.context, f.event).await.data).status,
        EventStatus::Resolving
    );
}

#[tokio::test]
async fn question_cross_ritual_event_claim_substitution_is_rejected_unchanged() {
    let mut f = fixture(4, 2, 2347).await;
    let before = f.snapshot().await;
    let substitutions = [
        question_claim_ix_with_accounts(
            f.ritual,
            event_pda(&f.ritual, 1),
            f.claim,
            f.members[1].pubkey(),
            0,
        ),
        question_claim_ix_with_accounts(
            Pubkey::new_unique(),
            f.event,
            f.claim,
            f.members[1].pubkey(),
            0,
        ),
        question_claim_ix_with_accounts(
            f.ritual,
            f.event,
            claim_pda(&f.event, &f.members[0].pubkey(), 1),
            f.members[1].pubkey(),
            0,
        ),
    ];
    for ix in substitutions {
        assert!(submit(&mut f.context, vec![ix], &[&f.members[1]])
            .await
            .is_err());
        assert_eq!(before, f.snapshot().await);
    }
}

#[tokio::test]
async fn sixth_member_approval_sets_the_high_boundary_bitmap_bit() {
    let mut f = fixture(6, 1, 2348).await;
    submit(
        &mut f.context,
        vec![approve_claim_ix(
            f.ritual,
            f.members[0].pubkey(),
            f.members[5].pubkey(),
            0,
        )],
        &[&f.members[5]],
    )
    .await
    .unwrap();
    let claim = deserialize_claim(&get_account(&mut f.context, f.claim).await.data);
    assert_eq!(
        (claim.status, claim.approval_count, claim.approvals_bitmap),
        (ClaimStatus::Confirmed, 1, 32)
    );
}

#[tokio::test]
async fn claim_status_invariant_corruption_is_rejected_without_mutation() {
    let mut pending = fixture(4, 2, 2349).await;
    replace_claim(&mut pending.context, pending.claim, |c| {
        c.approval_count = 2;
        c.approvals_bitmap = 3;
    })
    .await;
    assert_unchanged_error(&mut pending, Some(1), 6051).await;

    let mut confirmed = fixture(4, 2, 2350).await;
    replace_claim(&mut confirmed.context, confirmed.claim, |c| {
        c.status = ClaimStatus::Confirmed;
        c.approval_count = 3;
        c.approvals_bitmap = 7;
    })
    .await;
    replace_event(&mut confirmed.context, confirmed.event, |e| {
        e.confirmed_members_bitmap = 1
    })
    .await;
    let before_confirmed = confirmed.snapshot().await;
    assert_unchanged_error(&mut confirmed, Some(1), 6051).await;
    assert_eq!(before_confirmed, confirmed.snapshot().await);

    let mut questioned = fixture(4, 2, 2351).await;
    replace_claim(&mut questioned.context, questioned.claim, |c| {
        c.status = ClaimStatus::Questioned;
        c.approval_count = 2;
        c.approvals_bitmap = 3;
    })
    .await;
    replace_event(&mut questioned.context, questioned.event, |e| {
        e.questioned_members_bitmap = 1
    })
    .await;
    assert_unchanged_error(&mut questioned, Some(1), 6051).await;

    let mut honor = fixture(2, 0, 2352).await;
    replace_claim(&mut honor.context, honor.claim, |c| {
        c.status = ClaimStatus::Confirmed;
        c.approval_count = 1;
        c.approvals_bitmap = 2;
    })
    .await;
    replace_event(&mut honor.context, honor.event, |e| {
        e.confirmed_members_bitmap = 1
    })
    .await;
    assert_unchanged_error(&mut honor, Some(1), 6051).await;
}
