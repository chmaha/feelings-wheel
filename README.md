# Feelings Wheel

A free, private feelings wheel that helps you find a precise word for what you're feeling.

**Try it:** <https://chmaha.github.io/feelings-wheel/>

- **Wheel view:** an interactive wheel. Tap a core feeling and the wheel turns it to face you, then work outwards to narrow it down. "Reveal as you go" shows the words one ring at a time.
- **Step by step:** the same feelings as a series of large buttons, ideal on phones.
- **My list:** save the feelings you find, add optional notes (intensity, what happened, where you feel it, what you need) and copy or share them, for example to prepare for a therapy session.
- **Private by design:** no accounts, analytics or servers. Everything stays on the device.
- **Installable and offline:** works as a progressive web app, and can be built for Android and iOS with Capacitor.

It isn't medical advice. If you're in crisis, contact your local emergency number or find a helpline at [findahelpline.com](https://findahelpline.com).

## Running it locally

There's no build step. Serve the folder with any static web server, for example:

```sh
python3 -m http.server
```

Then open <http://localhost:8000>. Opening `index.html` directly from disk also works, but offline support needs a web server.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and dialogs |
| `styles.css` | All styling, including light and dark themes |
| `app.js` | Wheel, step-by-step view, list, notes and settings |
| `data.js` | The feelings and their colours |
| `i18n.js` | Interface text and feeling-word translations |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and app install |
| `privacy.html` | Privacy policy |
| `capacitor.config.json`, `package.json`, `scripts/` | Android and iOS builds |

## Adding a language

Translations are very welcome, but please make sure each one is written or reviewed by a native speaker, ideally someone familiar with how feelings are talked about in therapy in that language. Word choice matters a lot in an app like this.

1. In `i18n.js`, copy the `en` block inside `STRINGS`, give it the language code (for example `fr`), set `langName` to the language's own name (`"Français"`) and translate each string. Keep placeholders such as `{x}`, `{mid}`, `{core}`, `{list}` and `{date}` as they are.
2. In `FEELING_NAMES`, add a block for the same code that maps every English feeling in `data.js` to its translation. Any word you leave out falls back to English.
3. Check that the words fit the wheel. Long words shrink automatically, but very long ones become hard to read.

The language menu appears automatically once there's more than one language, and the app opens in the device's language when it's available.

## Building the Android and iOS apps

You'll need [Node.js](https://nodejs.org), plus Android Studio for Android and a Mac with Xcode for iOS.

```sh
npm install
npx cap add android
npx cap add ios
npm run android   # or: npm run ios
```

`npm run build` copies the web files into `www/`, which Capacitor packages into the apps. Before publishing your own build, change `appId` in `capacitor.config.json` to a reverse domain you own.

## Contributing

Issues and pull requests are welcome: bug fixes, accessibility improvements and reviewed translations especially. Please keep the app free of tracking and keep everything on the user's device.

## Credits and licence

Based on the Feel Wheel by Geoffrey Roberts (2015), adapted from Gloria Willcox's Feeling Wheel (1982).

The code is released under the [MIT License](LICENSE). © 2026 Christopher Hampson.
