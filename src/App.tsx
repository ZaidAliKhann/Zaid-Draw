import { useEffect, useState } from 'react';
import { Box, ExternalLink, PenTool } from 'lucide-react';
import { AirWriterPage } from './components/AirWriterPage';
import { ShapeStudioPage } from './components/ShapeStudioPage';

type StudioRoute = 'writing' | '3d-shapes';

function readInitialRoute(): StudioRoute {
  if (typeof window !== 'undefined' && window.location.hash === '#3d-shapes') {
    return '3d-shapes';
  }
  return 'writing';
}

export default function App() {
  const [activeRoute, setActiveRoute] = useState<StudioRoute>(readInitialRoute);
  const [mirrored, setMirrored] = useState<boolean>(true);

  useEffect(() => {
    const syncFromHash = () => {
      setActiveRoute(
        window.location.hash === '#3d-shapes' ? '3d-shapes' : 'writing'
      );
    };
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const navigateTo = (route: StudioRoute) => {
    setActiveRoute(route);
    const targetHash = route === '3d-shapes' ? '#3d-shapes' : '#writing';
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#050506] text-zinc-100 flex flex-col md:flex-row">
      {/* Left Interface Navigation Column */}
      <nav
        aria-label="Studio pages"
        className="shrink-0 bg-[#0B0C0E] border-b md:border-b-0 md:border-r border-[#22252D] px-3 py-2 md:py-3 md:px-2 flex md:flex-col items-center justify-between md:justify-start gap-2 md:w-[96px]"
      >
        <div className="flex md:flex-col items-center gap-1.5 w-full">
          <button
            type="button"
            onClick={() => navigateTo('writing')}
            aria-current={activeRoute === 'writing' ? 'page' : undefined}
            className={`flex-1 md:flex-none md:w-full flex md:flex-col items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-none text-xs font-medium transition-colors whitespace-nowrap border ${
              activeRoute === 'writing'
                ? 'bg-[#16181D] text-white border-[#3F4452]'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#111317] border-transparent'
            }`}
          >
            <PenTool className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Air Writer</span>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('3d-shapes')}
            aria-current={activeRoute === '3d-shapes' ? 'page' : undefined}
            className={`flex-1 md:flex-none md:w-full flex md:flex-col items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-none text-xs font-medium transition-colors whitespace-nowrap border ${
              activeRoute === '3d-shapes'
                ? 'bg-[#16181D] text-white border-[#3F4452]'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#111317] border-transparent'
            }`}
          >
            <Box className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>3D Shapes</span>
          </button>
        </div>

        <a
          href={activeRoute === '3d-shapes' ? '#writing' : '#3d-shapes'}
          target="_blank"
          rel="noopener noreferrer"
          title={
            activeRoute === '3d-shapes'
              ? 'Open Air Writer in a new browser tab'
              : 'Open 3D Shapes Studio in a new browser tab'
          }
          className="hidden md:flex flex-col items-center justify-center gap-1 w-full mt-auto pt-3 border-t border-[#22252D] text-[11px] text-zinc-400 hover:text-white transition-colors text-center"
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New Tab</span>
        </a>
      </nav>

      {/* Active Full-Screen Studio Interface */}
      {activeRoute === 'writing' ? (
        <AirWriterPage
          mirrored={mirrored}
          onToggleMirror={() => setMirrored((m) => !m)}
        />
      ) : (
        <ShapeStudioPage
          mirrored={mirrored}
          onToggleMirror={() => setMirrored((m) => !m)}
        />
      )}
    </div>
  );
}
