# Text-to-Speech (TTS) Integration Notes

**Project:** OpenRoom / VibeApps
**Scope:** Current TTS, speech synthesis, voice, and audio playback integration points

---

## Summary

OpenRoom / VibeApps does not currently include a TTS integration.

The current AI character interaction flow is text-and-image oriented. Audio-related code is limited to:

1. A music player app that streams MP3s via `HTMLAudioElement`
2. Muted video elements for character avatars and live wallpaper
3. Generic binary file storage capable of holding arbitrary bytes, used today for generated images and uploaded character assets

MiniMax may offer TTS APIs separately, but this codebase does not integrate them. The MiniMax provider is configured only for text chat via the Anthropic-compatible endpoint.

---

## Core File Analysis

### 1. `src/lib/llmClient.ts` (379 lines)

The LLM client handles all AI model communication. It is strictly text-only.

- **`ChatMessage` interface** (line 6): ONLY `content: string` — no audio fields
- **`LLMResponse` interface** (line 12): ONLY `content: string` + `toolCalls` — no audio
- **`chatOpenAI()`** (line 88): parses `choices[0].message` — only text content + tool_calls
- **`chatAnthropic()`** (line 204): parses `data.content` blocks — only `type: 'text'` and `type: 'tool_use'` — no audio blocks
- **Request body for both paths:** `{ model, messages, tools? }` — no `modalities`, no `audio`, no `voice`
- **MiniMax provider** goes through `chatAnthropic()` path with Anthropic-compatible format

```typescript
// llmClient.ts:6-14
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;           // <-- string only, no audio
}

export interface LLMResponse {
  content: string;           // <-- string only, no audio
  toolCalls?: ToolCall[];
}
```

### 2. `src/components/ChatPanel/useConversationEngine.ts` (386 lines)

The conversation engine orchestrates all LLM interactions and tool execution. No TTS tool exists.

- **`ConversationDisplayMessage`** (line 24): `content: string`, optional `imageUrl: string` — NO audio field
- **`executeToolCall()`** (line 312): handles respond_to_user, finish_target, list_apps, file tools, image gen, memory tools, app_action — NO TTS tool
- **`respond_to_user` tool result** (line 340): only `content` (text) + `emotion` (string) — no audio

```typescript
// useConversationEngine.ts:24-33
export interface ConversationDisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  imageUrl?: string;         // <-- audioUrl?: string; is MISSING
  emotion?: string;
  suggestedReplies?: string[];
  toolCalls?: string[];
}
```

### 3. `src/components/ChatPanel/toolDefinitions.ts` (136 lines)

Tool definitions schema the LLM's available actions. No speech or voice tools are defined.

- **`respond_to_user` tool schema** (line 45): `character_expression.content` (string), `character_expression.emotion` (string) — no audio
- **System prompt** (line 78): instructs to use `respond_to_user` and optionally `generate_image` — no mention of speech/voice/audio

```typescript
// toolDefinitions.ts:45-60
character_expression: {
  type: 'object',
  properties: {
    content: { type: 'string' },   // <-- text only
    emotion: { type: 'string' },   // <-- text only
  },
}
```

### 4. `src/lib/llmModels.ts` (188 lines)

Model configuration and provider definitions. All models are text-only.

- **MiniMax config** (line 56): `baseUrl: 'https://api.minimax.io/anthropic/v1'` — text-only Anthropic-compatible endpoint
- **All MiniMax models** are text LLMs (M2.5, M2.7, M2.1, M2) — no TTS models listed
- **No `modalities`, `audio`, or `voice` fields** in `LLMConfig`

```typescript
// llmModels.ts:56-62
minimax: {
  baseUrl: 'https://api.minimax.io/anthropic/v1',
  models: ['MiniMax-M2.5', 'MiniMax-M2.7', 'MiniMax-M2.1', 'MiniMax-M2'],
  // <-- no audio models, no voice config
}
```

### 5. `src/components/ChatPanel/SettingsModal.tsx`

Settings UI has two sections: LLM Settings and Image Generation — **NO TTS settings section**.

- Default provider: minimax — but this is for text chat only
- No voice selection, no speech rate, no audio output toggle

---

## MiniMax Provider Context

The codebase is from MiniMax-AI (GitHub org, license, author fields). Key facts:

