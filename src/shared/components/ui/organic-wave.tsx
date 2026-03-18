'use client';

import { cn } from '@/shared/lib/utils';

interface OrganicWaveProps {
  className?: string;
}

export function OrganicWave({ className }: OrganicWaveProps) {
  // Pre-defined particle positions to avoid SSR hydration mismatch
  const particles = [
    { left: 5, top: 45, size: 4, delay: 0, duration: 5 },
    { left: 11, top: 52, size: 5, delay: 0.5, duration: 6 },
    { left: 17, top: 48, size: 3, delay: 1, duration: 4.5 },
    { left: 23, top: 55, size: 6, delay: 1.5, duration: 5.5 },
    { left: 29, top: 42, size: 4, delay: 2, duration: 6.5 },
    { left: 35, top: 50, size: 5, delay: 2.5, duration: 5 },
    { left: 41, top: 47, size: 3, delay: 3, duration: 4 },
    { left: 47, top: 53, size: 4, delay: 3.5, duration: 5.5 },
    { left: 53, top: 44, size: 5, delay: 4, duration: 6 },
    { left: 59, top: 51, size: 4, delay: 4.5, duration: 5 },
  ];

  return (
    <div className={cn('absolute inset-0 overflow-hidden pointer-events-none', className)}>
      {/* Large central glow - positioned more to the left */}
      <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-violet-500/8 rounded-full blur-[120px]" />

      {/* Wave SVG - spans full width with fade to right */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1440 600"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Primary wave gradient - bright on left, fades to transparent on right */}
          <linearGradient id="wave-gradient-primary" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139, 92, 246, 0.5)" />
            <stop offset="20%" stopColor="rgba(167, 139, 250, 0.6)" />
            <stop offset="40%" stopColor="rgba(196, 181, 253, 0.4)" />
            <stop offset="60%" stopColor="rgba(167, 139, 250, 0.2)" />
            <stop offset="80%" stopColor="rgba(139, 92, 246, 0.05)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
          </linearGradient>

          {/* Secondary wave gradient */}
          <linearGradient id="wave-gradient-secondary" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(167, 139, 250, 0.35)" />
            <stop offset="25%" stopColor="rgba(196, 181, 253, 0.35)" />
            <stop offset="50%" stopColor="rgba(167, 139, 250, 0.2)" />
            <stop offset="70%" stopColor="rgba(139, 92, 246, 0.08)" />
            <stop offset="100%" stopColor="rgba(139, 92, 246, 0)" />
          </linearGradient>

          {/* Tertiary wave gradient */}
          <linearGradient id="wave-gradient-tertiary" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(196, 181, 253, 0.25)" />
            <stop offset="30%" stopColor="rgba(217, 210, 253, 0.2)" />
            <stop offset="55%" stopColor="rgba(196, 181, 253, 0.1)" />
            <stop offset="80%" stopColor="rgba(167, 139, 250, 0.02)" />
            <stop offset="100%" stopColor="rgba(167, 139, 250, 0)" />
          </linearGradient>

          {/* Glow filter */}
          <filter id="wave-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Wave 1 - Main flowing wave */}
        <path
          fill="none"
          stroke="url(#wave-gradient-primary)"
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#wave-glow)"
        >
          <animate
            attributeName="d"
            dur="8s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1"
            values="
              M0,300 Q180,200 360,300 T720,300 T1080,300 T1440,300;
              M0,300 Q180,380 360,300 T720,260 T1080,340 T1440,300;
              M0,300 Q180,220 360,340 T720,300 T1080,260 T1440,300;
              M0,300 Q180,360 360,280 T720,340 T1080,300 T1440,300;
              M0,300 Q180,200 360,300 T720,300 T1080,300 T1440,300
            "
          />
        </path>

        {/* Wave 2 - Secondary wave with offset */}
        <path
          fill="none"
          stroke="url(#wave-gradient-secondary)"
          strokeWidth="2"
          strokeLinecap="round"
          filter="url(#wave-glow)"
        >
          <animate
            attributeName="d"
            dur="10s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1"
            values="
              M0,300 Q180,380 360,300 T720,280 T1080,320 T1440,300;
              M0,300 Q180,240 360,320 T720,300 T1080,280 T1440,300;
              M0,300 Q180,340 360,260 T720,320 T1080,300 T1440,300;
              M0,300 Q180,280 360,340 T720,260 T1080,340 T1440,300;
              M0,300 Q180,380 360,300 T720,280 T1080,320 T1440,300
            "
          />
        </path>

        {/* Wave 3 - Tertiary subtle wave */}
        <path
          fill="none"
          stroke="url(#wave-gradient-tertiary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          filter="url(#wave-glow)"
        >
          <animate
            attributeName="d"
            dur="6s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1"
            values="
              M0,300 Q180,260 360,340 T720,300 T1080,260 T1440,300;
              M0,300 Q180,340 360,260 T720,340 T1080,300 T1440,300;
              M0,300 Q180,300 360,300 T720,260 T1080,340 T1440,300;
              M0,300 Q180,280 360,320 T720,280 T1080,320 T1440,300;
              M0,300 Q180,260 360,340 T720,300 T1080,260 T1440,300
            "
          />
        </path>

        {/* Wave 4 - Mirrored below center */}
        <path
          fill="none"
          stroke="url(#wave-gradient-secondary)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
        >
          <animate
            attributeName="d"
            dur="12s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1"
            values="
              M0,320 Q180,380 360,320 T720,340 T1080,320 T1440,320;
              M0,320 Q180,280 360,340 T720,320 T1080,360 T1440,320;
              M0,320 Q180,360 360,300 T720,360 T1080,300 T1440,320;
              M0,320 Q180,300 360,360 T720,300 T1080,340 T1440,320;
              M0,320 Q180,380 360,320 T720,340 T1080,320 T1440,320
            "
          />
        </path>
      </svg>

      {/* Floating particles - only on left side */}
      <div className="absolute inset-0">
        {particles.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${p.size}px`,
              height: `${p.size}px`,
              left: `${p.left}%`,
              top: `${p.top}%`,
              background: `radial-gradient(circle, rgba(196, 181, 253, 0.5) 0%, transparent 70%)`,
              animation: `float-particle ${p.duration}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Inline style for animation keyframes */}
      <style>{`
        @keyframes float-particle {
          0%, 100% {
            transform: translateY(0) translateX(0);
            opacity: 0.3;
          }
          25% {
            transform: translateY(-40px) translateX(15px);
            opacity: 0.7;
          }
          50% {
            transform: translateY(-20px) translateX(-10px);
            opacity: 0.5;
          }
          75% {
            transform: translateY(-50px) translateX(20px);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
