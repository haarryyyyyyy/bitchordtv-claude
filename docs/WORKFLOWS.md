# Workflows

Remote keys: arrows, OK, Back, Play/Pause, Play, Pause, Stop, Fast-forward, Rewind and 0–9. The app doesn't rely on the colour keys, which many remotes lack. The app doesn't use the Voice key: no voice API for web apps has been tested on a TV yet.

## Global keys

| Key | Effect |
|---|---|
| Play/Pause, Play, Pause, Stop | Control playback from anywhere. Stop pauses and returns to the start. |
| Fast-forward / Rewind | Seek ±10 s. On the keyboard screen, move the cursor instead. |
| Back | Close the open overlay, otherwise go up one page, otherwise (on Home) ask to exit. |
| Long-press OK (500 ms) | Open the context menu for the focused item. |
| Held arrow | Moves faster the longer it is held (repeat every 150 ms, then 75 ms after 1 s). |

## Start

1. Home opens at once with its loading skeleton while a WEB_REMIX `FEmusic_home` browse runs, which also returns the visitor data.
2. Home opens with focus on the first card of the first shelf.
3. If the browse fails, the connection check opens and shows each route's result.

## Home

1. **Chips:** the chips sit above the shelves. OK on a chip reloads the feed with its `params`; OK on the selected chip returns to the default feed.
2. **Shelves:** left and right move within a shelf; up and down move between shelves.
3. **Focus memory:** each shelf remembers its last focused item, so moving back into a shelf returns to it.
4. **Continuation:** when focus reaches the third-to-last shelf, the next page loads with `continuation`.
5. **Song cards** play the song and start its radio. Album, playlist and artist cards open their page.

## New

The page shows new releases, then top songs (four-row grid), then charts playlists.

## Search

1. Opening Search shows the keyboard, recent searches and, once letters are typed, live suggestions in a column one press to the right.
2. Suggestions refresh 200 ms after the last key.
3. OK on a suggestion, or the Search key, runs the search and saves it to history.
4. Results show the top result, then Songs, Albums, Artists and Playlists rows. Back returns to the keyboard with the text kept.

**Keyboard keys:**

| Key | Effect |
|---|---|
| 0–9 | Type the digit |
| Rewind / Fast-forward | Move the cursor |
| OK held | Repeats a character key |

## Album / playlist

1. The header shows the cover, title, artists and meta, with Play, Shuffle and Save to library on this TV.
2. Down moves into the track list. OK plays from that track, with the rest of the list queued.
3. Long-press OK on a track opens:
   - Play next, Add to queue and Start radio;
   - Like or Unlike;
   - Go to artist and Go to album.

## Artist

The page shows the banner and name, then Play top songs and Start radio. Below them come Top songs and the Albums, Singles, Playlists and Similar artists shelves.

## Play

1. The queue is set and the first track's `/player` (VISIONOS) is requested.
2. **Now Playing opens:** the cover flies from the card or row you pressed.
3. **Format:** the order is AAC 140, then 139, then Opus 251; a decode error tries the next format.
4. **Back to Now Playing:** from any page, press Left to the sidebar and choose **Now Playing** at the top.
5. **Next track:** 20 s before the end, the next track's player response is fetched (prefetch).
6. **Queue end:** when autoplay is on, the radio of the last track is appended.

## Now Playing

| Area | Behaviour |
|---|---|
| Layout | Every control is in the left column, below the cover: the seek bar, then Shuffle, Previous, Play, Next, Repeat, then the **Lyrics** and **Up next** toggles, Like and Sleep timer. The right side shows lyrics or the queue. |
| Seek bar | Up from the controls focuses it. The played part and the knob turn the cover's accent colour, and Left / Right seek 10 s. |
| Lyrics / Up next | Each toggle shows its panel; pressing the one already shown hides the panel and centres the cover. |
| Default | Lyrics, when the track has any. |
| Up (from the transport row) | Moves into the lyrics or queue panel. |
| Transport row | Shuffle, Previous, Play/Pause, Next, Repeat, then Lyrics / Up next toggle, Like and the sleep timer. |
| Lyrics | Line focus jumps to that line's time on OK. Up and down scroll freely; auto-follow resumes after 25 s or on Play. |
| Back | Returns to the page you came from. |

## Lyrics

1. **Unison:** a GET by video id, title, artist, album and duration.
2. **lrc.red:** search, pick the best hit by title, artist and ±20 s, then fetch its TTML by ISRC.
3. **LRCLIB:** `get`, then `search`.
4. **Result:** the first source that returns lyrics wins. Its name shows small under the lyrics. With none, "No lyrics for this song" shows and the queue opens instead.

## Settings

Each row is a toggle or a choice list; OK changes it. "Clear search history" and "Clear library on this TV" each open a confirmation naming what will be removed.

## Sign-in

Account sign-in is not available yet (see FEATURE_MATRIX, Signed-in features). Library rows say "Saved on this TV".
