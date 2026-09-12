use anchor_lang::prelude::*;
use anchor_spl::token::{self, spl_token, Mint, Token, TokenAccount};

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
        // The initializer records the address only. CreateRitual validates the
        // concrete classic SPL token account and its mint for the first time.
        require!(
            (1..=10_000).contains(&fee_basis_points),
            RitualsError::InvalidFeeBasisPoints
        );
        require!(minimum_fee > 0, RitualsError::InvalidMinimumFee);
        require!(maximum_fee > 0, RitualsError::InvalidMaximumFee);
        require!(minimum_fee <= maximum_fee, RitualsError::FeeBoundsReversed);
        require!(
            maximum_member_stake > 0,
            RitualsError::InvalidMaximumMemberStake
        );

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
        require!(
            (2..=config.max_members as usize).contains(&members.len()),
            RitualsError::InvalidMemberCount
        );
        require!(
            members.iter().all(|member| *member != Pubkey::default()),
            RitualsError::DefaultMember,
        );
        require!(
            members
                .iter()
                .all(|member| members.iter().filter(|other| *other == member).count() == 1),
            RitualsError::DuplicateMember
        );
        require!(
            members.contains(&ctx.accounts.creator.key()),
            RitualsError::CreatorNotMember
        );
        require!(
            !rule_digest.iter().all(|byte| *byte == 0),
            RitualsError::ZeroRuleDigest
        );
        require!(
            (1..=config.max_events as usize).contains(&schedule.len()),
            RitualsError::InvalidScheduleCount
        );
        for (index, window) in schedule.iter().enumerate() {
            require!(
                window.opens >= 0
                    && window.opens < window.deadline
                    && window.deadline < window.resolution,
                RitualsError::InvalidEventWindow
            );
            if let Some(previous) = index.checked_sub(1).and_then(|i| schedule.get(i)) {
                require!(
                    window.opens > previous.resolution,
                    RitualsError::ScheduleNotChronological
                );
            }
        }
        require!(
            member_total_stake > 0 && member_total_stake <= config.maximum_member_stake,
            RitualsError::InvalidMemberStake
        );
        require!(
            additional_confirmation_threshold <= (members.len() - 1) as u8,
            RitualsError::InvalidConfirmationThreshold
        );
        let group_pool = member_total_stake
            .checked_mul(members.len() as u64)
            .ok_or(RitualsError::StakePoolOverflow)?;
        require!(
            member_total_stake % schedule.len() as u64 == 0,
            RitualsError::StakeNotDivisible
        );
        let per_event_allocation = member_total_stake / schedule.len() as u64;
        require!(
            per_event_allocation > 0,
            RitualsError::InvalidPerEventAllocation
        );
        let fee_raw = (group_pool as u128)
            .checked_mul(config.fee_basis_points as u128)
            .ok_or(RitualsError::FeeCalculationOverflow)?
            / 10_000;
        let fee: u64 = fee_raw
            .try_into()
            .map_err(|_| RitualsError::FeeCalculationOverflow)?;
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
        ritual.stake_decimals = ctx.accounts.stake_mint.decimals;
        ritual.locked_fee_recipient = ctx.accounts.fee_recipient_token.key();
        ritual.stake_vault = ctx.accounts.stake_vault.key();
        ritual.fee_vault = ctx.accounts.fee_vault.key();
        ritual.stake_vault_bump = ctx.bumps.stake_vault;
        ritual.fee_vault_bump = ctx.bumps.fee_vault;
        ritual.funded_members_bitmap = 0;
        ritual.funded_member_count = 0;
        ritual.funded_stake_total = 0;
        ritual.funded_fee_total = 0;
        ritual.status = RitualStatus::Funding;
        ritual.current_event_index = 0;
        ritual.settled_event_count = 0;
        ritual.created_at = clock.unix_timestamp;
        ritual.activated_at = 0;
        ritual.cancelled_at = 0;
        ritual.bump = ctx.bumps.ritual;
        Ok(())
    }

    pub fn fund_member(ctx: Context<FundMember>) -> Result<()> {
        let config = &ctx.accounts.protocol_config;
        require!(!config.paused, RitualsError::ProtocolPaused);
        require!(
            ctx.accounts.ritual.status == RitualStatus::Funding,
            RitualsError::InvalidRitualStatus
        );
        let ritual = &ctx.accounts.ritual;
        let member_count = ritual.members.len() as u8;
        let member_mask = (1u16
            .checked_shl(member_count as u32)
            .ok_or(RitualsError::FundingStateInconsistent)?
            - 1) as u8;
        let expected_stake = ritual
            .member_total_stake
            .checked_mul(ritual.funded_member_count as u64)
            .ok_or(RitualsError::FundingStateInconsistent)?;
        let expected_fee = ritual.expected_fee_for_bitmap(ritual.funded_members_bitmap)?;
        require!(
            ritual.funded_member_count == ritual.funded_members_bitmap.count_ones() as u8
                && ritual.funded_members_bitmap & !member_mask == 0
                && ritual.funded_stake_total == expected_stake
                && ritual.funded_fee_total == expected_fee,
            RitualsError::FundingStateInconsistent
        );
        let member_index = ritual
            .members
            .iter()
            .position(|member| *member == ctx.accounts.member.key())
            .ok_or(RitualsError::MemberNotFound)?;
        let bit = 1u8
            .checked_shl(member_index as u32)
            .ok_or(RitualsError::FundingAccountingOverflow)?;
        require!(
            ritual.funded_members_bitmap & bit == 0,
            RitualsError::AlreadyFunded
        );

        let stake = ritual.member_total_stake;
        let fee = ritual.fee_share_for_member_index(member_index)?;
        let total = stake
            .checked_add(fee)
            .ok_or(RitualsError::FundingAmountOverflow)?;
        require!(
            ctx.accounts.member_source.amount >= total,
            RitualsError::InsufficientSourceFunds
        );
        let next_count = ritual
            .funded_member_count
            .checked_add(1)
            .ok_or(RitualsError::FundingAccountingOverflow)?;
        let next_stake = ritual
            .funded_stake_total
            .checked_add(stake)
            .ok_or(RitualsError::FundingAccountingOverflow)?;
        let next_fee = ritual
            .funded_fee_total
            .checked_add(fee)
            .ok_or(RitualsError::FundingAccountingOverflow)?;
        let next_bitmap = ritual.funded_members_bitmap | bit;
        let group_pool = ritual
            .member_total_stake
            .checked_mul(member_count as u64)
            .ok_or(RitualsError::FundingStateInconsistent)?;
        require!(
            next_count <= ritual.members.len() as u8,
            RitualsError::FundingAccountingOverflow
        );
        require!(
            next_bitmap & bit != 0,
            RitualsError::FundingAccountingOverflow
        );
        let expected_next_stake = ritual
            .member_total_stake
            .checked_mul(next_count as u64)
            .ok_or(RitualsError::FundingAccountingOverflow)?;
        let expected_next_fee = ritual.expected_fee_for_bitmap(next_bitmap)?;
        require!(
            next_stake == expected_next_stake
                && next_fee == expected_next_fee
                && next_stake <= group_pool
                && next_fee <= ritual.locked_activation_fee,
            RitualsError::FundingAccountingOverflow
        );

        let cpi_accounts = token::TransferChecked {
            from: ctx.accounts.member_source.to_account_info(),
            mint: ctx.accounts.stake_mint.to_account_info(),
            to: ctx.accounts.stake_vault.to_account_info(),
            authority: ctx.accounts.member.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
            stake,
            ritual.stake_decimals,
        )?;
        if fee > 0 {
            let cpi_accounts = token::TransferChecked {
                from: ctx.accounts.member_source.to_account_info(),
                mint: ctx.accounts.stake_mint.to_account_info(),
                to: ctx.accounts.fee_vault.to_account_info(),
                authority: ctx.accounts.member.to_account_info(),
            };
            token::transfer_checked(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts),
                fee,
                ritual.stake_decimals,
            )?;
        }

        let ritual = &mut ctx.accounts.ritual;
        ritual.funded_members_bitmap = next_bitmap;
        ritual.funded_member_count = next_count;
        ritual.funded_stake_total = next_stake;
        ritual.funded_fee_total = next_fee;
        Ok(())
    }

    pub fn activate_ritual(ctx: Context<ActivateRitual>) -> Result<()> {
        let ritual = &ctx.accounts.ritual;
        require!(
            ritual.status == RitualStatus::Funding,
            RitualsError::InvalidRitualStatus
        );
        ritual.validate_locked_activation_state()?;
        let first_window = ritual
            .schedule
            .first()
            .ok_or(RitualsError::ActivationStateInconsistent)?;
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp < first_window.opens,
            RitualsError::ActivationWindowClosed
        );
        require!(
            ctx.accounts.stake_vault.amount >= ritual.funded_stake_total,
            RitualsError::ActivationStakeVaultShort
        );
        require!(
            ctx.accounts.fee_vault.amount >= ritual.locked_activation_fee,
            RitualsError::ActivationFeeVaultShort
        );

        let fee = ritual.locked_activation_fee;
        let creator = ritual.creator;
        let nonce = ritual.nonce.to_le_bytes();
        let bump = [ritual.bump];
        let signer_seeds: &[&[u8]] = &[b"ritual", creator.as_ref(), nonce.as_ref(), bump.as_ref()];
        let cpi_accounts = token::TransferChecked {
            from: ctx.accounts.fee_vault.to_account_info(),
            mint: ctx.accounts.stake_mint.to_account_info(),
            to: ctx.accounts.fee_recipient_token.to_account_info(),
            authority: ctx.accounts.ritual.to_account_info(),
        };
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                &[signer_seeds],
            ),
            fee,
            ritual.stake_decimals,
        )?;

        let ritual = &mut ctx.accounts.ritual;
        ritual.status = RitualStatus::Active;
        ritual.activated_at = clock.unix_timestamp;
        Ok(())
    }

    pub fn cancel_unactivated<'a>(
        ctx: Context<'_, '_, '_, 'a, CancelUnactivated<'a>>,
    ) -> Result<()> {
        let ritual = &ctx.accounts.ritual;
        require!(
            ritual.status == RitualStatus::Funding,
            RitualsError::InvalidRitualStatus
        );
        ritual.validate_cancellation_state()?;
        let first_window = ritual
            .schedule
            .first()
            .ok_or(RitualsError::CancellationStateInconsistent)?;
        let clock = Clock::get()?;
        if clock.unix_timestamp < first_window.opens {
            require!(
                ctx.accounts.caller.key() == ritual.creator,
                RitualsError::InvalidCancellationAuthority
            );
        }
        require!(
            ctx.remaining_accounts.len() == ritual.members.len(),
            RitualsError::InvalidRefundAccountCount
        );
        require!(
            ctx.accounts.stake_vault.amount >= ritual.funded_stake_total,
            RitualsError::CancellationStakeVaultShort
        );
        require!(
            ctx.accounts.fee_vault.amount >= ritual.funded_fee_total,
            RitualsError::CancellationFeeVaultShort
        );

        let mut destinations: Vec<AccountInfo<'a>> = Vec::with_capacity(ritual.members.len());
        for (index, destination) in ctx.remaining_accounts.iter().enumerate() {
            require!(
                destination.is_writable && destination.owner == &spl_token::ID,
                RitualsError::InvalidRefundDestination
            );
            require!(
                !ctx.remaining_accounts[..index]
                    .iter()
                    .any(|previous| previous.key == destination.key),
                RitualsError::InvalidRefundDestination
            );
            let mut raw_data: &[u8] = &destination.data.borrow();
            let parsed = TokenAccount::try_deserialize(&mut raw_data)
                .map_err(|_| error!(RitualsError::InvalidRefundDestination))?;
            require!(
                parsed.state != spl_token::state::AccountState::Uninitialized
                    && parsed.mint == ritual.stake_mint
                    && parsed.owner == ritual.members[index],
                RitualsError::InvalidRefundDestination
            );
            destinations.push(destination.clone());
        }

        let creator = ritual.creator;
        let nonce = ritual.nonce.to_le_bytes();
        let bump = [ritual.bump];
        let signer_seeds: &[&[u8]] = &[b"ritual", creator.as_ref(), nonce.as_ref(), bump.as_ref()];
        for (index, destination) in destinations.iter().enumerate() {
            if ritual.funded_members_bitmap & (1u8 << index) == 0 {
                continue;
            }
            let cpi_accounts = token::TransferChecked {
                from: ctx.accounts.stake_vault.to_account_info(),
                mint: ctx.accounts.stake_mint.to_account_info(),
                to: destination.clone(),
                authority: ctx.accounts.ritual.to_account_info(),
            };
            token::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    &[signer_seeds],
                ),
                ritual.member_total_stake,
                ritual.stake_decimals,
            )?;
            let fee = ritual.fee_share_for_member_index(index)?;
            if fee > 0 {
                let cpi_accounts = token::TransferChecked {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    mint: ctx.accounts.stake_mint.to_account_info(),
                    to: destination.clone(),
                    authority: ctx.accounts.ritual.to_account_info(),
                };
                token::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        cpi_accounts,
                        &[signer_seeds],
                    ),
                    fee,
                    ritual.stake_decimals,
                )?;
            }
        }
        let ritual = &mut ctx.accounts.ritual;
        ritual.status = RitualStatus::Cancelled;
        ritual.cancelled_at = clock.unix_timestamp;
        ritual.funded_members_bitmap = 0;
        ritual.funded_member_count = 0;
        ritual.funded_stake_total = 0;
        ritual.funded_fee_total = 0;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeProtocolConfig<'info> {
    #[account(init, payer = authority, space = 8 + ProtocolConfig::INIT_SPACE, seeds = [b"protocol-config"], bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct CreateRitual<'info> {
    #[account(seeds = [b"protocol-config"], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(init, payer = creator, space = 8 + Ritual::INIT_SPACE, seeds = [b"ritual", creator.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub ritual: Account<'info, Ritual>,
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(address = protocol_config.allowed_stake_mint)]
    pub stake_mint: Account<'info, Mint>,
    #[account(address = protocol_config.fee_recipient)]
    #[account(constraint = fee_recipient_token.mint == stake_mint.key())]
    pub fee_recipient_token: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = creator,
        seeds = [b"stake-vault", ritual.key().as_ref()],
        bump,
        token::mint = stake_mint,
        token::authority = ritual,
    )]
    pub stake_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = creator,
        seeds = [b"fee-vault", ritual.key().as_ref()],
        bump,
        token::mint = stake_mint,
        token::authority = ritual,
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FundMember<'info> {
    #[account(seeds = [b"protocol-config"], bump = protocol_config.bump, address = ritual.protocol_config)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    pub member: Signer<'info>,
    #[account(address = ritual.stake_mint, constraint = stake_mint.decimals == ritual.stake_decimals)]
    pub stake_mint: Account<'info, Mint>,
    #[account(mut, constraint = member_source.mint == stake_mint.key(), constraint = member_source.owner == member.key())]
    pub member_source: Account<'info, TokenAccount>,
    #[account(mut, address = ritual.stake_vault, seeds = [b"stake-vault", ritual.key().as_ref()], bump = ritual.stake_vault_bump, token::mint = stake_mint, token::authority = ritual)]
    pub stake_vault: Account<'info, TokenAccount>,
    #[account(mut, address = ritual.fee_vault, seeds = [b"fee-vault", ritual.key().as_ref()], bump = ritual.fee_vault_bump, token::mint = stake_mint, token::authority = ritual)]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ActivateRitual<'info> {
    #[account(seeds = [b"protocol-config"], bump = protocol_config.bump, address = ritual.protocol_config)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    #[account(address = ritual.stake_mint, constraint = stake_mint.decimals == ritual.stake_decimals)]
    pub stake_mint: Account<'info, Mint>,
    #[account(mut, address = ritual.stake_vault, seeds = [b"stake-vault", ritual.key().as_ref()], bump = ritual.stake_vault_bump, token::mint = stake_mint, token::authority = ritual)]
    pub stake_vault: Account<'info, TokenAccount>,
    #[account(mut, address = ritual.fee_vault, seeds = [b"fee-vault", ritual.key().as_ref()], bump = ritual.fee_vault_bump, token::mint = stake_mint, token::authority = ritual)]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(mut, address = ritual.locked_fee_recipient, constraint = fee_recipient_token.mint == stake_mint.key())]
    pub fee_recipient_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelUnactivated<'info> {
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    pub caller: Signer<'info>,
    #[account(address = ritual.stake_mint, constraint = stake_mint.decimals == ritual.stake_decimals)]
    pub stake_mint: Account<'info, Mint>,
    #[account(mut, address = ritual.stake_vault, seeds = [b"stake-vault", ritual.key().as_ref()], bump = ritual.stake_vault_bump, token::mint = stake_mint, token::authority = ritual)]
    pub stake_vault: Account<'info, TokenAccount>,
    #[account(mut, address = ritual.fee_vault, seeds = [b"fee-vault", ritual.key().as_ref()], bump = ritual.fee_vault_bump, token::mint = stake_mint, token::authority = ritual)]
    pub fee_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub schema_version: u8,
    pub authority: Pubkey,
    pub allowed_stake_mint: Pubkey,
    /// The address is recorded without account validation; CreateRitual validates it.
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
pub enum FeePayerMode {
    Host,
    Split,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub enum RitualStatus {
    Funding,
    Active,
    Completed,
    Cancelled,
}

#[account]
#[derive(InitSpace)]
pub struct Ritual {
    pub schema_version: u8,
    pub protocol_config: Pubkey,
    pub creator: Pubkey,
    pub nonce: u64,
    pub rule_digest: [u8; 32],
    pub stake_mint: Pubkey,
    #[max_len(6)]
    pub members: Vec<Pubkey>,
    pub member_total_stake: u64,
    pub per_event_allocation: u64,
    #[max_len(16)]
    pub schedule: Vec<EventWindow>,
    pub additional_confirmation_threshold: u8,
    pub fee_payer_mode: FeePayerMode,
    pub locked_activation_fee: u64,
    pub stake_decimals: u8,
    pub locked_fee_recipient: Pubkey,
    pub stake_vault: Pubkey,
    pub fee_vault: Pubkey,
    pub stake_vault_bump: u8,
    pub fee_vault_bump: u8,
    pub funded_members_bitmap: u8,
    pub funded_member_count: u8,
    pub funded_stake_total: u64,
    pub funded_fee_total: u64,
    pub status: RitualStatus,
    pub current_event_index: u8,
    pub settled_event_count: u8,
    pub created_at: i64,
    pub activated_at: i64,
    pub cancelled_at: i64,
    pub bump: u8,
}

impl Ritual {
    fn validate_locked_activation_state(&self) -> Result<()> {
        let member_count = self.members.len();
        require!(
            self.schema_version == 1 && (2..=6).contains(&member_count),
            RitualsError::ActivationStateInconsistent
        );
        require!(
            self.members
                .iter()
                .all(|member| *member != Pubkey::default())
                && self.members.iter().all(|member| {
                    self.members.iter().filter(|other| *other == member).count() == 1
                })
                && self.members.contains(&self.creator),
            RitualsError::ActivationStateInconsistent
        );

        let event_count = self.schedule.len();
        require!(
            (1..=16).contains(&event_count),
            RitualsError::ActivationStateInconsistent
        );
        for (index, window) in self.schedule.iter().enumerate() {
            require!(
                window.opens >= 0
                    && window.opens < window.deadline
                    && window.deadline < window.resolution,
                RitualsError::ActivationStateInconsistent
            );
            if let Some(previous) = index.checked_sub(1).and_then(|i| self.schedule.get(i)) {
                require!(
                    previous.resolution < window.opens,
                    RitualsError::ActivationStateInconsistent
                );
            }
        }

        require!(
            self.member_total_stake > 0
                && self.member_total_stake % event_count as u64 == 0
                && self.per_event_allocation > 0
                && self.per_event_allocation == self.member_total_stake / event_count as u64,
            RitualsError::ActivationStateInconsistent
        );
        let group_pool = self
            .member_total_stake
            .checked_mul(member_count as u64)
            .ok_or(RitualsError::ActivationStateInconsistent)?;
        require!(
            self.additional_confirmation_threshold <= (member_count - 1) as u8
                && !self.rule_digest.iter().all(|byte| *byte == 0)
                && self.locked_activation_fee > 0
                && self.locked_fee_recipient != Pubkey::default(),
            RitualsError::ActivationStateInconsistent
        );

        let member_mask = ((1u16 << member_count) - 1)
            .try_into()
            .map_err(|_| RitualsError::ActivationStateInconsistent)?;
        require!(
            self.funded_members_bitmap == member_mask
                && self.funded_member_count as usize == member_count
                && self.funded_member_count == self.funded_members_bitmap.count_ones() as u8
                && self.funded_stake_total == group_pool,
            RitualsError::ActivationStateInconsistent
        );
        let expected_fee = self
            .expected_fee_for_bitmap(member_mask)
            .map_err(|_| RitualsError::ActivationStateInconsistent)?;
        require!(
            self.funded_fee_total == expected_fee && self.locked_activation_fee == expected_fee,
            RitualsError::ActivationStateInconsistent
        );
        Ok(())
    }

