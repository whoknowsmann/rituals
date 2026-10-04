import React, { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { color, type } from '../../theme'
import { HOLD_DURATION_MS, quartersCrossed, shouldUseTapFallback } from './holdButtonLogic'

export type HoldButtonProps = {
  onComplete: () => void
  disabled?: boolean
  done?: boolean
  label?: string
  doneLabel?: string
  accessibilityLabel?: string
  /** Diameter in px. The stamp button is the screen's main action, so it is big. */
  size?: number
}

const tick = () => { void Haptics.selectionAsync().catch(() => {}) }
const press = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}) }
const full = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const RING = 6

/**
 * The commitment control: press and hold while it fills from the bottom like
 * a glass, with a ring tracing the edge and a light tick each quarter. Full =
 * a firm buzz, then onComplete (which opens the wallet). Letting go early
 * drains it. A screen-reader user gets an ordinary accessible tap instead.
 */
export function HoldButton({
  onComplete,
  disabled = false,
  done = false,
  label = 'Hold',
  doneLabel = 'Done',
  accessibilityLabel = 'Hold to continue',
  size = 196,
}: HoldButtonProps) {
  const progress = useRef(new Animated.Value(done ? 1 : 0)).current
  const scale = useRef(new Animated.Value(1)).current
  const animation = useRef<Animated.CompositeAnimation | null>(null)
  const lastProgress = useRef(0)
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

  // One light tick at 25 / 50 / 75 %.
  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      if (quartersCrossed(lastProgress.current, value) > 0) tick()
      lastProgress.current = value
    })
    return () => progress.removeListener(id)
  }, [progress])

  useEffect(() => {
    if (done) {
      animation.current?.stop()
      setHolding(false)
      progress.setValue(1)
    }
  }, [done, progress])

  const settleScale = (to: number, bounce = false) => {
    Animated.spring(scale, { toValue: to, useNativeDriver: true, friction: bounce ? 3 : 7, tension: bounce ? 160 : 120 }).start()
  }

  const complete = () => {
    if (disabled || done) return
    animation.current?.stop()
    setHolding(false)
    progress.setValue(1)
    full()
    scale.setValue(1.06)
    settleScale(1, true)
    onComplete()
  }

  const start = () => {
    if (disabled || done || tapFallback) return
    setHolding(true)
    press()
    settleScale(0.96)
    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      easing: Easing.inOut(Easing.quad),
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
    settleScale(1)
    Animated.timing(progress, { toValue: 0, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false }).start()
  }

  const radiusPx = (size - RING) / 2
  const circumference = 2 * Math.PI * radiusPx
  const fillHeight = progress.interpolate({ inputRange: [0, 1], outputRange: [0, size] })
  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size, transform: [{ scale }] }]}>
      <Pressable
        onPressIn={start}
        onPressOut={cancel}
        onPress={tapFallback ? complete : undefined}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={tapFallback ? 'Double tap to activate' : 'Press and hold until it fills'}
        accessibilityState={{ disabled, busy: holding }}
        style={[styles.button, { width: size, height: size, borderRadius: size / 2 }, disabled && styles.disabled]}
      >
        <Animated.View style={[styles.fill, { height: fillHeight }]} />
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Circle cx={size / 2} cy={size / 2} r={radiusPx} stroke={color.line} strokeWidth={RING} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radiusPx}
            stroke={color.goInk}
            strokeWidth={RING}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.labels} pointerEvents="none">
          <Text style={styles.label}>{done ? doneLabel : label}</Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  button: { overflow: 'hidden', backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: color.go },
  labels: { alignItems: 'center', gap: 2 },
  label: { ...type.title, color: color.fg, letterSpacing: 2 },
  hint: { ...type.caption, color: color.muted },
})
