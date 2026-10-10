use anchor_lang::prelude::*;
use anchor_spl::token::{self, spl_token, Mint, Token, TokenAccount};

// Local-only placeholder identity; no deployed identity is implied.
declare_id!("2MycqaTePBvUbci13NQswby9qDnstBqhJzVq5EYMCB9p");

pub mod state {
    pub use super::{
        ClaimStatus, CompletionClaim, EventStatus, EventWindow, FeePayerMode, ProtocolConfig,
        Ritual, RitualEvent, RitualKind, RitualStatus, Season, SettlementPlan, VoidReason,
    };
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
        validate_fee_settings(fee_basis_points, minimum_fee, maximum_fee)?;
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

    pub fn initialize_season(
        ctx: Context<InitializeSeason>,
        season_id: [u8; 32],
        title_digest: [u8; 32],
        schedule: Vec<EventWindow>,
        start_at: i64,
        end_at: i64,
    ) -> Result<()> {
        let config = &ctx.accounts.protocol_config;
        require!(
            !title_digest.iter().all(|byte| *byte == 0),
            RitualsError::ZeroTitleDigest
        );
        require!(
            start_at >= 0 && start_at < end_at,
            RitualsError::InvalidSeasonBounds
        );
        validate_schedule(&schedule, config.max_events)?;
        require!(
            schedule
                .first()
                .map(|window| window.opens >= start_at)
                .unwrap_or(false)
                && schedule
                    .last()
                    .map(|window| window.resolution <= end_at)
                    .unwrap_or(false),
            RitualsError::SeasonScheduleOutsideBounds
        );
        let season = &mut ctx.accounts.season;
        season.schema_version = 1;
        season.protocol_config = config.key();
        season.season_id = season_id;
        season.title_digest = title_digest;
        season.schedule = schedule;
        season.start_at = start_at;
        season.end_at = end_at;
        season.authority = ctx.accounts.authority.key();
        season.participant_count = 0;
        season.checked_in_count = [0; 16];
        season.bump = ctx.bumps.season;
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
        ritual.completed_at = 0;
        ritual.vaults_closed = false;
        ritual.kind = RitualKind::Group;
        ritual.witness = None;
        ritual.season = None;
        ritual.forfeit_destination = Pubkey::default();
        ritual.skip_declared = false;
        ritual.skip_event_index = 0;
        ritual.bump = ctx.bumps.ritual;
        Ok(())
    }

