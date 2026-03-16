import React, { Suspense, useEffect, useRef, useState } from 'react';
import Generate from './Generate';

const ExploreFeed = React.lazy(() => import('../components/ExploreFeed'));

const ExploreSectionSkeleton: React.FC = () => (
  <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
    {Array.from({ length: 10 }).map((_, index) => (
      <div
        key={index}
        className="break-inside-avoid rounded-2xl border border-carbon-border bg-carbon-card/70 overflow-hidden"
      >
        <div className={`w-full animate-pulse bg-gradient-to-br from-white/10 via-white/5 to-transparent ${index % 3 === 0 ? 'h-72' : index % 2 === 0 ? 'h-56' : 'h-80'}`} />
      </div>
    ))}
  </div>
);

const Home: React.FC = () => {
  const [shouldLoadExplore, setShouldLoadExplore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || shouldLoadExplore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldLoadExplore(true);
          observer.disconnect();
        }
      },
      { rootMargin: '480px 0px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [shouldLoadExplore]);

  return (
    <div className="space-y-16">
      <Generate />

      <section className="relative overflow-hidden rounded-[28px] border border-carbon-border bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_35%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] px-4 py-8 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />

        <div className="relative mb-8 flex flex-col gap-4 border-b border-white/8 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.32em] text-carbon-muted">
              Home Feed
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Create first, then fall straight into the live gallery.
            </h2>
          </div>

          <p className="max-w-xl text-sm leading-6 text-carbon-muted">
            The homepage keeps the generator as the hero and streams community work underneath it. The gallery bundle stays code-split and only mounts when you approach this section.
          </p>
        </div>

        <div ref={sentinelRef} className="relative min-h-[320px]">
          {shouldLoadExplore ? (
            <Suspense fallback={<ExploreSectionSkeleton />}>
              <ExploreFeed
                showHeader={false}
                className="relative"
              />
            </Suspense>
          ) : (
            <ExploreSectionSkeleton />
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;
