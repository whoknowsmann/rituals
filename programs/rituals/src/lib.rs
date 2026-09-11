use anchor_lang::prelude::*;

// Local-only placeholder identity; no deployed identity is implied.
declare_id!("8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB");

pub mod state {
    pub use super::{EventWindow, FeePayerMode, ProtocolConfig, Ritual, RitualStatus};
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
        maximum_member_stake: u64,
    ) -> Result<()> {
        require!((1..=10_000).contains(&fee_basis_points), RitualsError::InvalidFeeBasisPoints);
        require!(minimum_fee > 0, RitualsError::InvalidMinimumFee);
        require!(maximum_fee > 0, RitualsError::InvalidMaximumFee);
        require!(minimum_fee <= maximum_fee, RitualsError::FeeBoundsReversed);
        require!(maximum_member_stake > 0, RitualsError::InvalidMaximumMemberStake);

        let config = &mut ctx.accounts.protocol_config;
        config.schema_version = 1;
        config.authority = ctx.accounts.authority.key();
        config.allowed_stake_mint = allowed_stake_mint;
        config.fee_recipient = fee_recipient;
        config.fee_basis_points = fee_basis_points;
        config.minimum_fee = minimum_fee;
        config.maximum_fee = maximum_fee;
        config.maximum_member_stake = maximum_member_stake;
        config.max_members = 6;
        config.max_events = 16;
        config.paused = false;
        config.bump = ctx.bumps.protocol_config;
        Ok(())
    }

    pub fn create_ritual(
        ctx: Context<CreateRitual>,
        nonce: u64,
        rule_digest: [u8; 32],
        members: Vec<Pubkey>,
        member_total_stake: u64,
        schedule: Vec<EventWindow>,
        additional_confirmation_threshold: u8,
        fee_payer_mode: FeePayerMode,
    ) -> Result<()> {
        let config = &ctx.accounts.protocol_config;
        require!(!config.paused, RitualsError::ProtocolPaused);
        require!((2..=config.max_members as usize).contains(&members.len()), RitualsError::InvalidMemberCount);
        require!(members.iter().all(|member| members.iter().filter(|other| *other == member).count() == 1), RitualsError::DuplicateMember);
        require!(members.contains(&ctx.accounts.creator.key()), RitualsError::CreatorNotMember);
        require!(!rule_digest.iter().all(|byte| *byte == 0), RitualsError::ZeroRuleDigest);
        require!((1..=config.max_events as usize).contains(&schedule.len()), RitualsError::InvalidScheduleCount);
        for (index, window) in schedule.iter().enumerate() {
            require!(window.opens >= 0 && window.opens < window.deadline && window.deadline < window.resolution, RitualsError::InvalidEventWindow);
            if let Some(previous) = index.checked_sub(1).and_then(|i| schedule.get(i)) {
                require!(window.opens > previous.resolution, RitualsError::ScheduleNotChronological);
            }
        }
        require!(member_total_stake > 0 && member_total_stake <= config.maximum_member_stake, RitualsError::InvalidMemberStake);
        require!(additional_confirmation_threshold <= (members.len() - 1) as u8, RitualsError::InvalidConfirmationThreshold);
        let member_total_stake = member_total_stake.checked_add(0).ok_or(RitualsError::StakePoolOverflow)?;
        require!(member_total_stake % schedule.len() as u64 == 0, RitualsError::StakeNotDivisible);
        let per_event_allocation = member_total_stake / schedule.len() as u64;
        require!(per_event_allocation > 0, RitualsError::InvalidPerEventAllocation);
        let fee = ((member_total_stake as u128)
            .checked_mul(config.fee_basis_points as u128)
            .ok_or(RitualsError::FeeCalculationOverflow)? / 10_000)
            .min(u64::MAX as u128) as u64;
        let locked_activation_fee = fee.clamp(config.minimum_fee, config.maximum_fee);
        let clock = Clock::get()?;
        let ritual = &mut ctx.accounts.ritual;
        ritual.schema_version = 1;
        ritual.protocol_config = config.key();
        ritual.creator = ctx.accounts.creator.key();
        ritual.nonce = nonce;
        ritual.rule_digest = rule_digest;
        ritual.stake_mint = ctx.accounts.stake_mint.key();
        ritual.members = members;
        ritual.member_total_stake = member_total_stake;
        ritual.per_event_allocation = per_event_allocation;
        ritual.schedule = schedule;
        ritual.additional_confirmation_threshold = additional_confirmation_threshold;
        ritual.fee_payer_mode = fee_payer_mode;
        ritual.locked_activation_fee = locked_activation_fee;
        ritual.status = RitualStatus::Funding;
        ritual.current_event_index = 0;
        ritual.settled_event_count = 0;
        ritual.created_at = clock.unix_timestamp;
        ritual.activated_at = 0;
        ritual.bump = ctx.bumps.ritual;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeProtocolConfig<'info> {
    #[account(init, payer = authority, space = 8 + ProtocolConfig::INIT_SPACE, seeds = [b"protocol-config"], bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)] pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateRitual<'info> {
    #[account(seeds = [b"protocol-config"], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(init, payer = creator, space = 8 + Ritual::INIT_SPACE, seeds = [b"ritual", creator.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub ritual: Account<'info, Ritual>,
    #[account(mut)] pub creator: Signer<'info>,
    /// CHECK: Task12 will validate mint owner and decimals; address allowlisting is enforced here.
    #[account(address = protocol_config.allowed_stake_mint)]
    pub stake_mint: UncheckedAccount<'info>,
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
    pub maximum_member_stake: u64,
    pub max_members: u8,
    pub max_events: u8,
    pub paused: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub struct EventWindow {
    pub opens: i64,
    pub deadline: i64,
    pub resolution: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub enum FeePayerMode { Host, Split }

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub enum RitualStatus { Funding, Active, Completed, Cancelled }

#[account]
#[derive(InitSpace)]
pub struct Ritual {
    pub schema_version: u8,
    pub protocol_config: Pubkey,
    pub creator: Pubkey,
    pub nonce: u64,
    pub rule_digest: [u8; 32],
    pub stake_mint: Pubkey,
    #[max_len(6)] pub members: Vec<Pubkey>,
    pub member_total_stake: u64,
    pub per_event_allocation: u64,
    #[max_len(16)] pub schedule: Vec<EventWindow>,
    pub additional_confirmation_threshold: u8,
    pub fee_payer_mode: FeePayerMode,
    pub locked_activation_fee: u64,
    pub status: RitualStatus,
    pub current_event_index: u8,
    pub settled_event_count: u8,
    pub created_at: i64,
    pub activated_at: i64,
    pub bump: u8,
}

#[error_code]
pub enum RitualsError {
    #[msg("fee basis points must be between 1 and 10,000")] InvalidFeeBasisPoints,
    #[msg("minimum fee must be positive")] InvalidMinimumFee,
    #[msg("maximum fee must be positive")] InvalidMaximumFee,
    #[msg("minimum fee must not exceed maximum fee")] FeeBoundsReversed,
    #[msg("maximum member stake must be positive")] InvalidMaximumMemberStake,
    #[msg("protocol is paused")] ProtocolPaused,
    #[msg("member count must be between 2 and the configured maximum")] InvalidMemberCount,
    #[msg("members must be unique")] DuplicateMember,
    #[msg("creator must be a member")] CreatorNotMember,
    #[msg("rule digest must be nonzero")] ZeroRuleDigest,
    #[msg("schedule count is outside the configured bounds")] InvalidScheduleCount,
    #[msg("event window timestamps are invalid")] InvalidEventWindow,
    #[msg("schedule windows must be strictly chronological")] ScheduleNotChronological,
    #[msg("member stake is outside the configured bounds")] InvalidMemberStake,
    #[msg("confirmation threshold exceeds the member count")] InvalidConfirmationThreshold,
    #[msg("member stake pool overflowed")] StakePoolOverflow,
    #[msg("member stake is not divisible by the event count")] StakeNotDivisible,
    #[msg("per-event allocation must be positive")] InvalidPerEventAllocation,
    #[msg("fee calculation overflowed")] FeeCalculationOverflow,
}
