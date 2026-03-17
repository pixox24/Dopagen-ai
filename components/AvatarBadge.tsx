import React, { useEffect, useMemo, useState } from 'react';

interface AvatarBadgeProps {
  name?: string;
  seed?: string;
  src?: string | null;
  className?: string;
  textClassName?: string;
  alt?: string;
  loading?: 'eager' | 'lazy';
}

const AVATAR_PALETTES = [
  ['#0f172a', '#2563eb'],
  ['#1f2937', '#10b981'],
  ['#3f1d2e', '#f97316'],
  ['#172554', '#38bdf8'],
  ['#111827', '#a855f7'],
  ['#3f3f46', '#f43f5e'],
  ['#052e16', '#22c55e'],
  ['#27272a', '#f59e0b'],
];

const hashValue = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
};

const getInitials = (name?: string, seed?: string) => {
  const source = (name || seed || 'DG').trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
};

const getGradientStyle = (seed?: string) => {
  const palette = AVATAR_PALETTES[hashValue(seed || 'DG') % AVATAR_PALETTES.length];

  return {
    backgroundImage: `radial-gradient(circle at 25% 20%, rgba(255,255,255,0.2), transparent 35%), linear-gradient(135deg, ${palette[0]}, ${palette[1]})`,
  };
};

const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  name,
  seed,
  src,
  className = '',
  textClassName = '',
  alt,
  loading = 'lazy',
}) => {
  const [hasImageError, setHasImageError] = useState(false);
  const initials = useMemo(() => getInitials(name, seed), [name, seed]);
  const style = useMemo(() => getGradientStyle(seed || name), [name, seed]);
  const imageAlt = alt || name || 'Avatar';

  useEffect(() => {
    setHasImageError(false);
  }, [src]);

  return (
    <div
      className={`inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full ${className}`}
      style={src && !hasImageError ? undefined : style}
      role="img"
      aria-label={imageAlt}
    >
      {src && !hasImageError ? (
        <img
          src={src}
          alt={imageAlt}
          loading={loading}
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <span className={`font-semibold uppercase tracking-[0.08em] text-white ${textClassName}`}>
          {initials}
        </span>
      )}
    </div>
  );
};

export default AvatarBadge;
