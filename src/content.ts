// All site text lives here, so it can be edited without touching the components.
// Sources: Johnny's CV (Nov 2026) and Conestoga College's official program outline
// (Bachelor of Computer Science (Honours), program 1514, "Courses - January 2024").
// Hackathon logos come from each event's official website (sih.svg is a plain text
// badge, since that event has no small logo) and only mark where a
// project was built.
import stormhacksLogo from './assets/logos/stormhacks.webp';
import ignitionLogo from './assets/logos/ignitionhacks.png';
import cuhackingLogo from './assets/logos/cuhacking.svg';
import hackcanadaLogo from './assets/logos/hackcanada.webp';
import sihLogo from './assets/logos/sih.svg';

export type IconName =
  | 'trophy'
  | 'code'
  | 'database'
  | 'robot'
  | 'pin'
  | 'bulb'
  | 'heart'
  | 'cube'
  | 'camera'
  | 'wave'
  | 'cap'
  | 'rocket'
  | 'gear'
  | 'chart'
  | 'book'
  | 'globe'
  | 'star'
  | 'chat'
  | 'chess';

export type PlanetKind = 'knit' | 'stickers' | 'moon' | 'letter';
export type SectionId = 'experience' | 'projects' | 'about' | 'contact';

export interface SectionDef {
  id: SectionId;
  label: string;
  note: string;
  planet: PlanetKind;
  /** A small felt patch sewn onto the section page's title, e.g. 'Featured'. */
  patch?: string;
}

export interface LinkDef {
  label: string;
  href: string;
  color: string;
}

export interface Project {
  id: string;
  title: string;
  badge: string;
  when: string;
  icon: IconName;
  color: string;
  summary: string;
  points: string[];
  tags: string[];
  /** Deployed site. When set, "Visit now!" opens it. */
  liveUrl?: string;
  /** Public GitHub repo. Used when there is no liveUrl. Neither set = "Working on it" screen. */
  repoUrl?: string;
  /** Logo of the hackathon it was built at; shown on the planet badge. */
  logo?: string;
  /** The project's Devpost page. */
  devpostUrl?: string;
}

export interface Job {
  id: string;
  role: string;
  org: string;
  type: string;
  place: string;
  when: string;
  icon: IconName;
  color: string;
  summary: string;
  points: string[];
}

export interface Course {
  code: string;
  title: string;
  summary: string;
}

export interface CourseTerm {
  term: string;
  courses: Course[];
}

