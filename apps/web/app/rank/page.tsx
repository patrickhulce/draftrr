'use client';

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  importPlayersCsv,
  moveTierGroupTo,
  repairRankingItems,
  tierGroupBoundary,
  tierGroupEnd,
  tierGroupStart,
  type Player,
  type RankingItem,
  type RankingSet,
} from '@draftrr/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { CirclePlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MatchReview } from '@/components/MatchReview';
import { cn } from '@/lib/cn';
import { db, ensureSeeded } from '@/lib/db';
import { uid } from '@/lib/ids';
import { allPlayers, defaultRankingItems, playerMap } from '@/lib/players';

const TIER_LABEL = /^Tier \d+$/;

/** Grabbing a tier's label (its `data-tier-grip`) drags the whole group; the line drags the break alone. */
type TierGrab = 'line' | 'group';

/** A group is many rows tall, so a group drag reads intent from travel, not from the row under the cursor. */
const GROUP_DRAG_SLOP = 24;

function itemId(item: RankingItem): string {
  return item.kind === 'player' ? `p:${item.playerId}` : `t:${item.id}`;
}

function formatStat(value?: number): string {
  return value == null ? '—' : value.toFixed(1);
}

function formatRank(value?: number): string {
  return value == null ? '—' : String(value);
}

const RANK_VS_ADP_STRONG = 30;
const RANK_VS_ADP_MILD = 12;

/**
 * Diff is positive when our rank is much better (lower) than ADP, i.e. we
 * value the player more than the market does (a target). It's negative when
 * our rank is much worse (higher) than ADP, i.e. the market will draft them
 * before we would (someone we'll never get).
 */
function rankVsAdpTone(rank: number | null, adp?: number): string | undefined {
  if (rank == null || adp == null) return undefined;
  const diff = adp - rank;
  if (diff >= RANK_VS_ADP_STRONG) return 'bg-emerald-500/20 hover:bg-emerald-500/25';
  if (diff >= RANK_VS_ADP_MILD) return 'bg-emerald-500/10 hover:bg-emerald-500/15';
  if (diff <= -RANK_VS_ADP_STRONG) return 'bg-rose-500/20 hover:bg-rose-500/25';
  if (diff <= -RANK_VS_ADP_MILD) return 'bg-rose-500/10 hover:bg-rose-500/15';
  return undefined;
}

function renumberTiers(list: RankingItem[]): RankingItem[] {
  let n = 0;
  return list.map((item) => {
    if (item.kind !== 'tier' || !TIER_LABEL.test(item.label)) return item;
    n += 1;
    return { ...item, label: `Tier ${n}` };
  });
}

function canInsertTierAt(items: RankingItem[], index: number): boolean {
  if (items[index]?.kind === 'tier') return false;
  if (index > 0 && items[index - 1]?.kind === 'tier') return false;
  return true;
}

function RowCols({
  rank,
  pos,
  name,
  team,
  points,
  ballers,
  adp,
  risk,
  upside,
  muted,
}: {
  rank: React.ReactNode;
  pos: React.ReactNode;
  name: React.ReactNode;
  team: React.ReactNode;
  points: React.ReactNode;
  ballers: React.ReactNode;
  adp: React.ReactNode;
  risk: React.ReactNode;
  upside: React.ReactNode;
  muted?: boolean;
}) {
  const tone = muted ? 'text-white/50' : undefined;
  return (
    <>
      <span className={cn('w-8 shrink-0 font-mono', muted ? 'text-white/40' : undefined)}>
        {rank}
      </span>
      <span className="w-10 shrink-0 font-medium">{pos}</span>
      <span className="min-w-0 flex-1">{name}</span>
      <span className={cn('w-12 shrink-0', tone)}>{team}</span>
      <span className={cn('w-16 shrink-0 font-mono', tone)}>{points}</span>
      <span className={cn('w-16 shrink-0 font-mono', tone)}>{ballers}</span>
      <span className={cn('w-16 shrink-0 font-mono', tone)}>{adp}</span>
      <span className={cn('w-14 shrink-0 font-mono', tone)}>{risk}</span>
      <span className={cn('w-16 shrink-0 font-mono', tone)}>{upside}</span>
    </>
  );
}

