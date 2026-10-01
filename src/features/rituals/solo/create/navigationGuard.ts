export type CreateNavigationGuardInput = Readonly<{
  step: 1 | 2 | 3
  isBusy: boolean
  isConfirmed: boolean
  actionType?: string
}>

export function shouldReturnToFirstCreateStep(input: CreateNavigationGuardInput): boolean {
  const isBackAction = input.actionType === undefined || input.actionType === 'GO_BACK' || input.actionType === 'POP'
  return input.step > 1 && !input.isBusy && !input.isConfirmed && isBackAction
}
