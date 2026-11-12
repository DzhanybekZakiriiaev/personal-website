import { profile } from '../content';
import { Sticker, TextStickerLink } from '../components/Sticker';

export function ContactPage() {
  return (
    <div className="contact">
      <section className="card contact-card" aria-labelledby="contact-heading">
        <Sticker icon="chat" color="#c8146a" size={72} tilt={-6} slap className="card-sticker" />
        <h2 id="contact-heading" className="card-title">
          Let's talk
        </h2>
        <p>
          I'm open to AI, data engineering and full-stack co-ops and projects, and to research collaborations. The
          quickest way to reach me is a message on LinkedIn, and my code is on GitHub.
        </p>
        <ul className="link-stickers link-stickers--inline">
          {profile.links.map((link, i) => (
            <li key={link.href}>
              <TextStickerLink href={link.href} label={link.label} color={link.color} tilt={i % 2 === 0 ? -4 : 5} />
            </li>
          ))}
          {profile.resumeUrl ? (
            <li>
              <TextStickerLink href={profile.resumeUrl} label="Resume" color="#2e9e6a" tilt={-3} />
            </li>
          ) : null}
        </ul>
        {profile.email ? (
          <p className="contact-email">
            Or email me at <a href={`mailto:${profile.email}`}>{profile.email}</a>
          </p>
        ) : null}
        <p className="card-meta">Based in {profile.location}.</p>
      </section>
    </div>
  );
}
