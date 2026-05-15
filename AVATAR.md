# Avatar And Character Expression System

Maintained developer documentation for OpenRoom / VibeApps avatar rendering, character expression media, and related app avatar usage.

> **Note:** There is no single file named `Avatar.tsx` or `avatar.ts`. Avatar rendering is distributed across multiple components and modules. This document maps the complete landscape.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Character Data Model](#character-data-model)
3. [Main Avatar Component: CharacterAvatar](#main-avatar-component-characteravatar)
4. [Emotion Resolution Algorithm](#emotion-resolution-algorithm)
5. [Emotion Triggering Flow](#emotion-triggering-flow)
6. [User Avatars (vibeInfo)](#user-avatars-vibeinfo)
7. [CharacterPanel (Settings UI)](#characterpanel-settings-ui)
8. [Image Generation (Separate System)](#image-generation-separate-system)
9. [App-Specific Avatar Components](#app-specific-avatar-components)
10. [Key Files Reference](#key-files-reference)

---

## Architecture Overview

The avatar system has two independent tracks:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        OPENROOM DESKTOP                                  │
│                                                                          │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────┐  │
│  │   CHAT PANEL (Agent Side)   │    │     APPS (iframe / standalone)  │  │
│  │                             │    │                                 │  │
│  │  ┌───────────────────────┐  │    │  ┌─────────┐  ┌─────────────┐  │  │
│  │  │   CharacterAvatar     │  │    │  │ Twitter │  │    Chess    │  │  │
│  │  │   (emotion-aware)     │  │    │  │ Avatar  │  │   Avatar    │  │  │
│  │  │   280px left panel    │  │    │  └─────────┘  └─────────────┘  │  │
│  │  └───────────────────────┘  │    │                                 │  │
│  │         ↑                   │    │         vibeInfo (userInfo /    │  │
│  │  resolveEmotionMedia()      │    │         characterInfo)          │  │
│  │         ↑                   │    │              ↑                  │  │
│  │  characterManager.ts        │    │    @gui/vibe-container          │  │
│  │  (CharacterMetaInfo)        │    │    or vibeContainerMock.ts      │  │
│  └─────────────────────────────┘    └─────────────────────────────────┘  │
│                                                                          │
│  CharacterPanel.tsx ──→ Edit character meta_info (URLs or local uploads)  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Character Data Model

### Type Definitions

```typescript
// apps/webuiapps/src/lib/characterManager.ts

export const CHARACTER_EMOTION_LIST = [
  'default',
  'happy',
  'shy',
  'peaceful',
  'depressing',
  'angry',
] as const;
export type CharacterEmotion = (typeof CHARACTER_EMOTION_LIST)[number];

export interface CharacterMetaInfo {
  base_image_url?: string;
  /** Emotion → video/image URL mapping for expression switching */
  emotion_images?: Record<string, string>;
  /** Emotion → array of video URLs for animated expressions */
  emotion_videos?: Record<string, string[]>;
  /** Various character image URLs ─ UNUSED by the avatar system */
  avatar_img_url?: string;   // UNUSED
  chat_pic_url?: string;     // UNUSED
  head_img_url?: string;     // UNUSED
  back_img_url?: string;     // UNUSED
  side_img_url?: string;     // UNUSED
  front_img_url?: string;    // UNUSED
}

export interface CharacterConfig {
  id: string;
  character_name: string;
  character_gender_desc: string;
  character_desc: string;
  character_emotion_list: readonly string[];
  character_meta_info?: CharacterMetaInfo;
}
```

### Default Character: "Aoi"

The `DEFAULT_CHARACTER` (id: `aoi`) ships with hardcoded CDN URLs from `cdn.openroom.ai`:

- `base_image_url` — static portrait image
- `emotion_videos` — 6 emotion keys, each with 1-2 MP4 video URLs
- `avatar_img_url`, `chat_pic_url`, `head_img_url`, etc. — populated but **never read** by avatar rendering

### Persistence

```
Server API:    GET/POST  /api/characters
LocalStorage:  key = "openroom_characters"
Fallback:      migrate old single-character config from "openroom_character_config"
```

All file operations go through the `@/lib` unified file API per project convention. Direct IndexedDB access is not used for character data.

---

## Main Avatar Component: CharacterAvatar

**File:** `apps/webuiapps/src/components/ChatPanel/ChatSubComponents.tsx` (lines 96–251)

The `CharacterAvatar` is a `memo()`-wrapped React component rendered inside the ChatPanel's left 280px column (`.avatarSide`).

### Features

| Feature | Implementation |
|---------|----------------|
| **Media types** | Video (MP4/WebM/MOV/OGG) and static images |
| **Transition** | Crossfade via CSS `opacity` (0.25s ease-out) |
| **Layering** | Multiple `<video>` / `<img>` elements stacked absolutely; only the active layer is opaque |
| **Idle videos** | Loop indefinitely when no emotion is active |
| **Emotion videos** | Play once; `onEnded` triggers `onEmotionEnd` callback to clear emotion |
| **Preload** | New layer starts invisible, waits for `onCanPlay` (video) or `onLoad` (image), then crossfades in |
| **Cleanup** | Stale layers removed via 300ms `setTimeout` after crossfade completes |
| **Fallback** | First character of `character_name` rendered as 72px text placeholder |

### Component Interface

```typescript
interface AvatarLayer {
  url: string;
  type: 'video' | 'image';
  active: boolean;
}

export const CharacterAvatar: React.FC<{
  character: CharacterConfig;
  emotion?: string;
  onEmotionEnd: () => void;
}> = memo(({ character, emotion, onEmotionEnd }) => {
  // ... implementation
});
```

### Layer State Machine

```
[Emotion triggers] → resolveEmotionMedia() → new URL?
                                    │
                                    ▼
                    Is URL already in layers?
                           /          \
                         Yes          No
                         /              \
            Reactivate existing      Append new layer (inactive)
            (cancel pending cleanup)   Wait for onCanPlay/onLoad
                         \              /
                          \            /
                           ▼          ▼
                    handleMediaReady(readyUrl)
                           │
                           ▼
              Set new layer active → opacity 1
              Set old layers inactive → opacity 0
              Schedule cleanup of stale layers (300ms)
                           │
                           ▼
              [Non-idle video onEnded] → onEmotionEnd() → emotion cleared → returns to default
```

### CSS Layout

```scss
// apps/webuiapps/src/components/ChatPanel/index.module.scss

.avatarSide {
  width: 280px;
  min-width: 280px;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #121214;
}

.avatarImage {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}

.avatarPlaceholder {
  // 72px first-initial text fallback
}
```

---

## Emotion Resolution Algorithm

**File:** `apps/webuiapps/src/lib/characterManager.ts` (lines 319–368)

### `resolveEmotionMedia(config, emotion?)`

Priority chain for resolving media for a given emotion:

```
1. emotion provided?
   ├─ emotion_videos[emotion] exists and non-empty?
   │  └─ Random pick from array (cached per characterId:emotion)
   │     → Return { url, type: 'video' }
   │
   └─ emotion_images[emotion] exists?
      → Return { url, type: 'image' }

2. No emotion or no match above → Fallback chain:
   ├─ emotion_videos['default'] → random pick
   ├─ First available key in emotion_videos → random pick
   └─ base_image_url → Return { url, type: 'image' }

3. Nothing configured → Return undefined
```

### Video Cache

```typescript
const _emotionVideoCache = new Map<string, string>();
// Key format: `${characterId}:${emotion}`
```

The cache stores the last randomly-selected video URL per character+emotion to prevent flashing when re-renders occur. It is cleared explicitly when a new emotion is triggered.

```typescript
export function clearEmotionVideoCache(characterId?: string): void {
  // Clears all entries matching `${characterId}:*` or entire map if no id
}
```

---

## Emotion Triggering Flow

**Files:**
- `apps/webuiapps/src/components/ChatPanel/useConversationEngine.ts`
- `apps/webuiapps/src/components/ChatPanel/toolDefinitions.ts`
- `apps/webuiapps/src/components/ChatPanel/index.tsx`

### Sequence Diagram

```
LLM ──→ respond_to_user tool call
          │
          │   character_expression: {
          │       content: "Hello there...",
          │       emotion: "happy"        ← LLM chooses emotion
          │   }
          ▼
   executeToolCall() in useConversationEngine.ts
          │
          ├─→ addMessage({ role: 'assistant', content, emotion })
          │
          ├─→ clearEmotionVideoCache(character.id)   // Force new random pick
          │
          └─→ setCurrentEmotion(emotion)             // React state update
                    │
                    ▼
            ChatPanel re-renders
                    │
                    ▼
            <CharacterAvatar emotion={currentEmotion} />
                    │
                    ▼
            resolveEmotionMedia(character, 'happy')
                    │
                    ▼
            New video layer appended → onCanPlay → crossfade active
                    │
                    ▼
            Video plays (non-idle, no loop)
                    │
                    ▼
            onEnded event ──→ onEmotionEnd() ──→ setCurrentEmotion(undefined)
                    │
                    ▼
            Returns to default / idle expression
```

### Tool Definition

```typescript
// toolDefinitions.ts
{
  type: 'function',
  function: {
    name: 'respond_to_user',
    parameters: {
      character_expression: {
        content: { type: 'string' },
        emotion: {
          type: 'string',
          description: "Character emotion — use one of the active character's defined emotion keys",
        },
      },
      user_interaction: {
        suggested_replies: { type: 'array', items: { type: 'string' } },
      },
    },
    required: ['character_expression'],
  },
}
```

---

## User Avatars (vibeInfo)

**File:** `apps/webuiapps/src/lib/vibeInfo.ts`

The `vibeInfo` module wraps three info queries from `@gui/vibe-container`:
- `getUserInfo()` → `UserInfoResponse`
- `getCharacterInfo()` → `CharacterInfoResponse`
- `getSystemSettings()` → `SystemSettingsResponse`

### vibe-container Types

```typescript
// packages/vibe-container/src/types/index.ts

export interface UserInfoResponse {
  userId: number;
  nickname: string;
  avatarUrl: string;      // ← Real SDK has avatarUrl (non-optional)
  isAnonymous: boolean;
}

export interface CharacterInfoResponse {
  id: number;
  name: string;
  avatarUrl: string;      // ← Real SDK has avatarUrl (non-optional)
  description: string;
}
```

### Mock Types (Standalone Mode)

```typescript
// apps/webuiapps/src/lib/vibeContainerMock.ts

export interface UserInfoResponse {
  user_id?: string;
  nickname?: string;
  avatar?: string;        // ← Mock uses `avatar` (optional, different name!)
  [key: string]: unknown;
}

export interface CharacterInfoResponse {
  character_id?: string;
  name?: string;
  avatar?: string;        // ← Mock uses `avatar` (optional, different name!)
  [key: string]: unknown;
}
```

**Important:** The mock and real SDK use **different field names** (`avatar` vs `avatarUrl`). Apps consuming `useVibeInfo()` must handle both shapes or rely on the app-level adaptation layer.

### Mock Returns

```typescript
getUserInfo: () => Promise.resolve({ user_id: 'local', nickname: 'Local User' }),
// avatar is undefined → apps fall back to first initial

getCharacterInfo: () => Promise.resolve({ character_id: 'assistant', name: 'Assistant' }),
// avatar is undefined
```

---

## CharacterPanel (Settings UI)

**File:** `apps/webuiapps/src/components/ChatPanel/CharacterPanel.tsx`

The character settings modal has two views: **List** and **Editor**.

### List View

- Displays all characters in the collection
- Each row shows a 40px circular avatar from `base_image_url` (or first initial)
- Active character marked with a check badge
- Edit/Delete buttons per row
- "New Character" button

### Editor View

- 160px preview of `base_image_url`
- Name, Gender, Persona Description fields
- **Default Avatar** field — paste an image URL or upload a local image
- **Emotions & Expressions** — per-emotion image/video URL fields plus local upload slots
  - Users can paste external URLs or upload local assets through `ImageUploader`
  - Local uploads are stored under `/characters/{characterId}/emotions/` via `characterAssetUpload.ts`
  - Video detection is centralized in `isVideoAssetUrl()` and supports local uploaded paths as well as external URLs
  - Thumbnail previews loop muted videos or show static images
- Add/remove custom emotions

### Editor Data Flow

```
User pastes URL or uploads asset → emotionImages[emotion] = url  or  emotionVideos[emotion] = [url]
        │
        ▼
   On Save:
   - Clean empty strings
   - emotion_images: Record<string, string>
   - emotion_videos: Record<string, string[]>
   - Persist via saveCharacterCollection() → /api/characters + localStorage
```

**Note:** The editor supports one configured asset per emotion in the UI. Image assets are saved in `emotion_images`; video assets are saved as single-entry arrays in `emotion_videos`. The underlying `emotion_videos: Record<string, string[]>` model still supports multiple videos per emotion, but the editor does not expose multi-video configuration.

---

## Image Generation (Separate System)

**Files:**
- `apps/webuiapps/src/lib/imageGenTools.ts`
- `apps/webuiapps/src/lib/imageGenClient.ts`

The `generate_image` LLM tool is **completely separate** from the avatar system.

```
LLM calls generate_image(prompt)
         │
         ▼
   imageGenClient.generateImage()
   (OpenAI DALL-E / Gemini / etc.)
         │
         ▼
   Returns { base64, mimeType }
         │
         ▼
   Saved to disk: generated-images/img-{timestamp}.{ext}
         │
         ▼
   Displayed in chat message as <img src={dataUrl} />
         │
         ▼
   NOT used for character avatars
```

### Key Differences from Avatar System

| Aspect | Avatar System | Image Generation |
|--------|--------------|------------------|
| Source | User-pasted URLs or local uploads in CharacterPanel | LLM-triggered text-to-image API |
| Storage | Character JSON with external URLs or `/characters/...` asset paths | Binary files on disk (`generated-images/`) |
| Display | `CharacterAvatar` in ChatPanel left panel | Inline in chat messages |
| URLs | External CDN URLs | `/api/session-data?path=...` or `data:` URLs |
| Blob/ObjectURL usage | None | None |

---

## App-Specific Avatar Components

### Twitter App

**File:** `apps/webuiapps/src/pages/Twitter/index.tsx`

```typescript
interface AvatarProps {
  name: string;
  avatarUrl?: string;
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ name, avatarUrl, className }) => {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={...} />;
  }
  return <div className={className || styles.avatar}>{getInitial(name)}</div>;
};
```

- Uses `vibeInfo.userInfo.avatarUrl` for the current user's avatar
- Fallback: first initial of name in a styled circle
- Used for posts, comments, and current user header

### Chess App

**File:** `apps/webuiapps/src/pages/Chess/index.tsx`

```tsx
<div className={styles.avatarWrap}>
  {characterInfo?.avatarUrl ? (
    <img src={characterInfo.avatarUrl} alt="" className={styles.avatar} />
  ) : (
    <div className={styles.avatarFallback}>♚</div>  // Black king
  )}
</div>
```

- Uses `characterInfo.avatarUrl` (from `useVibeInfo()`)
- Fallback: chess piece symbols (`♚` for AI, `♔` for user)

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `apps/webuiapps/src/components/ChatPanel/ChatSubComponents.tsx` | `CharacterAvatar` component with crossfade logic |
| `apps/webuiapps/src/components/ChatPanel/index.tsx` | ChatPanel parent; holds `currentEmotion` state, renders `CharacterAvatar` |
| `apps/webuiapps/src/components/ChatPanel/index.module.scss` | `.avatarSide`, `.avatarImage`, `.avatarPlaceholder` styles |
| `apps/webuiapps/src/components/ChatPanel/CharacterPanel.tsx` | Character list & editor UI |
| `apps/webuiapps/src/components/ChatPanel/useConversationEngine.ts` | Emotion triggering via `respond_to_user` tool |
| `apps/webuiapps/src/components/ChatPanel/toolDefinitions.ts` | LLM tool schema for `respond_to_user` with emotion param |
| `apps/webuiapps/src/lib/characterManager.ts` | `CharacterConfig`, `CharacterMetaInfo`, `resolveEmotionMedia()`, persistence |
| `apps/webuiapps/src/lib/vibeInfo.ts` | `useVibeInfo()` hook wrapping container info queries |
| `apps/webuiapps/src/lib/vibeContainerMock.ts` | Mock `getUserInfo()` / `getCharacterInfo()` returning no avatars |
| `apps/webuiapps/src/lib/imageGenTools.ts` | `generate_image` tool — separate from avatars |
| `apps/webuiapps/src/lib/imageGenClient.ts` | Generic text-to-image API client |
| `packages/vibe-container/src/types/index.ts` | Real SDK types: `UserInfoResponse.avatarUrl`, `CharacterInfoResponse.avatarUrl` |
| `apps/webuiapps/src/pages/Twitter/index.tsx` | Twitter `Avatar` component using `avatarUrl` |
| `apps/webuiapps/src/pages/Chess/index.tsx` | Chess avatar using `characterInfo.avatarUrl` |

---

## UNUSED Fields (Dead Code / Future Use)

The following fields exist in `CharacterMetaInfo` but are **never referenced** by any avatar-rendering code:

| Field | Present in DEFAULT_CHARACTER | Referenced anywhere |
|-------|------------------------------|---------------------|
| `avatar_img_url` | Yes | No |
| `chat_pic_url` | Yes | No |
| `head_img_url` | Yes | No |
| `back_img_url` | Yes | No |
| `side_img_url` | Yes | No |
| `front_img_url` | Yes | No |

These were likely carried over from a different character system (Talkie export format) and are preserved for potential future use (e.g., 3D model views, profile pictures, etc.).

---

## Important Implementation Notes

1. **No blob URLs or `URL.createObjectURL`** anywhere in the avatar or image generation codebase. External media is loaded via direct URL strings; local character uploads are loaded through `/api/session-data?path=...` URLs built by `diskStorage.buildFileUrl()`.

2. **Video loop behavior:** Idle/default videos loop (`loop={true}`); emotion videos play once and trigger `onEmotionEnd` when finished.

3. **Crossfade safety:** The layer system prevents white flashes by keeping the old layer visible until the new layer has fully loaded (`onCanPlay` / `onLoad`), then swapping opacity with a 0.25s CSS transition.

4. **Cache invalidation on emotion change:** `clearEmotionVideoCache()` is called before `setCurrentEmotion()` so that consecutive triggers of the same emotion can show a different randomly-selected video.

5. **Mock vs Real SDK type mismatch:** Standalone mode mock uses `avatar?: string`; production SDK uses `avatarUrl: string`. Apps should be defensive when reading avatar fields from `useVibeInfo()`.

6. **CharacterPanel editor limitation:** The UI only allows one configured asset per emotion. The underlying data model (`emotion_videos: Record<string, string[]>`) supports arrays, but the editor does not expose multi-video configuration.

7. **All file operations** for character persistence use the `@/lib` unified file API (`/api/characters`), not direct IndexedDB access.
