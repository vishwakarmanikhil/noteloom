---
'noteloom': minor
---

The "/" slash command menu no longer opens on a real phone/tablet (`(hover: none) and (pointer: coarse)`, via new `useTouchOnlyDevice` — a static device classification, unaffected by an individual touch/mouse event, unlike `useCoarsePointer`) — `MobileActionBar`'s own "+" picker (already pinned above the on-screen keyboard) is the intended way to insert a block there instead. A laptop touchscreen (2-in-1s included) is unaffected: it still has a trackpad/mouse as its primary pointer, so `/` keeps opening the menu as usual.

`FloatingToolbar`/`NoteloomEditor` gain an optional `voice` prop — pass the object `useVoiceTyping({ store: editor.store })` (from the separate `noteloom/voice` entry point) returns to surface a mic button in the floating format toolbar that toggles dictation (start/stop, labeled "Start dictation"/"Pause dictation"). Omitting `voice` (the default) keeps `noteloom/voice` and its `SpeechRecognition`-related code entirely out of your bundle — this component never imports it itself. Mount `VoiceListeningIndicator`/`VoicePermissionModal` yourself alongside the same `voice` object for the "Listening…" badge and the mic-blocked dialog, same as before.

`useVoiceTyping` also gains an optional `store` option: normally it reads the store off `<EditorProvider>` context, but the call site for the `voice` prop above sits outside the Provider `<NoteloomEditor>` creates internally, so it needs the store passed explicitly instead. New `useOptionalEditorStore` (internal, not part of the public API) is what makes this possible without throwing when no Provider is present yet.
