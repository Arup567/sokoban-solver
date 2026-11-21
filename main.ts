import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const input = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

type Level = { w: number; h: number; wall: Uint8Array; goals: number[]; boxes: number[]; player: number };

function parse(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length);
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length, n = w * h;
  const wall = new Uint8Array(n).fill(1), goals: number[] = [], boxes: number[] = [];
  let player = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const c = rows[y][x], p = y * w + x;
    if (c === '#') continue;
    wall[p] = 0;
    if (c === '.' || c === '*' || c === '+') goals.push(p);
    if (c === '$' || c === '*') boxes.push(p);
    if (c === '@' || c === '+') player = p;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!x || !y || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
  boxes.sort((a, b) => a - b);
  return { w, h, wall, goals, boxes, player };
}

function liveMap(level: Level): Uint8Array {
  const { w, wall, goals } = level, live = new Uint8Array(wall.length), q = [...goals];
  for (const g of goals) live[g] = 1;
  for (let i = 0; i < q.length; i++) for (const d of [-w, w, -1, 1]) {
    const b = q[i] - d;
    if (!wall[b] && !wall[b - d] && !live[b]) { live[b] = 1; q.push(b); }
  }
  return live;
}

function regions(level: Level): { boxes: number[]; goals: number[] }[] | null {
  const { w, wall, goals, boxes, player } = level, live = liveMap(level), row = Math.floor(player / w);
  const cut = new Uint8Array(wall.length), part = new Int32Array(wall.length).fill(-1), rooms: { boxes: number[]; goals: number[] }[] = [];
  for (let p = row * w; p < (row + 1) * w; p++) if (!wall[p] && !live[p]) cut[p] = 1;
  if (boxes.some((b) => cut[b])) return null;
  for (let p = 0; p < wall.length; p++) if (!wall[p] && !cut[p] && part[p] < 0) {
    const id = rooms.length, q = [p]; part[p] = id;
    for (let i = 0; i < q.length; i++) for (const d of [-w, w, -1, 1]) {
      const t = q[i] + d;
      if (!wall[t] && !cut[t] && part[t] < 0) { part[t] = id; q.push(t); }
    }
    rooms.push({ boxes: [], goals: [] });
  }
  for (const b of boxes) rooms[part[b]].boxes.push(b);
  for (const g of goals) if (part[g] >= 0) rooms[part[g]].goals.push(g);
  if (goals.some((g) => part[g] < 0) || rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length);
}