    pub fn create_solo_ritual(
        ctx: Context<CreateSoloRitual>,
        nonce: u64,
        rule_digest: [u8; 32],
        member_total_stake: u64,
        schedule: Vec<EventWindow>,
        witness: Option<Pubkey>,
    ) -> Result<()> {
        let config = &ctx.accounts.protocol_config;
        require!(!config.paused, RitualsError::ProtocolPaused);
        require!(
            ctx.accounts.creator.key() != Pubkey::default(),
            RitualsError::DefaultMember
        );
        require!(
            witness != Some(ctx.accounts.creator.key()),
            RitualsError::InvalidWitness
        );
        if let Some(witness) = witness {
            require!(witness != Pubkey::default(), RitualsError::InvalidWitness);
        }
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
            member_total_stake % schedule.len() as u64 == 0,
            RitualsError::StakeNotDivisible
        );
        let per_event_allocation = member_total_stake / schedule.len() as u64;
        require!(
            per_event_allocation > 0,
            RitualsError::InvalidPerEventAllocation
        );
        require!(
            ctx.accounts.forfeit_destination.mint == ctx.accounts.stake_mint.key(),
            RitualsError::InvalidForfeitDestination
        );
        require!(
            ctx.accounts.forfeit_destination.owner != ctx.accounts.creator.key(),
            RitualsError::ForfeitDestinationOwnedByParticipant
        );
        let season_key = ctx.accounts.season.as_ref().map(|season| season.key());
        if let Some(season) = ctx.accounts.season.as_ref() {
            let (canonical_season, _) =
                Pubkey::find_program_address(&[b"season", season.season_id.as_ref()], &crate::ID);
            require!(
                season.key() == canonical_season,
                RitualsError::SeasonAccountMismatch
            );
            require!(
                season.protocol_config == config.key()
                    && season.schedule == schedule
                    && season.participant_count < u32::MAX,
                RitualsError::SeasonScheduleMismatch
            );
        }
        if let Some(witness) = witness {
            require!(
                ctx.accounts.forfeit_destination.owner != witness,
                RitualsError::ForfeitDestinationOwnedByParticipant
            );
        }
        let fee_raw = (member_total_stake as u128)
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
        ritual.members = vec![ctx.accounts.creator.key()];
        ritual.member_total_stake = member_total_stake;
        ritual.per_event_allocation = per_event_allocation;
        ritual.schedule = schedule;
        ritual.additional_confirmation_threshold = u8::from(witness.is_some());
        ritual.fee_payer_mode = FeePayerMode::Host;
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
        ritual.completed_at = 0;
        ritual.vaults_closed = false;
        ritual.kind = RitualKind::Solo;
        ritual.witness = witness;
        ritual.season = season_key;
        ritual.forfeit_destination = ctx.accounts.forfeit_destination.key();
        ritual.skip_declared = false;
        ritual.skip_event_index = 0;
        ritual.bump = ctx.bumps.ritual;
        Ok(())
    }

    pub fn declare_skip(ctx: Context<DeclareSkip>, event_index: u8) -> Result<()> {
        let ritual = &mut ctx.accounts.ritual;
        require!(
            ritual.kind == RitualKind::Solo,
            RitualsError::SoloOnlyInstruction
        );
        require!(
            ritual.status == RitualStatus::Active,
            RitualsError::InvalidRitualStatus
        );
        require!(
            ctx.accounts.member.key() == ritual.creator,
            RitualsError::MemberNotFound
        );
        require!(!ritual.skip_declared, RitualsError::SkipAlreadyDeclared);
        require!(
            ritual.current_event_index == event_index,
            RitualsError::InvalidCurrentEvent
        );
        let window = ritual
            .schedule
            .get(event_index as usize)
            .ok_or(RitualsError::InvalidCurrentEvent)?;
        require!(
            Clock::get()?.unix_timestamp < window.opens,
            RitualsError::SkipWindowClosed
        );
        ritual.skip_declared = true;
        ritual.skip_event_index = event_index;
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
        if fee > 0 {
            let creator = ritual.creator;
            let nonce = ritual.nonce.to_le_bytes();
            let bump = [ritual.bump];
            let signer_seeds: &[&[u8]] =
                &[b"ritual", creator.as_ref(), nonce.as_ref(), bump.as_ref()];
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
        }
        record_season_participant(&ctx.accounts.ritual, ctx.accounts.season.as_mut())?;

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

    pub fn initialize_current_event(
        ctx: Context<InitializeCurrentEvent>,
        event_index: u8,
    ) -> Result<()> {
        let ritual = &ctx.accounts.ritual;
        require!(
            ritual.status == RitualStatus::Active,
            RitualsError::InvalidRitualStatus
        );
        require!(
            ritual.current_event_index == event_index,
            RitualsError::InvalidCurrentEvent
        );
        let window = ritual
            .schedule
            .get(event_index as usize)
            .ok_or(RitualsError::InvalidCurrentEvent)?;
        ritual.validate_active_state(ritual.key())?;
        let now = Clock::get()?.unix_timestamp;
        let status = if now < window.opens {
            EventStatus::Scheduled
        } else if now <= window.deadline {
            EventStatus::Claiming
        } else {
            EventStatus::Resolving
        };
        let event = &mut ctx.accounts.event;
        event.schema_version = 1;
        event.ritual = ritual.key();
        event.event_index = event_index;
        event.window = window.clone();
        event.member_count = ritual.members.len() as u8;
        event.status = status;
        event.claimed_members_bitmap = 0;
        event.confirmed_members_bitmap = 0;
        event.questioned_members_bitmap = 0;
        event.initialized_at = now;
        event.resolved_at = 0;
        event.settlement_version = 0;
        event.void_reason = VoidReason::None;
        event.event_pool = 0;
        event.forfeited_total = 0;
        event.payout_total = 0;
        event.refunded_total = 0;
        event.confirmed_member_count = 0;
        event.remainder_units = 0;
        event.remaining_stake_total_after = 0;
        event.bump = ctx.bumps.event;
        Ok(())
    }

    pub fn claim_completion(
        ctx: Context<ClaimCompletion>,
        event_index: u8,
        claim_version: u8,
    ) -> Result<()> {
        require!(claim_version == 0, RitualsError::UnsupportedClaimVersion);
        let ritual = &ctx.accounts.ritual;
        require!(
            ritual.status == RitualStatus::Active,
            RitualsError::InvalidRitualStatus
        );
        require!(
            ritual.current_event_index == event_index,
            RitualsError::InvalidCurrentEvent
        );
        ritual.validate_active_state(ritual.key())?;
        let event = &ctx.accounts.event;
        let window = ritual
            .schedule
            .get(event_index as usize)
            .ok_or(RitualsError::InvalidCurrentEvent)?;
        require!(
            event.schema_version == 1
                && event.ritual == ritual.key()
                && event.event_index == event_index
                && event.member_count == ritual.members.len() as u8
                && event.window == *window
                && matches!(event.status, EventStatus::Scheduled | EventStatus::Claiming),
            RitualsError::EventStateInconsistent
        );
        let member_index = ritual
            .members
            .iter()
            .position(|member| *member == ctx.accounts.claimant.key())
            .ok_or(RitualsError::MemberNotFound)?;
        let mask = event_member_mask(ritual.members.len())?;
        require!(
            event.claimed_members_bitmap & !mask == 0
                && event.confirmed_members_bitmap & !mask == 0
                && event.questioned_members_bitmap & !mask == 0
                && event.confirmed_members_bitmap & !event.claimed_members_bitmap == 0
                && event.questioned_members_bitmap & !event.claimed_members_bitmap == 0
                && event.confirmed_members_bitmap & event.questioned_members_bitmap == 0,
            RitualsError::EventBitmapInconsistent
        );
        let bit = 1u8
            .checked_shl(member_index as u32)
            .ok_or(RitualsError::EventBitmapInconsistent)?;
        require!(
            ritual.funded_members_bitmap & bit != 0,
            RitualsError::MemberNotFunded
        );
        require!(
            event.claimed_members_bitmap & bit == 0,
            RitualsError::AlreadyClaimed
        );
        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= event.window.opens && now <= event.window.deadline,
            RitualsError::ClaimWindowClosed
        );
        let confirmed = ritual.additional_confirmation_threshold == 0;
        let claim = &mut ctx.accounts.claim;
        claim.schema_version = 1;
        claim.ritual = ritual.key();
        claim.event = event.key();
        claim.event_index = event_index;
        claim.claimant = ctx.accounts.claimant.key();
        claim.member_index = member_index as u8;
        claim.claim_version = claim_version;
        claim.status = if confirmed {
            ClaimStatus::Confirmed
        } else {
            ClaimStatus::Pending
        };
        claim.required_additional_confirmations = ritual.additional_confirmation_threshold;
        claim.approvals_bitmap = 0;
        claim.approval_count = 0;
        claim.claimed_at = now;
        claim.bump = ctx.bumps.claim;
        let event = &mut ctx.accounts.event;
        event.claimed_members_bitmap |= bit;
        if confirmed {
            event.confirmed_members_bitmap |= bit;
            record_season_check_in(ritual, ctx.accounts.season.as_mut(), event_index)?;
        }
        event.status = EventStatus::Claiming;
        Ok(())
    }

    pub fn approve_claim(ctx: Context<ApproveClaim>, claim_version: u8) -> Result<()> {
        let now = validate_claim_action(
            &ctx.accounts.ritual,
            &ctx.accounts.event,
            &ctx.accounts.claim,
            ctx.accounts.ritual.key(),
            ctx.accounts.event.key(),
            claim_version,
        )?;
        require!(
            ctx.accounts.claim.status == ClaimStatus::Pending,
            RitualsError::InvalidClaimState
        );
        let approver_index = if ctx.accounts.ritual.is_solo() {
            require!(
                ctx.accounts.ritual.witness == Some(ctx.accounts.approver.key()),
                RitualsError::ApprovalNotEligible
            );
            None
        } else {
            Some(eligible_member_index(
                &ctx.accounts.ritual,
                ctx.accounts.approver.key(),
            )?)
        };
        if let Some(approver_index) = approver_index {
            require!(
                approver_index != ctx.accounts.claim.member_index as usize,
                RitualsError::SelfApproval
            );
            let bit = 1u8 << approver_index;
            require!(
                ctx.accounts.claim.approvals_bitmap & bit == 0,
                RitualsError::DuplicateApproval
            );
        } else {
            require!(
                ctx.accounts.claim.approval_count == 0 && ctx.accounts.claim.approvals_bitmap == 0,
                RitualsError::DuplicateApproval
            );
        }
        let next_count = ctx
            .accounts
            .claim
            .approval_count
            .checked_add(1)
            .ok_or(RitualsError::ClaimStateInconsistent)?;
        require!(
            next_count <= ctx.accounts.claim.required_additional_confirmations,
            RitualsError::ClaimStateInconsistent
        );
        if let Some(approver_index) = approver_index {
            ctx.accounts.claim.approvals_bitmap |= 1u8 << approver_index;
        }
        ctx.accounts.claim.approval_count = next_count;
        if now > ctx.accounts.event.window.deadline {
            ctx.accounts.event.status = EventStatus::Resolving;
        }
        if next_count == ctx.accounts.claim.required_additional_confirmations {
            ctx.accounts.claim.status = ClaimStatus::Confirmed;
            ctx.accounts.event.confirmed_members_bitmap |= 1u8 << ctx.accounts.claim.member_index;
            record_season_check_in(
                &ctx.accounts.ritual,
                ctx.accounts.season.as_mut(),
                ctx.accounts.claim.event_index,
            )?;
        }
        Ok(())
    }

    pub fn question_claim(ctx: Context<QuestionClaim>, claim_version: u8) -> Result<()> {
        validate_claim_action(
            &ctx.accounts.ritual,
            &ctx.accounts.event,
            &ctx.accounts.claim,
            ctx.accounts.ritual.key(),
            ctx.accounts.event.key(),
            claim_version,
        )?;
        require!(
            ctx.accounts.claim.status == ClaimStatus::Pending,
            RitualsError::InvalidClaimState
        );
        let questioner_index = if ctx.accounts.ritual.is_solo() {
            require!(
                ctx.accounts.ritual.witness == Some(ctx.accounts.questioner.key()),
                RitualsError::ApprovalNotEligible
            );
            None
        } else {
            Some(eligible_member_index(
                &ctx.accounts.ritual,
                ctx.accounts.questioner.key(),
            )?)
        };
        if let Some(questioner_index) = questioner_index {
            require!(
                questioner_index != ctx.accounts.claim.member_index as usize,
                RitualsError::SelfApproval
            );
            let questioner_bit = 1u8 << questioner_index;
            require!(
                ctx.accounts.claim.approvals_bitmap & questioner_bit == 0,
                RitualsError::ConflictingAttestation
            );
        } else {
            require!(
                ctx.accounts.claim.approval_count == 0,
                RitualsError::ConflictingAttestation
            );
        }
        ctx.accounts.claim.status = ClaimStatus::Questioned;
        ctx.accounts.event.questioned_members_bitmap |= 1u8 << ctx.accounts.claim.member_index;
        ctx.accounts.event.status = EventStatus::Resolving;
        Ok(())
    }

    pub fn finalize_event<'a>(
        ctx: Context<'_, '_, '_, 'a, FinalizeEvent<'a>>,
        event_index: u8,
    ) -> Result<()> {
        let ritual_key = ctx.accounts.ritual.key();
        let ritual = &ctx.accounts.ritual;
        require!(
            ritual.status == RitualStatus::Active,
            RitualsError::InvalidRitualStatus
        );
        require!(
            ritual.current_event_index == event_index,
            RitualsError::InvalidCurrentEvent
        );
        ritual.validate_active_state(ritual_key)?;
        let window = ritual
            .schedule
            .get(event_index as usize)
            .ok_or(RitualsError::InvalidCurrentEvent)?;
        let event = &ctx.accounts.event;
        require!(
            event.schema_version == 1
                && event.ritual == ritual_key
                && event.event_index == event_index
                && event.member_count == ritual.members.len() as u8
                && event.window == *window
                && matches!(
                    event.status,
                    EventStatus::Scheduled | EventStatus::Claiming | EventStatus::Resolving
                )
                && event.settlement_version == 0
                && event.resolved_at == 0
                && event.void_reason == VoidReason::None
                && event.event_pool == 0
                && event.forfeited_total == 0
                && event.payout_total == 0
                && event.refunded_total == 0
                && event.confirmed_member_count == 0
                && event.remainder_units == 0
                && event.remaining_stake_total_after == 0,
            RitualsError::EventStateInconsistent
        );
        let now = Clock::get()?.unix_timestamp;
        require!(
            event.initialized_at <= now,
            RitualsError::EventStateInconsistent
        );
        require!(
            now > event.window.resolution,
            RitualsError::ResolutionNotReached
        );
        let mask = event_member_mask(ritual.members.len())?;
        require!(
            event.claimed_members_bitmap & !mask == 0
                && event.confirmed_members_bitmap & !mask == 0
                && event.questioned_members_bitmap & !mask == 0
                && event.confirmed_members_bitmap & !event.claimed_members_bitmap == 0
                && event.questioned_members_bitmap & !event.claimed_members_bitmap == 0
                && event.confirmed_members_bitmap & event.questioned_members_bitmap == 0,
            RitualsError::EventBitmapInconsistent
        );
        let plan = if ritual.is_solo() {
            derive_solo_event_settlement_plan(
                ritual.per_event_allocation,
                event.claimed_members_bitmap,
                event.confirmed_members_bitmap,
                event.questioned_members_bitmap,
                ritual.skip_declared && ritual.skip_event_index == event_index,
            )?
        } else {
            derive_event_settlement_plan(
                event.member_count,
                ritual.per_event_allocation,
                event.claimed_members_bitmap,
                event.confirmed_members_bitmap,
                event.questioned_members_bitmap,
            )?
        };
        require!(
            ctx.accounts.stake_vault.amount >= ritual.funded_stake_total,
            RitualsError::FinalizeStakeVaultShort
        );
        let destination_count = ritual.members.len() + usize::from(ritual.is_solo());
        require!(
            ctx.remaining_accounts.len() == destination_count,
            RitualsError::InvalidFinalizeDestinationCount
        );
        let mut destinations = Vec::with_capacity(ritual.members.len());
        for (index, destination) in ctx
            .remaining_accounts
            .iter()
            .take(ritual.members.len())
            .enumerate()
        {
            require!(
                destination.is_writable
                    && destination.owner == &spl_token::ID
                    && !ctx.remaining_accounts[..index]
                        .iter()
                        .any(|previous| previous.key == destination.key),
                RitualsError::InvalidFinalizeDestination
            );
            let mut raw_data: &[u8] = &destination.data.borrow();
            let parsed = TokenAccount::try_deserialize(&mut raw_data)
                .map_err(|_| error!(RitualsError::InvalidFinalizeDestination))?;
            require!(
                parsed.state != spl_token::state::AccountState::Uninitialized
                    && parsed.mint == ritual.stake_mint
                    && parsed.owner == ritual.members[index],
                RitualsError::InvalidFinalizeDestination
            );
            destinations.push(destination.clone());
        }
        let forfeit_destination = if ritual.is_solo() {
            let destination = &ctx.remaining_accounts[ritual.members.len()];
            require!(
                destination.is_writable
                    && destination.key == &ritual.forfeit_destination
                    && !destinations
                        .iter()
                        .any(|previous| previous.key == destination.key),
                RitualsError::InvalidFinalizeDestination
            );
            let mut raw_data: &[u8] = &destination.data.borrow();
            let parsed = TokenAccount::try_deserialize(&mut raw_data)
                .map_err(|_| error!(RitualsError::InvalidFinalizeDestination))?;
            require!(
                parsed.state != spl_token::state::AccountState::Uninitialized
                    && parsed.mint == ritual.stake_mint,
                RitualsError::InvalidFinalizeDestination
            );
            Some(destination.clone())
        } else {
            None
        };
        let event_pool = plan.event_pool;
        let next_remaining = ritual
            .funded_stake_total
            .checked_sub(event_pool)
            .ok_or(RitualsError::SettlementAccountingOverflow)?;
        let next_settled_count = ritual
            .settled_event_count
            .checked_add(1)
            .ok_or(RitualsError::SettlementAccountingOverflow)?;
        let next_index = ritual
            .current_event_index
            .checked_add(1)
            .ok_or(RitualsError::SettlementAccountingOverflow)?;
        let payout_sum = plan
            .payouts
            .iter()
            .try_fold(0u64, |sum, amount| sum.checked_add(*amount))
            .ok_or(RitualsError::SettlementAccountingOverflow)?;
        let transfer_sum = if plan.status == EventStatus::Voided {
            ritual
                .per_event_allocation
                .checked_mul(ritual.members.len() as u64)
                .ok_or(RitualsError::SettlementAccountingOverflow)?
        } else if ritual.is_solo() {
            payout_sum
                .checked_add(plan.forfeited_total)
                .ok_or(RitualsError::SettlementAccountingOverflow)?
        } else {
            payout_sum
        };
        require!(
            transfer_sum == event_pool,
            RitualsError::SettlementAccountingOverflow
        );
        if next_index as usize == ritual.schedule.len() {
            require!(
                next_remaining == 0,
                RitualsError::SettlementAccountingOverflow
            );
        }
        let creator = ritual.creator;
        let nonce = ritual.nonce.to_le_bytes();
        let bump = [ritual.bump];
        let signer_seeds: &[&[u8]] = &[b"ritual", creator.as_ref(), nonce.as_ref(), bump.as_ref()];
        for (index, destination) in destinations.iter().enumerate() {
            let amount = if plan.status == EventStatus::Voided {
                ritual.per_event_allocation
            } else {
                plan.payouts[index]
            };
            if amount == 0 {
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
                amount,
                ritual.stake_decimals,
            )?;
        }
        if let Some(destination) = forfeit_destination {
            if plan.forfeited_total > 0 {
                let cpi_accounts = token::TransferChecked {
                    from: ctx.accounts.stake_vault.to_account_info(),
                    mint: ctx.accounts.stake_mint.to_account_info(),
                    to: destination,
                    authority: ctx.accounts.ritual.to_account_info(),
                };
                token::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        cpi_accounts,
                        &[signer_seeds],
                    ),
                    plan.forfeited_total,
                    ritual.stake_decimals,
                )?;
            }
        }
        let ritual = &mut ctx.accounts.ritual;
        let event = &mut ctx.accounts.event;
        event.status = plan.status;
        event.settlement_version = 1;
        event.void_reason = plan.void_reason;
        event.event_pool = event_pool;
        event.forfeited_total = plan.forfeited_total;
        event.payout_total = plan.payout_total;
        event.refunded_total = plan.refunded_total;
        event.confirmed_member_count = plan.confirmed_member_count;
        event.remainder_units = plan.remainder_units;
        event.remaining_stake_total_after = next_remaining;
        event.resolved_at = now;
        ritual.current_event_index = next_index;
        ritual.settled_event_count = next_settled_count;
        ritual.funded_stake_total = next_remaining;
        if next_index as usize == ritual.schedule.len() {
            ritual.status = RitualStatus::Completed;
            ritual.completed_at = now;
        }
        Ok(())
    }

    pub fn close_terminal_vaults(ctx: Context<CloseTerminalVaults>) -> Result<()> {
        let ritual = &ctx.accounts.ritual;
        require!(
            !ritual.vaults_closed,
            RitualsError::TerminalVaultsAlreadyClosed
        );
        ritual.validate_terminal_state(ritual.key())?;
        require!(
            ctx.accounts.stake_vault.amount == 0 && ctx.accounts.fee_vault.amount == 0,
            RitualsError::TerminalVaultNotEmpty
        );
        require!(
            ctx.accounts.stake_vault.close_authority.is_none()
                || ctx.accounts.stake_vault.close_authority == Some(ritual.key()).into(),
            RitualsError::TerminalVaultStateInconsistent
        );
        require!(
            ctx.accounts.fee_vault.close_authority.is_none()
                || ctx.accounts.fee_vault.close_authority == Some(ritual.key()).into(),
            RitualsError::TerminalVaultStateInconsistent
        );
        let creator = ritual.creator;
        let nonce = ritual.nonce.to_le_bytes();
        let bump = [ritual.bump];
        let signer_seeds: &[&[u8]] = &[b"ritual", creator.as_ref(), nonce.as_ref(), bump.as_ref()];
        for vault in [
            ctx.accounts.stake_vault.to_account_info(),
            ctx.accounts.fee_vault.to_account_info(),
        ] {
            let close = token::CloseAccount {
                account: vault,
                destination: ctx.accounts.creator_rent_destination.to_account_info(),
                authority: ctx.accounts.ritual.to_account_info(),
            };
            token::close_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                close,
                &[signer_seeds],
            ))?;
        }
        ctx.accounts.ritual.vaults_closed = true;
        Ok(())
    }

    /// Update the protocol fee settings in place. Only the three fee fields
    /// change; the account layout, authority, mint, recipient and limits are
    /// untouched so existing readers keep decoding the same bytes. Rituals
    /// that already locked a fee keep paying that locked fee.
    pub fn update_protocol_config(
        ctx: Context<UpdateProtocolConfig>,
        fee_basis_points: u16,
        minimum_fee: u64,
        maximum_fee: u64,
    ) -> Result<()> {
        validate_fee_settings(fee_basis_points, minimum_fee, maximum_fee)?;
        let config = &mut ctx.accounts.protocol_config;
        config.fee_basis_points = fee_basis_points;
        config.minimum_fee = minimum_fee;
        config.maximum_fee = maximum_fee;
        Ok(())
    }

    /// End a solo ritual early and give its money back. Remaining accounts are
    /// the event PDA of every unsettled week, in schedule order (absent ones
    /// too), so the chain clock decides which weeks are already decided. A week
    /// whose deadline has passed settles exactly as finalize_event would (no
    /// event account means nobody stamped: a miss); an open week that is
    /// already stamped settles as kept. Everything else in both vaults goes to
    /// the creator and the vaults close. `expected_forfeit` is the forfeit the
    /// creator was shown: a deadline passing during wallet approval fails the
    /// transaction instead of sending more than they agreed to.
    pub fn eject_ritual<'a>(
        ctx: Context<'_, '_, '_, 'a, EjectRitual<'a>>,
        expected_forfeit: u64,
    ) -> Result<()> {
        let ritual = &ctx.accounts.ritual;
        let ritual_key = ritual.key();
        ritual.validate_active_state(ritual_key)?;
        require!(
            ctx.accounts.stake_vault.amount >= ritual.funded_stake_total,
            RitualsError::FinalizeStakeVaultShort
        );
        let first = ritual.current_event_index as usize;
        require!(
            ctx.remaining_accounts.len() == ritual.schedule.len() - first,
            RitualsError::EjectEventAccounts
        );
        let now = Clock::get()?.unix_timestamp;
        let mut receipts = Vec::new();
        let mut forfeited = 0u64;
        let mut remaining = ritual.funded_stake_total;
        for (offset, info) in ctx.remaining_accounts.iter().enumerate() {
            let index = (first + offset) as u8;
            let window = &ritual.schedule[index as usize];
            let lapsed = window.deadline < now;
            let absent = info.owner == &anchor_lang::system_program::ID && info.data_is_empty();
            // Weeks are chronological: after the first undecided week, none is decided.
            if !lapsed && absent {
                break;
            }
            let (address, bump) = Pubkey::find_program_address(
                &[b"event", ritual_key.as_ref(), &[index]],
                &crate::ID,
            );
            require!(
                info.key == &address && info.is_writable,
                RitualsError::EjectEventAccounts
            );
            let mut event = if absent {
                RitualEvent {
                    schema_version: 1,
                    ritual: ritual_key,
                    event_index: index,
                    window: window.clone(),
                    member_count: 1,
                    status: EventStatus::Resolving,
                    claimed_members_bitmap: 0,
                    confirmed_members_bitmap: 0,
                    questioned_members_bitmap: 0,
                    initialized_at: now,
                    resolved_at: 0,
                    settlement_version: 0,
                    void_reason: VoidReason::None,
                    event_pool: 0,
                    forfeited_total: 0,
                    payout_total: 0,
                    refunded_total: 0,
                    confirmed_member_count: 0,
                    remainder_units: 0,
                    remaining_stake_total_after: 0,
                    bump,
                }
            } else {
                require!(
                    info.owner == &crate::ID && info.data_len() == 8 + RitualEvent::INIT_SPACE,
                    RitualsError::EjectEventAccounts
                );
                let event = RitualEvent::try_deserialize(&mut &info.data.borrow()[..])?;
                require!(
                    event.schema_version == 1
                        && event.ritual == ritual_key
                        && event.event_index == index
                        && event.window == *window
                        && event.member_count == 1
                        && event.bump == bump
                        && matches!(
                            event.status,
                            EventStatus::Scheduled | EventStatus::Claiming | EventStatus::Resolving
                        )
                        && event.settlement_version == 0
                        && event.resolved_at == 0
                        && event.initialized_at <= now
                        && event.void_reason == VoidReason::None
                        && event.event_pool == 0
                        && event.forfeited_total == 0
                        && event.payout_total == 0
                        && event.refunded_total == 0
                        && event.confirmed_member_count == 0
                        && event.remainder_units == 0
                        && event.remaining_stake_total_after == 0,
                    RitualsError::EventStateInconsistent
                );
                event
            };
            // An open week counts only once it is stamped: then it is kept.
            if !lapsed && event.confirmed_members_bitmap == 0 {
                break;
            }
            let plan = derive_solo_event_settlement_plan(
                ritual.per_event_allocation,
                event.claimed_members_bitmap,
                event.confirmed_members_bitmap,
                event.questioned_members_bitmap,
                ritual.skip_declared && ritual.skip_event_index == index,
            )?;
            require!(
                plan.payout_total
                    .checked_add(plan.refunded_total)
                    .and_then(|v| v.checked_add(plan.forfeited_total))
                    == Some(plan.event_pool),
                RitualsError::SettlementAccountingOverflow
            );
            forfeited = forfeited
                .checked_add(plan.forfeited_total)
                .ok_or(RitualsError::SettlementAccountingOverflow)?;
            remaining = remaining
                .checked_sub(plan.event_pool)
                .ok_or(RitualsError::SettlementAccountingOverflow)?;
            event.status = plan.status;
            event.void_reason = plan.void_reason;
            event.settlement_version = 1;
            event.resolved_at = now;
            event.event_pool = plan.event_pool;
            event.forfeited_total = plan.forfeited_total;
            event.payout_total = plan.payout_total;
            event.refunded_total = plan.refunded_total;
            event.confirmed_member_count = plan.confirmed_member_count;
            event.remainder_units = plan.remainder_units;
            event.remaining_stake_total_after = remaining;
            receipts.push((info, event, absent));
            if !lapsed {
                break;
            }
        }
        // Consent is amount-bound: a newly lapsed miss requires a fresh review,
        // never silently taking more than the receipt the creator approved.
        require!(
            forfeited == expected_forfeit,
            RitualsError::EjectQuoteChanged
        );
        let refund = ctx
            .accounts
            .stake_vault
            .amount
            .checked_sub(forfeited)
            .ok_or(RitualsError::SettlementAccountingOverflow)?;
        let creator = ritual.creator;
        let nonce = ritual.nonce.to_le_bytes();
        let bump = [ritual.bump];
        let seeds: &[&[u8]] = &[b"ritual", creator.as_ref(), nonce.as_ref(), bump.as_ref()];
        for (from, to, amount) in [
            (
                ctx.accounts.stake_vault.to_account_info(),
                ctx.accounts.forfeit_destination.to_account_info(),
                forfeited,
            ),
            (
                ctx.accounts.stake_vault.to_account_info(),
                ctx.accounts.creator_destination.to_account_info(),
                refund,
            ),
            (
                ctx.accounts.fee_vault.to_account_info(),
                ctx.accounts.creator_destination.to_account_info(),
                ctx.accounts.fee_vault.amount,
            ),
        ] {
            if amount > 0 {
                token::transfer_checked(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        token::TransferChecked {
                            from,
                            to,
                            mint: ctx.accounts.stake_mint.to_account_info(),
                            authority: ritual.to_account_info(),
                        },
                        &[seeds],
                    ),
                    amount,
                    ritual.stake_decimals,
                )?;
            }
        }
        // Return rent before allocating missing receipts; the creator can reuse it.
        for vault in [
            ctx.accounts.stake_vault.to_account_info(),
            ctx.accounts.fee_vault.to_account_info(),
        ] {
            token::close_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::CloseAccount {
                    account: vault,
                    destination: ctx.accounts.creator.to_account_info(),
                    authority: ritual.to_account_info(),
                },
                &[seeds],
            ))?;
        }
        let settled = ritual
            .settled_event_count
            .checked_add(receipts.len() as u8)
            .ok_or(RitualsError::SettlementAccountingOverflow)?;
        for (info, event, absent) in receipts {
            if absent {
                // Allocate/assign instead of create_account: unsolicited lamports
                // at a missing PDA must not prevent its miss from being settled.
                let size = 8 + RitualEvent::INIT_SPACE;
                let rent = Rent::get()?
                    .minimum_balance(size)
                    .saturating_sub(info.lamports());
                if rent > 0 {
                    anchor_lang::system_program::transfer(
                        CpiContext::new(
                            ctx.accounts.system_program.to_account_info(),
                            anchor_lang::system_program::Transfer {
                                from: ctx.accounts.creator.to_account_info(),
                                to: info.clone(),
                            },
                        ),
                        rent,
                    )?;
                }
                let index = [event.event_index];
                let bump = [event.bump];
                let seeds: &[&[u8]] = &[b"event", ritual_key.as_ref(), &index, &bump];
                anchor_lang::system_program::allocate(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Allocate {
                            account_to_allocate: info.clone(),
                        },
                        &[seeds],
                    ),
                    size as u64,
                )?;
                anchor_lang::system_program::assign(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        anchor_lang::system_program::Assign {
                            account_to_assign: info.clone(),
                        },
                        &[seeds],
                    ),
                    &crate::ID,
                )?;
            }
            event.try_serialize(&mut &mut info.data.borrow_mut()[..])?;
        }
        let ritual = &mut ctx.accounts.ritual;
        ritual.status = RitualStatus::Ended;
        ritual.completed_at = now;
        ritual.current_event_index = settled;
        ritual.settled_event_count = settled;
        ritual.funded_stake_total = 0;
        ritual.vaults_closed = true;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct EjectRitual<'info> {
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump,
        constraint = ritual.status == RitualStatus::Active @ RitualsError::EjectActiveOnly,
        constraint = ritual.is_solo() @ RitualsError::SoloOnlyInstruction)]
    pub ritual: Box<Account<'info, Ritual>>,
    #[account(mut, address = ritual.creator @ RitualsError::EjectCreatorOnly)]
    pub creator: Signer<'info>,
    #[account(address = ritual.stake_mint, constraint = stake_mint.decimals == ritual.stake_decimals)]
    pub stake_mint: Account<'info, Mint>,
    #[account(mut, address = ritual.stake_vault, seeds = [b"stake-vault", ritual.key().as_ref()], bump = ritual.stake_vault_bump, token::mint = stake_mint, token::authority = ritual)]
    pub stake_vault: Account<'info, TokenAccount>,
    #[account(mut, address = ritual.fee_vault, seeds = [b"fee-vault", ritual.key().as_ref()], bump = ritual.fee_vault_bump, token::mint = stake_mint, token::authority = ritual)]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = creator_destination.owner == ritual.creator && creator_destination.mint == ritual.stake_mint @ RitualsError::InvalidRefundDestination)]
    pub creator_destination: Account<'info, TokenAccount>,
    #[account(mut, address = ritual.forfeit_destination @ RitualsError::InvalidFinalizeDestination,
        constraint = forfeit_destination.mint == ritual.stake_mint && forfeit_destination.key() != creator_destination.key() @ RitualsError::InvalidFinalizeDestination)]
    pub forfeit_destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// Shared fee-setting validation for initialize and update. A zero fee
