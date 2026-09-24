import React, { useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Button, Card, Text, TextInput, useTheme, type MD3Theme } from 'react-native-paper'
import { PublicKey } from '@solana/web3.js'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { decodeRitualInvite, onchainInviteView } from '../features/rituals/invite/inviteCodec'
import { verifyInvite, type RitualInvite } from '../domain/rituals/invite'

type Props = NativeStackScreenProps<RootStackParamList, 'JoinRitual'>
type JoinState = Readonly<{ status: 'idle' | 'loading' | 'invalid' | 'valid' | 'error'; invite?: RitualInvite; message?: string }>

export function JoinRitualScreen({ route }: Props) {
  const styles = makeStyles(useTheme())
  const client = useRitualClient()
  const [input, setInput] = useState(route.params?.invite ?? '')
  const [state, setState] = useState<JoinState>({ status: 'idle' })

  const loadClipboard = async () => {
    const value = await Clipboard.getStringAsync()
    setInput(value)
    setState({ status: 'idle' })
  }

  const verify = async () => {
    setState({ status: 'loading' })
    try {
      if (client.status !== 'ready') throw new Error('Rituals are not available on this network.')
      const invite = decodeRitualInvite(input.trim())
      const read = await client.client.readRitual(new PublicKey(invite.ritual))
      const result = verifyInvite(invite, onchainInviteView(read))
      if (!result.ok) throw new Error(`This invite could not be verified (${result.reason}).`)
      setState({ status: 'valid', invite })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'This invite could not be verified.' })
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text variant="headlineMedium" accessibilityRole="header">Join a ritual</Text>
      <Text style={styles.muted}>Paste the invite. We read the Ritual from devnet and verify its digest before showing terms.</Text>
      <Card style={styles.card} accessibilityLabel="Invite input">
        <Card.Content>
          <TextInput label="Invite link" value={input} onChangeText={(value) => { setInput(value); setState({ status: 'idle' }) }} multiline accessibilityLabel="Invite link" />
          <Button mode="text" onPress={() => { void loadClipboard() }}>Paste from clipboard</Button>
          <Button mode="contained" onPress={() => { void verify() }} loading={state.status === 'loading'} disabled={!input.trim() || state.status === 'loading'}>Verify invite</Button>
          {state.status === 'error' && <Text style={styles.error} accessibilityLiveRegion="polite">{state.message}</Text>}
        </Card.Content>
      </Card>
      {state.status === 'valid' && state.invite && (
        <Card style={styles.card} accessibilityLabel="Verified ritual terms">
          <Card.Content>
            <Text variant="titleLarge">{state.invite.rules.title}</Text>
            <Text style={styles.verified}>VERIFIED AGAINST ON-CHAIN DIGEST</Text>
            <Text style={styles.body}>{state.invite.rules.requirement}</Text>
            <Text style={styles.term}>Stake per member · {state.invite.rules.memberTotalStake.toString()} atomic TEST units</Text>
            <Text style={styles.term}>Friends confirm · {state.invite.rules.additionalConfirmationThreshold} required</Text>
            <Text style={styles.muted}>These terms are locked by the confirmed Ritual. Review them before funding; nothing has been submitted.</Text>
            <Button mode="outlined" disabled accessibilityLabel="Funding unavailable until wallet connection">Continue to funding</Button>
          </Card.Content>
        </Card>
      )}
      <Text style={styles.disclosure}>DEVNET · TEST TOKENS HAVE NO REAL VALUE</Text>
    </ScrollView>
  )
}

const makeStyles = (theme: MD3Theme) => StyleSheet.create({
  content: { padding: 20, gap: 14 },
  card: { borderRadius: 18 },
  muted: { color: theme.colors.onSurfaceVariant, lineHeight: 20, marginTop: 8 },
  body: { lineHeight: 22, marginTop: 12 },
  term: { fontWeight: '700', marginTop: 10 },
  verified: { color: theme.colors.primary, fontSize: 11, fontWeight: '700', marginTop: 8 },
  error: { color: theme.colors.error, marginTop: 10 },
  disclosure: { color: theme.colors.onSurfaceVariant, fontSize: 11, textAlign: 'center', marginVertical: 10 },
})
