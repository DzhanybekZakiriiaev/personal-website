# Johnny Zakiriiaev

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

## Edit the content

All text lives in [`src/content.ts`](src/content.ts): profile, sections, projects, experience, courses and skills.

- **Resume link:** put a PDF at `public/resume.pdf` and set `resumeUrl: './resume.pdf'`.
- **Email on the Contact page:** set `email`. It will be public.

## Controls

| Key | Action |
| --- | --- |
| ← → | Choose a planet |
| Home / End | First or last planet |
| Enter | Open it |
| Esc | Back to the pod |

Mouse and touch work too. Every section has its own link (`#/projects`, `#/experience`, `#/about`, `#/contact`).

## Accessibility

- The planets are a normal navigation list of links, so keyboard and screen-reader users get the usual behaviour.
- Swaying, wobbling outlines and sticker animations switch off when the system's "reduce motion" setting is on.
- Body text sits on solid paper cards for contrast.

## Credits

- Inspired by the pod menu in the PlayStation game LittleBigPlanet. All artwork here is original, drawn in code. This site is not affiliated with Sony Interactive Entertainment or Media Molecule.
- Fonts: [Fredoka](https://fonts.google.com/specimen/Fredoka) and [Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next), both under the SIL Open Font License.
- Libraries:
  - [React](https://react.dev) (MIT)
  - [Motion](https://motion.dev) (MIT)
  - [Rough.js](https://roughjs.com) (MIT), for the hand-drawn outlines
