# Focus Cave — Shared Lo-fi Productivity Space

A polished static HTML/CSS/JS productivity room with:

- Live generative lo-fi radio moods: chill, dark, jazz, rain
- Pomodoro timer with solo or shared-room mode
- Ambient sound mixer: rain, cafe, fire
- Live presence avatars and timer statuses
- Shared visible task list per room
- Daily, weekly, and total streak tracking
- Room vibe board: Tokyo night, forest, space, cabin
- Break alert modal with animation and chime

## How to run

Open `index.html` in a modern browser.

For local development, you can also serve it from this folder:

```bash
python3 -m http.server 8080
```

Then visit:

```text
http://localhost:8080
```

## Shared room behavior

This is a complete static front-end app. The shared room features sync across tabs/windows in the same browser profile using `BroadcastChannel` and `localStorage`.

For true multi-user sync across different devices or browsers, add a backend such as Firebase, Supabase, WebSocket server, or PartyKit and replace the local room store/broadcast layer in `app.js`.

## Audio note

The lo-fi radio and ambience are generated with the Web Audio API, so no copyrighted audio files or external streams are required. Browsers require the user to press the play button before audio can start.
