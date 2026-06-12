/**
 * Create a rounded rectangle mask.
 * @returns Buffer containing the SVG mask.
 */
export const createRoundedRectangle = (
  width: number,
  height: number,
  radius: number,
): Buffer => {
  const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <rect x="0" y="0"
          width="${width}" height="${height}"
          rx="${radius}" ry="${radius}"
          fill="white"
        />
      </svg>
    `;

  return Buffer.from(svg);
};

/**
 * Create a squircle mask.
 * @returns Buffer containing the SVG mask.
 */
export const createSquircle = (width: number, height: number): Buffer => {
  const STEPS = 360;
  const EXPONENT = 3.7; // higher = more square-like

  const points: string[] = [];
  const a = width / 2;
  const b = height / 2;

  for (let index = 0; index <= STEPS; index++) {
    const angle = (index / STEPS) * 2 * Math.PI;
    const cosT = Math.cos(angle);
    const sinT = Math.sin(angle);
    const x = a * Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / EXPONENT);
    const y = b * Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / EXPONENT);

    const command = index === 0 ? "M" : "L";
    points.push(`${command} ${a + x},${b + y}`);
  }

  const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <path d="${points.join(" ")} Z" fill="white"/>
      </svg>
    `;

  return Buffer.from(svg);
};