function InsertTierControl({ onInsert }: { onInsert: () => void }) {
  const [hot, setHot] = useState(false);
  return (
    <div
      className="relative w-7 shrink-0 self-stretch"
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
    >
      <div className="absolute -top-3 right-0 bottom-0 left-0" />
      <button
        type="button"
        data-testid="insert-tier"
        aria-label="Insert tier break"
        onClick={onInsert}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'absolute top-0 left-1/2 z-20 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink-900 text-field-400 transition-opacity hover:text-field-300',
          hot ? 'opacity-100' : 'opacity-0',
        )}
      >
        <CirclePlus className="h-4 w-4" />
      </button>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0 left-1/2 z-20 h-px w-[100vw] -translate-y-1/2 bg-field-400/40 transition-opacity',
          hot ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}

function DropIndicator() {
  return (
    <div
      aria-hidden
      data-testid="tier-drop-indicator"
      className="pointer-events-none absolute inset-x-0 -top-0.5 z-30 h-0.5 rounded-full bg-field-300"
    />
  );
}

function SortableRow({
  item,
  selected,
  rank,
  players,
  showInsert,
  groupDrag,
  inMovingGroup,
  movingCount,
  dropHint,
  dropHere,
  onClick,
  onInsertTier,
  onRemove,
  onRenameTier,
  onTierGrab,
}: {
  item: RankingItem;
  selected: boolean;
  rank: number | null;
  players: Map<string, Player>;
  showInsert: boolean;
  groupDrag: boolean;
  inMovingGroup: boolean;
  movingCount: number | null;
  dropHint: string | null;
  dropHere: boolean;
  onClick: (e: React.MouseEvent) => void;
  onInsertTier: () => void;
  onRemove: () => void;
  onRenameTier: () => void;
  onTierGrab: (grab: TierGrab) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: itemId(item),
  });
  // Only the dragged tier follows the cursor during a group drag: shuffling the
  // other rows would preview a single-row move that is not what lands.
  const style =
    groupDrag && !isDragging
      ? undefined
      : { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="group relative flex">
      {dropHere && <DropIndicator />}
      {showInsert ? (
        <InsertTierControl onInsert={onInsertTier} />
      ) : (
        <div className="w-7 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {item.kind === 'tier' ? (
          <div
            data-testid="tier-row"
            className="tier-line my-1 flex items-center gap-3 px-2"
            onPointerDownCapture={(e) =>
              onTierGrab((e.target as HTMLElement).closest('[data-tier-grip]') ? 'group' : 'line')
            }
            {...attributes}
            {...listeners}
          >
            <div className="h-px flex-1 bg-field-400/70" />
            <span
              data-tier-grip=""
              title="Drag the label to move the whole tier; drag the line to move the break alone"
              // A directly applied cursor beats the row-resize the row hands down by inheritance.
              className="cursor-grab select-none rounded px-1.5 py-0.5 text-xs uppercase tracking-wide text-field-400 hover:bg-field-400/15 hover:text-field-300 active:cursor-grabbing"
              onDoubleClick={(e) => {
                e.stopPropagation();
                onRenameTier();
              }}
            >
              {item.label}
            </span>
            {movingCount != null && (
              <span className="whitespace-nowrap rounded bg-field-500/20 px-1.5 py-0.5 text-xs text-field-200">
                {movingCount} player{movingCount === 1 ? '' : 's'}
                {dropHint ? ` → ${dropHint}` : ''}
              </span>
            )}
            <div className="h-px flex-1 bg-field-400/70" />
            <button
              type="button"
              aria-label="Remove tier break"
              className="rounded px-1 text-xs text-white/30 opacity-0 hover:text-white/70 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              ×
            </button>
          </div>
        ) : (
          <PlayerRow
            item={item}
            selected={selected}
            rank={rank}
            player={players.get(item.playerId)}
            isDragging={isDragging || inMovingGroup}
            attributes={attributes}
            listeners={listeners}
            onClick={onClick}
            onRemove={onRemove}
          />
        )}
      </div>
    </div>
  );
}

