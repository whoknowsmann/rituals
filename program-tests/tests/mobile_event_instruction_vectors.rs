use anchor_lang::{prelude::Pubkey, InstructionData, ToAccountMetas};

fn key(byte: u8) -> Pubkey {
    Pubkey::new_from_array([byte; 32])
}
fn manifest(
    program_id: Pubkey,
    metas: &[anchor_lang::solana_program::instruction::AccountMeta],
    data: &[u8],
) -> String {
    let mut out = format!("program={};", program_id);
    for meta in metas {
        out.push_str(&format!(
            "{}:{}/{};",
            meta.pubkey,
            if meta.is_writable { "w" } else { "r" },
            if meta.is_signer { "s" } else { "n" }
        ));
    }
    out.push_str(&data.iter().map(|b| format!("{b:02x}")).collect::<String>());
    out
}

#[test]
fn event_instruction_manifests_are_frozen() {
    let program_id = rituals::ID;
    let creator = key(11);
    let payer = key(11);
    let claimant = key(12);
    let approver = key(13);
    let mint = key(22);
    let (ritual, _) = Pubkey::find_program_address(
        &[b"ritual", creator.as_ref(), &7u64.to_le_bytes()],
        &program_id,
    );
    let (event, _) = Pubkey::find_program_address(&[b"event", ritual.as_ref(), &[0]], &program_id);
    let (claim, _) = Pubkey::find_program_address(
        &[b"claim", event.as_ref(), claimant.as_ref(), &[0]],
        &program_id,
    );
    let (stake_vault, _) =
        Pubkey::find_program_address(&[b"stake-vault", ritual.as_ref()], &program_id);
    let system_program = anchor_lang::solana_program::system_program::ID;
    let token_program = anchor_spl::token::ID;
    let init = rituals::accounts::InitializeCurrentEvent {
        ritual,
        event,
        payer,
        system_program,
    };
    let claim_ix = rituals::accounts::ClaimCompletion {
        ritual,
        event,
        claim,
        claimant,
        system_program,
    };
    let approve = rituals::accounts::ApproveClaim {
        ritual,
        event,
        claim,
        approver,
    };
    let question = rituals::accounts::QuestionClaim {
        ritual,
        event,
        claim,
        questioner: key(13),
    };
    let finalize = rituals::accounts::FinalizeEvent {
        ritual,
        event,
        stake_mint: mint,
        stake_vault,
        token_program,
    };
    let close = rituals::accounts::CloseTerminalVaults {
        ritual,
        stake_vault,
        fee_vault: Pubkey::find_program_address(&[b"fee-vault", ritual.as_ref()], &program_id).0,
        creator_rent_destination: creator,
        token_program,
    };
    let actual = [
        manifest(
            program_id,
            &init.to_account_metas(None),
            &rituals::instruction::InitializeCurrentEvent { event_index: 0 }.data(),
        ),
        manifest(
            program_id,
            &claim_ix.to_account_metas(None),
            &rituals::instruction::ClaimCompletion {
                event_index: 0,
                claim_version: 0,
            }
            .data(),
        ),
        manifest(
            program_id,
            &approve.to_account_metas(None),
            &rituals::instruction::ApproveClaim { claim_version: 0 }.data(),
        ),
        manifest(
            program_id,
            &question.to_account_metas(None),
            &rituals::instruction::QuestionClaim { claim_version: 0 }.data(),
        ),
        manifest(
            program_id,
            &finalize
                .to_account_metas(None)
                .into_iter()
                .chain([key(41), key(42), key(43)].into_iter().map(|pubkey| {
                    anchor_lang::solana_program::instruction::AccountMeta::new(pubkey, false)
                }))
                .collect::<Vec<_>>(),
            &rituals::instruction::FinalizeEvent { event_index: 0 }.data(),
        ),
        manifest(
            program_id,
            &close.to_account_metas(None),
            &rituals::instruction::CloseTerminalVaults {}.data(),
        ),
    ];
    let expected = [
        "program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;Fh4bNphB4uxFYJpA3UTmWtJKqYmFVub5RbrqDZczoLaY:w/n;k7FaK87WHGVXzkaoHb7CdVPgkKDQhZ29VLDeBVbDfYn:w/s;11111111111111111111111111111111:r/n;3138bc0b0b0efd8f00",
        "program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;Fh4bNphB4uxFYJpA3UTmWtJKqYmFVub5RbrqDZczoLaY:w/n;6AcMTbYaS2abPh8orVbkxD88nCYvCYhQV5WiPifgPKaN:w/n;p2Yicb86aZig616Eav2VWG9vuXR5mEqhtzshZYBxzsV:w/s;11111111111111111111111111111111:r/n;59095345b0037a240000",
        "program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;Fh4bNphB4uxFYJpA3UTmWtJKqYmFVub5RbrqDZczoLaY:w/n;6AcMTbYaS2abPh8orVbkxD88nCYvCYhQV5WiPifgPKaN:w/n;swqrv48gsrwpBFbftEwnP2vB4jckpvfGJfXkwaniLCC:r/s;4ae4d33f8cff45d200",
        "program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;Fh4bNphB4uxFYJpA3UTmWtJKqYmFVub5RbrqDZczoLaY:w/n;6AcMTbYaS2abPh8orVbkxD88nCYvCYhQV5WiPifgPKaN:w/n;swqrv48gsrwpBFbftEwnP2vB4jckpvfGJfXkwaniLCC:r/s;3229d6a8f52dfb9800",
        "program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;Fh4bNphB4uxFYJpA3UTmWtJKqYmFVub5RbrqDZczoLaY:w/n;2VDW9dFE1ZXz4zWAbaBDQFynNVdRpQ73HyfSHMzBSL6Z:r/n;9sVTY4gFK7piEre3wE6scUtxqeqsYWXpnwQUbXVdDgFv:w/n;TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA:r/n;3mg7sM6RFEBHiiFotFNfvteH1WdFcc9cujKuPaqZdfDz:w/n;3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh:w/n;3uWi9x2SRpmjztkpkr2WWeBoVq3exjXG2YfDWLvm8KsQ:w/n;58f67b696494aaec00",
        "program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;9sVTY4gFK7piEre3wE6scUtxqeqsYWXpnwQUbXVdDgFv:w/n;6DqHBBYAkcekni6GR3YBSzscQ75P2bCRGk3wsW7AngRY:w/n;k7FaK87WHGVXzkaoHb7CdVPgkKDQhZ29VLDeBVbDfYn:w/n;TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA:r/n;e50aa451c77bdb15",
    ];
    for (i, value) in actual.iter().enumerate() {
        assert_eq!(value, expected[i], "vector {i}");
    }
}
