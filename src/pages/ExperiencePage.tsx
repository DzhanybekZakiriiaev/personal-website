import { jobs } from '../content';
import { Sticker } from '../components/Sticker';

export function ExperiencePage() {
  return (
    <>
      <p className="intro">
        Co-op terms, teaching and my first job in Bishkek, across full-stack, data, integration and applied AI. I'm
        open to full-stack projects as well.
      </p>
      <ol className="timeline">
        {jobs.map((job, i) => (
          <li key={job.id} className="card timeline-item">
            <Sticker icon={job.icon} color={job.color} size={64} tilt={i % 2 === 0 ? 6 : -6} slap delay={80 * i} className="card-sticker" />
            <h2 className="card-title">{job.role}</h2>
            <p className="card-badge">
              {job.org}
              <span className="card-badge-note"> · {job.type}</span>
            </p>
            <p className="card-meta">
              {job.when} · {job.place}
            </p>
            <p>{job.summary}</p>
            {job.points.length > 0 ? (
              <ul className="card-points">
                {job.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}
