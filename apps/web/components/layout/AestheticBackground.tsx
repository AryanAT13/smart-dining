/**
 * AestheticBackground — pure-CSS animated ambience.
 *
 * Three soft, blurred orbs that drift on long-period keyframes. The body's
 * fixed radial gradients (see globals.css) handle the base wash; the orbs
 * add gentle motion so the surface never feels static. Zero JS overhead
 * once mounted — animations run on the compositor.
 *
 * `pointer-events: none` on every element keeps clicks falling through to
 * the actual page content.
 */

export function AestheticBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Saffron — top-left */}
      <span className="animate-orb-a absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-[hsl(40,88%,82%)] opacity-50 mix-blend-multiply blur-3xl" />
      {/* Terracotta — top-right */}
      <span className="animate-orb-b absolute -right-24 top-24 h-[24rem] w-[24rem] rounded-full bg-[hsl(14,70%,82%)] opacity-45 mix-blend-multiply blur-3xl" />
      {/* Cream highlight — bottom-center */}
      <span className="animate-orb-c absolute bottom-[-10rem] left-[20%] h-[32rem] w-[32rem] rounded-full bg-[hsl(38,42%,90%)] opacity-60 mix-blend-multiply blur-3xl" />

      {/* Subtle grain — gives the cream paper a touch of texture. */}
      <span
        className="absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />
    </div>
  );
}