- **MiniMax as a company** likely offers TTS APIs commercially
- **This open-source codebase** does NOT integrate any MiniMax TTS capabilities
- The MiniMax provider is configured **only for text chat** via the Anthropic-compatible endpoint (`api.minimax.io/anthropic/v1`)
- All MiniMax models listed (`MiniMax-M2.5`, `MiniMax-M2.7`, etc.) are text LLMs
- No MiniMax audio endpoint, voice ID, or TTS model configuration exists

If MiniMax offers a standalone TTS API, it would require vendor research and a new provider implementation following the same pattern as OpenAI/Gemini image generation.

---

## Existing Audio-Adjacent Systems

While TTS does not exist, the following systems represent the **full extent** of audio handling in the codebase.

### 1. MusicApp — Native HTMLAudioElement Music Player

**File:** `apps/webuiapps/src/pages/MusicApp/index.tsx`

The only component that performs actual audio playback. Uses the browser's native `HTMLAudioElement` API (not Web Audio API) to stream MP3 files.

```typescript
// Line 301
const audioRef = useRef<HTMLAudioElement | null>(null);

// Line 326-328
useEffect(() => {
  audioRef.current = new Audio();
  audioRef.current.volume = playerState.volume;
  // ...
}, []);
```

**Capabilities:**
- Playback controls: play, pause, seek, next/previous track
- Volume slider (0.0–1.0 range) with mute toggle
- Event listeners: `timeupdate`, `ended`
- State management: `PlayerState` with `volume`, `currentTime`, `isPlaying`

**Relevance to TTS:** The `HTMLAudioElement` + volume control pattern could be **reused** as the playback layer for a TTS system, but it is currently app-scoped and not exported as a reusable component or hook.

### 2. Character Avatar Videos — Explicitly MUTED

**File:** `apps/webuiapps/src/components/ChatPanel/ChatSubComponents.tsx`

Character emotions are expressed via layered `<video>` elements. All are **explicitly muted**.

```tsx
// Line 171-182
<video
  key={layer.url}
  className={styles.avatarImage}
  style={layerStyle}
  src={layer.url}
  autoPlay
  loop={layer.active ? isIdle : false}
  muted          // <-- explicitly muted
  playsInline
  onCanPlay={!layer.active ? () => handleMediaReady(layer.url) : undefined}
  onEnded={layer.active && !isIdle ? onEmotionEnd : undefined}
/>
```

**Relevance to TTS:** The video avatar system has no audio pipeline. A TTS system would need to play audio independently of these video layers.

### 3. Live Wallpaper Video — MUTED

**File:** `apps/webuiapps/src/components/Shell/index.tsx`

The desktop live wallpaper is a looping background video, also muted.

```tsx
// Line 322
<video src={wallpaper} autoPlay loop muted playsInline />
```

### 4. Generic Binary File Storage (Image-Only Today)

**File:** `apps/webuiapps/src/lib/diskStorage.ts`

The storage layer supports binary file writes via `putBinaryFile`, which accepts base64 data, decodes it to a `Uint8Array`, and POSTs it to the session-data API with the provided MIME type.

```typescript
// Line 99-114
export async function putBinaryFile(
  filePath: string,
  base64: string,
  mimeType: string,
): Promise<void> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  await fetch(apiUrl(filePath), {
    method: 'POST',
    headers: { 'Content-Type': mimeType },
    body: bytes,
  });
}
```

**Current Usage:** Called from `imageGenTools.ts` to save generated images and from `characterAssetUpload.ts` to save uploaded character images/videos.

**Relevance to TTS:** This is the **exact storage mechanism** a TTS system would use to save generated audio files (e.g., `audio/mp3`, `audio/wav`). No code changes needed to the storage layer — it is already capable of persisting arbitrary binary data.

### 5. Image Generation System — The Pattern to Follow

**Files:**
- `apps/webuiapps/src/lib/imageGenClient.ts`
- `apps/webuiapps/src/lib/imageGenTools.ts`

The image generation system is the **canonical example** of how a new AI modality is integrated into OpenRoom. A TTS system should follow this exact architecture.

#### 5a. `imageGenClient.ts` — Provider-Agnostic API Client

```typescript
export type ImageGenProvider = 'openai' | 'gemini';

export interface ImageGenConfig {
  provider: ImageGenProvider;
  apiKey: string;
  hasApiKey?: boolean;
  baseUrl: string;
  model: string;
  customHeaders?: string;
}

export interface ImageGenResult {
  base64: string;
  mimeType: string;
}
```

