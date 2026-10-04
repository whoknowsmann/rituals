import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native'
import { color, memberColors } from '../../theme'

/**
 * A short paper-confetti burst for a confirmed stamp. Each change of `fire`
 * (a counter) launches one burst from `originY`. Transforms and opacity only,
 * on the native driver; no extra packages. Ignores touches.
 */
export function Confetti({ fire, originY = 260, pieces = 42 }: { fire: number; originY?: number; pieces?: number }) {
  const t = useRef(new Animated.Value(0)).current
  // Fire only when `fire` changes after mount: a remount must never replay a burst.
  const lastFire = useRef(fire)
  const [active, setActive] = useState(false)
  const { width } = Dimensions.get('window')
  const bits = useMemo(() => Array.from({ length: pieces }, (_, index) => {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * Math.PI * 1.1
    const speed = 160 + Math.random() * 240
    return {
      key: `${fire}:${index}`,
      dx: Math.cos(angle) * speed,
      rise: Math.sin(angle) * speed,
      fall: 380 + Math.random() * 260,
      spin: `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg`,
      tint: [color.go, color.goDeep, color.stampInk, ...memberColors][index % (3 + memberColors.length)],
      w: 6 + Math.random() * 6,
      h: 10 + Math.random() * 8,
    }
  }), [fire, pieces])

  useEffect(() => {
    if (fire === lastFire.current) return
    lastFire.current = fire
    setActive(true)
    t.setValue(0)
    Animated.timing(t, { toValue: 1, duration: 1700, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => setActive(false))
  }, [fire, t])

  if (!active) return null
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bits.map((bit) => (
        <Animated.View
          key={bit.key}
          style={[styles.bit, {
            left: width / 2,
            top: originY,
            width: bit.w,
            height: bit.h,
            backgroundColor: bit.tint,
            opacity: t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, bit.dx] }) },
              { translateY: t.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, bit.rise, bit.rise + bit.fall] }) },
              { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', bit.spin] }) },
            ],
          }]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bit: { position: 'absolute', borderRadius: 2 },
})
