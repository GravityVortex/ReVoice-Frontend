'use client';

// The app currently ships a dark-only palette (see `src/config/style/theme.css`).
// Theme switching causes inconsistent styling in production, so we keep the UI
// stable by disabling the toggler until a real light theme exists.
export function ThemeToggler({
  type = 'icon',
  className,
}: {
  type?: 'icon' | 'button' | 'toggle';
  className?: string;
}) {
  return null;
}