- Supports multiple providers (OpenAI DALL-E, Gemini) via unified interface
- Uses `/api/llm-proxy` server-side proxy to avoid exposing API keys client-side
- Returns `{ base64, mimeType }` — provider-specific response parsing is hidden
- Config is loaded via `configPersistence.ts` alongside LLM config

#### 5b. `imageGenTools.ts` — LLM Tool Bridge

```typescript
const TOOL_NAME = 'generate_image';
const IMAGES_DIR = 'generated-images';

export function getImageGenToolDefinitions() {
  return [{
    type: 'function',
    function: {
      name: TOOL_NAME,
      description: 'Generate an image from a text prompt. The image is displayed in chat and saved to disk. Returns a url.',
      parameters: {
        type: 'object',
        properties: { prompt: { type: 'string', description: 'Detailed description of the image to generate' } },
        required: ['prompt'],
      },
    },
  }];
}

export async function executeImageGenTool(params, config) {
  const imageResult = await generateImage(params.prompt || '', config);
  const ext = mimeToExt(imageResult.mimeType);
  const fileName = `img-${Date.now()}.${ext}`;
  const filePath = `${IMAGES_DIR}/${fileName}`;
  await idb.putBinaryFile(filePath, imageResult.base64, imageResult.mimeType);
  const url = buildFileUrl(filePath);
  return { result: `success: image generated, url=${url}`, dataUrl };
}
```

**Integration points:**
- `useConversationEngine.ts` checks `hasUsableImageGenConfig()` and conditionally includes image gen tools in the LLM tool list
- `toolDefinitions.ts` receives `hasImageGen` flag to build system prompt instructions
- `configPersistence.ts` stores `imageGen` config alongside `llm` config
- `SettingsModal.tsx` provides a full UI panel for Image Generation settings (provider, API key, base URL, model)

---

## Architecture Gap Analysis

The following components are **missing** and would need to be created to support TTS:

| # | Missing Component | What Exists Instead | Effort |
|---|-------------------|---------------------|--------|
| 1 | **TTS Client Module** | `imageGenClient.ts` exists; no `ttsClient.ts` | Medium — copy pattern |
| 2 | **TTS Config Model** | `ImageGenConfig` exists; no `TTSConfig` | Low — extend types |
| 3 | **TTS LLM Tool** | `generate_image` tool exists; no `speak` / `generate_speech` | Low — add tool def |
| 4 | **Character Voice Data** | `CharacterMetaInfo` has images/videos; no `voice_id` / `tts_enabled` | Low — extend types |
| 5 | **Audio Playback Infrastructure** | MusicApp has `HTMLAudioElement` usage; no reusable hook/component | Low — extract hook |
| 6 | **Audio UI Controls** | Image gen displays in chat; no speaker icon / play button for messages | Medium — UI work |
| 7 | **Audio File API** | `fileApi.ts` is text/JSON only; no audio read helpers | Low — not needed if using `diskStorage.putBinaryFile` directly |
| 8 | **Streaming Support** | No `ReadableStream`, `Blob`, `MediaRecorder` usage anywhere | Medium if streaming TTS desired |
| 9 | **Settings UI Panel** | SettingsModal has LLM + Image Gen sections; no TTS section | Medium — form UI |
| 10 | **Config Persistence** | `PersistedConfig` stores `{ llm, imageGen }`; no `tts` key | Low — extend interface |

### Detailed Gap Descriptions

#### Gap 1: No TTS Client Module
There is no `ttsClient.ts` analogous to `imageGenClient.ts`. The codebase has no abstraction for calling a speech synthesis API. All existing API clients are in `src/lib/`:
- `llmClient.ts` — chat completions
- `imageGenClient.ts` — image generation
- No `ttsClient.ts`

#### Gap 2: No TTS Configuration
The `LLMConfig` interface (`llmModels.ts`) and `SettingsModal.tsx` contain no TTS-related fields:
- No TTS provider selection
- No voice ID / voice name
- No speech rate / speed / pitch controls
- No TTS API key (could share LLM key for OpenAI, but not for ElevenLabs)

The persisted config shape (`configPersistence.ts`):
```typescript
export interface PersistedConfig {
  llm: LLMConfig;
  imageGen?: ImageGenConfig;
  // tts?: TTSConfig;  <-- MISSING
}
```

