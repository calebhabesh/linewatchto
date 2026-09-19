const SDF_RADIUS_PX = 8;
const SDF_CUTOFF = 0.25;
const INF = 1e20;

export type MapSdfImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

const alphaDistance = new Float64Array(256);
for (let alpha = 0; alpha < 256; alpha += 1) {
  const distance = 0.5 - Math.pow(alpha / 255, 1 / 2.2);
  alphaDistance[alpha] = distance * Math.abs(distance);
}
alphaDistance[255] = -INF;

function edt1d(
  grid: Float64Array,
  offset: number,
  stride: number,
  length: number,
  f: Float64Array,
  v: Uint16Array,
  z: Float64Array,
) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];

  for (let q = 1, k = 0; q < length; q += 1) {
    f[q] = grid[offset + q * stride];
    const qSquared = q * q;
    let intersection = 0;
    do {
      const r = v[k];
      intersection = (f[q] - f[r] + qSquared - r * r) / (q - r) / 2;
    } while (intersection <= z[k] && --k > -1);

    k += 1;
    v[k] = q;
    z[k] = intersection;
    z[k + 1] = INF;
  }

  for (let q = 0, k = 0; q < length; q += 1) {
    while (z[k + 1] < q) k += 1;
    const delta = q - v[k];
    grid[offset + q * stride] = f[v[k]] + delta * delta;
  }
}

function edt(grid: Float64Array, width: number, height: number) {
  const maxLength = Math.max(width, height);
  const f = new Float64Array(maxLength);
  const v = new Uint16Array(maxLength);
  const z = new Float64Array(maxLength + 1);

  for (let x = 0; x < width; x += 1) {
    edt1d(grid, x, width, height, f, v, z);
  }
  for (let y = 0; y < height; y += 1) {
    edt1d(grid, y * width, 1, width, f, v, z);
  }
}

/** Converts an antialiased alpha mask into the SDF texture MapLibre expects. */
export function createSdfImageData(image: ImageData): MapSdfImageData {
  const { width, height } = image;
  const pixelCount = width * height;
  const outer = new Float64Array(pixelCount);
  const inner = new Float64Array(pixelCount);
  outer.fill(INF);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const alpha = image.data[pixel * 4 + 3];
    if (alpha === 0) continue;
    const distance = alphaDistance[alpha];
    outer[pixel] = Math.max(0, distance);
    inner[pixel] = Math.max(0, -distance);
  }

  edt(outer, width, height);
  edt(inner, width, height);

  const data = new Uint8ClampedArray(pixelCount * 4);
  const scale = 255 / SDF_RADIUS_PX;
  const base = 255 * (1 - SDF_CUTOFF);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const distance = Math.sqrt(outer[pixel]) - Math.sqrt(inner[pixel]);
    const offset = pixel * 4;
    data[offset] = 255;
    data[offset + 1] = 255;
    data[offset + 2] = 255;
    data[offset + 3] = Math.round(base - scale * distance);
  }

  return { width, height, data };
}