/// (0 bps, 0 minimum, 0 maximum) is valid and makes activation free.
fn validate_fee_settings(fee_basis_points: u16, minimum_fee: u64, maximum_fee: u64) -> Result<()> {
    require!(
        fee_basis_points <= 10_000,
        RitualsError::InvalidFeeBasisPoints
    );
    require!(minimum_fee <= maximum_fee, RitualsError::FeeBoundsReversed);
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateProtocolConfig<'info> {
    #[account(mut, seeds = [b"protocol-config"], bump = protocol_config.bump, has_one = authority)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseTerminalVaults<'info> {
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    #[account(mut, address = ritual.stake_vault, seeds = [b"stake-vault", ritual.key().as_ref()], bump = ritual.stake_vault_bump, constraint = stake_vault.mint == ritual.stake_mint, constraint = stake_vault.owner == ritual.key())]
    pub stake_vault: Account<'info, TokenAccount>,
    #[account(mut, address = ritual.fee_vault, seeds = [b"fee-vault", ritual.key().as_ref()], bump = ritual.fee_vault_bump, constraint = fee_vault.mint == ritual.stake_mint, constraint = fee_vault.owner == ritual.key())]
    pub fee_vault: Account<'info, TokenAccount>,
    /// CHECK: constrained to the immutable creator stored in the Ritual.
    #[account(mut, address = ritual.creator)]
    pub creator_rent_destination: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub enum VoidReason {
    None,
    NoConfirmedMembers,
    UnresolvedClaims,
    DeclaredSkip,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SettlementPlan {
    pub payouts: [u64; 6],
    pub status: EventStatus,
    pub void_reason: VoidReason,
    pub event_pool: u64,
    pub forfeited_total: u64,
    pub payout_total: u64,
    pub refunded_total: u64,
    pub confirmed_member_count: u8,
    pub remainder_units: u64,
}

pub fn derive_event_settlement_plan(
    member_count: u8,
    allocation: u64,
    claimed: u8,
    confirmed: u8,
    questioned: u8,
) -> Result<SettlementPlan> {
    let mask = event_member_mask(member_count as usize)?;
    require!(allocation > 0, RitualsError::InvalidPerEventAllocation);
    require!(claimed & !mask == 0, RitualsError::EventBitmapInconsistent);
    require!(
        confirmed & !mask == 0 && questioned & !mask == 0,
        RitualsError::EventBitmapInconsistent
    );
    require!(
        confirmed & !claimed == 0 && questioned & !claimed == 0,
        RitualsError::EventBitmapInconsistent
    );
    require!(
        confirmed & questioned == 0,
        RitualsError::EventBitmapInconsistent
    );

    let event_pool = allocation
        .checked_mul(u64::from(member_count))
        .ok_or(RitualsError::SettlementAccountingOverflow)?;
    let confirmed_count = confirmed.count_ones() as u8;
    let pending = claimed & !(confirmed | questioned);
    let unclaimed = mask & !claimed;
    let mut payouts = [0u64; 6];
    if pending != 0 || questioned != 0 || confirmed_count == 0 {
        let reason = if pending != 0 || questioned != 0 {
            VoidReason::UnresolvedClaims
        } else {
            VoidReason::NoConfirmedMembers
        };
        return Ok(SettlementPlan {
            payouts,
            status: EventStatus::Voided,
            void_reason: reason,
            event_pool,
            forfeited_total: 0,
            payout_total: 0,
            refunded_total: event_pool,
            confirmed_member_count: confirmed_count,
            remainder_units: 0,
        });
    }

    let forfeited_total = u64::from(unclaimed.count_ones())
        .checked_mul(allocation)
        .ok_or(RitualsError::SettlementAccountingOverflow)?;
    let base_bonus = forfeited_total
        .checked_div(u64::from(confirmed_count))
        .ok_or(RitualsError::SettlementAccountingOverflow)?;
    let remainder_units = forfeited_total % u64::from(confirmed_count);
    let mut remaining_remainder = remainder_units;
    for index in 0..member_count as usize {
        if confirmed & (1u8 << index) != 0 {
            payouts[index] = allocation
                .checked_add(base_bonus)
                .and_then(|value| value.checked_add(u64::from(remaining_remainder > 0)))
                .ok_or(RitualsError::SettlementAccountingOverflow)?;
            remaining_remainder = remaining_remainder.saturating_sub(1);
        }
    }
    require!(
        payouts
            .iter()
            .try_fold(0u64, |sum, payout| sum.checked_add(*payout))
            == Some(event_pool),
        RitualsError::SettlementAccountingOverflow
    );
    Ok(SettlementPlan {
        payouts,
        status: EventStatus::Settled,
        void_reason: VoidReason::None,
        event_pool,
        forfeited_total,
        payout_total: event_pool,
        refunded_total: 0,
        confirmed_member_count: confirmed_count,
        remainder_units,
    })
}

pub fn derive_solo_event_settlement_plan(
    allocation: u64,
    claimed: u8,
    confirmed: u8,
    questioned: u8,
    skipped: bool,
) -> Result<SettlementPlan> {
    require!(allocation > 0, RitualsError::InvalidPerEventAllocation);
    require!(
        claimed & !1 == 0 && confirmed & !1 == 0 && questioned & !1 == 0,
        RitualsError::EventBitmapInconsistent
    );
    require!(
        confirmed & !claimed == 0 && questioned & !claimed == 0 && confirmed & questioned == 0,
        RitualsError::EventBitmapInconsistent
    );
    let event_pool = allocation;
    if skipped {
        return Ok(SettlementPlan {
            payouts: [0; 6],
            status: EventStatus::Voided,
            void_reason: VoidReason::DeclaredSkip,
            event_pool,
            forfeited_total: 0,
            payout_total: 0,
            refunded_total: event_pool,
            confirmed_member_count: 0,
            remainder_units: 0,
        });
    }
    if questioned != 0 || (claimed != 0 && confirmed == 0) {
        return Ok(SettlementPlan {
            payouts: [0; 6],
            status: EventStatus::Voided,
            void_reason: VoidReason::UnresolvedClaims,
            event_pool,
            forfeited_total: 0,
            payout_total: 0,
            refunded_total: event_pool,
            confirmed_member_count: 0,
            remainder_units: 0,
        });
    }
    if claimed == 0 {
        return Ok(SettlementPlan {
            payouts: [0; 6],
            status: EventStatus::Settled,
            void_reason: VoidReason::None,
            event_pool,
            forfeited_total: allocation,
            payout_total: 0,
            refunded_total: 0,
            confirmed_member_count: 0,
            remainder_units: 0,
        });
    }
    Ok(SettlementPlan {
        payouts: [allocation, 0, 0, 0, 0, 0],
        status: EventStatus::Settled,
        void_reason: VoidReason::None,
        event_pool,
        forfeited_total: 0,
        payout_total: allocation,
        refunded_total: 0,
        confirmed_member_count: 1,
        remainder_units: 0,
    })
}
fn eligible_member_index(ritual: &Ritual, signer: Pubkey) -> Result<usize> {
    let index = ritual
        .members
        .iter()
        .position(|member| *member == signer)
        .ok_or(RitualsError::ApprovalNotEligible)?;
    require!(
        ritual.funded_members_bitmap & (1u8 << index) != 0,
        RitualsError::ApprovalNotEligible
    );
    Ok(index)
}

fn validate_claim_action(
    ritual: &Ritual,
    event: &RitualEvent,
    claim: &CompletionClaim,
    ritual_key: Pubkey,
    event_key: Pubkey,
    claim_version: u8,
) -> Result<i64> {
    require!(claim_version == 0, RitualsError::UnsupportedClaimVersion);
    require!(
        ritual.current_event_index == event.event_index,
        RitualsError::InvalidCurrentEvent
    );
    ritual.validate_active_state(ritual_key)?;
    let window = ritual
        .schedule
        .get(event.event_index as usize)
        .ok_or(RitualsError::InvalidClaimState)?;
    let mask = event_member_mask(ritual.members.len())?;
    require!(
        event.schema_version == 1
            && event.ritual == ritual_key
            && event.member_count == ritual.members.len() as u8
            && event.window == *window
            && matches!(event.status, EventStatus::Claiming | EventStatus::Resolving),
        RitualsError::InvalidClaimState
    );
    require!(
        event.claimed_members_bitmap & !mask == 0
            && event.confirmed_members_bitmap & !mask == 0
            && event.questioned_members_bitmap & !mask == 0
            && event.confirmed_members_bitmap & !event.claimed_members_bitmap == 0
            && event.questioned_members_bitmap & !event.claimed_members_bitmap == 0
            && event.confirmed_members_bitmap & event.questioned_members_bitmap == 0,
        RitualsError::ClaimStateInconsistent
    );
    require!(
        claim.schema_version == 1
            && claim.ritual == ritual_key
            && claim.event == event_key
            && claim.event_index == event.event_index
            && claim.claim_version == claim_version
            && (claim.member_index as usize) < ritual.members.len()
            && ritual.members[claim.member_index as usize] == claim.claimant
            && claim.required_additional_confirmations == ritual.additional_confirmation_threshold,
        RitualsError::ClaimStateInconsistent
    );
    let claimant_bit = 1u8 << claim.member_index;
    require!(
        event.claimed_members_bitmap & claimant_bit != 0,
        RitualsError::ClaimStateInconsistent
    );
    require!(
        if ritual.is_solo() {
            claim.approvals_bitmap == 0
                && claim.approval_count <= claim.required_additional_confirmations
        } else {
            claim.approvals_bitmap & !mask == 0
                && claim.approvals_bitmap & claimant_bit == 0
                && claim.approval_count == claim.approvals_bitmap.count_ones() as u8
        },
        RitualsError::ClaimStateInconsistent
    );
    if !ritual.is_solo() {
        for index in 0..ritual.members.len() {
            if claim.approvals_bitmap & (1u8 << index) != 0 {
                require!(
                    ritual.funded_members_bitmap & (1u8 << index) != 0,
                    RitualsError::ClaimStateInconsistent
                );
            }
        }
    }
    validate_claim_status_invariants(
        claim.status.clone(),
        claim.required_additional_confirmations,
        claim.approval_count,
        claim.approvals_bitmap,
        event.confirmed_members_bitmap & claimant_bit != 0,
        event.questioned_members_bitmap & claimant_bit != 0,
    )?;
    let now = Clock::get()?.unix_timestamp;
    require!(
        claim.claimed_at >= event.window.opens
            && claim.claimed_at <= event.window.deadline
            && now >= claim.claimed_at
            && now <= event.window.resolution,
        RitualsError::ApprovalWindowClosed
    );
    Ok(now)
}

fn validate_claim_status_invariants(
    status: ClaimStatus,
    threshold: u8,
    approval_count: u8,
    approvals_bitmap: u8,
    confirmed: bool,
    questioned: bool,
) -> Result<()> {
    match status {
        ClaimStatus::Pending => require!(
            threshold > 0 && approval_count < threshold && !confirmed && !questioned,
            RitualsError::ClaimStateInconsistent
        ),
        ClaimStatus::Confirmed => require!(
            ((threshold == 0 && approval_count == 0 && approvals_bitmap == 0)
                || (threshold > 0 && approval_count == threshold))
                && confirmed
                && !questioned,
            RitualsError::ClaimStateInconsistent
        ),
        ClaimStatus::Questioned => require!(
            threshold > 0 && approval_count < threshold && questioned && !confirmed,
            RitualsError::ClaimStateInconsistent
        ),
    }
    Ok(())
}

fn event_member_mask(member_count: usize) -> Result<u8> {
    require!(
        (1..=6).contains(&member_count),
        RitualsError::EventBitmapInconsistent
    );
    Ok(((1u16 << member_count) - 1) as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_member_mask_rejects_member_counts_above_six() {
        assert!(event_member_mask(7).is_err());
        assert!(event_member_mask(8).is_err());
    }

    #[test]
    fn settlement_exhaustively_partitions_every_member_state() {
        let mut cases = 0usize;
        for member_count in 2..=6u8 {
            let mask = (1u8 << member_count) - 1;
            for states in 0..4usize.pow(member_count as u32) {
                let mut encoded = states;
                let mut claimed = 0;
                let mut confirmed = 0;
                let mut questioned = 0;
                let mut confirmed_count = 0;
                let mut has_unresolved = false;
                for index in 0..member_count {
                    let bit = 1u8 << index;
                    match encoded % 4 {
                        0 => {}
                        1 => {
                            claimed |= bit;
                            confirmed |= bit;
                            confirmed_count += 1;
                        }
                        2 => {
                            claimed |= bit;
                            has_unresolved = true;
                        }
                        3 => {
                            claimed |= bit;
                            questioned |= bit;
                            has_unresolved = true;
                        }
                        _ => unreachable!(),
                    }
                    encoded /= 4;
                }
                let plan =
                    derive_event_settlement_plan(member_count, 11, claimed, confirmed, questioned)
                        .unwrap();
                cases += 1;
                assert_eq!(plan.event_pool, u64::from(member_count) * 11);
                assert_eq!(plan.confirmed_member_count, confirmed_count);
                if has_unresolved || confirmed_count == 0 {
                    assert_eq!(plan.status, EventStatus::Voided);
                    assert_eq!(
                        plan.void_reason,
                        if has_unresolved {
                            VoidReason::UnresolvedClaims
                        } else {
                            VoidReason::NoConfirmedMembers
                        }
                    );
                    assert_eq!(plan.payouts, [0; 6]);
                    assert_eq!(plan.payout_total, 0);
                    assert_eq!(plan.refunded_total, plan.event_pool);
                    assert_eq!(plan.forfeited_total, 0);
                    assert_eq!(plan.remainder_units, 0);
                } else {
                    assert_eq!(plan.status, EventStatus::Settled);
                    assert_eq!(plan.void_reason, VoidReason::None);
                    assert_eq!(plan.payout_total, plan.event_pool);
                    assert_eq!(plan.payouts.iter().sum::<u64>(), plan.event_pool);
                    assert_eq!(
                        plan.forfeited_total,
                        u64::from(mask.count_ones() - confirmed_count as u32) * 11
                    );
                    assert_eq!(plan.refunded_total, 0);
                }
            }
        }
        assert_eq!(cases, (2..=6).map(|n| 4usize.pow(n)).sum::<usize>());
    }

    #[test]
    fn settlement_voids_unresolved_before_no_confirmed_reason() {
        let pending = derive_event_settlement_plan(3, 7, 1, 0, 0).unwrap();
        assert_eq!(pending.status, EventStatus::Voided);
        assert_eq!(pending.void_reason, VoidReason::UnresolvedClaims);
        let questioned = derive_event_settlement_plan(3, 7, 3, 1, 2).unwrap();
        assert_eq!(questioned.void_reason, VoidReason::UnresolvedClaims);
        assert_eq!(questioned.confirmed_member_count, 1);
        assert_eq!(questioned.payouts, [0; 6]);
        assert_eq!(questioned.payout_total, 0);
        assert_eq!(questioned.refunded_total, questioned.event_pool);
    }

    #[test]
    fn settlement_rejects_invalid_inputs_and_overflow() {
        for count in [0, 7, 8, u8::MAX] {
            assert!(derive_event_settlement_plan(count, 1, 0, 0, 0).is_err());
        }
        for count in 1..=6 {
            let plan = derive_event_settlement_plan(count, 11, 0, 0, 0).unwrap();
            assert_eq!(plan.status, EventStatus::Voided);
            assert_eq!(plan.refunded_total, u64::from(count) * 11);
        }
        let single = derive_event_settlement_plan(1, 11, 1, 1, 0).unwrap();
        assert_eq!(single.status, EventStatus::Settled);
        assert_eq!(single.void_reason, VoidReason::None);
        assert_eq!(single.payouts, [11, 0, 0, 0, 0, 0]);
        assert_eq!(single.event_pool, 11);
        assert_eq!(single.payout_total, 11);
        assert_eq!(single.refunded_total, 0);
        assert_eq!(single.forfeited_total, 0);
        assert_eq!(single.confirmed_member_count, 1);
        assert_eq!(single.remainder_units, 0);
        assert!(derive_event_settlement_plan(2, 0, 0, 0, 0).is_err());
        assert!(derive_event_settlement_plan(2, 1, 4, 0, 0).is_err());
        assert!(derive_event_settlement_plan(2, 1, 1, 2, 0).is_err());
        assert!(derive_event_settlement_plan(2, 1, 1, 1, 1).is_err());
        assert!(derive_event_settlement_plan(2, u64::MAX, 0, 0, 0).is_err());
        assert!(derive_event_settlement_plan(2, u64::MAX, 3, 3, 0).is_err());
    }

    #[test]
    fn settlement_assigns_remainder_to_earliest_confirmed_indices() {
        let plan = derive_event_settlement_plan(3, 5, 0b101, 0b101, 0).unwrap();
        assert_eq!(plan.payouts, [8, 0, 7, 0, 0, 0]);
        assert_eq!(plan.remainder_units, 1);
        let voided = derive_event_settlement_plan(2, 9, 0, 0, 0).unwrap();
        assert_eq!(voided.payouts, [0; 6]);
        assert_eq!(voided.payout_total, 0);
        assert_eq!(voided.refunded_total, voided.event_pool);
    }

    #[test]
    fn active_state_tracks_sequential_liabilities_for_all_supported_sizes() {
        for member_count in 2..=6 {
            for event_count in [1, 2, 16] {
                let mut ritual = active_test_ritual(member_count, event_count);
                let event_pool = ritual.per_event_allocation * member_count as u64;
                let group_pool = ritual.member_total_stake * member_count as u64;
                for settled in 0..event_count {
                    ritual.current_event_index = settled as u8;
                    ritual.settled_event_count = settled as u8;
                    ritual.funded_stake_total = (event_count - settled) as u64 * event_pool;
                    assert!(ritual.validate_active_state(ritual_key()).is_ok());

                    let mut wrong = ritual.clone();
                    wrong.funded_stake_total += 1;
                    assert!(wrong.validate_active_state(ritual_key()).is_err());
                    let mut wrong = ritual.clone();
                    wrong.settled_event_count += 1;
                    assert!(wrong.validate_active_state(ritual_key()).is_err());
                    let mut wrong = ritual.clone();
                    wrong.current_event_index = wrong.current_event_index.saturating_add(1);
                    assert!(wrong.validate_active_state(ritual_key()).is_err());
                    let mut wrong = ritual.clone();
                    wrong.completed_at = 1;
                    assert!(wrong.validate_active_state(ritual_key()).is_err());
                }
                assert_eq!(group_pool, event_count as u64 * event_pool);
            }
        }
    }

    fn ritual_key() -> Pubkey {
        Pubkey::new_from_array([9; 32])
    }

    fn active_test_ritual(member_count: usize, event_count: usize) -> Ritual {
        let members = (0..member_count)
            .map(|i| Pubkey::new_from_array([i as u8 + 1; 32]))
            .collect::<Vec<_>>();
        let schedule = (0..event_count)
            .map(|i| EventWindow {
                opens: i as i64 * 10,
                deadline: i as i64 * 10 + 1,
                resolution: i as i64 * 10 + 2,
            })
            .collect::<Vec<_>>();
        let (stake_vault, stake_vault_bump) =
            Pubkey::find_program_address(&[b"stake-vault", ritual_key().as_ref()], &crate::ID);
        let (fee_vault, fee_vault_bump) =
            Pubkey::find_program_address(&[b"fee-vault", ritual_key().as_ref()], &crate::ID);
        Ritual {
            schema_version: 1,
            protocol_config: Pubkey::new_unique(),
            creator: members[0],
            nonce: 1,
            rule_digest: [1; 32],
            stake_mint: Pubkey::new_unique(),
            members,
            member_total_stake: 7 * event_count as u64,
            per_event_allocation: 7,
            schedule,
            additional_confirmation_threshold: 0,
            fee_payer_mode: FeePayerMode::Host,
            locked_activation_fee: 1,
            stake_decimals: 0,
            locked_fee_recipient: Pubkey::new_unique(),
            stake_vault,
            fee_vault,
            stake_vault_bump,
            fee_vault_bump,
            funded_members_bitmap: (1u8 << member_count) - 1,
            funded_member_count: member_count as u8,
            funded_stake_total: 7 * event_count as u64 * member_count as u64,
            funded_fee_total: 1,
            status: RitualStatus::Active,
            current_event_index: 0,
            settled_event_count: 0,
            created_at: 1,
            activated_at: 2,
            cancelled_at: 0,
            completed_at: 0,
            vaults_closed: false,
            kind: RitualKind::Group,
            witness: None,
            season: None,
            forfeit_destination: Pubkey::default(),
            skip_declared: false,
            skip_event_index: 0,
            bump: 1,
        }
    }

    #[test]
    fn terminal_claim_states_require_exact_approval_counts() {
        let cases = [
            (ClaimStatus::Confirmed, 0, 0, 0, true, false, true),
            (ClaimStatus::Confirmed, 0, 1, 1, true, false, false),
            (ClaimStatus::Confirmed, 2, 2, 3, true, false, true),
            (ClaimStatus::Confirmed, 2, 3, 7, true, false, false),
            (ClaimStatus::Questioned, 2, 1, 1, false, true, true),
            (ClaimStatus::Questioned, 2, 2, 3, false, true, false),
            (ClaimStatus::Questioned, 0, 0, 0, false, true, false),
        ];
        for (status, threshold, count, bitmap, confirmed, questioned, expected) in cases {
            let result = validate_claim_status_invariants(
                status.clone(),
                threshold,
                count,
                bitmap,
                confirmed,
                questioned,
            );
            assert_eq!(
                result.is_ok(),
                expected,
                "case: {status:?} {threshold} {count}"
            );
        }
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
#[instruction(season_id: [u8; 32])]
pub struct InitializeSeason<'info> {
    #[account(seeds = [b"protocol-config"], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(init, payer = authority, space = 8 + Season::INIT_SPACE, seeds = [b"season", season_id.as_ref()], bump)]
    pub season: Account<'info, Season>,
    #[account(mut, address = protocol_config.authority)]
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
#[instruction(nonce: u64)]
pub struct CreateSoloRitual<'info> {
    #[account(seeds = [b"protocol-config"], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(init, payer = creator, space = 8 + Ritual::INIT_SPACE, seeds = [b"ritual", creator.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub ritual: Box<Account<'info, Ritual>>,
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(address = protocol_config.allowed_stake_mint)]
    pub stake_mint: Account<'info, Mint>,
    #[account(address = protocol_config.fee_recipient)]
    #[account(constraint = fee_recipient_token.mint == stake_mint.key())]
    pub fee_recipient_token: Account<'info, TokenAccount>,
    #[account(constraint = forfeit_destination.mint == stake_mint.key())]
    pub forfeit_destination: Account<'info, TokenAccount>,
    #[account(mut)]
    pub season: Option<Box<Account<'info, Season>>>,
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
pub struct DeclareSkip<'info> {
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    pub member: Signer<'info>,
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
    pub ritual: Box<Account<'info, Ritual>>,
    #[account(mut)]
    pub season: Option<Account<'info, Season>>,
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

#[derive(Accounts)]
#[instruction(event_index: u8)]
pub struct FinalizeEvent<'info> {
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    #[account(mut, seeds = [b"event", ritual.key().as_ref(), &[event_index]], bump = event.bump)]
    pub event: Account<'info, RitualEvent>,
    #[account(address = ritual.stake_mint, constraint = stake_mint.decimals == ritual.stake_decimals)]
    pub stake_mint: Account<'info, Mint>,
    #[account(mut, address = ritual.stake_vault, seeds = [b"stake-vault", ritual.key().as_ref()], bump = ritual.stake_vault_bump, token::mint = stake_mint, token::authority = ritual)]
    pub stake_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(event_index: u8)]
pub struct InitializeCurrentEvent<'info> {
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    #[account(init, payer = payer, space = 8 + RitualEvent::INIT_SPACE, seeds = [b"event", ritual.key().as_ref(), &[event_index]], bump)]
    pub event: Account<'info, RitualEvent>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(event_index: u8, claim_version: u8)]
pub struct ClaimCompletion<'info> {
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    #[account(mut, seeds = [b"event", ritual.key().as_ref(), &[event_index]], bump = event.bump)]
    pub event: Account<'info, RitualEvent>,
    #[account(init, payer = claimant, space = 8 + CompletionClaim::INIT_SPACE, seeds = [b"claim", event.key().as_ref(), claimant.key().as_ref(), &[claim_version]], bump)]
    pub claim: Account<'info, CompletionClaim>,
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(mut)]
    pub season: Option<Account<'info, Season>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(claim_version: u8)]
pub struct ApproveClaim<'info> {
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    #[account(mut, seeds = [b"event", ritual.key().as_ref(), &[event.event_index]], bump = event.bump)]
    pub event: Account<'info, RitualEvent>,
    #[account(mut, seeds = [b"claim", event.key().as_ref(), claim.claimant.as_ref(), &[claim_version]], bump = claim.bump)]
    pub claim: Account<'info, CompletionClaim>,
    pub approver: Signer<'info>,
    #[account(mut)]
    pub season: Option<Account<'info, Season>>,
}

#[derive(Accounts)]
#[instruction(claim_version: u8)]
pub struct QuestionClaim<'info> {
    #[account(mut, seeds = [b"ritual", ritual.creator.as_ref(), &ritual.nonce.to_le_bytes()], bump = ritual.bump)]
    pub ritual: Account<'info, Ritual>,
    #[account(mut, seeds = [b"event", ritual.key().as_ref(), &[event.event_index]], bump = event.bump)]
    pub event: Account<'info, RitualEvent>,
    #[account(mut, seeds = [b"claim", event.key().as_ref(), claim.claimant.as_ref(), &[claim_version]], bump = claim.bump)]
    pub claim: Account<'info, CompletionClaim>,
    pub questioner: Signer<'info>,
    pub season: Option<Account<'info, Season>>,
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

#[account]
#[derive(InitSpace)]
pub struct Season {
    pub schema_version: u8,
    pub protocol_config: Pubkey,
    pub season_id: [u8; 32],
    pub title_digest: [u8; 32],
    #[max_len(16)]
    pub schedule: Vec<EventWindow>,
    pub start_at: i64,
    pub end_at: i64,
    pub authority: Pubkey,
    pub participant_count: u32,
    pub checked_in_count: [u32; 16],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub struct EventWindow {
    pub opens: i64,
    pub deadline: i64,
    pub resolution: i64,
}

fn validate_schedule(schedule: &[EventWindow], max_events: u8) -> Result<()> {
    require!(
        (1..=max_events as usize).contains(&schedule.len()),
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
    Ok(())
}

fn record_season_check_in(
    ritual: &Ritual,
    season: Option<&mut Account<Season>>,
    event_index: u8,
) -> Result<()> {
    match ritual.season {
        Some(expected_season) => {
            let season = season.ok_or(RitualsError::SeasonAccountMismatch)?;
            require!(
                season.key() == expected_season
                    && season.protocol_config == ritual.protocol_config
                    && season.schedule == ritual.schedule
                    && (event_index as usize) < season.schedule.len(),
                RitualsError::SeasonAccountMismatch
            );
            season.checked_in_count[event_index as usize] = season.checked_in_count
                [event_index as usize]
                .checked_add(1)
                .ok_or(RitualsError::SeasonCheckInOverflow)?;
        }
        None => require!(season.is_none(), RitualsError::SeasonAccountMismatch),
    }
    Ok(())
}

fn record_season_participant(ritual: &Ritual, season: Option<&mut Account<Season>>) -> Result<()> {
    match ritual.season {
        Some(expected_season) => {
            let season = season.ok_or(RitualsError::SeasonAccountMismatch)?;
            require!(
                season.key() == expected_season
                    && season.protocol_config == ritual.protocol_config
                    && season.schedule == ritual.schedule
                    && season.participant_count < u32::MAX,
                RitualsError::SeasonAccountMismatch
            );
            season.participant_count = season
                .participant_count
                .checked_add(1)
                .ok_or(RitualsError::SeasonParticipantOverflow)?;
        }
        None => require!(season.is_none(), RitualsError::SeasonAccountMismatch),
    }
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub enum FeePayerMode {
    Host,
    Split,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub enum RitualKind {
    Group,
    Solo,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub enum RitualStatus {
    Funding,
    Active,
    Completed,
    Cancelled,
    Ended,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub enum EventStatus {
    Scheduled,
    Claiming,
    Resolving,
    Settled,
    Voided,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, PartialEq, Eq, Debug)]
pub enum ClaimStatus {
    Pending,
    Confirmed,
    Questioned,
}

#[account]
#[derive(InitSpace)]
pub struct RitualEvent {
    pub schema_version: u8,
    pub ritual: Pubkey,
    pub event_index: u8,
    pub window: EventWindow,
    pub member_count: u8,
    pub status: EventStatus,
    pub claimed_members_bitmap: u8,
    pub confirmed_members_bitmap: u8,
    pub questioned_members_bitmap: u8,
    pub initialized_at: i64,
    pub resolved_at: i64,
    pub settlement_version: u8,
    pub void_reason: VoidReason,
    pub event_pool: u64,
    pub forfeited_total: u64,
    pub payout_total: u64,
    pub refunded_total: u64,
    pub confirmed_member_count: u8,
    pub remainder_units: u64,
    pub remaining_stake_total_after: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CompletionClaim {
    pub schema_version: u8,
    pub ritual: Pubkey,
    pub event: Pubkey,
    pub event_index: u8,
    pub claimant: Pubkey,
    pub member_index: u8,
    pub claim_version: u8,
    pub status: ClaimStatus,
    pub required_additional_confirmations: u8,
    pub approvals_bitmap: u8,
    pub approval_count: u8,
    pub claimed_at: i64,
    pub bump: u8,
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
    pub completed_at: i64,
    pub vaults_closed: bool,
    pub kind: RitualKind,
    pub witness: Option<Pubkey>,
    pub season: Option<Pubkey>,
    pub forfeit_destination: Pubkey,
    pub skip_declared: bool,
    pub skip_event_index: u8,
    pub bump: u8,
}

impl Ritual {
    fn is_solo(&self) -> bool {
        self.kind == RitualKind::Solo && self.members.len() == 1
    }

    /// Validate the immutable funding and identity invariants required by
    /// operations that read or mutate the current event.
    fn validate_active_state(&self, ritual_key: Pubkey) -> Result<()> {
        require!(
            self.status == RitualStatus::Active
                && self.cancelled_at == 0
                && self.activated_at >= self.created_at
                && self.settled_event_count == self.current_event_index
                && (self.current_event_index as usize) < self.schedule.len()
                && self.stake_mint != Pubkey::default()
                && self.stake_vault != Pubkey::default()
                && self.fee_vault != Pubkey::default(),
            RitualsError::ActiveStateInconsistent
        );
        let (canonical_stake_vault, stake_vault_bump) =
            Pubkey::find_program_address(&[b"stake-vault", ritual_key.as_ref()], &crate::ID);
        let (canonical_fee_vault, fee_vault_bump) =
            Pubkey::find_program_address(&[b"fee-vault", ritual_key.as_ref()], &crate::ID);
        require!(
            self.stake_vault == canonical_stake_vault
                && self.fee_vault == canonical_fee_vault
                && self.stake_vault_bump == stake_vault_bump
                && self.fee_vault_bump == fee_vault_bump,
            RitualsError::ActiveStateInconsistent
        );
        self.validate_common_state()
            .map_err(|_| error!(RitualsError::ActiveStateInconsistent))?;
        let member_count = self.members.len() as u64;
        let event_count = self.schedule.len() as u64;
        let group_pool = self
            .member_total_stake
            .checked_mul(member_count)
            .ok_or(RitualsError::ActiveStateInconsistent)?;
        let member_mask = ((1u16 << member_count) - 1) as u8;
        let expected_fee = self
            .expected_fee_for_bitmap(member_mask)
            .map_err(|_| error!(RitualsError::ActiveStateInconsistent))?;
        require!(
            self.funded_members_bitmap == member_mask
                && self.funded_member_count == member_count as u8
                && self.funded_member_count == self.funded_members_bitmap.count_ones() as u8
                && self.funded_fee_total == expected_fee,
            RitualsError::ActiveStateInconsistent
        );
        let event_pool = self
            .per_event_allocation
            .checked_mul(member_count)
            .ok_or(RitualsError::ActiveStateInconsistent)?;
        let processed = u64::from(self.settled_event_count)
            .checked_mul(event_pool)
            .ok_or(RitualsError::ActiveStateInconsistent)?;
        let expected_remaining = group_pool
            .checked_sub(processed)
            .ok_or(RitualsError::ActiveStateInconsistent)?;
        require!(
            u64::from(self.current_event_index) < event_count
                && self.completed_at == 0
                && self.funded_stake_total == expected_remaining,
            RitualsError::ActiveStateInconsistent
        );
        Ok(())
    }

    fn validate_locked_activation_state(&self) -> Result<()> {
        self.validate_common_state()?;
        let member_count = self.members.len();
        let group_pool = self
            .member_total_stake
            .checked_mul(member_count as u64)
            .ok_or(RitualsError::ActivationStateInconsistent)?;
        let member_mask = ((1u16 << member_count) - 1) as u8;
        require!(
            self.funded_members_bitmap == member_mask
                && self.funded_member_count as usize == member_count
                && self.funded_member_count == self.funded_members_bitmap.count_ones() as u8
                && self.funded_stake_total == group_pool,
            RitualsError::ActivationStateInconsistent
        );
        let expected_fee = self
            .expected_fee_for_bitmap(member_mask)
            .map_err(|_| error!(RitualsError::ActivationStateInconsistent))?;
        require!(
            self.funded_fee_total == expected_fee && self.locked_activation_fee == expected_fee,
            RitualsError::ActivationStateInconsistent
        );
        Ok(())
    }

    fn validate_common_state(&self) -> Result<()> {
        let member_count = self.members.len();
        require!(
            self.schema_version == 1 && (1..=6).contains(&member_count),
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
        require!(
            if self.is_solo() {
                member_count == 1
                    && self.kind == RitualKind::Solo
                    && self.witness != Some(self.creator)
                    && self.additional_confirmation_threshold == u8::from(self.witness.is_some())
                    && self.forfeit_destination != Pubkey::default()
            } else {
                member_count >= 2
                    && self.kind == RitualKind::Group
                    && self.witness.is_none()
                    && self.forfeit_destination == Pubkey::default()
                    && !self.skip_declared
                    && self.additional_confirmation_threshold <= (member_count - 1) as u8
            },
            RitualsError::ActivationStateInconsistent
        );
        require!(
            !self.rule_digest.iter().all(|byte| *byte == 0)
                && self.locked_fee_recipient != Pubkey::default(),
            RitualsError::ActivationStateInconsistent
        );

        let member_mask = ((1u16 << member_count) - 1) as u8;
        let expected_fee = self
            .expected_fee_for_bitmap(member_mask)
            .map_err(|_| RitualsError::ActivationStateInconsistent)?;
        require!(
            self.locked_activation_fee == expected_fee,
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
            self.schema_version == 1 && (1..=6).contains(&member_count),
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

    fn validate_terminal_state(&self, ritual_key: Pubkey) -> Result<()> {
        require!(
            self.protocol_config != Pubkey::default()
                && self.creator != Pubkey::default()
                && self.stake_mint != Pubkey::default()
                && self.locked_fee_recipient != Pubkey::default(),
            RitualsError::TerminalStateInconsistent
        );
        self.validate_common_state()
            .map_err(|_| error!(RitualsError::TerminalStateInconsistent))?;
        let (stake_vault, stake_bump) =
            Pubkey::find_program_address(&[b"stake-vault", ritual_key.as_ref()], &crate::ID);
        let (fee_vault, fee_bump) =
            Pubkey::find_program_address(&[b"fee-vault", ritual_key.as_ref()], &crate::ID);
        require!(
            !self.vaults_closed
                && self.stake_vault == stake_vault
                && self.fee_vault == fee_vault
                && self.stake_vault_bump == stake_bump
                && self.fee_vault_bump == fee_bump,
            RitualsError::TerminalStateInconsistent
        );
        let count = self.members.len() as u8;
        let mask = ((1u16 << count) - 1) as u8;
        require!(self.created_at > 0, RitualsError::TerminalStateInconsistent);
        match self.status {
            RitualStatus::Completed => require!(
                self.current_event_index == self.settled_event_count
                    && self.current_event_index as usize == self.schedule.len()
                    && self.funded_stake_total == 0
                    && self.funded_members_bitmap == mask
                    && self.funded_member_count == count
                    && self.funded_member_count == self.funded_members_bitmap.count_ones() as u8
                    && self.funded_fee_total == self.locked_activation_fee
                    && self.activated_at > 0
                    && self.completed_at > 0
                    && self.activated_at >= self.created_at
                    && self.completed_at >= self.activated_at
                    && self.cancelled_at == 0,
                RitualsError::TerminalStateInconsistent
            ),
            RitualStatus::Cancelled => require!(
                self.current_event_index == 0
                    && self.settled_event_count == 0
                    && self.funded_members_bitmap == 0
                    && self.funded_member_count == 0
                    && self.funded_stake_total == 0
                    && self.funded_fee_total == 0
                    && self.activated_at == 0
                    && self.completed_at == 0
                    && self.cancelled_at > 0
                    && self.cancelled_at >= self.created_at,
                RitualsError::TerminalStateInconsistent
            ),
            _ => return err!(RitualsError::InvalidTerminalStatus),
        }
        Ok(())
    }
}

#[error_code]
pub enum RitualsError {
    #[msg("fee basis points must be between 0 and 10,000")]
    InvalidFeeBasisPoints,
    #[msg("minimum fee is invalid")]
    InvalidMinimumFee,
    #[msg("maximum fee is invalid")]
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
    #[msg("event index is not the current event")]
    InvalidCurrentEvent,
    #[msg("event state is inconsistent")]
    EventStateInconsistent,
    #[msg("event bitmaps are inconsistent")]
    EventBitmapInconsistent,
    #[msg("member has not funded this ritual")]
    MemberNotFunded,
    #[msg("member has already claimed this event")]
    AlreadyClaimed,
    #[msg("completion claim window is closed")]
    ClaimWindowClosed,
    #[msg("claim version is unsupported")]
    UnsupportedClaimVersion,
    #[msg("active ritual state is inconsistent")]
    ActiveStateInconsistent,
    #[msg("claim state is invalid for this action")]
    InvalidClaimState,
    #[msg("signer is not an eligible funded member")]
    ApprovalNotEligible,
    #[msg("claimant cannot approve or question their own claim")]
    SelfApproval,
    #[msg("member has already approved this claim")]
    DuplicateApproval,
    #[msg("approval or question window is closed")]
    ApprovalWindowClosed,
    #[msg("claim state is inconsistent")]
    ClaimStateInconsistent,
    #[msg("member has already approved this claim and cannot question it")]
    ConflictingAttestation,
    #[msg("settlement accounting overflowed")]
    SettlementAccountingOverflow,
    #[msg("event resolution has not passed")]
    ResolutionNotReached,
    #[msg("finalize destination count is invalid")]
    InvalidFinalizeDestinationCount,
    #[msg("finalize destination is invalid")]
    InvalidFinalizeDestination,
    #[msg("stake vault is short of tracked settlement liability")]
    FinalizeStakeVaultShort,
    #[msg("stake or fee vault is not empty")]
    TerminalVaultNotEmpty,
    #[msg("terminal vault state is inconsistent")]
    TerminalVaultStateInconsistent,
    #[msg("ritual is not in a terminal status")]
    InvalidTerminalStatus,
    #[msg("terminal state is inconsistent")]
    TerminalStateInconsistent,
    #[msg("terminal vaults have already been closed")]
    TerminalVaultsAlreadyClosed,
    #[msg("witness is invalid")]
    InvalidWitness,
    #[msg("solo instruction is only valid for solo rituals")]
    SoloOnlyInstruction,
    #[msg("forfeit destination is invalid")]
    InvalidForfeitDestination,
    #[msg("a skip has already been declared")]
    SkipAlreadyDeclared,
    #[msg("skip must be declared before the claim window opens")]
    SkipWindowClosed,
    #[msg("forfeit destination cannot be owned by the creator or witness")]
    ForfeitDestinationOwnedByParticipant,
    #[msg("season title digest must be nonzero")]
    ZeroTitleDigest,
    #[msg("season bounds are invalid")]
    InvalidSeasonBounds,
    #[msg("season schedule falls outside its bounds")]
    SeasonScheduleOutsideBounds,
    #[msg("solo ritual schedule does not match its season")]
    SeasonScheduleMismatch,
    #[msg("season participant count overflowed")]
    SeasonParticipantOverflow,
    #[msg("season account does not match the ritual")]
    SeasonAccountMismatch,
    #[msg("season check-in counter overflowed")]
    SeasonCheckInOverflow,
    #[msg("only the creator can end a ritual")]
    EjectCreatorOnly,
    #[msg("only an active ritual can be ended; use cancel_unactivated for funding")]
    EjectActiveOnly,
    #[msg("pass every unsettled event PDA in schedule order")]
    EjectEventAccounts,
    #[msg("the forfeit amount changed; review again")]
    EjectQuoteChanged,
}