function PlayerRow({
  item,
  selected,
  rank,
  player,
  isDragging,
  attributes,
  listeners,
  onClick,
  onRemove,
}: {
  item: Extract<RankingItem, { kind: 'player' }>;
  selected: boolean;
  rank: number | null;
  player: Player | undefined;
  isDragging: boolean;
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: React.HTMLAttributes<HTMLElement> | undefined;
  onClick: (e: React.MouseEvent) => void;
  onRemove: () => void;
}) {
  if (!player) {
    return (
      <div
        className={cn(
          'flex w-full cursor-grab items-center gap-3 rounded-md bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-100 active:cursor-grabbing',
          isDragging && 'opacity-60',
        )}
        {...attributes}
        {...listeners}
      >
        <RowCols
          rank={rank ?? ''}
          pos="—"
          name={
            <span>
              Unknown player{' '}
              <span className="font-mono text-xs text-amber-200/80">{item.playerId}</span>
            </span>
          }
          team=""
          points=""
          ballers=""
          adp=""
          risk=""
          upside=""
        />
        <button
          type="button"
          aria-label="Remove unknown player"
          className="shrink-0 rounded px-1 text-amber-200/70 hover:text-amber-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          ×
        </button>
      </div>
    );
  }

  const highlight = rankVsAdpTone(rank, player.adp);

  return (
    <button
      type="button"
      data-testid="player-row"
      data-player-id={item.playerId}
      onClick={onClick}
      title={highlight ? `Rank ${rank} vs ADP ${formatStat(player.adp)}` : undefined}
      className={cn(
        'flex w-full cursor-grab items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-white/5 active:cursor-grabbing',
        highlight,
        selected && 'bg-white/10',
        isDragging && 'opacity-60',
      )}
      {...attributes}
      {...listeners}
    >
      <RowCols
        muted
        rank={rank ?? ''}
        pos={<span className={`pos-${player.position}`}>{player.position}</span>}
        name={player.name}
        team={player.team}
        points={formatStat(player.projectedPoints)}
        ballers={formatRank(player.ballersRank)}
        adp={formatStat(player.adp)}
        risk={formatStat(player.risk)}
        upside={formatStat(player.upside)}
      />
    </button>
  );
}

