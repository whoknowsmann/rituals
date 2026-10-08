import { canSubmitCreate, type CreateMachineState } from '../../create/createMachine'

/** Balance help belongs to an editable stake, never an in-flight or completed create. */
export const showCreateBalanceHelp = (state: CreateMachineState): boolean => canSubmitCreate(state)
