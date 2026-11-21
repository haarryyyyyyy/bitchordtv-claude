# Design spec

Every value below comes from the PC source, cited by file. Values marked **TV** are additions for a 10-foot screen, with the reason given.

## Precedence

The TV browser is Chromium 76 on Tizen 6 (Chromium 63 on Tizen 5, 56 on Tizen 4). Where a design skill's recipe needs a newer browser, the TV's capability wins:

- **CSS:** no `oklch()`, `color-mix()`, standalone `scale`/`translate`, `:focus-visible`, `@starting-style`, flex `gap`, `inset`, `aspect-ratio`, `:is()` or container queries.
- **Focus:** focus is a `.focused` class set by the nav engine.
- **JavaScript:** no `?.`, `??`, `.at()`, `replaceAll`, `structuredClone` or `Object.hasOwn`.

`test/compat.test.js` greps the widget folder for each of these.

## Canvas

- **Design size:** 1920×1080, the body fixed at that size.
- **4K:** the TV's web engine renders at 1920×1080 CSS pixels on a 4K panel, so no rescaling is needed. Images are requested at 1.5× their CSS size so they stay sharp there.
- **Safe area:** 5% of each edge (96 px left and right, 54 px top and bottom). Nothing interactive or textual sits outside it. Backdrops and art bleed to the edges.

## Colour (`theme.rs`)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0C0A0E` | Base under everything (`BG`) |
| `--text` | `#F2F0F5` | Primary text (`TEXT`) |
| `--dim` | `#B2ACBA` | Secondary text (`TEXT_DIM`) |
| `--faint` | `#827C8C` | Counts, hints (`TEXT_FAINT`) |
| `--accent` | `#FA586A` | BitChord pink (`RED`); Now Playing replaces it with a colour sampled from the cover |
| `--surface` | `#1C1820` | Cards and dialogs (`surface_fill`) |
| `--menu` | `#26222A` | Menus, the keyboard (`menu_fill`) |
| `--on-text` | `#0F0F0F` | Text on a fill of `--text` (`on_text`) |
| `--glass-N` | `rgba(255,255,255,N)` | Glass surfaces (`glass(a)`) |
| `--shade-N` | `rgba(0,0,0,N)` | Panels (`shade(a)`): PC sidebar 0.28, player bar 0.55 |

The app is dark only, as the PC's Now Playing always is. The PC default "System" mode follows Windows, which a TV has no equivalent of.

**Cover accent.** Sampled from a 16×16 downscale of the cover:
- take the most saturated pixel that is not near-black or near-white;
- lift it to at least 0.62 lightness so it reads on the dark backdrop.

## Type

PC fonts (`assets/fonts`) shipped in the app:

- **Inter** (UI, the PC default `font: "inter"`), 400, 600 and 800.
- **Figtree ExtraBold**, for the wordmark.

SF Pro, the PC lyric font, is Apple's and may not be redistributed off Apple platforms, so lyrics use Inter 800.

**TV.** The sizes are the PC's scaled for 10 feet: the PC's 34 px page title is about 1.6× the body there, and the TV keeps that ratio at 28 px body.

| Role | Size / line-height | Weight | Tracking |
|---|---|---|---|
| Display (artist hero, Now Playing title) | 64 / 1.05 | 800 | −0.02em |
| Page title (`page_title`) | 48 / 1.1 | 800 | −0.02em |
| Shelf title | 34 / 1.2 | 800 | −0.01em |
| Body, card title | 26 / 1.3 | 600 | 0 |
| Secondary | 22 / 1.35 | 400 | 0 |
| Lyrics | 56 / 1.2 | 800 | −0.01em (PC lyric size 1.42 × the base) |

Times and counts use `font-variant-numeric: tabular-nums`.

## Shape (`preset.rs` defaults)

| Token | PC | TV |
|---|---|---|
| Card art radius | 8 | 12 (scaled with the card) |
| Row thumbnail radius | 5 | 8 |
| Panel radius | 14 | 20 |
| Now Playing cover radius | 12 (Apple Music preset) | 20 |
| Buttons and chips | pill | pill |

## Spacing

The scale is 8, 12, 16, 24, 32, 48, 64 and 96.

- **Shelves:** 64 apart, title to items 20, cards 32 apart (PC 20 × 1.6, **TV**: the focus scale needs room).
- **Rows:** song-row height is 96 (PC `ROW_H` 56, **TV**: a 10-foot target).
- **Top bar (TV):** 72 tall at 40 px from the top, inside the 96 px side margins. Player pill 440 wide, then text tabs 56 tall. Pages start at 152 px. PC uses a sidebar (`SIDEBAR_W` 236); a top bar keeps the full width for rows and puts the player in reach.

## Motion (`theme.rs`, `karaoke.rs`)

