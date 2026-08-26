// Logo de Datibot (Editorial · Papel + Neón): baldosa tinta plana con un "spark"
// (chispa de IA) en neón lima. Sin degradados. Escala bien en cualquier tamaño.
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <rect x="2" y="2" width="36" height="36" rx="10" fill="#111111" />
      {/* chispa grande (neón) */}
      <path
        d="M20 8 C20 16, 24 20, 32 20 C24 20, 20 24, 20 32 C20 24, 16 20, 8 20 C16 20, 20 16, 20 8 Z"
        fill="#D7FF3A"
      />
      {/* chispa pequeña (neón, tenue) */}
      <path
        d="M28.5 8 C28.5 10.6, 29.4 11.5, 32 11.5 C29.4 11.5, 28.5 12.4, 28.5 15 C28.5 12.4, 27.6 11.5, 25 11.5 C27.6 11.5, 28.5 10.6, 28.5 8 Z"
        fill="#D7FF3A"
        opacity="0.7"
      />
    </svg>
  );
}
