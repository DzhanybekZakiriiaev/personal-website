import { courseTerms, education, interests, profile, skills } from '../content';
import { Sticker } from '../components/Sticker';

export function AboutPage() {
  return (
    <div className="about">
      <section className="card about-intro" aria-labelledby="about-me">
        <Sticker icon="globe" color="#2f63a8" size={64} tilt={-7} slap className="card-sticker" />
        <h2 id="about-me" className="card-title">
          Hi, I'm {profile.name}
        </h2>
        <p>{profile.pitch}</p>
        <h3>What I want to work on</h3>
        <ul className="card-points">
          {interests.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="education">
        <Sticker icon="cap" color="#7a5af0" size={64} tilt={8} slap delay={80} className="card-sticker" />
        <h2 id="education" className="card-title">
          Education
        </h2>
        <p className="card-badge">
          {education.degree}, {education.minor}
        </p>
        <p className="card-meta">
          {education.school} · {education.place} · {education.when}
        </p>
        <p className="gpa">{education.gpa}</p>

        <h3>Courses</h3>
        <div className="course-groups">
          {courseTerms.map((group) => (
            <details key={group.term} className="course-group">
              <summary>
                {group.term} <span className="course-count">({group.courses.length})</span>
              </summary>
              <ul className="course-list">
                {group.courses.map((course) => (
                  <li key={course.code}>
                    <span className="course-title">{course.title}</span>
                    <span className="course-code">{course.code}</span>
                    <span className="course-summary">{course.summary}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="skills">
        <Sticker icon="gear" color="#0f8b8d" size={64} tilt={-5} slap delay={160} className="card-sticker" />
        <h2 id="skills" className="card-title">
          Skills
        </h2>
        <dl className="skills">
          {skills.map((group) => (
            <div key={group.group} className="skill-group">
              <dt>{group.group}</dt>
              <dd>
                <ul className="tags">
                  {group.items.map((item) => (
                    <li key={item} className="tag">
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
