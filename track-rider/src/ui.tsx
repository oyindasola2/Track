import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BUTTON_HEIGHT, colors, radius, space, type } from './theme';

/** Full-screen layout: scrollable content on top, actions pinned to the bottom (thumb zone). */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

export function BigButton({ label, onPress, variant = 'primary', disabled, loading, style }: BtnProps) {
  const isGhost = variant === 'ghost';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        variant === 'primary' && { backgroundColor: pressed ? colors.yellowPressed : colors.yellow },
        variant === 'secondary' && [s.btnSecondary, pressed && { backgroundColor: colors.creamDeep }],
        isGhost && s.btnGhost,
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <Text style={[s.btnText, isGhost && s.btnGhostText]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[s.body, muted && { color: colors.inkMuted }]}>{children}</Text>;
}

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'danger' | 'ok' }) {
  const bg = tone === 'danger' ? colors.dangerBg : tone === 'ok' ? colors.okBg : colors.warnBg;
  const fg = tone === 'danger' ? colors.danger : tone === 'ok' ? colors.ok : colors.ink;
  return (
    <View style={[s.notice, { backgroundColor: bg }]}>
      <Text style={[s.noticeText, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={s.dots} accessibilityLabel={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[s.dot, i <= current && { backgroundColor: colors.ink, width: 28 }]} />
      ))}
    </View>
  );
}

export function Brand() {
  return (
    <View style={s.brand}>
      <Text style={s.brandMain}>Track</Text>
      <Text style={s.brandSub}>RIDER</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: space.lg, paddingTop: space.xl, gap: space.md, flexGrow: 1 },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.cream,
  },
  btn: {
    minHeight: BUTTON_HEIGHT,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.ink },
  btnGhost: { backgroundColor: 'transparent', minHeight: 52 },
  btnText: { fontSize: type.button, fontWeight: '800', color: colors.ink },
  btnGhostText: { fontSize: type.small + 1, fontWeight: '700', textDecorationLine: 'underline' },
  title: { fontSize: type.title, fontWeight: '900', color: colors.ink, lineHeight: 36 },
  body: { fontSize: type.body, color: colors.inkSoft, lineHeight: 27 },
  notice: { borderRadius: 14, padding: space.md },
  noticeText: { fontSize: type.small + 1, fontWeight: '700', lineHeight: 23 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { height: 8, width: 8, borderRadius: 4, backgroundColor: colors.line },
  brand: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  brandMain: { fontSize: 26, fontWeight: '900', color: colors.ink, letterSpacing: -1 },
  brandSub: { fontSize: 13, fontWeight: '800', color: colors.inkMuted, letterSpacing: 3, paddingBottom: 5 },
});
