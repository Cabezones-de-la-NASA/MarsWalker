// Núcleo de A* sobre una malla de 8 vecinos con montículo binario (M4).
// Lo comparten la ruta por oxígeno (M4) y la ruta por salud (M14): solo cambia el coste.
import { createMinHeap } from './binary_heap.js';

// 8 vecinos: [dfila, dcolumna].
const NEIGHBORS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
];

/**
 * grid       { rows, cols, x_m, z_m } de buildSearchGrid
 * edgeCost   (from, to, distance_m) -> coste, o Infinity si el tramo está prohibido
 * heuristic  (node) -> estimación que nunca sobreestima lo que falta
 * bounds     opcional { rowMin, rowMax, colMin, colMax }: ventana de búsqueda
 * -> { found, nodes, cost }
 */
export function aStarSearch({ grid, start, goal, edgeCost, heuristic, bounds }) {
  const { rows, cols, x_m, z_m } = grid;
  const rowMin = bounds?.rowMin ?? 0;
  const rowMax = bounds?.rowMax ?? rows - 1;
  const colMin = bounds?.colMin ?? 0;
  const colMax = bounds?.colMax ?? cols - 1;

  const cost = new Float64Array(rows * cols).fill(Infinity);
  const parent = new Int32Array(rows * cols).fill(-1);
  const closed = new Uint8Array(rows * cols);
  const open = createMinHeap();
  cost[start] = 0;
  open.push(heuristic(start), start);

  let found = false;
  while (open.size > 0) {
    const node = open.pop().value;
    if (closed[node]) continue;
    closed[node] = 1;
    if (node === goal) {
      found = true;
      break;
    }
    const row = Math.floor(node / cols);
    const col = node % cols;
    for (const [dRow, dCol] of NEIGHBORS) {
      const nRow = row + dRow;
      const nCol = col + dCol;
      if (nRow < rowMin || nRow > rowMax || nCol < colMin || nCol > colMax) continue;
      const next = nRow * cols + nCol;
      if (closed[next]) continue;
      const distance_m = Math.hypot(x_m[nCol] - x_m[col], z_m[nRow] - z_m[row]);
      const candidate = cost[node] + edgeCost(node, next, distance_m);
      if (candidate < cost[next]) {
        cost[next] = candidate;
        parent[next] = node;
        open.push(candidate + heuristic(next), next);
      }
    }
  }
  if (!found) return { found: false, nodes: [], cost: Infinity };

  const nodes = [];
  for (let node = goal; node !== -1; node = parent[node]) nodes.push(node);
  nodes.reverse();
  return { found: true, nodes, cost: cost[goal] };
}
