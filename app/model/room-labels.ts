import * as T from 'three';
import type { Facility, Room, Vec2 } from './schema';
import type { ViewerState } from './renderer';

export function roomLabelCode(model: Facility, room: Room) {
  const floor = model.levels.findIndex((l) => l.id === room.levelId) + 1;
  const number =
    model.rooms
      .filter((r) => r.levelId === room.levelId)
      .findIndex((r) => r.id === room.id) + 1;
  return `${floor}.${String(number).padStart(2, '0')}`;
}

function inside([x, z]: Vec2, polygon: Vec2[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}

/** An interior anchor, including for L-shaped dining / admin rooms. */
export function roomLabelAnchor(room: Room): Vec2 {
  const xs = room.polygon.map((p) => p[0]),
    zs = room.polygon.map((p) => p[1]);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    z0 = Math.min(...zs),
    z1 = Math.max(...zs);
  let best: Vec2 = room.polygon[0],
    clearance = -1;
  for (let i = 1; i < 20; i++)
    for (let j = 1; j < 20; j++) {
      const p: Vec2 = [x0 + ((x1 - x0) * i) / 20, z0 + ((z1 - z0) * j) / 20];
      if (!inside(p, room.polygon)) continue;
      let distance = Infinity;
      room.polygon.forEach((a, k) => {
        const b = room.polygon[(k + 1) % room.polygon.length],
          dx = b[0] - a[0],
          dz = b[1] - a[1];
        const t = T.MathUtils.clamp(
          ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1),
          0,
          1,
        );
        distance = Math.min(
          distance,
          Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz),
        );
      });
      // Favor the center when multiple samples have the same wall clearance.
      const score =
        distance -
        0.001 * Math.hypot(p[0] - (x0 + x1) / 2, p[1] - (z0 + z1) / 2);
      if (score > clearance) {
        best = p;
        clearance = score;
      }
    }
  return best;
}

export function buildRoomLabels(
  host: HTMLElement,
  model: Facility,
  select: (zone: string, room: string) => void,
) {
  if (model.contextStyle !== 'olympic') return null;
  const entries = model.rooms.map((room) => {
    const button = document.createElement('button');
    const code = roomLabelCode(model, room);
    button.className = 'model-room-label';
    button.textContent = code;
    button.setAttribute('data-room-name', room.name);
    button.setAttribute('data-room-id', room.id);
    button.setAttribute('aria-label', `${code} · ${room.name}`);
    button.title = `${code} · ${room.name}`;
    button.onclick = () => select(room.zoneId, room.id);
    const line = document.createElement('span');
    line.className = 'model-room-leader';
    line.setAttribute('aria-hidden', 'true');
    host.appendChild(line);
    host.appendChild(button);
    return { room, button, line, anchor: roomLabelAnchor(room) };
  });
  type Rect = { x: number; y: number; w: number; h: number };
  const overlaps = (a: Rect, b: Rect) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 + 3 &&
    Math.abs(a.y - b.y) < (a.h + b.h) / 2 + 3;
  const position = new T.Vector3();
  return {
    update(
      camera: T.Camera,
      groups: Map<string, T.Group>,
      state: ViewerState,
      section: T.Plane,
    ) {
      const width = host.clientWidth,
        height = host.clientHeight;
      const top = Math.max(
        ...model.levels
          .filter((l) => state.level === 'all' || l.id === state.level)
          .map((l) => l.elevation),
      );
      const projected = entries
        .flatMap((entry) => {
          const { room, button, line, anchor } = entry,
            group = groups.get(room.zoneId)!;
          button.style.display = 'none';
          line.style.display = 'none';
          if (!state.labels || state.exterior || !group.visible) return [];
          const level = model.levels.find((l) => l.id === room.levelId)!;
          if (
            state.level === 'all' &&
            state.stack === 0 &&
            state.sectionAxis === 'none' &&
            level.elevation < top
          )
            return [];
          position.set(anchor[0], 0.15, anchor[1]).add(group.position);
          if (
            state.sectionAxis !== 'none' &&
            !state.plan &&
            section.distanceToPoint(position) < 0
          )
            return [];
          position.project(camera);
          if (Math.abs(position.z) > 1) return [];
          const x = ((position.x + 1) * width) / 2,
            y = ((1 - position.y) * height) / 2;
          if (x < 5 || x > width - 5 || y < 5 || y > height - 5) return [];
          const points = room.polygon.map(([a, b]) =>
            new T.Vector3(a, 0.15, b).add(group.position).project(camera),
          );
          const w =
            ((Math.max(...points.map((p) => p.x)) -
              Math.min(...points.map((p) => p.x))) *
              width) /
            2;
          const h =
            ((Math.max(...points.map((p) => p.y)) -
              Math.min(...points.map((p) => p.y))) *
              height) /
            2;
          return [
            {
              ...entry,
              x,
              y,
              area: w * h,
              full: (w > 94 && h > 36) || state.room === room.id,
            },
          ];
        })
        .sort(
          (a, b) =>
            Number(b.room.id === state.room) -
              Number(a.room.id === state.room) || b.area - a.area,
        );
      const placed: Rect[] = [];
      for (const entry of projected) {
        const { button, line, x, y, room } = entry;
        let full = entry.full;
        let rect = { x, y, w: full ? 126 : 39, h: full ? 56 : 24 };
        if (
          full &&
          placed.some((r) => overlaps(rect, r)) &&
          room.id !== state.room
        ) {
          full = false;
          rect.w = 39;
          rect.h = 24;
        }
        // Small marker shifts keep every room represented, including tight toilet clusters.
        if (placed.some((r) => overlaps(rect, r))) {
          let found = false;
          for (let radius = 14; radius <= 280; radius += 14) {
            for (let k = 0; k < 24; k++) {
              const candidate = {
                ...rect,
                x: x + radius * Math.cos((k * Math.PI) / 12),
                y: y + radius * Math.sin((k * Math.PI) / 12),
              };
              if (
                candidate.x < rect.w / 2 ||
                candidate.x > width - rect.w / 2 ||
                candidate.y < rect.h / 2 ||
                candidate.y > height - rect.h / 2
              )
                continue;
              if (!placed.some((r) => overlaps(candidate, r))) {
                rect = candidate;
                found = true;
                break;
              }
            }
            if (found) break;
          }
        }
        placed.push(rect);
        button.style.display = 'block';
        button.classList.toggle('full', full);
        button.classList.toggle('selected', room.id === state.room);
        button.style.left = `${rect.x}px`;
        button.style.top = `${rect.y}px`;
        const length = Math.hypot(rect.x - x, rect.y - y);
        if (length > 5) {
          line.style.display = 'block';
          line.style.left = `${x}px`;
          line.style.top = `${y}px`;
          line.style.width = `${length}px`;
          line.style.transform = `rotate(${Math.atan2(rect.y - y, rect.x - x)}rad)`;
        }
      }
    },
    dispose() {
      entries.forEach((e) => {
        e.button.remove();
        e.line.remove();
      });
    },
  };
}