#### Gap 3: No TTS LLM Tool
The tool list in `useConversationEngine.ts` includes:
- `respond_to_user`
- `finish_target`
- `list_apps`
- `app_action`
- File tools (read/write/list/delete/search)
- Memory tools
- `generate_image` (conditional)

No `speak`, `generate_speech`, `read_aloud`, or any audio-generation tool is defined.

The system prompt builder (`toolDefinitions.ts`) receives a `hasImageGen` flag to inform the model about image generation capabilities. An analogous `hasTTS` flag would be needed.

#### Gap 4: No Character Voice Data
`CharacterConfig` and `CharacterMetaInfo` (`characterManager.ts`) define visual expression assets:
```typescript
export interface CharacterMetaInfo {
  base_image_url?: string;
  emotion_images?: Record<string, string>;
  emotion_videos?: Record<string, string[]>;
  avatar_img_url?: string;
  // voice_id?: string;       <-- MISSING
  // tts_enabled?: boolean;   <-- MISSING
  // speech_rate?: number;    <-- MISSING
}
```

There is no concept of a "voice" for a character. Characters are purely visual + textual.

#### Gap 5: No Reusable Audio Playback Hook
The MusicApp contains audio playback logic inline:
```typescript
const audioRef = useRef<HTMLAudioElement | null>(null);
audioRef.current = new Audio();
audioRef.current.volume = playerState.volume;
```

This is not extracted into a reusable hook like `useAudioPlayer()` that could be shared with ChatPanel for message playback.

#### Gap 6: No Audio UI in ChatPanel
Chat messages in `ChatSubComponents.tsx` render text, images, suggested replies, and tool call badges. There is no:
- Speaker icon next to assistant messages
- Play/pause button for generated speech
- Audio wave visualization
- Inline audio player

Message rendering only supports:
```typescript
export interface ConversationDisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  emotion?: string;
  suggestedReplies?: string[];
  toolCalls?: string[];
  imageUrl?: string;   // <-- audioUrl?: string; is MISSING
}
```

#### Gap 7: fileApi.ts is Text-Only
The unified file API (`fileApi.ts`) exposes:
- `listFiles(path)`
- `readFile(path)` — returns `{ content, metadata }` where content is string/object
- `writeFile(path, content)` — stringifies to JSON or plain text
- `deleteFile(path)` / `deleteFiles(paths)`
- `searchFiles(query)`

There is no `readBinaryFile` or `writeBinaryFile` wrapper. Binary operations are only available directly via `diskStorage.ts` (`putBinaryFile`, `getFile`). The `@gui/vibe-container` interface itself (`FileOperations`) may not support binary payloads through its message-passing layer.

**Important:** In standalone mode, `diskStorage.ts` is used directly and supports binary. In production iframe mode, the `@gui/vibe-container` `putTextFilesByJSON` API only accepts string content. A TTS system would need to verify whether the container supports binary file writes or use a different transport (e.g., base64-in-JSON via `putTextFilesByJSON`).

#### Gap 8: No Streaming Infrastructure
The codebase does not use:
- `ReadableStream` — for streaming audio chunks
- `Blob` / `URL.createObjectURL` — for in-memory audio playback
- `MediaRecorder` — for recording audio

