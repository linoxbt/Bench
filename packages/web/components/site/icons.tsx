type P = { className?: string };
const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const Chevron = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M9 5l7 7-7 7" {...s} strokeWidth={2.2} />
  </svg>
);
export const ArrowUpRight = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M7 17L17 7M9 7h8v8" {...s} />
  </svg>
);
export const Close = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" {...s} />
  </svg>
);
export const Check = ({ className = "h-4 w-4" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" {...s} strokeWidth={2.2} />
  </svg>
);
/** Icon tiles: blue line art on a 24px grid. */
export const IconDoc = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="2" {...s} />
    <path d="M8.5 8h7M8.5 12h7M8.5 16h4" {...s} />
  </svg>
);
export const IconJury = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="6" cy="9" r="2.2" {...s} />
    <circle cx="12" cy="7" r="2.2" {...s} />
    <circle cx="18" cy="9" r="2.2" {...s} />
    <path d="M2.5 18c.6-2.6 2-4 3.5-4s2.9 1.4 3.5 4M8.5 16c.6-2.6 2-4 3.5-4s2.9 1.4 3.5 4M14.5 18c.6-2.6 2-4 3.5-4s2.9 1.4 3.5 4" {...s} />
  </svg>
);
export const IconBolt = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" {...s} />
  </svg>
);
export const IconScale = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M12 4v16M7 20h10M5 7h14M5 7l-2.5 6a2.5 2.5 0 005 0L5 7zm14 0l-2.5 6a2.5 2.5 0 005 0L19 7z" {...s} />
  </svg>
);
export const IconLock = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <rect x="5" y="10.5" width="14" height="10" rx="2" {...s} />
    <path d="M8 10.5V7.5a4 4 0 018 0v3" {...s} />
  </svg>
);
export const IconBot = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <rect x="4.5" y="7.5" width="15" height="11" rx="3" {...s} />
    <path d="M12 7.5V4.5M9 12.5h.01M15 12.5h.01M9.5 15.5h5" {...s} />
  </svg>
);
export const IconTarget = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="8" {...s} />
    <circle cx="12" cy="12" r="4" {...s} />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
);
export const IconPen = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M4 20l4-1 10.5-10.5a2.1 2.1 0 00-3-3L5 16l-1 4zM14 7l3 3" {...s} />
  </svg>
);
export const IconTerminal = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" {...s} />
    <path d="M7 10l3 2.5L7 15M12.5 15H17" {...s} />
  </svg>
);
export const IconGithub = ({ className = "h-5 w-5" }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
    <path d="M12 2a10 10 0 00-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 015 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0012 2z" />
  </svg>
);
