# BitChord TV probe

A one-screen Tizen web app that answers one question: can a Samsung TV app read YouTube Music directly, with no proxy?

It runs the requests BitChord PC makes (WEB_REMIX browse, search, suggestions and radio; the VISIONOS `/player` call; Opus 251 and AAC 140 playback; LRCLIB, lrc.red and Unison lyrics). It also launches a bundled service app that tries the same browse call outside the page. Each check shows PASS, FAIL or INFO, and a verdict line sits at the bottom.

Baseline from a desktop browser: every YouTube call fails with a CORS error, and all three lyric sources pass. The TV result is what we need.

## Sign and install (about 15 minutes the first time)

You need Tizen Studio with **Samsung TV Extensions** and **Samsung Certificate Extension**, both installed from its Package Manager. The commands below assume the default `C:\tizen-studio`.

1. **Turn on Developer Mode on the TV.** Open Apps, press `1 2 3 4 5` on the remote, switch Developer mode On, enter this PC's IP address, then restart the TV.
2. **Connect to the TV.** The TV's IP is under Settings › General › Network › Network Status.

   ```bash
   C:\tizen-studio\tools\sdb.exe connect 192.168.1.50
   ```

   ```bash
   C:\tizen-studio\tools\sdb.exe devices
   ```

   The second column of the device line is the target name, for example `UE55CU7100`.
3. **Create a Samsung certificate.** In Tizen Studio, open Tools › Certificate Manager, click +, choose **Samsung**, then **TV**, and name the profile `bctv`. Sign in with your Samsung account when asked. With the TV connected, the wizard adds its DUID for you. A certificate without your TV's DUID installs but will not launch.
4. **Package.** If you downloaded `BitChordProbe-unsigned.wgt` from Releases, sign it in place:

   ```bash
   C:\tizen-studio\tools\ide\bin\tizen.bat package -t wgt -s bctv -- BitChordProbe-unsigned.wgt
   ```

   If that command refuses the file, unzip the `.wgt` (it's a zip) into a folder named `probe` and use the command below. From a clone of this repo, run this from the repo root:

   ```bash
   C:\tizen-studio\tools\ide\bin\tizen.bat package -t wgt -s bctv -- probe
   ```

   A `.wgt` file appears in `probe\`. Use its name in step 5.
5. **Install and run.** Replace `UE55CU7100` with your target name:

   ```bash
   C:\tizen-studio\tools\ide\bin\tizen.bat install -n "<the .wgt name>" -t UE55CU7100 -- probe
   ```

   ```bash
   C:\tizen-studio\tools\ide\bin\tizen.bat run -p bcprobe001.BitChordProbe -t UE55CU7100
   ```

The checks take about 40 seconds and play two seconds of audio at 40% volume. Press OK to run them again, or Back to exit.

**If install or launch fails** with a privilege, certificate or partner error, the bundled service is the likely cause. Delete the `<tizen:service>…</tizen:service>` block from `config.xml` and repeat steps 4 and 5. The service row will then read "could not launch service", which is itself an answer.

**Emulator:** start a TV emulator from Emulator Manager. Its target name looks like `emulator-26101`; use it in step 5. The emulator's browser can treat CORS differently from a real TV, so a real TV result is the one that counts.

## What to send back

A photo of the screen is enough. If you want the raw log as well, every line is printed with the prefix `[probe]`:

```bash
C:\tizen-studio\tools\sdb.exe shell 0 debug bcprobe001.BitChordProbe
```

That command prints a port. Open `http://<TV_IP>:<port>` in Chrome to get DevTools for the app.

## Reading the result

| Rows | Meaning |
|---|---|
| WEB_REMIX + VISIONOS rows PASS | Direct YouTube works. The full app goes ahead exactly as specified. |
| Those rows FAIL, **service** row PASS | The page is CORS-bound but an on-TV service is not. YouTube calls move into a bundled service, still with no server. |
| Both FAIL | No direct route on this TV. Decision needed (see the main chat). |
| Play rows | Which codec the TV decodes. If 251 fails and 140 passes, the app starts with AAC. |

License: GPL-3.0, derived from BitChord by jackychan4891 and kushagrasinghx.
