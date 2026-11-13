# Dzhanybek (Johnny) Zakiriiaev

My personal website. The home screen is a handmade "pod" with felt planets hanging on strings: pick one to open that section.

- **Experience**: co-ops and roles
- **Projects**: capstones and hackathon wins
- **About**: education, courses and skills
- **Contact me**: where to find me

## Run it

You need [Node.js](https://nodejs.org) 20.19 or newer.

```bash
npm install
npm run dev
```

Build for production with `npm run build`; the output goes to `dist/`.

## Deploy

The site is live at [dzhanybek.xyz](https://dzhanybek.xyz), on Vercel: framework preset **Vite**, build command `npm run build`, output directory `dist`, no environment variables. Every push to `main` redeploys. [`vercel.json`](vercel.json) lets browsers keep the hashed files in `assets/` for a year. `public/_headers` does the same on Netlify or Cloudflare Pages.

## 3D site and simple version

[`src/lib/viewMode.ts`](src/lib/viewMode.ts) picks one before any 3D code downloads:

- **Simple version** ([`src/simple/SimpleSite.tsx`](src/simple/SimpleSite.tsx)): all the same content with no 3D and about a fifth of the download, in the same handmade style: a cardboard sign, a paper cut-out rocket animated frame by frame, a woven ribbon of section tabs (one section at a time, same addresses as the 3D site) and felt, burlap and paper cards. Shown when the browser has no WebGL or only software graphics, when data saver is on, or on very low-memory devices. Link to it directly with `?view=simple` (for example on a CV: `https://dzhanybek.xyz/?view=simple`).
- **Gamified | Simple switch:** on the start screen, the planets screen and the simple version's header.
- **Loading screen:** after 2.5 s on screen it offers the simple version, and after 9 s it switches to it by itself.
- **3D site:** the default; `?view=3d` forces it (no automatic switch).

## Edit the content

All text lives in [`src/content.ts`](src/content.ts): profile, sections, projects, experience, courses and skills.

- **Resume link:** put a PDF at `public/resume.pdf` and set `resumeUrl: './resume.pdf'`.
- **Email on the Contact page:** set `email`. It will be public.
- **Site address:** set `siteUrl` (for example `'https://example.com'`, no trailing slash). It turns on the canonical link, the social preview image and `sitemap.xml`.

## SEO and crawlers

[`seo.plugin.ts`](seo.plugin.ts) builds these from `src/content.ts`, so they always match the site:

- The page title, description, Open Graph and Twitter cards (preview image: [`public/og-image.jpg`](public/og-image.jpg), 1200 × 630), and JSON-LD describing you as a Person.
- A plain-text version of the whole site inside `<noscript>`, for visitors without JavaScript and for crawlers that don't run it.
- `robots.txt` (every crawler is welcome, search engines and AI assistants alike), `sitemap.xml`, and `llms.txt` (a Markdown summary for AI assistants).

## Sound

- Background music: put one audio file (mp3, ogg, m4a or opus) in `src/assets/audio/`. It starts once the loading screen is done, or on the first click or key press where the browser blocks sound until then. With no file there is no music.
- Button sounds are generated in code (soft felt pops and plucks). To use recordings instead, add files named `press`, `hover`, `open`, `back`, `start` or `toggle` (any audio format) to `src/assets/audio/ui/`.
- The **Sound** stitch (on the start screen and the planets screen) turns everything on or off and sets the volume; the choice is remembered.

## Controls

| Key | Action |
| --- | --- |
| ← → | Choose a planet |
| Home / End | First or last planet |
| Enter | Open it |
| Esc | Back to the planets |

Mouse and touch work too. On a section's planet, drag to turn it any way you like: the badge nearest the front becomes the selected one, and the speech bubble's arrow follows it. **Back to start** (top left of the planets screen) flies the rocket back to the start screen. Every section has its own link (`#/projects`, `#/experience`, `#/about`, `#/contact`).

## Accessibility

- The planets are a normal navigation list of links, so keyboard and screen-reader users get the usual behaviour.
- Swaying, wobbling outlines and sticker animations switch off when the system's "reduce motion" setting is on.
- Body text sits on solid paper cards for contrast.

## Credits

- Inspired by the pod menu in the PlayStation game LittleBigPlanet. Apart from the Sackboy model below, all artwork here is original, drawn in code. This site is not affiliated with Sony Interactive Entertainment or Media Molecule.
- Sackboy model: ["Play Station 3 - Little Big Planet - Sackboy"](https://sketchfab.com/3d-models/play-station-3-little-big-planet-sackboy-9a7c12661954431a9eb25fdd24044a18) by [AAAAAAAAAAAAA (@KPCOOKIESWIRL)](https://sketchfab.com/KPCOOKIESWIRL), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes: textures re-encoded as JPEG, and the model is rigged and animated in code (`src/three/Sackboy.tsx`). Sackboy is a character of Sony Interactive Entertainment.
- Background music (`src/assets/audio/background-music.mp3`): "The Orb of Dreamers" from the LittleBigPlanet 2 soundtrack, © Sony Interactive Entertainment.
- Fonts: [Fredoka](https://fonts.google.com/specimen/Fredoka) and [Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next), both under the SIL Open Font License.
- Libraries:
  - [React](https://react.dev) (MIT)
  - [Motion](https://motion.dev) (MIT)
  - [Rough.js](https://roughjs.com) (MIT), for the hand-drawn outlines