export default function RankPage() {
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState('default');
  const [items, setItems] = useState<RankingItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<RankingItem[][]>([]);
  const [redo, setRedo] = useState<RankingItem[][]>([]);
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState<{ id: string; grab: TierGrab } | null>(null);
  const [drop, setDrop] = useState<{ at: number; hint: string } | null>(null);
  const [importReview, setImportReview] = useState<ReturnType<typeof importPlayersCsv> | null>(
    null,
  );
  const lastClick = useRef<number>(-1);
  const tierGrab = useRef<TierGrab>('line');
  const saveTimer = useRef<number | undefined>(undefined);
  const players = useMemo(() => playerMap(), []);

  const sets =
    useLiveQuery(() => db.rankingSets.orderBy('updatedAt').reverse().toArray(), []) ?? [];

  useEffect(() => {
    void ensureSeeded().then(() => setReady(true));
  }, []);

  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const set = sets.find((s) => s.id === activeId) ?? sets[0];
    if (!set) return;
    if (set.id !== activeId) {
      setActiveId(set.id);
      return;
    }
    if (loadedFor.current === set.id) return;
    loadedFor.current = set.id;
    const result = repairRankingItems(set.items, allPlayers());
    setItems(result.items);
    if (result.repaired > 0) {
      toast.success(`Fixed ${result.repaired} outdated player${result.repaired === 1 ? '' : 's'}`);
    }
    setSelected(new Set());
    setUndo([]);
    setRedo([]);
  }, [sets, activeId]);

  useEffect(() => {
    if (!ready || !activeId || loadedFor.current !== activeId) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void db.rankingSets.update(activeId, { items, updatedAt: Date.now() });
    }, 400);
    return () => window.clearTimeout(saveTimer.current);
  }, [items, activeId, ready]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const ids = useMemo(() => items.map(itemId), [items]);
  const indexById = useMemo(() => new Map(ids.map((id, i) => [id, i])), [ids]);
  const ranks = useMemo(() => {
    let n = 0;
    return items.map((item) => (item.kind === 'player' ? ++n : null));
  }, [items]);
  const current = sets.find((s) => s.id === activeId);

  /** The tier break being dragged by its label, plus the players travelling with it. */
  const moving = useMemo(() => {
    if (drag?.grab !== 'group') return null;
    const start = indexById.get(drag.id);
    if (start == null) return null;
    const end = tierGroupEnd(items, start);
    return { start, end, members: new Set(ids.slice(start + 1, end)) };
  }, [drag, ids, indexById, items]);
  // Drop handling reads the group from a ref so a quick flick can't land on a
  // render that hasn't caught up with the drag yet.
  const movingRef = useRef<{ start: number; end: number } | null>(null);

  const pushUndo = (next: RankingItem[]) => {
    setUndo((u) => [...u.slice(-40), items]);
    setRedo([]);
    setItems(next);
  };

  /**
   * A group drag only ever lands outside the group, so the group's own rows are
   * poor drop targets: they sit under the cursor for the whole first stretch of
   * the drag. Aim at the rows the drag is heading toward instead.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const group = movingRef.current;
    if (!group) return closestCenter(args);
    const travel = args.collisionRect.top - (args.active.rect.current.initial?.top ?? 0);
    if (Math.abs(travel) < GROUP_DRAG_SLOP) return [];
    const droppableContainers = args.droppableContainers.filter((container) => {
      const index = indexById.get(String(container.id));
      if (index == null) return false;
      return travel > 0 ? index >= group.end : index < group.start;
    });
    return closestCenter({ ...args, droppableContainers });
  };

  /** Where the dragged group would land right now, with a label for the drag chip. */
  const groupLanding = (group: { start: number; end: number }, event: DragMoveEvent) => {
    const overIndex = event.over == null ? undefined : indexById.get(String(event.over.id));
    if (overIndex == null) return null;
    const down = event.delta.y > 0;
    const at = tierGroupBoundary(items, group.start, overIndex, down ? 1 : -1);
    if (at == null) return null;
    const target = items[tierGroupStart(items, overIndex)];
    const hint =
      target?.kind === 'tier' ? `${down ? 'after' : 'before'} ${target.label}` : 'to the top';
    return { at, hint };
  };

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    const start = indexById.get(id) ?? -1;
    const grab: TierGrab = items[start]?.kind === 'tier' ? tierGrab.current : 'line';
    movingRef.current = grab === 'group' ? { start, end: tierGroupEnd(items, start) } : null;
    setDrag({ id, grab });
    setDrop(null);
  };

  const onDragMove = (event: DragMoveEvent) => {
    const group = movingRef.current;
    if (group) setDrop(groupLanding(group, event));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const group = movingRef.current;
    movingRef.current = null;
    setDrag(null);
    setDrop(null);
    if (group) {
      const landing = groupLanding(group, event);
      if (landing) pushUndo(renumberTiers(moveTierGroupTo(items, group.start, landing.at)));
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = indexById.get(String(active.id));
    const newIndex = indexById.get(String(over.id));
    if (oldIndex == null || newIndex == null) return;
    pushUndo(arrayMove(items, oldIndex, newIndex));
  };

  const insertTier = (index: number) => {
    const next = [...items];
    next.splice(index, 0, { kind: 'tier', id: uid('tier'), label: 'Tier 1' });
    pushUndo(renumberTiers(next));
  };

  const removeItem = (index: number) => {
    pushUndo(renumberTiers(items.filter((_, i) => i !== index)));
  };

  const renameTier = (index: number) => {
    const item = items[index];
    if (item?.kind !== 'tier') return;
    const label = window.prompt('Rename tier', item.label);
    if (!label?.trim()) return;
    const next = items.map((it, i) =>
      i === index && it.kind === 'tier' ? { ...it, label: label.trim() } : it,
    );
    pushUndo(renumberTiers(next));
  };

  const clickPlayer = (index: number, e: React.MouseEvent) => {
    const id = items[index] && itemId(items[index]);
    if (!id || items[index]?.kind !== 'player') return;
    setSelected((prev) => {
      const next = new Set(e.shiftKey ? prev : []);
      if (e.shiftKey && lastClick.current >= 0) {
        const [a, b] = [lastClick.current, index].sort((x, y) => x - y);
        for (let i = a; i <= b; i++) {
          const it = items[i];
          if (it?.kind === 'player') next.add(itemId(it));
        }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastClick.current = index;
  };

  const moveSelected = (delta: number) => {
    if (selected.size === 0) return;
    const indexes = items.map((it, i) => ({ it, i })).filter(({ it }) => selected.has(itemId(it)));
    const next = [...items];
    const ordered = delta > 0 ? [...indexes].reverse() : indexes;
    for (const { i } of ordered) {
      const j = i + delta;
      if (j < 0 || j >= next.length) continue;
      const tmp = next[i]!;
      next[i] = next[j]!;
      next[j] = tmp;
    }
    pushUndo(next);
  };

  const createSet = async (name: string, source?: RankingSet) => {
    const now = Date.now();
    const id = uid('rank');
    const set: RankingSet = {
      id,
      name,
      parentId: source?.id,
      items: source ? structuredClone(source.items) : defaultRankingItems(),
      createdAt: now,
      updatedAt: now,
    };
    await db.rankingSets.add(set);
    setActiveId(id);
  };

  const rename = async () => {
    const name = window.prompt('Rename ranking set', current?.name ?? '');
    if (!name || !current) return;
    await db.rankingSets.update(current.id, { name, updatedAt: Date.now() });
  };

  const remove = async () => {
    if (!current || current.id === 'default') return toast.error('Keep the baseline set');
    if (!window.confirm(`Delete ${current.name}?`)) return;
    await db.rankingSets.delete(current.id);
    setActiveId('default');
  };

  const exportSet = () => {
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${current?.name ?? 'ranking'}.json`;
    a.click();
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    if (file.name.endsWith('.json')) {
      const parsed = JSON.parse(text) as RankingSet;
      await createSet(`${parsed.name} import`, parsed);
      return;
    }
    setImportReview(importPlayersCsv(text));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          const next = redo.at(-1);
          if (!next) return;
          setRedo((r) => r.slice(0, -1));
          setUndo((u) => [...u, items]);
          setItems(next);
        } else {
          const prev = undo.at(-1);
          if (!prev) return;
          setUndo((u) => u.slice(0, -1));
          setRedo((r) => [...r, items]);
          setItems(prev);
        }
      }
      if (e.altKey && e.key === 'ArrowUp') moveSelected(-1);
      if (e.altKey && e.key === 'ArrowDown') moveSelected(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!ready) return <p className="text-white/50">Loading rankings…</p>;

  return (
    <div className="space-y-4">
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Rank</h1>
          <p className="text-sm text-white/50">
            Drag players or slide the tier lines. Drag a tier by its label to move the whole group.
            Shift-click to multi-select. Alt+↑/↓ to nudge.
          </p>
          <div className="mt-1 flex items-center gap-3 text-xs text-white/40">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/60" />
              Target: we rank them well above ADP
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/60" />
              Long shot: we rank them well below ADP
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeId}
            onChange={(e) => setActiveId(e.target.value)}
            className="rounded-md border border-white/10 bg-ink-800 px-3 py-1.5 text-sm"
          >
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.parentId ? ' (fork)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md bg-field-500 px-3 py-1.5 text-sm text-ink-950"
            onClick={() => void createSet('New board')}
          >
            New
          </button>
          <button
            type="button"
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm"
            onClick={() => void createSet(`${current?.name ?? 'Board'} fork`, current)}
          >
            Fork
          </button>
          <div className="relative">
            <button
              type="button"
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm"
              onClick={() => setMenu((m) => !m)}
            >
              More
            </button>
            {menu && (
              <div className="absolute right-0 z-30 mt-1 w-40 rounded-md border border-white/10 bg-ink-800 py-1 text-sm">
                <button
                  className="block w-full px-3 py-1.5 text-left hover:bg-white/5"
                  onClick={() => void rename()}
                >
                  Rename
                </button>
                <button
                  className="block w-full px-3 py-1.5 text-left hover:bg-white/5"
                  onClick={() => void createSet(`${current?.name} copy`, current)}
                >
                  Duplicate
                </button>
                <label className="block cursor-pointer px-3 py-1.5 hover:bg-white/5">
                  Import
                  <input
                    type="file"
                    accept=".csv,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onImportFile(f);
                    }}
                  />
                </label>
                <button
                  className="block w-full px-3 py-1.5 text-left hover:bg-white/5"
                  onClick={exportSet}
                >
                  Export
                </button>
                <button
                  className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-white/5"
                  onClick={() => void remove()}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {importReview && (
        <MatchReview
          report={importReview}
          onClose={() => setImportReview(null)}
          onApply={async (acceptedIds) => {
            const next: RankingItem[] = [
              { kind: 'tier', id: uid('tier'), label: 'Tier 1' },
              ...acceptedIds.map((playerId) => ({ kind: 'player' as const, playerId })),
            ];
            await createSet('Imported CSV', {
              id: '',
              name: '',
              items: next,
              createdAt: 0,
              updatedAt: 0,
            });
            setImportReview(null);
          }}
        />
      )}

      <div
        data-testid="rank-list"
        className="max-h-[calc(100vh-14rem)] overflow-auto rounded-xl border border-white/10 bg-ink-900/50"
      >
        <div className="min-w-[820px]">
          <div className="sticky top-0 z-10 border-b border-white/10 bg-ink-900/95 backdrop-blur">
            <div className="flex items-center">
              <div className="w-7 shrink-0" />
              <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-xs font-medium text-white/50">
                <RowCols
                  rank="#"
                  pos=""
                  name="Player"
                  team="Team"
                  points="Points"
                  ballers="Rank"
                  adp="ADP"
                  risk="Risk"
                  upside="Upside"
                />
              </div>
            </div>
          </div>
          <div className="py-2">
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragCancel={() => {
                movingRef.current = null;
                setDrag(null);
                setDrop(null);
              }}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {items.map((item, i) => (
                  <SortableRow
                    key={itemId(item)}
                    item={item}
                    selected={selected.has(itemId(item))}
                    rank={ranks[i] ?? null}
                    players={players}
                    showInsert={!drag && canInsertTierAt(items, i)}
                    groupDrag={moving != null}
                    inMovingGroup={moving?.members.has(itemId(item)) ?? false}
                    movingCount={moving && drag?.id === itemId(item) ? moving.members.size : null}
                    dropHint={drop?.hint ?? null}
                    dropHere={drop?.at === i}
                    onClick={(e) => clickPlayer(i, e)}
                    onInsertTier={() => insertTier(i)}
                    onRemove={() => removeItem(i)}
                    onRenameTier={() => renameTier(i)}
                    onTierGrab={(grab) => {
                      tierGrab.current = grab;
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {drop?.at === items.length && (
              <div className="relative h-0">
                <DropIndicator />
              </div>
            )}
            {!drag && canInsertTierAt(items, items.length) && (
              <div className="flex h-6">
                <InsertTierControl onInsert={() => insertTier(items.length)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
