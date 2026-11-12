import { education, interests, jobs, profile, projects, type SectionId } from '../content';
import type { LevelItem } from '../components/levels/types';
import { TextStickerLink } from '../components/Sticker';
import { CourseGroups, Points, SkillsList, Tags } from './shared';
import { ContactForm } from '../components/ContactForm';

function firstSentence(text: string): string {
  const match = text.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : text;
}

function projectKicker(badge: string): string {
  if (badge.startsWith('1st') || badge.startsWith('Winner')) return 'Hackathon win';
  if (badge.startsWith('Top')) return 'Hackathon podium';
  return 'Capstone';
}

function projectLevels(): LevelItem[] {
  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    meta: p.badge,
    summary: p.summary,
    icon: p.icon,
    color: p.color,
    logo: p.logo,
    badgeStyle: p.badge.startsWith('Capstone') ? 'sticker' : 'rosette',
    kicker: projectKicker(p.badge),
    action: p.liveUrl
      ? { kind: 'live', href: p.liveUrl }
      : p.repoUrl
        ? { kind: 'repo', href: p.repoUrl }
        : { kind: 'soon' },
    detail: (
      <>
        <p className="card-meta">{p.when}</p>
        <p>{p.summary}</p>
        <Points items={p.points} />
        <Tags items={p.tags} />
        {(p.liveUrl && p.repoUrl) || p.devpostUrl ? (
          <ul className="link-stickers link-stickers--inline">
            {p.liveUrl && p.repoUrl ? (
              <li>
                <TextStickerLink href={p.repoUrl} label="Code on GitHub" color="#2f63a8" tilt={-3} />
              </li>
            ) : null}
            {p.devpostUrl ? (
              <li>
                <TextStickerLink href={p.devpostUrl} label="Devpost" color="#0b7a75" tilt={3} />
              </li>
            ) : null}
          </ul>
        ) : null}
      </>
    ),
  }));
}

function experienceLevels(): LevelItem[] {
  return jobs.map((job) => ({
    id: job.id,
    title: job.role,
    meta: `${job.org} · ${job.when}`,
    summary: firstSentence(job.summary),
    icon: job.icon,
    color: job.color,
    kicker: job.type,
    detail: (
      <>
        <p className="card-meta">
          {job.type} · {job.place}
        </p>
        <p>{job.summary}</p>
        <Points items={job.points} />
      </>
    ),
  }));
}

function aboutLevels(): LevelItem[] {
  return [
    {
      id: 'about-me',
      title: `Hi, I'm ${profile.name.split(' ')[0]}`,
      meta: `${profile.tagline} · ${profile.location}`,
      summary: profile.pitch,
      kicker: 'About me',
      icon: 'globe',
      color: '#2f63a8',
      detail: (
        <>
          <p>{profile.pitch}</p>
          <h3>What I want to work on</h3>
          <Points items={interests} />
        </>
      ),
    },
    {
      id: 'education',
      title: 'Education',
      meta: `${education.school} · ${education.when}`,
      summary: `${education.degree}, ${education.minor}. ${education.gpa}.`,
      kicker: 'Education',
      icon: 'cap',
      color: '#7a5af0',
      detail: (
        <>
          <p className="card-badge">
            {education.degree}, {education.minor}
          </p>
          <p className="card-meta">
            {education.school} · {education.place} · {education.when}
          </p>
          <p className="gpa">{education.gpa}</p>
          <h3>Courses</h3>
          <CourseGroups />
        </>
      ),
    },
    {
      id: 'skills',
      title: 'Skills',
      meta: 'Languages, AI and ML, data, backend, cloud',
      summary: 'The languages, frameworks and platforms I use most in my work and projects.',
      kicker: 'Skills',
      icon: 'gear',
      color: '#0f8b8d',
      detail: <SkillsList />,
    },
  ];
}

function contactLevels(): LevelItem[] {
  const levels: LevelItem[] = [
    {
      id: 'write',
      title: 'Write to me',
      kicker: 'Letter',
      meta: 'Straight to my inbox',
      summary: 'Send me an email: co-ops, projects or research ideas.',
      icon: 'chat',
      color: '#7a5af0',
      detail: <ContactForm />,
    },
    {
      id: 'linkedin',
      title: 'LinkedIn',
      kicker: 'Message me',
      meta: 'The quickest way to reach me',
      summary: 'Send me a message on LinkedIn about co-ops, projects or research.',
      icon: 'chat',
      color: '#c8146a',
      detail: (
        <>
          <p>
            I'm open to AI, data engineering and full-stack co-ops and projects, and to research collaborations.
            A message on LinkedIn reaches me fastest.
          </p>
          <ul className="link-stickers link-stickers--inline">
            <li>
              <TextStickerLink href="https://www.linkedin.com/in/dzhanybek/" label="LinkedIn" color="#c8146a" tilt={-4} />
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'github',
      title: 'GitHub',
      kicker: 'Code',
      meta: 'My code',
      summary: 'Hackathon builds, capstone work and side projects.',
      icon: 'code',
      color: '#2f63a8',
      detail: (
        <>
          <p>Hackathon builds, capstone work and side projects live on my GitHub.</p>
          <ul className="link-stickers link-stickers--inline">
            <li>
              <TextStickerLink href="https://github.com/DzhanybekZakiriiaev" label="GitHub" color="#2f63a8" tilt={4} />
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'where',
      title: 'Where I am',
      kicker: 'Location',
      meta: profile.location,
      summary: `Based in ${profile.location}.`,
      icon: 'pin',
      color: '#d35400',
      detail: (
        <p>
          I'm based in {profile.location} and open to AI, data engineering and full-stack co-ops and projects,
          on-site, hybrid or remote.
        </p>
      ),
    },
  ];

  if (profile.email) {
    levels.push({
      id: 'email',
      title: 'Email',
      kicker: 'Email',
      meta: profile.email,
      summary: 'Prefer email? That works too.',
      icon: 'chat',
      color: '#7a5af0',
      detail: (
        <p>
          Email me at <a href={`mailto:${profile.email}`}>{profile.email}</a>.
        </p>
      ),
    });
  }

  if (profile.resumeUrl) {
    levels.push({
      id: 'resume',
      title: 'Resume',
      kicker: 'Resume',
      meta: 'PDF',
      summary: 'My one-page resume.',
      icon: 'book',
      color: '#2e9e6a',
      detail: (
        <ul className="link-stickers link-stickers--inline">
          <li>
            <TextStickerLink href={profile.resumeUrl} label="Resume (PDF)" color="#2e9e6a" tilt={-3} />
          </li>
        </ul>
      ),
    });
  }

  return levels;
}

export function levelsFor(id: SectionId): LevelItem[] {
  switch (id) {
    case 'projects':
      return projectLevels();
    case 'experience':
      return experienceLevels();
    case 'about':
      return aboutLevels();
    case 'contact':
      return contactLevels();
  }
}
