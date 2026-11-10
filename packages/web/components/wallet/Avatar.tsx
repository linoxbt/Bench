/** Deterministic gradient avatar from an address (no network, no third-party service). */
export function Avatar({ address, size = 24 }: { address: string; size?: number }) {
  const h = parseInt(address.slice(2, 8), 16);
  const a = h % 360;
  const b = (a + 40 + ((h >> 8) % 80)) % 360;
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(from ${h % 180}deg, hsl(${a} 85% 55%), hsl(${b} 85% 60%), hsl(${a} 85% 55%))` }}
    />
  );
}
