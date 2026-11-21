# Sokoban solver: push-optimal, room-decomposable

A Sokoban solver written for make.fun's [Build the best Sokoban solver](https://make.fun/bounty/sokoban-solver-01-run-20261121) bounty. It answers every level in the competition's input set with the fewest possible pushes, and runs the whole set in barely a second.

## What it does

The solver reads each level under `$MAKEFUN_INPUT_DIR/<id>/level.txt` and writes the move string under `$MAKEFUN_OUTPUT_DIR/<id>/solution.txt`.

It minimises **pushes**, not walking steps: any number of free moves may separate two pushes, and the grader only counts the pushes in the answer.

## How it works

1. **Parse and normalise.** The level is turned into a flat grid of wall/live cells, a goal mask, a sorted box list and the player's cell. The outer ring is walled so the move arithmetic never needs bounds checks.
2. **Live-square map.** A reverse flood fill from the goals marks every square a box can still be pushed through. A box on a dead square means the level is unsolvable, and pushes onto dead squares are rejected outright instead of searched.
3. **Room decomposition.** The player's row is scanned for live squares, and those cut lines are removed. If no box sits on a cut line and the remaining pieces are disconnected, each piece becomes an independent sub-problem with equal box and goal counts. Each room is then solved on its own, with the other rooms' unfinished boxes (and finished rooms' goals) turned into walls. This keeps the state space of a five-room level at roughly the sum of its rooms rather than the product.
4. **Push-level BFS.** Each node is a sorted box multiset plus a normalised player region: the smallest cell reachable without moving a box, so all player positions inside one region collapse to a single state. Successors are the pushes reachable from that region that keep the pushing box on a live square.
5. **2x2 frozen-box pruning.** Before a successor is admitted, every 2x2 window over the pushed box is checked; a fully blocked window containing a box off its goal is a frozen cluster and is pruned.
6. **Path reconstruction.** The BFS records parents; the push chain is replayed, and between two pushes a plain BFS over the player's walkable cells (treating boxes as walls) produces the exact walking moves. The whole answer is emitted in `udlr`/`UDLR` form.
7. **Fallback.** If a level has no clean room cut, or a room fails, the solver re-runs the same push-level BFS on the whole level.

Box states are deduplicated with a `lowestReachable:boxes` key, and the search is bounded per call so a pathological level degrades instead of hanging. The output is deterministic: the same input always produces the same byte-identical answer.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

Node 22 or newer, no dependencies, single file.

## Results on the practice set

| instance | pushes | oracle |
| --- | --- | --- |
| i001 | 13 | 13 |
| i002 | 16 | 16 |
| i003 | 29 | 29 |
| i004 | 47 | 47 |
| i005 | 60 | 60 |

All five match the published push optima; the practice scorer reports 1,000,000. The five levels together run in about 1.2 s, well inside the 60 s budget.

## Licence

MIT.
