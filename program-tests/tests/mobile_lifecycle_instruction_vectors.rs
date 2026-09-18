use anchor_lang::{prelude::Pubkey, InstructionData, ToAccountMetas};

/// Frozen cross-language vector identity.
///
/// These golden strings prove that the TypeScript client and the Rust program
/// encode identical instructions and derive identical PDAs. That equivalence
/// holds for ANY fixed program id, so the vectors deliberately pin their own
/// constant instead of tracking `rituals::ID`.
///
/// Keeping them decoupled means redeploying the program under a new address
/// does not invalidate hundreds of reviewed vectors. Do NOT change this value.
const VECTOR_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    117, 149, 230, 54, 107, 213, 43, 204, 240, 50, 45, 105, 246, 31, 246, 5,
    215, 74, 146, 204, 85, 199, 191, 123, 231, 253, 195, 215, 31, 14, 177, 70,
]);

fn key(byte: u8) -> Pubkey {
    Pubkey::new_from_array([byte; 32])
}

fn manifest(
    program_id: Pubkey,
    metas: &[anchor_lang::solana_program::instruction::AccountMeta],
    data: &[u8],
) -> String {
    let mut result = format!("program={};", program_id);
    for meta in metas {
        result.push_str(&format!(
            "{}:{}/{};",
            meta.pubkey,
            if meta.is_writable { "w" } else { "r" },
            if meta.is_signer { "s" } else { "n" },
        ));
    }
    result.push_str(&hex(data));
    result
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[test]
fn lifecycle_instruction_manifests_are_frozen() {
    let program_id = VECTOR_PROGRAM_ID;
    let creator = key(11);
    let nonce = 7u64;
    let mint = key(22);
    let recipient = key(24);
    let member = key(12);
    let source = key(32);
    let outsider = key(99);
    let destinations = [key(41), key(42), key(43)];
    let (protocol_config, _) = Pubkey::find_program_address(&[b"protocol-config"], &program_id);
    let (ritual, _) = Pubkey::find_program_address(
        &[b"ritual", creator.as_ref(), &nonce.to_le_bytes()],
        &program_id,
    );
    let (stake_vault, _) =
        Pubkey::find_program_address(&[b"stake-vault", ritual.as_ref()], &program_id);
    let (fee_vault, _) =
        Pubkey::find_program_address(&[b"fee-vault", ritual.as_ref()], &program_id);
    let system_program = anchor_lang::solana_program::system_program::ID;
    let token_program = anchor_spl::token::ID;

    let initialize = rituals::accounts::InitializeProtocolConfig {
        protocol_config,
        authority: creator,
        system_program,
    };
    let create = rituals::accounts::CreateRitual {
        protocol_config,
        ritual,
        creator,
        stake_mint: mint,
        fee_recipient_token: recipient,
        stake_vault,
        fee_vault,
        system_program,
        token_program,
    };
    let fund = rituals::accounts::FundMember {
        protocol_config,
        ritual,
        member,
        stake_mint: mint,
        member_source: source,
        stake_vault,
        fee_vault,
        token_program,
    };
    let activate = rituals::accounts::ActivateRitual {
        protocol_config,
        ritual,
        stake_mint: mint,
        stake_vault,
        fee_vault,
        fee_recipient_token: recipient,
        token_program,
    };
    let cancel = rituals::accounts::CancelUnactivated {
        ritual,
        caller: outsider,
        stake_mint: mint,
        stake_vault,
        fee_vault,
        token_program,
    };

    let actual = [
        manifest(
            program_id,
            &initialize.to_account_metas(None),
            &rituals::instruction::InitializeProtocolConfig {
                allowed_stake_mint: mint,
                fee_recipient: recipient,
                fee_basis_points: 250,
                minimum_fee: 11,
                maximum_fee: 999,
                maximum_member_stake: 1000,
            }
            .data(),
        ),
        manifest(
            program_id,
            &create.to_account_metas(None),
            &rituals::instruction::CreateRitual {
                nonce,
                rule_digest: [31; 32],
                members: vec![creator, member, key(13)],
                member_total_stake: 200,
                schedule: vec![
                    rituals::EventWindow {
                        opens: 100,
                        deadline: 200,
                        resolution: 300,
                    },
                    rituals::EventWindow {
                        opens: 400,
                        deadline: 500,
                        resolution: 600,
                    },
                ],
                additional_confirmation_threshold: 2,
                fee_payer_mode: rituals::FeePayerMode::Host,
            }
            .data(),
        ),
        manifest(
            program_id,
            &fund.to_account_metas(None),
            &rituals::instruction::FundMember {}.data(),
        ),
        manifest(
            program_id,
            &activate.to_account_metas(None),
            &rituals::instruction::ActivateRitual {}.data(),
        ),
        manifest(
            program_id,
            &cancel
                .to_account_metas(None)
                .into_iter()
                .chain(destinations.iter().map(|pubkey| {
                    anchor_lang::solana_program::instruction::AccountMeta::new(*pubkey, false)
                }))
                .collect::<Vec<_>>(),
            &rituals::instruction::CancelUnactivated {}.data(),
        ),
    ];
    let expected = [
        r#"program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;6m5qUBdZjKwsrx1jJpR84SnUVQq8hYUhsDLR8wr9sFri:w/n;k7FaK87WHGVXzkaoHb7CdVPgkKDQhZ29VLDeBVbDfYn:w/s;11111111111111111111111111111111:r/n;1c322be9f4627b7616161616161616161616161616161616161616161616161616161616161616161818181818181818181818181818181818181818181818181818181818181818fa000b00000000000000e703000000000000e803000000000000"#,
        r#"program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;6m5qUBdZjKwsrx1jJpR84SnUVQq8hYUhsDLR8wr9sFri:r/n;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;k7FaK87WHGVXzkaoHb7CdVPgkKDQhZ29VLDeBVbDfYn:w/s;2VDW9dFE1ZXz4zWAbaBDQFynNVdRpQ73HyfSHMzBSL6Z:r/n;2d46SEBFCA8SMB1BUAq3z1XJrp3qAXUgQnzkQ85Nvzjy:r/n;9sVTY4gFK7piEre3wE6scUtxqeqsYWXpnwQUbXVdDgFv:w/n;6DqHBBYAkcekni6GR3YBSzscQ75P2bCRGk3wsW7AngRY:w/n;11111111111111111111111111111111:r/n;TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA:r/n;613422ab19aa103a07000000000000001f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f030000000b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0dc800000000000000020000006400000000000000c8000000000000002c010000000000009001000000000000f40100000000000058020000000000000200"#,
        r#"program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;6m5qUBdZjKwsrx1jJpR84SnUVQq8hYUhsDLR8wr9sFri:r/n;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;p2Yicb86aZig616Eav2VWG9vuXR5mEqhtzshZYBxzsV:r/s;2VDW9dFE1ZXz4zWAbaBDQFynNVdRpQ73HyfSHMzBSL6Z:r/n;3AQTaduKvYWFTu1ExZSQK1hQp5jSZ2yEt4KzsASAufKd:w/n;9sVTY4gFK7piEre3wE6scUtxqeqsYWXpnwQUbXVdDgFv:w/n;6DqHBBYAkcekni6GR3YBSzscQ75P2bCRGk3wsW7AngRY:w/n;TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA:r/n;ea9ccffc9418a2ee"#,
        r#"program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;6m5qUBdZjKwsrx1jJpR84SnUVQq8hYUhsDLR8wr9sFri:r/n;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;2VDW9dFE1ZXz4zWAbaBDQFynNVdRpQ73HyfSHMzBSL6Z:r/n;9sVTY4gFK7piEre3wE6scUtxqeqsYWXpnwQUbXVdDgFv:w/n;6DqHBBYAkcekni6GR3YBSzscQ75P2bCRGk3wsW7AngRY:w/n;2d46SEBFCA8SMB1BUAq3z1XJrp3qAXUgQnzkQ85Nvzjy:w/n;TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA:r/n;bc6dc539757759fb"#,
        r#"program=8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB;394425MuGkpJqaXpVNa2MpouYrgK9NCPWP6tExSigTn9:w/n;7gyGAp71YXQRoxmFBaHxofQXAipvgHyBKPyxmdSJxyvz:r/s;2VDW9dFE1ZXz4zWAbaBDQFynNVdRpQ73HyfSHMzBSL6Z:r/n;9sVTY4gFK7piEre3wE6scUtxqeqsYWXpnwQUbXVdDgFv:w/n;6DqHBBYAkcekni6GR3YBSzscQ75P2bCRGk3wsW7AngRY:w/n;TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA:r/n;3mg7sM6RFEBHiiFotFNfvteH1WdFcc9cujKuPaqZdfDz:w/n;3qbR1eZRqXUWroWKKYhbDmR3FfqTHfqSU8zZSxtANzYh:w/n;3uWi9x2SRpmjztkpkr2WWeBoVq3exjXG2YfDWLvm8KsQ:w/n;add9e27172c7ef52"#,
    ];
    for (name, (actual, expected)) in ["initialize", "create", "fund", "activate", "cancel"]
        .into_iter()
        .zip(actual.into_iter().zip(expected))
    {
        assert_eq!(actual, expected, "{name}");
    }
}
