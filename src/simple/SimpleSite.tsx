// The simple version: everything the site says, with no 3D and nothing heavy to
// download, in the same handmade style: a cardboard sign, a paper cut-out rocket,
// a woven ribbon of section tabs, and felt, burlap and paper cards. One section
// shows at a time (the same addresses as the 3D site: #/experience, #/projects, ...),
// with a small row of stitched chips to jump between its parts. main.tsx shows it
// instead of the 3D site when lib/viewMode.ts says so.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  contactEmail,
  courseTerms,
  education,
  interests,
  jobs,
  profile,
  projects,
  sections,
  skills,
  type Job,
  type Project,
  type SectionId,
} from '../content';
import { type SimpleReason } from '../lib/viewMode';
import { Sticker } from '../components/Sticker';
import { SvgDefs } from '../components/SvgDefs';
import { ViewToggle } from '../components/ViewToggle';
import { CutoutRocket } from './CutoutRocket';
import './simple.css';

const WHY: Record<SimpleReason, string> = {
  asked: '',
  slow: 'The 3D version was taking a while to load, so this is the simple version.',
  'no-webgl': "This browser can't show 3D graphics, so this is the simple version.",
  software: 'This device has no graphics acceleration for 3D, so this is the simple version.',
  'save-data': 'Data saver is on, so this is the light, simple version.',
  'low-memory': 'This device is low on memory, so this is the light, simple version.',
};

const TAB_COLOURS: Record<SectionId, string> = {
  experience: '#2f63a8',
  projects: '#5f8f2a',
  about: '#9a7a3c',
  contact: '#c8146a',
};
const TILTS = [-2, 1.5, -1, 2];

const sectionIds = sections.map((s) => s.id);
const DEFAULT_TAB: SectionId = 'experience';

/** A job's chip in the sub-navbar: the organisation's first word and the year it started. */
function jobChip(job: Job): string {
  const year = job.when.match(/d{4}/)?.[0];
  const org = job.org.split(/[ ,]/)[0];
  return year ? `${org} ${year}` : org;
}

