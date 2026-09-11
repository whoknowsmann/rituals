use anchor_lang::prelude::*;

declare_id!("8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB");

pub mod state {
    pub use super::ProtocolConfig;
}

#[program]
pub mod rituals {
    use super::*;

    pub fn initialize_protocol_config(
        ctx: Context<InitializeProtocolConfig>,
        allowed_stake_mint: Pubkey,
        fee_recipient: Pubkey,
        fee_basis_points: u16,
        minimum_fee: u64,
        maximum_fee: u64,
    ) -> Result<()> {
        require!((1..=10_000).contains(&fee_basis_points), RitualsError::InvalidFeeBasisPoints);
        require!(minimum_fee > 0, RitualsError::InvalidMinimumFee);
        require!(maximum_fee > 0, RitualsError::InvalidMaximumFee);
        require!(minimum_fee <= maximum_fee, RitualsError::FeeBoundsReversed);

        let config = &mut ctx.accounts.protocol_config;
        config.schema_version = 1;
        config.authority = ctx.accounts.authority.key();
        config.allowed_stake_mint = allowed_stake_mint;
        config.fee_recipient = fee_recipient;
        config.fee_basis_points = fee_basis_points;
        config.minimum_fee = minimum_fee;
        config.maximum_fee = maximum_fee;
        config.max_members = 6;
        config.max_events = 16;
        config.paused = false;
        config.bump = ctx.bumps.protocol_config;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeProtocolConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [b"protocol-config"],
        bump,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub schema_version: u8,
    pub authority: Pubkey,
    pub allowed_stake_mint: Pubkey,
    pub fee_recipient: Pubkey,
    pub fee_basis_points: u16,
    pub minimum_fee: u64,
    pub maximum_fee: u64,
    pub max_members: u8,
    pub max_events: u8,
    pub paused: bool,
    pub bump: u8,
}

#[error_code]
pub enum RitualsError {
    #[msg("fee basis points must be between 1 and 10,000")]
    InvalidFeeBasisPoints,
    #[msg("minimum fee must be positive")]
    InvalidMinimumFee,
    #[msg("maximum fee must be positive")]
    InvalidMaximumFee,
    #[msg("minimum fee must not exceed maximum fee")]
    FeeBoundsReversed,
}
