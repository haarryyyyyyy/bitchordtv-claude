# Performance report

**Status:** nothing below was measured on a TV yet. The numbers come from desktop Chrome with the CPU slowed 6× through DevTools, a rough stand-in for a mid-range TV. Rerun them on the TV with the remote inspector before trusting them.

Run it yourself: `node test/perf.js` (needs the dev server on port 5180, see README).

## Measured (desktop Chrome, CPU ×6, 1920×1080)

| Metric | Result | Target |
|---|---|---|
| Page load (`load` event) | 143 ms | — |
| Start to Home with artwork, splash included | 1.35 s | under 2 s cold start |
| Holding Right along a shelf | 93 fps average; 14 frames over 33 ms; worst 160 ms | 60 fps |
| Holding Down through Home (loads more of the feed) | 62 fps average; 21 frames over 33 ms; worst 118 ms | 60 fps |
| JS heap after browsing Home | 2 MB | small |
| DOM nodes on Home | 764 | small |
| DOM nodes in Now Playing with lyrics | 659 | small |

The long frames are mostly YouTube's replies being parsed: 200–800 KB of JSON each, which `JSON.parse` can't split. A shelf scroll alone stays smooth.

## How the app keeps frames cheap

- **What animates:** only `transform` and `opacity`. Focus rings and row fills are pseudo-elements faded by opacity, so focus never causes layout.
- **Scrolling:** rows and pages move by `translate3d` on one track element per scroller. There is no native scrolling.
- **Backdrop:**
  - It renders at 192×108 in WebGL from a 24 px texture, at 30 fps.
  - CSS scales it to full screen, so no CSS blur ever runs on a moving surface.
  - It holds a still frame under reduced motion and stops while the app is hidden.
- **Lyrics:** blur is a static `filter` per line, switched by a `data-d` attribute and never transitioned. Only the column's `transform` moves.
- **Images:** loaded when within 600 px of the screen. Each is requested at its drawn size × 1.5 from Google's image CDN (`=w…-h…`, `model.rs::sized`), never the original.
- **Long lists:** rendered in chunks of 40 as focus nears the end. Playlists are capped at 500 tracks for mixes, as on PC.
- **Feed pages:** a continuation inserts one shelf per frame.
- **Caches:** lyrics hold 30 songs. Stream URLs are reused for up to 3 hours.

## Measure on the TV

1. Install the app.
2. Run `sdb shell 0 debug bchordtv01.BitChord`.
3. Open the printed `http://<TV_IP>:<port>` in Chrome.
4. In the Performance panel, record while holding Right on Home, and while lyrics play.
5. Check the Memory panel's heap after 10 minutes of playback.
