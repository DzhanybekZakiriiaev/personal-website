import { useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { sections } from './content';
import { useHashRoute } from './lib/route';
import { SvgDefs } from './components/SvgDefs';
import { Bokeh } from './components/Bokeh';
import { PodMenu } from './components/PodMenu';
import { SectionPage } from './components/SectionPage';

const START_INDEX = 1; // the middle planet (Projects) starts selected

export default function App() {
  const route = useHashRoute();
  const [selected, setSelected] = useState(() => {
    const index = sections.findIndex((s) => s.id === route);
    return index >= 0 ? index : START_INDEX;
  });

  // Remember whether we came back from a section, so focus returns to its planet.
  const previousRoute = useRef(route);
  const cameBack = previousRoute.current !== 'pod' && route === 'pod';

  useEffect(() => {
    if (route !== 'pod') {
      const index = sections.findIndex((s) => s.id === route);
      if (index >= 0) setSelected(index);
    }
    previousRoute.current = route;
  }, [route]);

  return (
    <MotionConfig reducedMotion="user">
      <SvgDefs />
      <Bokeh />
      {route === 'pod' ? (
        <PodMenu selected={selected} onSelect={setSelected} restoreFocus={cameBack} />
      ) : (
        <SectionPage key={route} id={route} />
      )}
    </MotionConfig>
  );
}
