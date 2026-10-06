/** The app's mark: a small chamber of seats in gold, not the Riksdag's official emblem. */
export function Emblem({ size = 28 }: { size?: number }) {
  const dots: { x: number; y: number; r: number }[] = [];
  [9, 13, 17].forEach((radius, row) => {
    const n = 5 + row * 2;
    for (let j = 0; j < n; j++) {
      const a = Math.PI * (1 - (j + 0.5) / n);
      dots.push({ x: 20 + radius * Math.cos(a), y: 22 - radius * Math.sin(a), r: 1.5 });
    }
  });
  return (
    <svg width={size} height={size} viewBox="0 0 40 28" aria-hidden>
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#d4b35f" />
      ))}
      <rect x={15} y={21} width={10} height={4} rx={1} fill="#d4b35f" />
    </svg>
  );
}
