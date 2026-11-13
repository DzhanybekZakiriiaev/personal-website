// The simple version: everything the site says, on felt-and-paper cards, with no 3D
// and nothing heavy to download. main.tsx shows it instead of the 3D site when
// viewMode.ts says so (asked for, a weak device, or the 3D taking too long).
import { useEffect } from 'react';
import { contactEmail, courseTerms, education, interests, jobs, profile, projects, sections, skills } from '../content';
import { viewUrl, type SimpleReason } from '../lib/viewMode';
import './simple.css';

const WHY: Record<SimpleReason, string> = {
  asked: '',
  slow: 'The 3D version was taking a while to load, so this is the simple version.',
  'no-webgl': "This browser can't show 3D graphics, so this is the simple version.",
  software: 'This device has no graphics acceleration for 3D, so this is the simple version.',
  'save-data': 'Data saver is on, so this is the light, simple version.',
  'low-memory': 'This device is low on memory, so this is the light, simple version.',
};

const label = (id: string) => sections.find((s) => s.id === id)?.label ?? id;

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

export function SimpleSite({ reason }: { reason: SimpleReason | null }) {
  // Opened with a section address (#/projects): jump to that section.
  useEffect(() => {
    document.title = `${profile.name} · ${profile.tagline}`;
    const id = window.location.hash.replace(/^#\/?/, '');
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  const why = reason ? WHY[reason] : '';
  const canTry3d = reason !== 'no-webgl';

  return (
    <div className="simple">
      <a className="simple-skip" href="#main">
        Skip to content
      </a>

      <header className="simple-header">
        <div className="simple-sign">
          <h1>{profile.name}</h1>
          <p className="simple-role">
            {profile.tagline} · {profile.location}
          </p>
        </div>
        <p className="simple-pitch">{profile.pitch}</p>
        <ul className="simple-links" aria-label="Elsewhere">
          {profile.links.map((l) => (
            <li key={l.href}>
              <External href={l.href}>{l.label}</External>
            </li>
          ))}
          {profile.resumeUrl ? (
            <li>
              <External href={profile.resumeUrl}>Resume</External>
            </li>
          ) : null}
        </ul>
        <nav className="simple-nav" aria-label="Sections">
          <ul>
            {(['experience', 'projects', 'about', 'contact'] as const).map((id) => (
              <li key={id}>
                <a href={`#${id}`}>{label(id)}</a>
              </li>
            ))}
          </ul>
        </nav>
        {why || canTry3d ? (
          <p className="simple-note">
            {why} {canTry3d ? <a href={viewUrl('3d')}>Try the 3D version</a> : null}
          </p>
        ) : null}
      </header>

      <main id="main" tabIndex={-1}>
        <section id="experience" aria-labelledby="simple-experience">
          <h2 id="simple-experience">{label('experience')}</h2>
          {jobs.map((j) => (
            <article key={j.id} className="simple-card">
              <h3>{j.role}</h3>
              <p className="simple-meta">
                {j.org} · {j.type} · {j.place} · {j.when}
              </p>
              <p>{j.summary}</p>
              {j.points.length ? (
                <ul>
                  {j.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </section>

        <section id="projects" aria-labelledby="simple-projects">
          <h2 id="simple-projects">Featured {label('projects').toLowerCase()}</h2>
          <div className="simple-grid">
            {projects.map((p) => (
              <article key={p.id} className="simple-card">
                <h3>{p.title}</h3>
                <p className="simple-meta">
                  {p.badge} · {p.when}
                </p>
                <p>{p.summary}</p>
                {p.points.length ? (
                  <ul>
                    {p.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                ) : null}
                {p.tags.length ? <p className="simple-tags">{p.tags.join(' · ')}</p> : null}
                {p.liveUrl || p.repoUrl || p.devpostUrl ? (
                  <p className="simple-card-links">
                    {p.liveUrl ? <External href={p.liveUrl}>Live site</External> : null}
                    {p.repoUrl ? <External href={p.repoUrl}>Code</External> : null}
                    {p.devpostUrl ? <External href={p.devpostUrl}>Devpost</External> : null}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section id="about" aria-labelledby="simple-about">
          <h2 id="simple-about">{label('about')}</h2>
          <article className="simple-card">
            <h3>Education</h3>
            <p className="simple-meta">
              {education.school} · {education.place} · {education.when}
            </p>
            <p>
              {education.degree}, {education.minor}. {education.gpa}.
            </p>
            <details>
              <summary>Courses</summary>
              {courseTerms.map((t) => (
                <div key={t.term} className="simple-term">
                  <h4>{t.term}</h4>
                  <ul>
                    {t.courses.map((c) => (
                      <li key={c.code}>
                        <strong>{c.title}</strong> ({c.code}): {c.summary}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
          </article>
          <article className="simple-card">
            <h3>Skills</h3>
            <ul className="simple-skills">
              {skills.map((g) => (
                <li key={g.group}>
                  <strong>{g.group}:</strong> {g.items.join(', ')}
                </li>
              ))}
            </ul>
          </article>
          <article className="simple-card">
            <h3>Interests</h3>
            <ul>
              {interests.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </article>
        </section>

        <section id="contact" aria-labelledby="simple-contact">
          <h2 id="simple-contact">{label('contact')}</h2>
          <article className="simple-card">
            <p>Co-ops, projects or research ideas: I'd love to hear from you.</p>
            <p className="simple-card-links">
              <a href={`mailto:${contactEmail}`}>Email me</a>
              {profile.links
                .filter((l) => l.label === 'LinkedIn')
                .map((l) => (
                  <External key={l.href} href={l.href}>
                    Message me on LinkedIn
                  </External>
                ))}
            </p>
          </article>
        </section>
      </main>

      <footer className="simple-footer">
        <p>
          {profile.name} · {profile.location}
          {canTry3d ? (
            <>
              {' · '}
              <a href={viewUrl('3d')}>3D version</a>
            </>
          ) : null}
        </p>
      </footer>
    </div>
  );
}