    fn fee_share_for_member_index(&self, index: usize) -> Result<u64> {
        let member = self
            .members
            .get(index)
            .ok_or(RitualsError::FundingStateInconsistent)?;
        match self.fee_payer_mode {
            FeePayerMode::Host => Ok(if *member == self.creator {
                self.locked_activation_fee
            } else {
                0
            }),
            FeePayerMode::Split => {
                let count = self.members.len() as u64;
                let base = self
                    .locked_activation_fee
                    .checked_div(count)
                    .ok_or(RitualsError::FundingStateInconsistent)?;
                let remainder = self.locked_activation_fee % count;
                base.checked_add(u64::from((index as u64) < remainder))
                    .ok_or(RitualsError::FundingAccountingOverflow.into())
            }
        }
    }

    fn expected_fee_for_bitmap(&self, bitmap: u8) -> Result<u64> {
        let count = self.members.len();
        let mask = (1u16
            .checked_shl(count as u32)
            .ok_or(RitualsError::FundingStateInconsistent)?
            - 1) as u8;
        require!(bitmap & !mask == 0, RitualsError::FundingStateInconsistent);
        let mut total = 0u64;
        for index in 0..count {
            let bit = 1u8
                .checked_shl(index as u32)
                .ok_or(RitualsError::FundingStateInconsistent)?;
            if bitmap & bit != 0 {
                total = total
                    .checked_add(self.fee_share_for_member_index(index)?)
                    .ok_or(RitualsError::FundingAccountingOverflow)?;
            }
        }
        Ok(total)
    }

