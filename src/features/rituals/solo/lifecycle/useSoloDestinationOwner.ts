import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { PublicKey } from '@solana/web3.js'
import { useConnection } from '../../../../utils/ConnectionProvider'
import { listKnownRituals } from '../../authoritativeRituals'
import { labelSoloDestination } from './soloRitualModel'
import { resolveSoloDestinationOwner } from './destinationOwner'

export function useSoloDestinationOwner(ritualId: string, destination?: PublicKey, mint?: PublicKey): PublicKey | null {
  const { connection } = useConnection()
  const destinationText = destination?.toBase58()
  const mintText = mint?.toBase58()
  const target = `${ritualId}:${destinationText}:${mintText}`
  const [resolved, setResolved] = useState<{ target: string; owner: PublicKey | null } | null>(null)
  useFocusEffect(useCallback(() => {
    if (!destinationText || !mintText) return
    const account = new PublicKey(destinationText)
    // Named demo causes need no extra read.
    if (labelSoloDestination(account) !== 'the wallet you chose') return
    let active = true
    void listKnownRituals()
      .then((known) => resolveSoloDestinationOwner(connection, account, new PublicKey(mintText), known.find((item) => item.address === ritualId)?.destinationOwner))
      .then((owner) => { if (active) setResolved({ target, owner }) })
      .catch(() => { if (active) setResolved({ target, owner: null }) })
    return () => { active = false }
  }, [connection, ritualId, destinationText, mintText, target]))
  return resolved?.target === target ? resolved.owner : null
}
