import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { parseErrorMessage, parseRiderLink, RiderLink } from '../link';
import { colors, radius, space, type } from '../theme';
import { BigButton, Body, Brand, Notice, Screen, Title } from '../ui';

type Props = {
  onLink: (link: RiderLink) => void;
  /** Message from a link that was opened but couldn't be used (e.g. customer link, expired link). */
  message?: string | null;
};

export function LinkEntryScreen({ onLink, message }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(value = text) {
    const r = parseRiderLink(value);
    if (!r.ok) {
      setError(parseErrorMessage[r.reason]);
      return;
    }
    setError(null);
    onLink(r.link);
  }

  async function pasteFromClipboard() {
    const value = (await Clipboard.getStringAsync()).trim();
    if (!value) {
      setError('Nothing copied yet. In WhatsApp, long-press the link and tap Copy.');
      return;
    }
    setText(value);
    submit(value);
  }

  return (
    <Screen
      footer={
        <>
          <BigButton label="Paste link from WhatsApp" onPress={pasteFromClipboard} />
          <BigButton label="Open this link" variant="secondary" onPress={() => submit()} disabled={!text.trim()} />
        </>
      }
    >
      <Brand />
      <View style={{ height: space.md }} />
      <Title>Open the rider link your seller sent you</Title>
      <Body muted>
        Tap the link in WhatsApp and it opens here. Or copy it and paste it below.
      </Body>

      {message ? <Notice tone="danger">{message}</Notice> : null}

      <TextInput
        value={text}
        onChangeText={(v) => {
          setText(v);
          if (error) setError(null);
        }}
        onSubmitEditing={() => submit()}
        placeholder="usetracktech.com/track/…"
        placeholderTextColor={colors.inkMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        multiline
        style={s.input}
        accessibilityLabel="Rider link"
      />

      {error ? <Notice tone="danger">{error}</Notice> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  input: {
    minHeight: 96,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: type.body,
    color: colors.ink,
    textAlignVertical: 'top',
  },
});
