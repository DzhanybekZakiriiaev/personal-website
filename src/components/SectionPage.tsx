import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { profile, sections, type SectionId } from '../content';
import { go } from '../lib/route';
import { Planet } from './Planets';
import { ButtonHints } from './ButtonHints';
import { ProjectsPage } from '../pages/ProjectsPage';
import { ExperiencePage } from '../pages/ExperiencePage';
import { AboutPage } from '../pages/AboutPage';
import { ContactPage } from '../pages/ContactPage';

// A section opened from the pod: the planet sits in the corner and the content
// is laid out on readable paper cards.
export function SectionPage({ id }: { id: SectionId }) {
  const section = sections.find((s) => s.id === id) ?? sections[0];
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.title = `${section.label} · ${profile.name}`;
    window.scrollTo(0, 0);
    heading.current?.focus();
  }, [section]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') go('pod');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <motion.div
      className="section"
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      <header className="section-header">
        <a className="back-bubble" href="#/">
          <span aria-hidden="true">← </span>Back to the pod
        </a>
        <h1 ref={heading} tabIndex={-1} className="title-bubble">
          {section.label}
        </h1>
        <motion.div
          className="section-planet"
          aria-hidden="true"
          initial={{ scale: 2.4, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 16 }}
        >
          <Planet kind={section.planet} />
        </motion.div>
      </header>

      <main id="main" className="section-main">
        {id === 'projects' ? (
          <ProjectsPage />
        ) : id === 'experience' ? (
          <ExperiencePage />
        ) : id === 'contact' ? (
          <ContactPage />
        ) : (
          <AboutPage />
        )}
      </main>

      <ButtonHints hints={[{ keys: ['Esc'], label: 'Back' }]} />
    </motion.div>
  );
}
