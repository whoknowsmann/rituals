/**
 * Ink stamp: the commitment moment made visible. Spec: docs/DESIGN.md "Stamp".
 * Thumps in (scale 1.6 -> 1, fade) once; static when reduce-motion is on.
 */
import React, { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { color, fonts, themedStyles, useColors } from '../../theme'
import { stampSpec, type StampKind } from './stampSpec'

export function Stamp({ kind, note, animate = true }: { kind: StampKind; note?: string; animate?: boolean }) {
  const s = useS()
  const color = useColors()
  const spec = stampSpec(kind)
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current
  useEffect(() => {
    if (!animate) return
    let cancelled = false
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return
      if (reduce) { v.setValue(1); return }
      Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }).start()
    }).catch(() => v.setValue(1))
    return () => { cancelled = true }
  }, [animate, v])
  const ink = spec.tone === 'ink' ? color.stampInk : color.stampQuiet
  return (
    <View style={s.wrap} accessibilityRole="text" accessibilityLabel={note ? `${spec.label}. ${note}` : spec.label}>
      <Animated.View
        style={[
          s.stamp,
          { borderColor: ink, transform: [{ rotate: `${spec.rotateDeg}deg` }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }], opacity: v },
        ]}
      >
        <View style={[s.inner, { borderColor: ink }]}>
          <Text style={[s.label, { color: ink }]}>{spec.label}</Text>
        </View>
      </Animated.View>
      {note ? <Text style={s.note}>{note}</Text> : null}
    </View>
  )
}

const useS = themedStyles((color) => StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  stamp: { borderWidth: 3, borderRadius: 10, padding: 3 },
  inner: { borderWidth: 1.5, borderRadius: 7, paddingHorizontal: 18, paddingVertical: 8 },
  label: { fontFamily: fonts.heavy, fontSize: 22, letterSpacing: 3 },
  note: { fontFamily: fonts.hand, fontSize: 20, color: color.fg },
}))