export const profile = {
  name: 'Dzhanybek (Johnny) Zakiriiaev',
  fullName: 'Dzhanybek (Johnny) Zakiriiaev',
  tagline: 'Applied AI, data engineering and full-stack',
  location: 'Waterloo, Ontario',
  // The site's public address, e.g. 'https://example.com' (no trailing slash). Used for
  // the canonical link, social previews, sitemap.xml and robots.txt (seo.plugin.ts).
  siteUrl: '',
  pitch:
    "I build things. Lately that's been full-stack software, data pipelines, AI assistants and integrations for companies in Toronto and Vancouver. Before that, I helped build a patient records platform used by public hospitals in Bishkek.",
  // Put your resume at public/resume.pdf and set resumeUrl to './resume.pdf' to show the link.
  resumeUrl: '',
  // Add an email address here to show it on the Contact page (it will be public).
  email: '',
  links: [
    { label: 'GitHub', href: 'https://github.com/DzhanybekZakiriiaev', color: '#2f63a8' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/dzhanybek/', color: '#c8146a' },
    { label: 'Devpost', href: 'https://devpost.com/DzhanybekZakiriiaev', color: '#0b7a75' },
  ] satisfies LinkDef[],
};

// Left to right on the pod menu. Projects starts selected.
export const sections: SectionDef[] = [
  { id: 'experience', label: 'Experience', note: 'QuadReal, Touchstone, UKUK', planet: 'knit' },
  // 'Featured': the page shows a selection, not every hackathon win.
  { id: 'projects', label: 'Projects', note: '8 hackathon wins!', planet: 'stickers', patch: 'Featured' },
  { id: 'about', label: 'About', note: 'Education and skills', planet: 'moon' },
  { id: 'contact', label: 'Contact me', note: 'Say hello!', planet: 'letter' },
];

export const projects: Project[] = [
  {
    id: 'doggin-around',
    devpostUrl: 'https://devpost.com/software/doggin-around',
    logo: stormhacksLogo,
    title: "Doggin' Around",
    badge: '1st of 750+ · StormHacks 2026',
    when: 'Simon Fraser University',
    icon: 'cube',
    color: '#f08a24',
    summary:
      'A Three.js app that turns a comic page into a 3D world you can walk into and rewrite.',
    points: [
      "Implemented the SMAL-pets paper's 3D reconstruction in PyTorch3D and gsplat.",
      'PSNR 43.9 and SSIM 0.996 on 8 held-out synthetic views; runs at 60 FPS in Chrome.',
    ],
    tags: ['PyTorch3D', 'gsplat', 'Three.js'],
    liveUrl: 'https://itslowkey.tech/',
    repoUrl: 'https://github.com/DzhanybekZakiriiaev/doggin-around',
  },
  {
    id: 'starry-night',
    devpostUrl: 'https://devpost.com/software/project-eq9tw5acxhf3',
    logo: ignitionLogo,
    title: 'Star Glazers',
    badge: '1st of 300+ · Ignition Hacks 2026',
    when: 'Toronto light-pollution map',
    icon: 'star',
    color: '#3b4fb8',
    summary:
      'A map tracing light pollution from satellite down to individual streetlights, with retrofit savings.',
    points: [
      'Built a validated pipeline joining 305,237 Toronto poles with 12 years of VIIRS night-light data.',
      'Contributed to a YOLOv11 light detector and an XGBoost forecast (R² 0.94 on unseen years).',
    ],
    tags: ['Python', 'YOLOv11', 'XGBoost', 'Mapbox'],
    liveUrl: 'https://starry-night-lp5h.onrender.com/',
    repoUrl: 'https://github.com/karnamgyal/star-glazers',
  },
  {
    id: 'clascade',
    devpostUrl: 'https://devpost.com/software/clascade',
    logo: cuhackingLogo,
    title: 'Clascade',
    badge: '1st of 200+ · Best Use of AI · cuHacking 2026',
    when: 'Carleton University',
    icon: 'book',
    color: '#2e9e6a',
    summary:
      "Turns a teacher's slides into a fact-checked 3D lesson the whole class plays live.",
    points: [
      'AI fills a validated JSON lesson spec with cited sources instead of writing code.',
      "The teacher controls every student's screen through Firestore sync.",
    ],
    tags: ['LLMs', 'Firestore', 'Three.js'],
    repoUrl: 'https://github.com/akashngb/clascade',
  },
  {
    id: 'storydrift',
    devpostUrl: 'https://devpost.com/software/w-enxoy9',
    logo: hackcanadaLogo,
    title: 'StoryDrift',
    badge: 'Top 3 of 700+ · HackCanada 2026',
    when: 'Now a startup backed by the SPUR Innovation Centre',
    icon: 'heart',
    color: '#d6336c',
    summary:
      "An AI bedtime-story app that paces narration to a child's heart rate and breathing, read through an iPhone camera.",
    points: [
      'Owned the backend: Node.js, Express, Prisma, MongoDB and Auth0.',
      'Zero production incidents in its first 6 months.',
    ],
    tags: ['Node.js', 'Prisma', 'MongoDB', 'Auth0'],
    repoUrl: 'https://github.com/CatherineSusilo/HackCanada2026',
  },
  {
    id: 'love-is-chess',
    devpostUrl: 'https://devpost.com/software/love-is-chess',
    logo: sihLogo,
    title: 'love-is-chess',
    badge: 'Winner · Waterloo Stupid Ideas Hackathon 2026',
    when: 'Where pieces have feelings',
    icon: 'chess',
    color: '#c8146a',
    summary:
      'A chess game where every piece is a character you can chat with, and pieces you neglect can defect.',
    points: [
      'Each piece streams its dialogue from Claude and tracks trust and love toward you.',
      'Play single-player against a bot or LAN multiplayer.',
    ],
    tags: ['React', 'Node.js', 'Claude API'],
    repoUrl: 'https://github.com/DzhanybekZakiriiaev/love-is-chess',
  },
  {
    id: 'smartgym',
    title: 'SmartGym OS',
    badge: 'Capstone Project I',
    when: 'Feb 2026 to present',
    icon: 'camera',
    color: '#0f8b8d',
    summary:
      'A real-time computer vision and sensor analytics system with PyTorch edge inference for occupancy detection, member tracking and automated rep counting on constrained hardware.',
    points: [
      'Rep counting on 152 held-out RepCount Part-A videos: nMAE 0.38 vs 0.55 for a predict-the-mean baseline.',
      'Caching and frame sampling to balance accuracy and speed, with integration and load testing.',
    ],
    tags: ['PyTorch', 'Computer vision', 'Edge inference', 'React'],
  },
  {
    id: 'speech-wearable',
    title: 'ML-powered speech reconstruction wearable',
    badge: 'Capstone Project II',
    when: 'Apr 2026 to present',
    icon: 'wave',
    color: '#b5482f',
    summary:
      'A real-time PyTorch pipeline for non-vocal speech reconstruction on edge hardware, working with EMG, IMU and ultrasound data.',
    points: [
      'Tuning the personalized model across throughput, accuracy and latency.',
      'Documenting design decisions so model updates can be reproduced.',
    ],
    tags: ['PyTorch', 'Signal processing', 'Edge hardware'],
  },
];

// Experience text comes from LinkedIn on purpose: the site is public, so it stays
// at the same level of detail as the LinkedIn profile.
export const jobs: Job[] = [
  {
    id: 'quadreal',
    role: 'Intern, Integration Developer',
    org: 'QuadReal Property Group',
    type: 'Internship',
    place: 'Vancouver, BC · On-site',
    when: 'Sep 2026 to present',
    icon: 'gear',
    color: '#2f63a8',
    summary:
      'Integration Developer on the technology team, working across MuleSoft and Azure Integration Services to build and maintain enterprise integration solutions. Supporting requirements gathering, designing custom connectors, scripting data transformations, and managing API security. Collaborating with DevOps, infrastructure, and cross-functional teams.',
    points: [],
  },
  {
    id: 'touchstone-2026',
    role: 'Summer Student, Software Development',
    org: 'Touchstone Institute',
    type: 'Co-op',
    place: 'Toronto, ON · Hybrid',
    when: 'May 2026 to Aug 2026',
    icon: 'robot',
    color: '#c8146a',
    summary:
      'Developer working across data engineering and full-stack: building pipelines that integrate complex structured and unstructured datasets across business programs, and the web dashboards and reporting automation that make that data usable. Includes applied AI and LLM-powered workflows.',
    points: [],
  },
  {
    id: 'teaching-assistant',
    role: 'Teaching Assistant',
    org: 'Conestoga College, School of Applied Computer Science and Information Technology',
    type: 'Part-time',
    place: 'Waterloo, ON · Hybrid',
    when: 'Sep 2025 to Dec 2025',
    icon: 'cap',
    color: '#7a5af0',
    summary: 'Supported Computer Science students in strengthening their programming fundamentals in C and C++.',
    points: [
      'Guided students through pointers, memory management, control flow, data structures, and object-oriented programming.',
      'Shared debugging techniques and best practices for clean, efficient code.',
      'Fostered independent problem-solving and helped students prepare for assessments.',
    ],
  },
  {
    id: 'touchstone-2025',
    role: 'Summer Student, Software Development',
    org: 'Touchstone Institute',
    type: 'Co-op',
    place: 'Toronto, ON · Hybrid',
    when: 'May 2025 to Sep 2025',
    icon: 'database',
    color: '#0f8b8d',
    summary:
      'Full-stack developer contributing to platform development, automation, and data pipelines within an Agile software team.',
    points: [
      'Collaborated with a Senior Engineer to design and build interactive prototypes for the Touchstone Institute Dashboard, and enhanced General Portal platforms to improve performance and user experience.',
      'Built front-end and back-end features across web platforms using Node.js and Angular.',
      'Developed data pipelines and automated reporting and analytics workflows, and analysed business processes to identify improvements.',
      'Supported application portal launches with live debugging and error handling to keep systems reliable in production.',
    ],
  },
  {
    id: 'ukuk',
    role: 'Back-End Developer / Database Engineer',
    org: 'UKUK',
    type: 'Full-time',
    place: 'Bishkek, Kyrgyzstan',
    when: 'Nov 2022 to Dec 2023',
    icon: 'pin',
    color: '#d35400',
    summary:
      'Java back-end and database developer building government-used healthcare software, focused on database design, APIs, and business logic with AI/ML integration.',
    points: [
      'Built RESTful and SOAP APIs and an MVC-based inventory system.',
      'Designed and optimized databases handling large-scale records across hospital systems.',
      'Gathered requirements through use cases and user interviews with stakeholders across hospital systems to shape data models and features.',
      'Integrated AI/ML models into back-end services for intelligent decision-making.',
      'Automated report generation and mentored a team of interns.',
    ],
  },
];

export const education = {
  school: 'Conestoga College',
  degree: 'Bachelor of Computer Science (Honours)',
  minor: 'Minor in Big Data and Machine Learning',
  place: 'Waterloo, ON',
  when: 'Jan 2024 to Jul 2027 (expected)',
  gpa: 'Overall GPA 3.74 / 4.0 (85.32%)',
};

export const courseTerms: CourseTerm[] = [
  {
    term: 'Foundations',
    courses: [
      { code: 'PROG71985', title: 'Programming Principles', summary: 'Software design and implementation in C: algorithms, modular code, pointers, strings, data structures and file I/O.' },
      { code: 'MATH71010', title: 'Linear Algebra and Discrete Mathematics', summary: 'Linear equations, matrix algebra and determinants, linear transformations and spatial vectors.' },
      { code: 'CSCN71000', title: 'Software Engineering Fundamentals', summary: 'Requirements, specifications, implementation and testing against specs to produce low-defect software.' },
      { code: 'CSCN71010', title: 'Computer Systems Architecture Fundamentals', summary: 'Computer hardware and architecture, assembly language, I/O, and performance limits such as caches.' },
      { code: 'CSCN71020', title: 'Project I: Software Implementation and Unit Testing', summary: 'Writing unit tests, growing them into a larger test project, adding code and reporting results.' },
      { code: 'ENGL71200', title: 'Scientific and Technical Communications', summary: 'Concise technical writing, document formats and graphics, and technical presentations.' },
      { code: 'FREN71020', title: 'Introduction to French Language and Culture', summary: 'Beginner standard and Canadian French, and French culture around the world.' },
    ],
  },
  {
    term: 'Core computer science',
    courses: [
      { code: 'PROG71020', title: 'Object Oriented Programming', summary: 'Object-oriented design and iterative development of robust applications with modern frameworks.' },
      { code: 'PROG72370', title: 'Data Structures and Algorithms', summary: 'Advanced data structures, sorting and searching, and analyzing algorithm efficiency.' },
      { code: 'PROG71040', title: 'Operating Systems and Security Fundamentals', summary: 'Process scheduling, synchronization, deadlock avoidance, file system integrity and secure OS features.' },
      { code: 'CSCN72000', title: 'Introduction to Database Systems', summary: 'Relational databases, data modelling, SQL, and alternatives such as in-memory and NoSQL systems.' },
      { code: 'CSCN72020', title: 'Computer Networks', summary: 'Designing, implementing and troubleshooting TCP/IP networks, protocols and network security.' },
      { code: 'STAT72000', title: 'Probability and Statistics', summary: 'Probability and statistics applied to risk analysis and decisions across the software lifecycle.' },
      { code: 'CSCN72050', title: 'Mobile and Networked Systems', summary: 'Distributed, cloud and service-oriented architectures, and introductory mobile development.' },
      { code: 'SECU73000', title: 'Introduction to Software Security', summary: 'Common vulnerabilities and mitigations, malware detection, encryption and penetration testing.' },
    ],
  },
  {
    term: 'Software engineering and quality',
    courses: [
      { code: 'SENG71000', title: 'Systems Analysis and Design', summary: 'The SDLC and alternative methodologies, and UML for analysis and design.' },
      { code: 'CSCN72040', title: 'Software Design Techniques', summary: 'Design trade-offs, design patterns, and documenting designs with UML.' },
      { code: 'PROG71030', title: 'User Experience Design', summary: 'UX theory, usability and accessibility, and designing and evaluating user experiences.' },
      { code: 'CSCN72010', title: 'Software Quality I: Testing Tools and Methodologies', summary: 'Test types, risk assessment, complexity metrics, defect reporting and quality metrics.' },
      { code: 'CSCN72060', title: 'Software Quality II: User Experience Evaluation', summary: 'Test- and behaviour-driven design and usability testing from a user experience view.' },
      { code: 'CSCN73010', title: 'Software Quality III: Build and Release', summary: 'Managing build and release of large-scale software and release-readiness risk.' },
      { code: 'CSCN73040', title: 'Software Quality IV: Performance and Analysis', summary: 'Performance testing, code and algorithm optimization, instrumentation and performance metrics.' },
      { code: 'PROG73020', title: 'Enterprise Application Development', summary: 'Architecture frameworks for large enterprise systems, integration and performance analysis.' },
    ],
  },
  {
    term: 'Data and AI',
    courses: [
      { code: 'PROG73010', title: 'Introduction to Big Data', summary: 'Big data problems, programming models and tools, hands-on analysis and big data strategy.' },
      { code: 'PROG73040', title: 'Big Data Integration and Processing', summary: 'Integrating big data for analytics, designing analytics pipelines and building integrated databases.' },
      { code: 'PROG74000', title: 'Applications of Artificial Intelligence and Machine Learning (2027)', summary: 'Machine learning pipelines, traditional algorithms, neural networks, CNNs and U-Nets, and MLOps deployment.' },
      { code: 'PROG74030', title: 'Data Mining (2027)', summary: 'Finding patterns in large datasets with clustering, classification and pattern mining.' },
    ],
  },
  {
    term: 'Team projects, research and communication',
    courses: [
      { code: 'CSCN71030', title: 'Project II: Team Based Software Development', summary: 'Team-based testing and development, and reporting results to leaders and management.' },
      { code: 'CSCN72030', title: 'Project III: Software Development Life Cycle', summary: 'A team project across the full SDLC with project management practices.' },
      { code: 'COMP72070', title: 'Project IV: Mobile and Networked Environments', summary: 'An end-to-end team project for mobile and networked environments.' },
      { code: 'CSCN73030', title: 'Project V: Advanced Software Development', summary: 'Researching enterprise tools and documenting a prototype and its design process.' },
      { code: 'CSCN73060', title: 'Project VI: Software Efficiency and Performance', summary: "Improving a solution's efficiency and performance, with documented evaluation." },
      { code: 'RSCH73000', title: 'Understanding Research', summary: 'Quantitative, qualitative and mixed methods, research ethics, and an original research proposal.' },
      { code: 'ENGL73170', title: 'Advanced Technical Communication', summary: 'Collaborative technical writing and adapting content for different platforms.' },
      { code: 'SOC71500', title: 'Group Dynamics', summary: 'Group process theory and teamwork: leadership, problem solving and conflict management.' },
    ],
  },
];

export const skills: { group: string; items: string[] }[] = [
  { group: 'Languages', items: ['Python', 'Java', 'TypeScript', 'JavaScript', 'SQL', 'C', 'C++', 'C#'] },
  { group: 'AI and ML', items: ['MCP', 'LLM APIs', 'RAG', 'LangChain', 'LangGraph', 'PyTorch', 'scikit-learn', 'Computer vision', 'Edge inference'] },
  { group: 'Data engineering', items: ['dbt', 'Spark', 'Databricks', 'AWS Glue', 'Athena', 'Microsoft Fabric', 'Azure Data Factory', 'Power BI'] },
  { group: 'Backend and integration', items: ['Node.js', 'NestJS', 'FastAPI', 'Spring Boot', 'React', 'Angular', 'MuleSoft', 'DataWeave'] },
  { group: 'Databases', items: ['PostgreSQL', 'SQL Server', 'MongoDB', 'Redis', 'Vector search'] },
  { group: 'Cloud and DevOps', items: ['AWS (Bedrock, Lambda, S3)', 'Azure', 'Docker', 'Kubernetes', 'GitHub Actions', 'CI/CD'] },
];

export const interests = [
  'Lightweight machine learning for financial data, such as catching money laundering with fast tree models.',
  'Making AI assistants trustworthy on company data, so the numbers they give match the source.',
];

// Where the Contact planet's "Write to me" letter sends visitors (a mailto link).
export const contactEmail = 'dzhanybek.zakiriiaev@gmail.com';
