import React, { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { color, radius, type } from '../../theme'
import { HOLD_DURATION_MS, shouldUseTapFallback } from './holdButtonLogic'

export type HoldButtonProps = {
  onComplete: () => void
  disabled?: boolean
  done?: boolean
  label?: string
  doneLabel?: string
  accessibilityLabel?: string
}

const haptic = (kind: 'light' | 'success') => {
  const action = kind === 'light'
    ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  void action.catch(() => {})
}

/**
 * A reusable commitment control. A normal user holds for 700 ms; a screen-reader
 * user gets an ordinary accessible tap instead of a gesture with no spoken cue.
 */
export function HoldButton({
  onComplete,
  disabled = false,
  done = false,
  label = 'Hold',
  doneLabel = 'Done',
  accessibilityLabel = 'Hold to continue',
}: HoldButtonProps) {
  const progress = useRef(new Animated.Value(done ? 1 : 0)).current
  const animation = useRef<Animated.CompositeAnimation | null>(null)
  const [holding, setHolding] = useState(false)
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false)
  const tapFallback = shouldUseTapFallback(screenReaderEnabled)

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) setScreenReaderEnabled(shouldUseTapFallback(enabled))
    }).catch(() => {})
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      setScreenReaderEnabled(shouldUseTapFallback(enabled))
    })
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    if (done) {
      animation.current?.stop()
      setHolding(false)
      progress.setValue(1)
    }
  }, [done, progress])

  const complete = () => {
    if (disabled || done) return
    animation.current?.stop()
    setHolding(false)
    progress.setValue(1)
    haptic('success')
    onComplete()
  }

  const start = () => {
    if (disabled || done || tapFallback) return
    setHolding(true)
    haptic('light')
    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    })
    animation.current.start(({ finished }) => {
      setHolding(false)
      if (finished) complete()
    })
  }

  const cancel = () => {
    if (disabled || done || tapFallback) return
    animation.current?.stop()
    setHolding(false)
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: false }).start()
  }

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      onPress={tapFallback ? complete : undefined}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={tapFallback ? 'Double tap to activate' : 'Press and hold until the progress fill completes'}
      accessibilityState={{ disabled, busy: holding }}
      style={[styles.button, disabled && styles.disabled]}
    >
      <View style={styles.core}>
        <Animated.View style={[styles.progressFill, { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }, { scaleY: progress }] }]} />
        <Text style={styles.label}>{done ? doneLabel : label}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  core: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', backgroundColor: color.go, alignItems: 'center', justifyContent: 'center' },
  progressFill: { ...StyleSheet.absoluteFillObject, backgroundColor: color.white, borderRadius: radius.pill, opacity: 0.92 },
  label: { ...type.caption, fontFamily: type.heading.fontFamily, color: color.fg, textAlign: 'center', zIndex: 1 },
})