All network requests use `fetch()` with JSON request/response bodies. The LLM chat endpoint (`llmClient.ts`) returns complete response strings, not streaming chunks. A streaming TTS implementation (e.g., OpenAI's streaming `tts-1`) would require new infrastructure.

---

## Integration Point Map

The following locations are the natural integration points for a TTS system, listed in implementation order:

### 1. `src/lib/ttsClient.ts` — Create New
Follow the `imageGenClient.ts` pattern exactly:
- Define `TTSProvider` union type (`'openai' | 'elevenlabs' | 'minimax' | 'web-speech'`)
- Define `TTSConfig` interface with `provider`, `apiKey`, `baseUrl`, `model`, `voiceId`, `speed`
- Implement `generateSpeech(text, config): Promise<{ base64: string; mimeType: string }>`
- Route through `/api/llm-proxy` or direct fetch depending on provider

### 2. `src/lib/ttsTools.ts` — Create New
Follow the `imageGenTools.ts` pattern:
- Export `getTTSToolDefinitions()` returning `speak` / `generate_speech` tool schema
- Export `isTTSTool(name)` guard
- Export `executeTTSTool(params, config)` that calls `generateSpeech`, saves to `generated-speech/` via `putBinaryFile`, returns file URL

### 3. `src/components/ChatPanel/useConversationEngine.ts` — Modify
- Add `ttsConfigRef` to `ConversationEngineDeps`
- Import TTS tool functions alongside image gen imports
- Check `hasUsableTTSConfig(ttsConfigRef.current)` before adding TTS tools to the LLM tool list
- Add TTS tool execution branch in `executeToolCall()`

### 4. `src/components/ChatPanel/toolDefinitions.ts` — Modify
- Add `hasTTS: boolean` parameter to `buildSystemPrompt()`
- Add TTS capability description to system prompt when `hasTTS` is true (analogous to image gen instructions)

### 5. `src/lib/characterManager.ts` — Extend Types
- Add optional voice fields to `CharacterMetaInfo`:
  ```typescript
  voice_id?: string;
  tts_enabled?: boolean;
  speech_rate?: number;
  ```

### 6. `src/lib/configPersistence.ts` — Extend
- Add `tts?: TTSConfig` to `PersistedConfig` and `PersistedConfigUpdate`

### 7. `src/lib/llmClient.ts` — Extend Save
- Update `saveConfig()` to accept optional `ttsConfig` parameter and include it in `PersistedConfigUpdate`

### 8. `src/components/ChatPanel/SettingsModal.tsx` — Add UI Panel
- Add a third settings section: "Text-to-Speech"
- Fields: Provider dropdown, API Key, Base URL, Model, Voice ID, Speed
- Follow the exact form pattern used for LLM and Image Gen sections

### 9. `src/components/ChatPanel/ChatSubComponents.tsx` — Add Playback UI
- Add `audioUrl?: string` to `ConversationDisplayMessage`
- Render a speaker/play button next to assistant messages that have an associated audio file
- Use `HTMLAudioElement` (or extracted `useAudioPlayer` hook) for playback

### 10. `src/pages/MusicApp/index.tsx` — Extract Reusable Hook (Optional)
- Extract audio playback logic into a shared hook: `useAudioPlayer()`
- Share between MusicApp and ChatPanel

---

## Recommended Implementation Path

The codebase pattern to follow is **`imageGenClient.ts` + `imageGenTools.ts`**. Create analogous files:

```
src/lib/
  ttsClient.ts      # ← NEW (pattern: imageGenClient.ts)
  ttsTools.ts       # ← NEW (pattern: imageGenTools.ts)
```

### Provider Recommendations

| Provider | Verdict | Notes |
|----------|---------|-------|
| **OpenAI TTS** | **Recommended primary** | Fits existing OpenAI provider pattern. `POST /v1/audio/speech` with `{ model, input, voice }`. Route through existing `/api/llm-proxy`. |
| **ElevenLabs** | **Recommended premium tier** | Best voice quality and cloning. Higher cost. Implement after OpenAI TTS is working. |
| **MiniMax TTS** | **Investigate** | Requires vendor research. If MiniMax offers TTS, follow same provider pattern. |
| **Web Speech API** | **Not recommended** | Free but robotic quality. Poor for character-driven UX. |

### Recommended First Milestone: OpenAI TTS (`tts-1`)

1. `ttsClient.ts` with OpenAI provider
2. `ttsTools.ts` with `generate_speech` tool
3. Config persistence extended for `TTSConfig`
4. SettingsModal UI panel for TTS
5. ChatPanel play button next to assistant messages
6. Audio files saved to `generated-speech/` directory via `putBinaryFile`

---

## Key Files Reference Table

| File Path | Lines | Searched For | Finding |
|-----------|-------|--------------|---------|
| `apps/webuiapps/src/lib/llmClient.ts` | 379 | `ChatMessage`, `LLMResponse`, audio modalities | **NO TTS** — Text-only chat; no audio in message/response types |
| `apps/webuiapps/src/components/ChatPanel/useConversationEngine.ts` | 386 | `ConversationDisplayMessage`, TTS tool handling | **NO TTS** — No audio field in message type; no `speak` tool execution |
| `apps/webuiapps/src/components/ChatPanel/toolDefinitions.ts` | 136 | `respond_to_user` schema, TTS tool definitions | **NO TTS** — Only text content + emotion; no speech/voice/audio tools |
| `apps/webuiapps/src/lib/llmModels.ts` | 188 | MiniMax config, TTS models | **NO TTS** — MiniMax is text-only Anthropic endpoint; no audio models |
| `apps/webuiapps/src/components/ChatPanel/SettingsModal.tsx` | ~400 | TTS settings UI | **NO TTS** — Only LLM and Image Generation sections |
| `apps/webuiapps/src/pages/MusicApp/index.tsx` | ~450 | `HTMLAudioElement`, audio playback | **FOUND** — Native music player with volume/seek controls |
| `apps/webuiapps/src/pages/MusicApp/types.ts` | ~30 | Audio types | **FOUND** — `PlayerState` with `volume`, `currentTime`, `isPlaying` |
| `apps/webuiapps/src/components/ChatPanel/ChatSubComponents.tsx` | ~280 | TTS UI, audio playback | **NO TTS** — Only muted `<video>` avatars and text/image messages |
| `apps/webuiapps/src/components/ChatPanel/CharacterPanel.tsx` | ~120 | Audio, voice | **NO TTS** — Muted video layer only |
| `apps/webuiapps/src/components/Shell/index.tsx` | ~350 | Audio, voice | **NO TTS** — Muted live wallpaper video only |
| `apps/webuiapps/src/lib/characterManager.ts` | ~200 | `voice_id`, `tts_enabled` | **NO TTS** — `CharacterMetaInfo` has images/videos only |
| `apps/webuiapps/src/lib/imageGenClient.ts` | ~120 | Image generation pattern | **FOUND** — Provider-agnostic client; **model for TTS** |
| `apps/webuiapps/src/lib/imageGenTools.ts` | ~80 | Image generation tool pattern | **FOUND** — LLM tool bridge; **model for TTS** |
| `apps/webuiapps/src/lib/fileApi.ts` | ~150 | Binary file operations | **NO TTS** — Text/JSON only; `writeFile` stringifies content |
| `apps/webuiapps/src/lib/diskStorage.ts` | ~150 | Binary storage | **FOUND** — `putBinaryFile()` supports arbitrary MIME types |
| `apps/webuiapps/src/lib/configPersistence.ts` | ~80 | TTS config storage | **NO TTS** — `PersistedConfig` only has `llm` and `imageGen` |
| `apps/webuiapps/src/lib/vibeContainerMock.ts` | ~200 | Audio URL interception | **FOUND** — Maps local MP3 paths to `soundhelix.com` URLs (MusicApp only) |
| `apps/webuiapps/src/lib/fileTools.ts` | ~200 | Audio file tools | **NO TTS** — Read/write/list/delete/search for text files only |
| `apps/webuiapps/src/lib/memoryManager.ts` | ~150 | Voice/speech memory | **NO TTS** — Text-only memory entries |
| `apps/webuiapps/src/hooks/**/*.ts` | ~20 files | Audio hooks (`useAudio`, `useSpeech`) | **NO TTS** — No audio-related hooks |
| `apps/webuiapps/src/types/**/*.ts` | ~10 files | Audio types | **NO TTS** — No audio interfaces |
| `package.json` | ~80 | TTS dependencies | **NO TTS** — No `elevenlabs`, `responsivevoice`, or speech libraries |
| Entire repo | — | `*.mp3`, `*.wav`, `*.ogg` files | **NO TTS** — No bundled audio assets (except MusicApp seed data) |
| Entire repo | — | Files named `*tts*`, `*speech*`, `*voice*` | **NO TTS** — Zero file matches |
| Entire repo | — | `speechSynthesis`, `SpeechSynthesisUtterance` | **NO TTS** — Zero code matches |
| Entire repo | — | `AudioContext`, `OscillatorNode` | **NO TTS** — Zero Web Audio API usage |
| Entire repo | — | `URL.createObjectURL` | **NO TTS** — Zero blob URL usage |
| Entire repo | — | `MediaRecorder`, `getUserMedia` | **NO TTS** — Zero media capture usage |

---

## Conclusion

OpenRoom / VibeApps currently has **zero TTS infrastructure**. The codebase is architecturally ready to support it — the image generation system provides a proven, production-ready pattern (`imageGenClient.ts` + `imageGenTools.ts` + config persistence + settings UI + LLM tool integration) that can be replicated almost verbatim for TTS.

The minimal viable TTS implementation requires **~5 new files** and **modifications to ~8 existing files**, all following well-established patterns already present in the codebase.

The absence of TTS is a deliberate product gap, not a technical limitation. All required building blocks (binary storage, LLM tool dispatch, config UI, provider-agnostic API clients) are already in place.

---

These notes should be updated when a TTS provider, character voice metadata, or chat audio playback UI is added.