function tabFromHash(): SectionId {
  const id = window.location.hash.replace(/^#\/?/, '');
  return (sectionIds as string[]).includes(id) ? (id as SectionId) : DEFAULT_TAB;
}

function External({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

/** A section's own little navbar: stitched chips that jump to its parts. */
function SubNav({ label, parts }: { label: string; parts: { id: string; text: string }[] }) {
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };
  return (
    <nav className="s-subnav" aria-label={label}>
      <ul>
        {parts.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => jump(p.id)}>
              {p.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** A project's sticker: its hackathon logo on a white disc, or its icon. */
function ProjectSticker({ project }: { project: Project }) {
  const [failed, setFailed] = useState(false);
  if (!project.logo || failed) return <Sticker icon={project.icon} color={project.color} size={64} tilt={-6} />;
  return (
    <span className="s-logo" style={{ '--c': project.color } as CSSProperties} aria-hidden="true">
      <img src={project.logo} alt="" width={44} height={44} decoding="async" loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

function SectionTitle({ id, children, patch }: { id: string; children: ReactNode; patch?: string }) {
  return (
    <div className="s-title-row">
      <h2 id={id} className="s-title" tabIndex={-1}>
        {children}
      </h2>
      {patch ? (
        <p className="s-patch" aria-hidden="true">
          {patch}
        </p>
      ) : null}
    </div>
  );
}

export function SimpleSite({ reason }: { reason: SimpleReason | null }) {
  const [tab, setTab] = useState<SectionId>(tabFromHash);
  const tabsRef = useRef<HTMLElement>(null);
  const moved = useRef(false);

  useEffect(() => {
    document.title = `${profile.name} · ${profile.tagline}`;
    const onHash = () => {
      moved.current = true;
      setTab(tabFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // A new tab: bring the tabs to the top if they've scrolled away, and move focus to
  // the section's heading so screen readers announce it.
  useEffect(() => {
    if (!moved.current) return;
    const bar = tabsRef.current;
    if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: 'start' });
    document.getElementById(`s-${tab}`)?.focus({ preventScroll: true });
  }, [tab]);

  const choose = useCallback((id: SectionId) => {
    if (window.location.hash === `#/${id}`) return;
    window.location.hash = `/${id}`;
  }, []);

  const why = reason ? WHY[reason] : '';
  const canTry3d = reason !== 'no-webgl';
  const label = (id: SectionId) => sections.find((s) => s.id === id)?.label ?? id;
  const linkedIn = profile.links.find((l) => l.label === 'LinkedIn');

  return (
    <div className="simple">
      <SvgDefs />
      <a className="s-skip" href="#main">
        Skip to content
      </a>

      <header className="s-top">
        {canTry3d ? <ViewToggle current="simple" className="s-view" /> : null}
        <div className="s-hero">
          <div className="s-hang">
            <div className="s-sign">
              <h1>{profile.name}</h1>
              <p className="s-role">
                {profile.tagline} · {profile.location}
              </p>
            </div>
          </div>
          <CutoutRocket />
        </div>
        <div className="s-pitch">
          <p>{profile.pitch}</p>
        </div>
        <ul className="s-links" aria-label="Elsewhere">
          {profile.links.map((l, i) => (
            <li key={l.href} style={{ '--tilt': `${TILTS[i % TILTS.length]}deg`, '--c': l.color } as CSSProperties}>
              <External href={l.href}>{l.label}</External>
            </li>
          ))}
          {profile.resumeUrl ? (
            <li style={{ '--tilt': '1deg', '--c': '#f08a24' } as CSSProperties}>
              <External href={profile.resumeUrl}>Resume</External>
            </li>
          ) : null}
        </ul>
        {why ? <p className="s-note">{why}</p> : null}
      </header>

      <nav ref={tabsRef} className="s-tabs" aria-label="Sections">
        <ul>
          {sections.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#/${s.id}`}
                aria-current={tab === s.id ? 'page' : undefined}
                style={{ '--c': TAB_COLOURS[s.id], '--tilt': `${TILTS[i % TILTS.length]}deg` } as CSSProperties}
                onClick={(e) => {
                  e.preventDefault();
                  choose(s.id);
                }}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" tabIndex={-1}>
        {/* Every section is in the page (for search engines and print); only the chosen one shows. */}
        <section className="s-section" aria-labelledby="s-experience" hidden={tab !== 'experience'}>
          <SectionTitle id="s-experience">{label('experience')}</SectionTitle>
          <SubNav label="Jobs" parts={jobs.map((j) => ({ id: `job-${j.id}`, text: jobChip(j) }))} />
          <ol className="s-thread">
            {jobs.map((j, i) => (
              <li key={j.id} className="s-job" style={{ '--c': j.color, '--tilt': `${TILTS[i % TILTS.length] / 2}deg` } as CSSProperties}>
                <span className="s-knot" aria-hidden="true" />
                <article className="s-tag" aria-labelledby={`job-${j.id}`}>
                  <div className="s-tag-head">
                    <Sticker icon={j.icon} color={j.color} size={56} tilt={TILTS[i % TILTS.length] * 2} />
                    <div>
                      <h3 id={`job-${j.id}`} tabIndex={-1}>
                        {j.role}
                      </h3>
                      <p className="s-org">{j.org}</p>
                    </div>
                  </div>
                  <p className="s-meta">
                    <span className="s-chip">{j.type}</span>
                    <span>{j.when}</span>
                    <span>{j.place}</span>
                  </p>
                  <p>{j.summary}</p>
                  {j.points.length ? (
                    <ul className="s-points">
                      {j.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              </li>
            ))}
          </ol>
        </section>

        <section className="s-section" aria-labelledby="s-projects" hidden={tab !== 'projects'}>
          <SectionTitle id="s-projects" patch="Featured">
            {label('projects')}
          </SectionTitle>
          <p className="s-lede">A selection of hackathon wins and builds.</p>
          <div className="s-patches">
            {projects.map((p, i) => (
              <article key={p.id} className="s-patch-card" style={{ '--c': p.color, '--tilt': `${TILTS[i % TILTS.length] / 2}deg` } as CSSProperties} aria-labelledby={`project-${p.id}`}>
                <div className="s-patch-head">
                  <ProjectSticker project={p} />
                  <div>
                    <h3 id={`project-${p.id}`}>{p.title}</h3>
                    <p className="s-ribbon">{p.badge}</p>
                  </div>
                </div>
                <p className="s-when">{p.when}</p>
                <p>{p.summary}</p>
                {p.points.length ? (
                  <ul className="s-points">
                    {p.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                ) : null}
                {p.tags.length ? (
                  <ul className="s-tags" aria-label="Built with">
                    {p.tags.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : null}
                {p.liveUrl || p.repoUrl || p.devpostUrl ? (
                  <p className="s-actions">
                    {p.liveUrl ? <External href={p.liveUrl}>Live site</External> : null}
                    {p.repoUrl ? <External href={p.repoUrl}>Code</External> : null}
                    {p.devpostUrl ? <External href={p.devpostUrl}>Devpost</External> : null}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="s-section" aria-labelledby="s-about" hidden={tab !== 'about'}>
          <SectionTitle id="s-about">{label('about')}</SectionTitle>
          <SubNav
            label="About"
            parts={[
              { id: 'about-education', text: 'Education' },
              { id: 'about-courses', text: 'Courses' },
              { id: 'about-skills', text: 'Skills' },
              { id: 'about-interests', text: 'Interests' },
            ]}
          />
          <div className="s-about">
            <article className="s-card s-card--wide" aria-labelledby="about-education">
              <h3 id="about-education" tabIndex={-1}>
                Education
              </h3>
              <p className="s-org">{education.school}</p>
              <p className="s-meta">
                <span className="s-chip">{education.when}</span>
                <span>{education.place}</span>
              </p>
              <p>
                {education.degree}, {education.minor}. {education.gpa}.
              </p>
            </article>

            <article className="s-card s-card--wide" aria-labelledby="about-courses">
              <h3 id="about-courses" tabIndex={-1}>
                Courses
              </h3>
              <div className="s-terms">
                {courseTerms.map((t) => (
                  <details key={t.term} className="s-pocket">
                    <summary>
                      {t.term} <span className="s-count">{t.courses.length} courses</span>
                    </summary>
                    <ul>
                      {t.courses.map((c) => (
                        <li key={c.code}>
                          <strong>{c.title}</strong> <span className="s-code">{c.code}</span>
                          <br />
                          {c.summary}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </article>

            <article className="s-card" aria-labelledby="about-skills">
              <h3 id="about-skills" tabIndex={-1}>
                Skills
              </h3>
              {skills.map((g) => (
                <div key={g.group} className="s-skill-group">
                  <h4>{g.group}</h4>
                  <ul className="s-tags">
                    {g.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </article>

            <article className="s-card" aria-labelledby="about-interests">
              <h3 id="about-interests" tabIndex={-1}>
                Interests
              </h3>
              <ul className="s-yarn">
                {interests.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <section className="s-section" aria-labelledby="s-contact" hidden={tab !== 'contact'}>
          <SectionTitle id="s-contact">{label('contact')}</SectionTitle>
          <article className="s-envelope">
            <span className="s-stamp" aria-hidden="true">
              <Sticker icon="chat" color="#c8146a" size={58} tilt={8} />
            </span>
            <p className="s-envelope-to">To: {profile.name}</p>
            <p>Co-ops, projects or research ideas: I'd love to hear from you.</p>
            <p className="s-actions s-actions--big">
              <a href={`mailto:${contactEmail}`}>Email</a>
              {linkedIn ? <External href={linkedIn.href}>LinkedIn</External> : null}
            </p>
          </article>
        </section>
      </main>

      <footer className="s-footer">
        <p>
          {profile.name} · {profile.location}
        </p>
      </footer>
    </div>
  );
}