    fn validate_cancellation_state(&self) -> Result<()> {
        let member_count = self.members.len();
        require!(
            self.activated_at == 0
                && self.cancelled_at == 0
                && self.current_event_index == 0
                && self.settled_event_count == 0,
            RitualsError::CancellationStateInconsistent
        );
        require!(
            self.schema_version == 1 && (2..=6).contains(&member_count),
            RitualsError::CancellationStateInconsistent
        );
        require!(
            self.members
                .iter()
                .all(|member| *member != Pubkey::default())
                && self.members.iter().all(|member| self
                    .members
                    .iter()
                    .filter(|other| *other == member)
                    .count()
                    == 1)
                && self.members.contains(&self.creator),
            RitualsError::CancellationStateInconsistent
        );
        let event_count = self.schedule.len();
        require!(
            (1..=16).contains(&event_count),
            RitualsError::CancellationStateInconsistent
        );
        for (index, window) in self.schedule.iter().enumerate() {
            require!(
                window.opens >= 0
                    && window.opens < window.deadline
                    && window.deadline < window.resolution,
                RitualsError::CancellationStateInconsistent
            );
            if let Some(previous) = index.checked_sub(1).and_then(|i| self.schedule.get(i)) {
                require!(
                    previous.resolution < window.opens,
                    RitualsError::CancellationStateInconsistent
                );
            }
        }
        require!(
            self.member_total_stake > 0
                && self.member_total_stake % event_count as u64 == 0
                && self.per_event_allocation > 0
                && self.per_event_allocation == self.member_total_stake / event_count as u64
                && self.additional_confirmation_threshold <= (member_count - 1) as u8
                && !self.rule_digest.iter().all(|byte| *byte == 0)
                && self.locked_activation_fee > 0
                && self.locked_fee_recipient != Pubkey::default(),
            RitualsError::CancellationStateInconsistent
        );
        require!(
            self.stake_mint != Pubkey::default()
                && self.stake_vault != Pubkey::default()
                && self.fee_vault != Pubkey::default(),
            RitualsError::CancellationStateInconsistent
        );
        let mask = ((1u16 << member_count) - 1) as u8;
        let expected_stake = self
            .member_total_stake
            .checked_mul(self.funded_member_count as u64)
            .ok_or(RitualsError::CancellationStateInconsistent)?;
        let expected_fee = self
            .expected_fee_for_bitmap(self.funded_members_bitmap)
            .map_err(|_| error!(RitualsError::CancellationStateInconsistent))?;
        require!(
            self.funded_members_bitmap & !mask == 0
                && self.funded_member_count == self.funded_members_bitmap.count_ones() as u8
                && self.funded_stake_total == expected_stake
                && self.funded_fee_total == expected_fee,
            RitualsError::CancellationStateInconsistent
        );
        Ok(())
    }
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
    #[msg("maximum member stake must be positive")]
    InvalidMaximumMemberStake,
    #[msg("protocol is paused")]
    ProtocolPaused,
    #[msg("member count must be between 2 and the configured maximum")]
    InvalidMemberCount,
    #[msg("members must be unique")]
    DuplicateMember,
    #[msg("creator must be a member")]
    CreatorNotMember,
    #[msg("rule digest must be nonzero")]
    ZeroRuleDigest,
    #[msg("schedule count is outside the configured bounds")]
    InvalidScheduleCount,
    #[msg("event window timestamps are invalid")]
    InvalidEventWindow,
    #[msg("schedule windows must be strictly chronological")]
    ScheduleNotChronological,
    #[msg("member stake is outside the configured bounds")]
    InvalidMemberStake,
    #[msg("confirmation threshold exceeds the member count")]
    InvalidConfirmationThreshold,
    #[msg("member stake pool overflowed")]
    StakePoolOverflow,
    #[msg("member stake is not divisible by the event count")]
    StakeNotDivisible,
    #[msg("per-event allocation must be positive")]
    InvalidPerEventAllocation,
    #[msg("fee calculation overflowed")]
    FeeCalculationOverflow,
    #[msg("member public keys must be non-default")]
    DefaultMember,
    #[msg("ritual status is not funding")]
    InvalidRitualStatus,
    #[msg("member is not part of this ritual")]
    MemberNotFound,
    #[msg("member has already funded this ritual")]
    AlreadyFunded,
    #[msg("split funding is not implemented")]
    SplitFundingNotImplemented,
    #[msg("funding amount overflowed")]
    FundingAmountOverflow,
    #[msg("member source has insufficient funds")]
    InsufficientSourceFunds,
    #[msg("funding accounting overflowed")]
    FundingAccountingOverflow,
    #[msg("funding state is inconsistent")]
    FundingStateInconsistent,
    #[msg("activation funding state is inconsistent")]
    ActivationStateInconsistent,
    #[msg("the first event has opened")]
    ActivationWindowClosed,
    #[msg("stake vault is short of its tracked liability")]
    ActivationStakeVaultShort,
    #[msg("fee vault is short of its locked activation fee")]
    ActivationFeeVaultShort,
    #[msg("caller cannot cancel before the first event opens")]
    InvalidCancellationAuthority,
    #[msg("refund account count must equal the member count")]
    InvalidRefundAccountCount,
    #[msg("refund destination is invalid")]
    InvalidRefundDestination,
    #[msg("cancellation funding state is inconsistent")]
    CancellationStateInconsistent,
    #[msg("stake vault is short of tracked cancellation liabilities")]
    CancellationStakeVaultShort,
    #[msg("fee vault is short of tracked cancellation liabilities")]
    CancellationFeeVaultShort,
}