function search(level: Level, cap = 250000): string | null {
  const { w, wall, goals, boxes: initial, player } = level, n = wall.length;
  const goal = new Uint8Array(n), live = liveMap(level), occ = new Uint8Array(n);
  const seen = new Int32Array(n), mark = new Int32Array(n), todo = new Int32Array(n);
  for (const g of goals) goal[g] = 1;
  if (initial.some((b) => !live[b])) return null;
  let stamp = 0;
  const reach = (from: number, marks: Int32Array) => {
    const id = ++stamp; let a = 0, z = 0, low = from;
    todo[z++] = from; marks[from] = id;
    while (a < z) {
      const p = todo[a++]; if (p < low) low = p;
      for (const d of [-w, w, -1, 1]) { const t = p + d; if (!wall[t] && !occ[t] && marks[t] !== id) { marks[t] = id; todo[z++] = t; } }
    }
    return [id, low] as const;
  };
  const frozen = (t: number) => {
    for (const a of [t, t - 1, t - w, t - w - 1]) {
      const b = a + 1, c = a + w, d = c + 1;
      if ((wall[a] || occ[a]) && (wall[b] || occ[b]) && (wall[c] || occ[c]) && (wall[d] || occ[d]) &&
          ((occ[a] && !goal[a]) || (occ[b] && !goal[b]) || (occ[c] && !goal[c]) || (occ[d] && !goal[d]))) return true;
    }
    return false;
  };
  const key = (bs: number[], low: number) => low + ':' + bs.join(',');
  const stateBoxes: number[][] = [initial], statePlayer = [player], parent = [-1], fromBox = [-1], toBox = [-1];
  for (const b of initial) occ[b] = 1;
  const [, low0] = reach(player, seen);
  const index = new Map<string, number>([[key(initial, low0), 0]]);
  for (const b of initial) occ[b] = 0;
  let found = initial.every((b) => goal[b]) ? 0 : -1;
  for (let head = 0; found < 0 && head < stateBoxes.length; head++) {
    const bs = stateBoxes[head];
    for (const b of bs) occ[b] = 1;
    const [rid] = reach(statePlayer[head], seen);
    for (const b of bs) {
      for (const d of [-w, w, -1, 1]) {
        const from = b - d, to = b + d;
        if (seen[from] !== rid || wall[to] || occ[to] || !live[to]) continue;
        occ[b] = 0; occ[to] = 1;
        const dead = frozen(to);
        let next: number[] | null = null, k = '';
        if (!dead) {
          next = bs.slice(); next[next.indexOf(b)] = to; next.sort((a, z) => a - z);
          const [, lo] = reach(b, mark); k = key(next, lo);
        }
        occ[to] = 0; occ[b] = 1;
        if (dead || index.has(k)) continue;
        if (stateBoxes.length >= cap) { for (const x of bs) occ[x] = 0; return null; }
        const s = stateBoxes.length;
        index.set(k, s); stateBoxes.push(next!); statePlayer.push(b); parent.push(head); fromBox.push(b); toBox.push(to);
        if (next!.every((x) => goal[x])) { found = s; break; }
      }
      if (found >= 0) break;
    }
    for (const b of bs) occ[b] = 0;
  }
  if (found < 0) return null;
  const path: number[] = [];
  for (let s = found; s; s = parent[s]) path.push(s);
  path.reverse();
  const letters: Record<number, string> = { [-w]: 'u', [w]: 'd', [-1]: 'l', [1]: 'r' };
  const walk = (from: number, to: number, bs: number[]): string | null => {
    if (from === to) return '';
    for (const b of bs) occ[b] = 1;
    const prev = new Int32Array(n).fill(-1), how = new Int32Array(n), q = [from];
    prev[from] = from;
    for (let i = 0; i < q.length && prev[to] < 0; i++) for (const d of [-w, w, -1, 1]) {
      const t = q[i] + d;
      if (!wall[t] && !occ[t] && prev[t] < 0) { prev[t] = q[i]; how[t] = d; q.push(t); }
    }
    for (const b of bs) occ[b] = 0;
    if (prev[to] < 0) return null;
    let out = '';
    for (let p = to; p !== from; p = prev[p]) out = letters[how[p]] + out;
    return out;
  };
  let out = '', at = player, bs = initial;
  for (const s of path) {
    const b = fromBox[s], t = toBox[s], d = t - b;
    const step = walk(at, b - d, bs);
    if (step === null) return null;
    out += step + letters[d].toUpperCase();
    at = b;
    bs = stateBoxes[s];
  }
  return out;
}

function solve(text: string): string {
  const level = parse(text), rooms = regions(level);
  if (rooms && rooms.length) {
    let player = level.player, result = '';
    const done: boolean[] = rooms.map(() => false);
    let ok = true;
    for (const room of rooms) {
      const wall = level.wall.slice();
      rooms.forEach((other, j) => {
        if (other === room) return;
        for (const b of done[j] ? other.goals : other.boxes) wall[b] = 1;
      });
      const sub: Level = {
        ...level, wall,
        boxes: room.boxes.slice().sort((a, b) => a - b),
        goals: room.goals.slice().sort((a, b) => a - b),
        player,
      };
      const moves = search(sub);
      if (moves === null) { ok = false; break; }
      result += moves;
      for (const c of moves.toLowerCase()) player += c === 'u' ? -level.w : c === 'd' ? level.w : c === 'l' ? -1 : 1;
      done[rooms.indexOf(room)] = true;
    }
    if (ok) return result;
  }
  return search(level) ?? '';
}

for (const id of readdirSync(input).sort()) {
  const moves = solve(readFileSync(join(input, id, 'level.txt'), 'utf8'));
  mkdirSync(join(output, id), { recursive: true });
  writeFileSync(join(output, id, 'solution.txt'), `${moves}\n`);
}
