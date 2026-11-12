import { useEffect, useState } from 'react';
import type { SectionId } from '../content';

export type Route = 'pod' | SectionId;

const SECTION_IDS: readonly SectionId[] = ['experience', 'projects', 'about', 'contact'];

function parse(hash: string): Route {
  const id = hash.replace(/^#\/?/, '');
  return (SECTION_IDS as readonly string[]).includes(id) ? (id as SectionId) : 'pod';
}

export function hrefFor(route: Route): string {
  return route === 'pod' ? '#/' : `#/${route}`;
}

export function go(route: Route): void {
  window.location.hash = hrefFor(route);
}

// Hash routing keeps every section linkable and makes the browser Back button work,
// with no server configuration (useful on GitHub Pages).
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
