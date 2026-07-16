import { useState } from 'react';
import { cn } from '@/lib/utils';

interface FighterAvatarProps {
  name: string;
  espnId?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

// Deterministic color from name (so same fighter always gets same color)
function getColor(name: string): string {
  const colors = [
    'from-blue-600 to-blue-800',
    'from-purple-600 to-purple-800',
    'from-emerald-600 to-emerald-800',
    'from-orange-600 to-red-700',
    'from-cyan-600 to-teal-800',
    'from-pink-600 to-rose-800',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

const SIZE_CLASSES = {
  sm: 'w-14 h-14 text-sm',
  md: 'w-20 h-20 text-base',
  lg: 'w-24 h-24 sm:w-28 sm:h-28 text-lg',
};

export function FighterAvatar({ name, espnId, size = 'lg', className }: FighterAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImg = espnId && !imgError;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden shrink-0 border-2 border-white/10',
        sizeClass,
        className
      )}
    >
      {showImg ? (
        <img
          src={`https://a.espncdn.com/i/headshots/mma/players/full/${espnId}.png`}
          alt={name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-top"
          loading="lazy"
        />
      ) : (
        <div
          className={cn(
            'w-full h-full flex items-center justify-center font-black bg-gradient-to-br text-white',
            getColor(name)
          )}
        >
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}
