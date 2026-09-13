use anchor_lang::{AnchorSerialize, Discriminator};
use rituals::{CompletionClaim, ProtocolConfig, Ritual, RitualEvent};
use solana_sdk::pubkey::Pubkey;

const PROGRAM_ID: Pubkey = rituals::ID;

fn assert_pda(seeds: &[&[u8]], expected: &str, bump: u8) {
    let (address, actual_bump) = Pubkey::find_program_address(seeds, &PROGRAM_ID);
    assert_eq!(address.to_string(), expected);
    assert_eq!(actual_bump, bump);
}

#[test]
fn pda_vectors_are_independent_from_typescript() {
    let creator = Pubkey::new_from_array([1; 32]);
    let claimant = Pubkey::new_from_array([2; 32]);
    assert_pda(
        &[b"protocol-config"],
        "6m5qUBdZjKwsrx1jJpR84SnUVQq8hYUhsDLR8wr9sFri",
        255,
    );
    let nonce_zero = 0u64.to_le_bytes();
    let (ritual, bump) =
        Pubkey::find_program_address(&[b"ritual", creator.as_ref(), &nonce_zero], &PROGRAM_ID);
    assert_eq!(
        ritual.to_string(),
        "56qqYFSNL8DigDgJzzE69dACMkg8V6BM5soH2psZ31A"
    );
    assert_eq!(bump, 254);
    let nonce_seven = 7u64.to_le_bytes();
    let (ritual7, bump7) =
        Pubkey::find_program_address(&[b"ritual", creator.as_ref(), &nonce_seven], &PROGRAM_ID);
    assert_eq!(
        ritual7.to_string(),
        "7gBbsqQ6kDrezFt6tiLESXxfHtjdE42uHCHGdxLRDLvW"
    );
    assert_eq!(bump7, 255);
    assert_pda(
        &[b"stake-vault", ritual7.as_ref()],
        "EUfajH79J35Qf4MY1eCBFjnP3dSEeYnHKqGtVvHmE3Hh",
        253,
    );
    assert_pda(
        &[b"fee-vault", ritual7.as_ref()],
        "4NxDFE9RyjB8ubghexEGLiqK8DiQnGA9DPd911EyXBLs",
        252,
    );
    let (event, event_bump) =
        Pubkey::find_program_address(&[b"event", ritual7.as_ref(), &[1]], &PROGRAM_ID);
    assert_eq!(
        event.to_string(),
        "6NdFN2VzV61wi1bRYz6RATyjumBkhR7M6GfxtW47Nu7u"
    );
    assert_eq!(event_bump, 255);
    assert_pda(
        &[b"event", ritual7.as_ref(), &[15]],
        "H9PGU7zHkDskgyMk2oM6RUzT86pDGkjz7oT9G76Cj84w",
        255,
    );
    assert_pda(
        &[b"claim", event.as_ref(), claimant.as_ref(), &[0]],
        "3diycyyrPajbEtpf8dkCNuZsPqHaVWZH7TNswGdqr2TJ",
        253,
    );
}

#[test]
fn account_discriminators_are_the_frozen_anchor_bytes() {
    assert_eq!(
        ProtocolConfig::DISCRIMINATOR,
        &[207, 91, 250, 28, 152, 179, 215, 209]
    );
    assert_eq!(
        Ritual::DISCRIMINATOR,
        &[59, 144, 213, 109, 22, 234, 192, 75]
    );
    assert_eq!(
        RitualEvent::DISCRIMINATOR,
        &[20, 35, 155, 231, 156, 20, 94, 160]
    );
    assert_eq!(
        CompletionClaim::DISCRIMINATOR,
        &[233, 130, 153, 175, 66, 45, 112, 112]
    );
}

#[allow(dead_code)]
fn serialize<T: AnchorSerialize>(value: &T) -> Vec<u8> {
    let mut bytes = Vec::new();
    value
        .serialize(&mut bytes)
        .expect("serialization must succeed");
    bytes
}