| Token | Value | Source |
|---|---|---|
| UI speed | 0.65 × the written time | `SPEED` |
| `--ease-out` | cubic, `1 − (1 − t)³`, as `cubic-bezier(0.33, 1, 0.68, 1)` | `ease_out` |
| `--ease-in-out` | cubic, as `cubic-bezier(0.65, 0, 0.35, 1)` | `ease_in_out` |
| Lyric scroll easing | `cubic-bezier(0.86, 0, 0.2, 1)` | `SCROLL_EASE` |
| Lyric line fade in / out | 0.33 s / 0.5 s | `FADE_IN`, `FADE_OUT` |
| Cover cross-fade | 0.45 s | `COVER_XFADE` |
| Line-sync lead | 0.115 s, word-sync 0.150 s | `LINE_OFFSET`, `RICHSYNC_OFFSET` |

**Focus** (**TV**): the card scales to 1.06 over 150 ms (`--ease-out`), and its title moves down 14 px to clear it. A 4 px ring in `--text` (#F2F0F5) sits 8 px outside the art. White, not the accent, stays visible on pink covers. Rows, buttons and menu items fill with `--text` and switch to dark text. Only transform and opacity animate; the ring is a pseudo-element faded by opacity, so nothing reflows.

**Splash:** none since 0.3.0; it felt laggy on the test TV. Home shows its skeleton at once.

**Page change:** the new page rises 24 px with opacity over 300 ms (×0.65 ≈ 200 ms). On Back the old page drops away the same way (spatial consistency).

**Cover to Now Playing:** the mini-player art scales and translates into the Now Playing cover position (a FLIP transform), 420 ms `--ease-out`, while the backdrop fades in.

**Reduced motion:** every move becomes an opacity cross-fade, and the backdrop stops warping and shows a still frame.

## Backdrop (`shader.rs`, preset defaults)

- **TV (0.2.0):** PC's warp shader was replaced after the first TV test, where it looked poor.
  - Once per song, the cover is drawn twice into a 160×90 canvas: once large, and once turned half round at 65% opacity. Both draws use `blur(10px) saturate(1.6)`.
  - CSS scales the canvas past the screen edges and drifts it over 48 s with `transform` (scale up to 1.12, a 4° turn).
  - Two canvases cross-fade over 0.9 s between songs.
  - A `#0C0A0E` scrim sits on top: 0.84 opacity behind pages, 0.42 in Now Playing.
- **PC values, for reference:** the PC fragment shader does a simplex-noise warp of the cover, with vignette, saturation, dim and dither.
- **Defaults:**
  - intensity 1.0, saturation 1.5, scale 1.2, speed 1.0;
  - dim 0.85 in Now Playing (`np_dim`).
- **TV:**
  - Behind pages the dim is 0.3 (PC: 0.5); at 0.5, page text was hard to read across a room.
  - The cover is uploaded as a 24 px texture, warped at 192×108 and scaled to 1920×1080 by CSS. The small texture and the bilinear upscale are the blur, so no `filter: blur()` runs on a moving surface. (96×54 with a 128 px texture showed blocky pixels.)
  - It renders at 30 fps, holds a still frame under reduced motion, and pauses when the app is hidden.

## Lyrics (Apple Music preset, `presets.json`; behaviour from `karaoke.rs`)

| Parameter | Value |
|---|---|
| Anchor (active line's vertical position) | 0.43 of the view (`anchor`) |
| Inactive (upcoming) line opacity | 0.2, minus 0.01 per line further away, never below 0.2 (`inactive_alpha`, `falloff`) |
| Past lines | opacity 0 (`past_alpha: 0`) |
| Blur on upcoming lines | 2 px × (1 + 0.35 × (distance − 1)), at most 9 px (`blur`, `blur_scope: upcoming`) |
| Active line lift | 3 px up, scale 1.05 (`lift`, `active_scale`) |
| Word highlight | each word goes from 0.35 to 1.0 opacity as it is sung |
| Scroll | the column translates with `SCROLL_EASE` over 0.6 s; the user's scroll pauses auto-follow for 25 s (`USER_SCROLL_RESUME`) |
| Gaps (instrumental, over 5 s) | three dots breathing at 0.55 rest opacity (`GAP_DOTS`, `GAP_DOT_REST`) |

**TV.** Blur is a static `filter` on each line, changed by class. It is never animated, and only on the about 12 lines in view.

## Brand mark

- **Mark:** three filled arcs growing in length top to bottom, from the web app's `logo-mark.svg` (path reused as is).
- **Squircle:** a superellipse (n = 5), filled with a vertical gradient from `#FF6479` (top) to `#FA2A40` (bottom). This is the only gradient in the app: it is the brand.
- **Wordmark:** "BitChord" in Figtree ExtraBold, tracking −0.02em.
- **Icons:** 512 px, plus the Samsung store set (see README).
