use anchor_lang::prelude::*;

declare_id!("8v1Go43dHxxaVHJhT4vxr2h794ETPhtqzQecPBnxmbjB");

#[program]
pub mod anchor_mwa_spike {
    use super::*;

    pub fn set_value(ctx: Context<SetValue>, value: u64) -> Result<()> {
        ctx.accounts.state.value = value;
        ctx.accounts.state.authority = ctx.accounts.authority.key();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct SetValue<'info> {
    #[account(init, payer = authority, space = 8 + State::INIT_SPACE)]
    pub state: Account<'info, State>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct State {
    pub authority: Pubkey,
    pub value: u64,
}
