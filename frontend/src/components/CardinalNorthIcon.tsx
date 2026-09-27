/** Authored cardinal-north.svg geometry with an explicit theme fill.
 * Avoid CSS filters on an external SVG image inside the transformed map.
 */
export function CardinalNorthIcon({ width, height, dark }: { width: number; height: number; dark: boolean }) {
  return (
    <svg width={width} height={height} viewBox="0 0 41.804165 80.962502" className="opacity-90" aria-hidden="true" fill={dark ? "#ffffff" : "#000000"}>
      <g transform="translate(-119.59172,-72.495823)">
        <g transform="matrix(0.26458333,0,0,0.26458333,-1917.9645,-518.05417)" fillRule="evenodd">
          <polygon fillRule="nonzero" points="7763,2443 7763,2501 7745,2501 7745,2416 7764,2416 7798,2475 7798,2416 7815,2416 7815,2501 7797,2501" />
          <path d="m 7780,2380 c 44,0 79,35 79,79 0,43 -35,79 -79,79 -43,0 -79,-36 -79,-79 0,-44 36,-79 79,-79 z m 0,8 c 40,0 71,31 71,71 0,39 -31,71 -71,71 -39,0 -71,-32 -71,-71 0,-40 32,-71 71,-71 z" />
          <path d="m 7780,2246 -64,95 h 129 z m 0,-14 79,117 h -158 z" />
        </g>
      </g>
    </svg>
  );
}
