import React, { useState } from 'react'
import { ScrollView, StyleSheet, Text as RNText, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { TextInput } from 'react-native-paper'
import { PublicKey } from '@solana/web3.js'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigators/AppNavigator'
import { useRitualClient } from '../features/rituals/client/useRitualClient'
import { decodeRitualInvite, onchainInviteView } from '../features/rituals/invite/inviteCodec'
import { verifyInvite, type RitualInvite } from '../domain/rituals/invite'
import { rememberRitual, formatAtomic } from '../features/rituals/authoritativeRituals'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ActionButton, ErrorLine, Footnote, Poster, PosterLine } from '../components/crew'
import { color, memberColor, radius, space, type } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'JoinRitual'>
type JoinState = Readonly<{ status: 'idle' | 'loading' | 'valid' | 'error'; invite?: RitualInvite; message?: string }>

export function JoinRitualScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const client = useRitualClient()
  const [input, setInput] = useState(route.params?.invite ?? '')
  const [state, setState] = useState<JoinState>({ status: 'idle' })

  const loadClipboard = async () => {
    const value = await Clipboard.getStringAsync()
    setInput(value.trim())
    setState({ status: 'idle' })
  }

  const verify = async () => {
    setState({ status: 'loading' })
    try {
      if (client.status !== 'ready') throw new JoinError("Rituals isn't reachable right now. Try again in a moment.")
      let invite: RitualInvite
      try { invite = decodeRitualInvite(input.trim()) } catch { throw new JoinError("That doesn't look like a Rituals invite. Ask your friend to send it again.") }
      const read = await client.client.readRitual(new PublicKey(invite.ritual))
      const result = verifyInvite(invite, onchainInviteView(read))
      if (!result.ok) throw new JoinError("This invite doesn't match the ritual it points to. Ask your friend for a fresh one.")
      await rememberRitual({ address: invite.ritual, title: invite.rules.title, requirement: invite.rules.requirement })
      setState({ status: 'valid', invite })
    } catch (error) {
      setState({ status: 'error', message: error instanceof JoinError ? error.message : "We couldn't open this invite. Check your connection and try again." })
    }
  }

  const invite = state.status === 'valid' ? state.invite : undefined

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <RNText style={s.title} accessibilityRole="header">Join a ritual</RNText>

      {!invite && (
        <>
          <View style={s.field} accessibilityLabel="Invite input">
            <TextInput
              mode="outlined"
              label="Invite"
              value={input}
              onChangeText={(value) => { setInput(value); setState({ status: 'idle' }) }}
              numberOfLines={1}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Invite link"
              style={s.input}
            />
          </View>
          <View style={s.row}>
            <ActionButton tone="quiet" label="Paste" onPress={() => { void loadClipboard() }} accessibilityLabel="Paste from clipboard" style={s.half} />
            <ActionButton label="Open invite" onPress={() => { void verify() }} loading={state.status === 'loading'} disabled={!input.trim() || state.status === 'loading'} accessibilityLabel="Verify invite" style={s.half} />
          </View>
          {state.status === 'error' && <ErrorLine>{state.message}</ErrorLine>}
        </>
      )}

      {invite && (
        <View accessibilityLabel="Verified ritual terms" style={s.terms}>
          <Poster tint={memberColor(0)} kicker="You're invited" title={invite.rules.title}>
            <PosterLine label="Each person puts in" value={formatAtomic(invite.rules.memberTotalStake, 6)} />
            <PosterLine label="Check-ins" value={invite.rules.additionalConfirmationThreshold === 0 ? 'Honor system' : `${invite.rules.additionalConfirmationThreshold} friend${invite.rules.additionalConfirmationThreshold === 1 ? '' : 's'} confirm`} />
          </Poster>
          <RNText style={s.body}>{invite.rules.requirement}</RNText>
          <RNText style={s.note}>These rules are locked. Nothing happens until you approve your stake.</RNText>
          <ActionButton label="Continue" onPress={() => navigation.navigate('RitualAction', { ritualId: invite.ritual, phase: 'fund' })} accessibilityLabel="Continue to funding" />
        </View>
      )}

      <Footnote>Devnet · TEST tokens have no real value</Footnote>
    </ScrollView>
  )
}

class JoinError extends Error {}

const s = StyleSheet.create({
  screen: { backgroundColor: color.bg },
  content: { padding: space.screen, paddingBottom: 48, gap: space.md },
  title: { ...type.display, color: color.fg },
  field: { backgroundColor: color.card, borderRadius: radius.lg },
  input: { backgroundColor: color.card },
  row: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1 },
  terms: { gap: space.md },
  body: { ...type.body, color: color.fg },
  note: { ...type.caption, color: color.muted },
})
