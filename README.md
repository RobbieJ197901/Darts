# Darts Counter

A darts scoreboard for the iPad, styled like a classic electronic scorer: red LED scores, green buttons and a dartboard emblem. It runs in Safari and can be added to the home screen, where it opens full screen and works offline.

## Features

- Start from 501, 401, 301, 201 or 101.
- Solo, 2 players, doubles (4 players in two teams) and checkout practice.
- Optional names (otherwise Player 1, Player 2 and so on).
- Legs and sets, with the starting thrower alternating each leg.
- Keypad entry, with CLEAR to delete a digit and UNDO to take back the last score so it can be re-entered.
- ADD to enter a visit one dart at a time.
- Rejects impossible scores (over 180, 179, 163 and so on), busts, and scores that can't be checked out.
- “Help me” checkout suggestions using the standard outs table, switchable on and off.
- An announcer voice that calls each score and the next player's out (“Rob, you require 57. That's seventeen and then double top!”), with celebrations for 180, double top, the bullseye and the 170 big fish.
- Averages per dart and per three darts, darts thrown this leg and last leg, 100+ and 180 counts, best checkout.
- RECALL shows the last 80 scores.
- H/C sets a handicap (points taken off a player's starting score).
- Custom background image, remembered on the device.

## Installing on an iPad

1. Open the app's web address in Safari.
2. Tap the Share button, then **Add to Home Screen**.
3. Open it from the new home screen icon. It runs full screen and keeps working without internet.

The announcer uses the iPad's built-in voices. For the best result, install the “Daniel” British English voice under Settings → Accessibility → Spoken Content → Voices → English.

## Running locally

No build step. Serve the folder with any static web server, for example:

```
npx http-server -c-1 .
```

Tests for the scoring rules and checkout table:

```
npm test
```

## Hosting on GitHub Pages

In the repository's **Settings → Pages**, choose **Deploy from a branch**, pick `main` and the `/ (root)` folder, and save. The app will be at `https://<your-username>.github.io/<repo-name>/`.
