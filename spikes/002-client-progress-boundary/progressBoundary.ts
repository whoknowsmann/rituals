export type PreparedAction = Readonly<{
  message: string
  custody: Readonly<{ ritual: string; amount: bigint }>
}>

export type Confirmation = Readonly<{ signature: string; slot: number; ritual: string }>
export type ProgressPhase = 'wallet' | 'submitted' | 'confirming' | 'confirmed' | 'error'
export type ProgressEvent = Readonly<{
  phase: ProgressPhase
  signature?: string
  error?: unknown
}>
export type ProgressObserver = (event: ProgressEvent) => void | Promise<void>

export type Wallet = Readonly<{
  signAndSend: (action: PreparedAction) => Promise<Readonly<{ signature: string }>>
}>
export type SignatureValidator = (message: string, signature: string) => boolean
export type ConfirmationReader = (signature: string) => Promise<Confirmation>

export class InvalidSubmittedActionError extends Error {
  constructor(message = 'submitted action handle is invalid or stale') {
    super(message)
    this.name = 'InvalidSubmittedActionError'
  }
}

export class SubmissionSignatureError extends Error {
  constructor() {
    super('wallet signature does not verify the prepared message')
    this.name = 'SubmissionSignatureError'
  }
}

const internals = new WeakMap<SubmittedActionHandle, Readonly<{ signature: string; message: string }>>()

/** Runtime-opaque capability: structural copies and prototype-only forgeries have no WeakMap entry. */
export class SubmittedActionHandle {
  readonly #opaque = true

  private constructor(signature: string, message: string) {
    void this.#opaque
    internals.set(this, Object.freeze({ signature, message }))
    Object.freeze(this)
  }

  static create(signature: string, message: string): SubmittedActionHandle {
    return new SubmittedActionHandle(signature, message)
  }

  get signature(): string {
    const value = internals.get(this)
    if (!value) throw new InvalidSubmittedActionError()
    return value.signature
  }
}

type ConfirmationState = { promise?: Promise<Confirmation> }

export class SplitSubmitter {
  readonly #wallet: Wallet
  readonly #validateSignature: SignatureValidator
  readonly #confirmReader: ConfirmationReader
  readonly #states = new WeakMap<SubmittedActionHandle, ConfirmationState>()
  readonly #subscribers = new Set<ProgressObserver>()

  constructor(wallet: Wallet, validateSignature: SignatureValidator, confirmReader: ConfirmationReader) {
    this.#wallet = wallet
    this.#validateSignature = validateSignature
    this.#confirmReader = confirmReader
  }

  subscribe(observer: ProgressObserver): () => void {
    this.#subscribers.add(observer)
    return () => this.#subscribers.delete(observer)
  }

  async submit(prepared: PreparedAction, observer?: ProgressObserver): Promise<SubmittedActionHandle> {
    await this.#notify({ phase: 'wallet' }, observer)
    let signed: Readonly<{ signature: string }>
    try {
      signed = await this.#wallet.signAndSend(prepared)
      if (!this.#validateSignature(prepared.message, signed.signature)) throw new SubmissionSignatureError()
    } catch (error) {
      await this.#notify({ phase: 'error', error }, observer)
      throw error
    }

    const handle = SubmittedActionHandle.create(signed.signature, prepared.message)
    this.#states.set(handle, {})
    await this.#notify({ phase: 'submitted', signature: handle.signature }, observer)
    return handle
  }

  confirm(handle: SubmittedActionHandle, observer?: ProgressObserver): Promise<Confirmation> {
    const state = this.#states.get(handle)
    if (!state) return Promise.reject(new InvalidSubmittedActionError())
    if (state.promise) return state.promise

    state.promise = (async () => {
      await this.#notify({ phase: 'confirming', signature: handle.signature }, observer)
      try {
        const result = await this.#confirmReader(handle.signature)
        await this.#notify({ phase: 'confirmed', signature: result.signature }, observer)
        return result
      } catch (error) {
        await this.#notify({ phase: 'error', signature: handle.signature, error }, observer)
        throw error
      }
    })()
    return state.promise
  }

  async #notify(event: ProgressEvent, direct?: ProgressObserver): Promise<void> {
    const frozen = Object.freeze({ ...event })
    const observers = direct ? [...this.#subscribers, direct] : [...this.#subscribers]
    for (const observer of observers) {
      try { await observer(frozen) } catch { /* UI observers are not custody authorities. */ }
    }
  }
}

/** Compatibility facade composed from the split primitives; no second wallet call. */
export class CombinedSubmitter {
  readonly #split: SplitSubmitter

  constructor(
    wallet: Wallet,
    validateSignature: SignatureValidator,
    confirmReader: ConfirmationReader,
    split?: SplitSubmitter,
  ) {
    this.#split = split ?? new SplitSubmitter(wallet, validateSignature, confirmReader)
  }

  async submitAndConfirm(prepared: PreparedAction, observer?: ProgressObserver): Promise<Confirmation> {
    const handle = await this.#split.submit(prepared, observer)
    return this.#split.confirm(handle, observer)
  }
}
