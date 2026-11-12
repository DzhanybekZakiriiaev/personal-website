import { courseTerms, skills } from '../content';

export function Points({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="card-points">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function Tags({ items, label = 'Tools' }: { items: string[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="tags" aria-label={label}>
      {items.map((item) => (
        <li key={item} className="tag">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function CourseGroups() {
  return (
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
  );
}

export function SkillsList() {
  return (
    <dl className="skills">
      {skills.map((group) => (
        <div key={group.group} className="skill-group">
          <dt>{group.group}</dt>
          <dd>
            <Tags items={group.items} label={group.group} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
