import { projects } from '../content';
import { Sticker } from '../components/Sticker';

export function ProjectsPage() {
  return (
    <>
      <p className="intro">
        Capstone work and hackathon builds. I've won eight hackathons; these are the ones I'm proudest of.
      </p>
      <ul className="card-grid">
        {projects.map((project, i) => (
          <li key={project.id} className="card">
            <Sticker
              icon={project.icon}
              color={project.color}
              size={72}
              tilt={i % 2 === 0 ? -8 : 7}
              slap
              delay={80 * i}
              className="card-sticker"
            />
            <h2 className="card-title">{project.title}</h2>
            <p className="card-badge">{project.badge}</p>
            <p className="card-meta">{project.when}</p>
            <p>{project.summary}</p>
            {project.points.length > 0 ? (
              <ul className="card-points">
                {project.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            ) : null}
            <ul className="tags" aria-label="Tools">
              {project.tags.map((tag) => (
                <li key={tag} className="tag">
                  {tag}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
