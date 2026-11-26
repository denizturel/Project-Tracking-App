import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { personName } from '@/components/space/scope';
import { type SpaceInfo } from '@/components/space/space';
import { Tick } from '@/components/space/tasks';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, EditedLabel, ErrorText, Field, IconButton, Segmented } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { parseDate, useRows } from '@/lib/use-rows';
import { type SubgroupNode, useWorkspace } from '@/lib/workspace';
import { months as monthNames, weekdays } from '@/lib/i18n';

export type Milestone = {
  id: string;
  subgroup_id: string | null;
  title: string;
  start_date: string | null;
  due_date: string | null;
  done: boolean;
  edited_at: string | null;
  editor: unknown;
  /** Missing until the database has the meeting columns; then 'milestone' or 'meeting'. */
  kind?: 'milestone' | 'meeting';
  starts_at?: string | null;
  ends_at?: string | null;
  location?: string | null;
  notes?: string | null;
  decisions?: string | null;
};

export const SCHEDULE_VIEWS = ['List', 'Timeline', 'Calendar'] as const;
export type ScheduleView = (typeof SCHEDULE_VIEWS)[number];

const DAY = 86_400_000;
const toDate = (value: string) => new Date(`${value}T00:00:00`);
const today = () => new Date(new Date().setHours(0, 0, 0, 0));
const short = (d: Date) => `${d.getDate()} ${monthNames()[d.getMonth()].slice(0, 3)}`;

type Status = 'done' | 'now' | 'next';

function span(m: Milestone) {
  const first = m.start_date ?? m.due_date;
  const last = m.due_date ?? m.start_date;
  if (!first || !last) return null;
  const a = toDate(first);
  const b = toDate(last);
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

export function statusOf(m: Milestone): Status {
  if (m.done) return 'done';
  // A meeting is simply over once its day has passed.
  if (m.kind === 'meeting') return m.due_date && toDate(m.due_date) < today() ? 'done' : 'next';
  const s = span(m);
  return s && s.from <= today() ? 'now' : 'next';
}

/** "20 Nov", or "25–28 Nov" and "28 Nov – 3 Dec" for a stretch of days. */
export function dateText(m: Milestone) {
  const s = span(m);
  if (!s) return '';
  if (+s.from === +s.to) return short(s.to);
  if (s.from.getMonth() === s.to.getMonth()) return `${s.from.getDate()}–${short(s.to)}`;
  return `${short(s.from)} – ${short(s.to)}`;
}

export function percentAlong(all: Milestone[]) {
  const list = all.filter((m) => !isMeeting(m));
  if (list.length === 0) return 0;
  const done = list.filter((m) => m.done).length;
  const now = list.filter((m) => statusOf(m) === 'now').length;
  return Math.round(((done + 0.5 * now) / list.length) * 100);
}

const BASE = 'id, subgroup_id, title, start_date, due_date, done, edited_at, editor:profiles!edited_by(full_name)';

/** Every milestone and meeting of the project; pages pick the ones for their own place. */
export function useMilestones(projectId: string) {
  return useRows<Milestone>(projectId, async () => {
    const load = (columns: string) =>
      supabase
        .from('milestones')
        .select(columns)
        .eq('project_id', projectId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .returns<Milestone[]>();
    // Older databases lack the meeting columns; the schedule then still works with what is there.
    const full = await load(`${BASE}, kind, starts_at, ends_at, location, notes, decisions`);
    if (!full.error) return full;
    const meetings = await load(`${BASE}, kind, starts_at, ends_at, location`);
    return meetings.error ? load(BASE) : meetings;
  });
}

export const isMeeting = (m: Milestone) => m.kind === 'meeting';
const clock = (value?: string | null) => (value ? value.slice(0, 5) : '');
/** "10:00–11:30" */
export const timeText = (m: Milestone) => [clock(m.starts_at), clock(m.ends_at)].filter(Boolean).join('–');
const parseTime = (text: string) => {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(text.trim());
  return match && +match[1] < 24 && +match[2] < 60 ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
};

/** Schedule tab: this place's own schedule first, then one card for each team inside a group. */
export function Schedule({ info }: { info: SpaceInfo }) {
  const { subgroups } = useWorkspace();
  const [view, setView] = useState<ScheduleView>('List');
  const { rows, error, reload } = useMilestones(info.project.id);

  const inside =
    info.level === 'project'
      ? subgroups.filter((s) => s.project_id === info.project.id && !s.parent_id)
      : info.level === 'group'
        ? subgroups.filter((s) => s.parent_id === info.subgroup?.id)
        : [];

  return (
    <>
      <ErrorText>{error}</ErrorText>
      <ScheduleCard info={info} place={info.subgroup} rows={rows} view={view} onView={setView} onChanged={reload} />
      {inside.map((child) => (
        <ScheduleCard key={child.id} info={info} place={child} rows={rows} view={view} onView={setView} onChanged={reload} />
      ))}
      {inside.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {info.level === 'project'
            ? 'The project schedule comes first, then the schedule of each group.'
            : "This group's schedule comes first, then the schedule of each team inside it."}
        </ThemedText>
      )}
    </>
  );
}

type CardProps = {
  info: SpaceInfo;
  /** Whose schedule: a group or team, or null for the project's own big milestones. */
  place: SubgroupNode | null;
  rows: Milestone[];
  view: ScheduleView;
  onView: (view: ScheduleView) => void;
  onChanged: () => void;
};

/** One schedule: title, List / Timeline / Calendar switch, progress bar and the milestones. */
export function ScheduleCard({ info, place, rows, view, onView, onChanged }: CardProps) {
  const theme = useTheme();
  const list = rows.filter((m) => m.subgroup_id === (place?.id ?? null));
  const percent = percentAlong(list);
  // 'new', a milestone's id, or nothing open.
  const [editing, setEditing] = useState<string | null>(null);
  // A manager changes the schedule of their own group or team only.
  const canEdit = info.isAdmin;
  const edit = canEdit ? setEditing : undefined;

  return (
    <Card>
      <View style={styles.header}>
        <ThemedText type="label">{place ? `${place.name} schedule` : 'Project schedule'}</ThemedText>
        <Segmented options={SCHEDULE_VIEWS} value={view} onChange={onView} />
      </View>
      <View style={styles.tools}>
        {canEdit && (
          <Button title="Add milestone" icon="plus" variant="secondary" small onPress={() => setEditing('new')} />
        )}
        {canEdit && (
          <Button title="Add meeting" icon="video" variant="secondary" small onPress={() => setEditing('meeting')} />
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {percent}% along
        </ThemedText>
      </View>
      <View style={[styles.bar, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.barFill, { backgroundColor: theme.primary, width: `${Math.max(percent, 2)}%` }]} />
      </View>

      {(editing === 'new' || editing === 'meeting') && (
        <MilestoneForm
          info={info}
          place={place}
          meeting={editing === 'meeting'}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      )}

      {list.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          No milestones or meetings yet.{canEdit ? ' Add the first one above.' : ''}
        </ThemedText>
      )}

      {list.length > 0 && view === 'List' && (
        <View>
          {list.map((m, index) => {
            const status = statusOf(m);
            if (editing === m.id) {
              return (
                <MilestoneForm
                  key={m.id}
                  info={info}
                  place={place}
                  milestone={m}
                  onClose={() => setEditing(null)}
                  onChanged={onChanged}
                />
              );
            }
            return (
              <View key={m.id} style={styles.step}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.stepDate}>
                  {dateText(m)}
                </ThemedText>
                <View style={styles.rail}>
                  <View
                    style={[
                      styles.node,
                      {
                        borderColor: status === 'done' ? theme.ok : status === 'now' ? theme.primary : theme.border,
                        backgroundColor: status === 'done' ? theme.ok : status === 'now' ? theme.primary : theme.card,
                      },
                    ]}
                  />
                  {index < list.length - 1 && <View style={[styles.wire, { backgroundColor: theme.border }]} />}
                </View>
                <View style={styles.stepBody}>
                  <ThemedText type={status === 'now' ? 'bold' : 'default'}>{m.title}</ThemedText>
                  {isMeeting(m) && (
                    <View style={styles.tools}>
                      <Chip text={['Meeting', timeText(m)].filter(Boolean).join(' · ')} tone="lavender" icon="video" />
                      {!!m.location && (
                        <ThemedText type="small" themeColor="textSecondary" selectable>
                          {m.location}
                        </ThemedText>
                      )}
                    </View>
                  )}
                  {isMeeting(m) && (!!m.notes || !!m.decisions) && (
                    <View style={[styles.minutes, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      {!!m.notes && (
                        <View style={{ gap: 2 }}>
                          <ThemedText type="label">Meeting notes</ThemedText>
                          <ThemedText>{m.notes}</ThemedText>
                        </View>
                      )}
                      {!!m.decisions && (
                        <View style={{ gap: 2 }}>
                          <ThemedText type="label">Decisions taken</ThemedText>
                          <ThemedText>{m.decisions}</ThemedText>
                        </View>
                      )}
                    </View>
                  )}
                  {isMeeting(m) && !m.notes && !m.decisions && statusOf(m) === 'done' && (
                    <ThemedText type="small" themeColor="textSecondary">
                      No notes or decisions written yet.
                    </ThemedText>
                  )}
                  {status === 'now' && !isMeeting(m) && (
                    <ThemedText type="smallBold" themeColor="primary">
                      In progress
                    </ThemedText>
                  )}
                  <EditedLabel name={m.edited_at ? personName(m.editor) : null} at={m.edited_at} />
                </View>
                {edit && <IconButton icon="edit-2" label={`Edit ${m.title}`} onPress={() => edit(m.id)} />}
              </View>
            );
          })}
        </View>
      )}

      {list.length > 0 && view === 'Timeline' && <Gantt list={list} onEdit={edit} />}
      {list.length > 0 && view === 'Calendar' && <MonthCalendar list={list} onEdit={edit} />}
      {view !== 'List' && editing && editing !== 'new' && editing !== 'meeting' && list.some((m) => m.id === editing) && (
        <MilestoneForm
          info={info}
          place={place}
          milestone={list.find((m) => m.id === editing)}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      )}
    </Card>
  );
}

type FormProps = {
  info: SpaceInfo;
  place: SubgroupNode | null;
  milestone?: Milestone;
  /** A new meeting instead of a new milestone. */
  meeting?: boolean;
  onClose: () => void;
  onChanged: () => void;
};

const dotted = (value: string | null) => (value ? value.split('-').reverse().join('.') : '');

function MilestoneForm({ info, place, milestone, meeting, onClose, onChanged }: FormProps) {
  const theme = useTheme();
  const asMeeting = milestone ? isMeeting(milestone) : !!meeting;
  const [from, setFrom] = useState(clock(milestone?.starts_at));
  const [to, setTo] = useState(clock(milestone?.ends_at));
  const [location, setLocation] = useState(milestone?.location ?? '');
  const [notes, setNotes] = useState(milestone?.notes ?? '');
  const [decisions, setDecisions] = useState(milestone?.decisions ?? '');
  const [title, setTitle] = useState(milestone?.title ?? '');
  const [start, setStart] = useState(dotted(milestone?.start_date ?? null));
  const [due, setDue] = useState(dotted(milestone?.due_date ?? null));
  const [done, setDone] = useState(milestone?.done ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: failed } = await action;
    setBusy(false);
    if (failed) return setError(failed.message);
    onChanged();
    onClose();
  }

  function save() {
    const startDate = start.trim() ? parseDate(start) : null;
    const dueDate = due.trim() ? parseDate(due) : null;
    if ((start.trim() && !startDate) || (due.trim() && !dueDate)) return setError('Write dates like 03.12.2026.');
    const fromTime = from.trim() ? parseTime(from) : null;
    const toTime = to.trim() ? parseTime(to) : null;
    if (asMeeting && ((from.trim() && !fromTime) || (to.trim() && !toTime))) return setError('Write times like 10:00.');
    if (asMeeting && !dueDate) return setError('A meeting needs a day.');
    const values = asMeeting
      ? {
          title: title.trim(),
          start_date: null,
          due_date: dueDate,
          done,
          kind: 'meeting',
          starts_at: fromTime,
          ends_at: toTime,
          location: location.trim() || null,
          notes: notes.trim() || null,
          decisions: decisions.trim() || null,
        }
      : { title: title.trim(), start_date: startDate, due_date: dueDate, done };
    return run(
      milestone
        ? supabase.from('milestones').update(values).eq('id', milestone.id)
        : supabase.from('milestones').insert({ ...values, project_id: info.project.id, subgroup_id: place?.id ?? null }),
    );
  }

  return (
    <View style={[styles.form, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <ThemedText type="bold">
        {milestone ? 'Edit' : 'New'} {asMeeting ? 'meeting' : 'milestone'}
      </ThemedText>
      <Field label={asMeeting ? 'What the meeting is about' : 'What happens'} required value={title} onChangeText={setTitle} />
      {asMeeting ? (
        <>
          <View style={styles.dates}>
            <View style={styles.grow}>
              <Field label="Day (day.month.year)" required value={due} onChangeText={setDue} placeholder="15.12.2026" />
            </View>
            <View style={styles.grow}>
              <Field label="From" value={from} onChangeText={setFrom} placeholder="10:00" />
            </View>
            <View style={styles.grow}>
              <Field label="To" value={to} onChangeText={setTo} placeholder="11:00" />
            </View>
          </View>
          <Field
            label="Place or meeting link"
            value={location}
            onChangeText={setLocation}
            placeholder="Meeting room 2, or a Teams / Meet / Zoom link"
            autoCapitalize="none"
          />
          <Field
            label="Meeting notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="What was discussed. You can fill this in after the meeting."
            multiline
          />
          <Field
            label="Decisions taken"
            value={decisions}
            onChangeText={setDecisions}
            placeholder="One decision per line"
            multiline
          />
        </>
      ) : (
        <View style={styles.dates}>
          <View style={styles.grow}>
            <Field label="Starts (day.month.year)" value={start} onChangeText={setStart} placeholder="01.12.2026" />
          </View>
          <View style={styles.grow}>
            <Field label="Ends or is due" value={due} onChangeText={setDue} placeholder="15.12.2026" />
          </View>
        </View>
      )}
      <View style={styles.tools}>
        <Tick checked={done} enabled={!busy} label="Done" onPress={() => setDone(!done)} />
        <ThemedText>Done</ThemedText>
      </View>
      <ErrorText>{error}</ErrorText>
      <View style={styles.tools}>
        <Button title="Save" small onPress={save} loading={busy} disabled={!title.trim()} />
        <Button title="Cancel" variant="plain" small onPress={onClose} disabled={busy} />
        {milestone && (
          <Button
            title="Delete"
            icon="trash-2"
            variant="plain"
            small
            disabled={busy}
            onPress={() => run(supabase.from('milestones').delete().eq('id', milestone.id))}
          />
        )}
      </View>
    </View>
  );
}

type ViewProps = { list: Milestone[]; onEdit?: (id: string) => void };

/** Bars on a shared month axis with a line for today. */
function Gantt({ list, onEdit }: ViewProps) {
  const theme = useTheme();
  const narrow = useWindowDimensions().width < 700;
  const dated = list.map((m) => ({ m, s: span(m) }));
  const spans = dated.flatMap((d) => (d.s ? [d.s] : []));
  if (spans.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Add dates to see the timeline.
      </ThemedText>
    );
  }

  const now = today();
  const first = new Date(Math.min(...spans.map((s) => +s.from), +now));
  const last = new Date(Math.max(...spans.map((s) => +s.to), +now));
  const start = new Date(first.getFullYear(), first.getMonth(), 1);
  const end = new Date(last.getFullYear(), last.getMonth() + 1, 1);
  const total = +end - +start;
  const at = (d: Date | number) => `${((+d - +start) / total) * 100}%` as const;
  const months: Date[] = [];
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);
  const labelWidth = narrow ? 120 : 230;
  const colour = (status: Status) =>
    status === 'done' ? theme.ok : status === 'now' ? theme.primary : theme.backgroundSelected;

  return (
    <View style={styles.gantt}>
      <View style={styles.ganttRow}>
        <View style={{ width: labelWidth }} />
        <View style={[styles.track, styles.monthRow]}>
          {months.map((d) => (
            <ThemedText key={+d} type="smallBold" themeColor="textSecondary" style={[styles.month, { left: at(d) }]}>
              {monthNames()[d.getMonth()].slice(0, 3)}
              {d.getMonth() === 0 ? ` ${d.getFullYear()}` : ''}
            </ThemedText>
          ))}
        </View>
      </View>
      {dated.map(({ m, s }) => {
        const status = statusOf(m);
        return (
          <View key={m.id} style={[styles.ganttRow, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
            <View style={{ width: labelWidth, paddingVertical: 8, paddingRight: 10 }}>
              <ThemedText type={status === 'now' ? 'bold' : 'smallBold'} numberOfLines={2}>
                {m.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {dateText(m) || 'No date'}
                {isMeeting(m) ? ` · Meeting ${timeText(m)}` : status === 'done' ? ' · Done' : status === 'now' ? ' · In progress' : ''}
              </ThemedText>
            </View>
            <View style={styles.track}>
              {months.map((d) => (
                <View key={+d} style={[styles.gridLine, { left: at(d), backgroundColor: theme.border }]} />
              ))}
              <View style={[styles.todayLine, { left: at(now), backgroundColor: theme.danger }]} />
              {s && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${m.title}, ${dateText(m)}`}
                  disabled={!onEdit}
                  onPress={() => onEdit?.(m.id)}
                  style={[
                    styles.ganttBar,
                    {
                      left: at(s.from),
                      width: `${((+s.to + DAY - +s.from) / total) * 100}%`,
                      minWidth: 12,
                      backgroundColor: colour(status),
                      borderWidth: status === 'next' ? 1.5 : 0,
                      borderColor: theme.primary,
                    },
                  ]}
                />
              )}
            </View>
          </View>
        );
      })}
      <View style={styles.legend}>
        {(['done', 'now', 'next'] as const).map((status) => (
          <View key={status} style={styles.legendItem}>
            <View style={[styles.key, { backgroundColor: colour(status) }]} />
            <ThemedText type="small" themeColor="textSecondary">
              {status === 'done' ? 'Done' : status === 'now' ? 'In progress' : 'Upcoming'}
            </ThemedText>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.key, { width: 3, backgroundColor: theme.danger }]} />
          <ThemedText type="small" themeColor="textSecondary">
            Today
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

/** A month grid, Monday first, with the milestones of that month listed below. */
function MonthCalendar({ list, onEdit }: ViewProps) {
  const theme = useTheme();
  const narrow = useWindowDimensions().width < 700;
  const dated = list.flatMap((m) => {
    const s = span(m);
    return s ? [{ m, s }] : [];
  });
  const now = today();
  const [month, setMonth] = useState(() => {
    const open = dated.find((d) => !d.m.done) ?? dated[0];
    const base = open && open.s.to >= now ? (open.s.from > now ? open.s.from : now) : now;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = month.getFullYear();
  const index = month.getMonth();
  const days = new Date(year, index + 1, 0).getDate();
  const lastDay = new Date(year, index, days);
  const cells: (Date | null)[] = Array.from({ length: (month.getDay() + 6) % 7 }, () => null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, index, d));
  while (cells.length % 7) cells.push(null);
  const inMonth = dated.filter((d) => d.s.from <= lastDay && d.s.to >= month);
  const tone = (m: Milestone) => (statusOf(m) === 'done' ? 'ok' : statusOf(m) === 'now' ? 'accent' : 'sky');
  const ink = (m: Milestone) =>
    statusOf(m) === 'done' ? theme.mint : statusOf(m) === 'now' ? theme.backgroundSelected : theme.sky;

  return (
    <View style={styles.calendar}>
      <View style={styles.header}>
        <IconButton icon="chevron-left" label="Previous month" onPress={() => setMonth(new Date(year, index - 1, 1))} />
        <ThemedText type="heading">
          {monthNames()[index]} {year}
          <ThemedText type="small" themeColor="textSecondary">
            {'  '}· {inMonth.length} item{inMonth.length === 1 ? '' : 's'}
          </ThemedText>
        </ThemedText>
        <IconButton icon="chevron-right" label="Next month" onPress={() => setMonth(new Date(year, index + 1, 1))} />
      </View>
      <View style={styles.week}>
        {weekdays().map((name) => (
          <ThemedText key={name} raw type="smallBold" themeColor="textSecondary" style={styles.dow}>
            {narrow ? name[0] : name}
          </ThemedText>
        ))}
      </View>
      <View style={styles.week}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={styles.cell} />;
          const hits = inMonth.filter((x) => d >= x.s.from && d <= x.s.to);
          const starts = hits.filter((x) => +x.s.from === +d || d.getDate() === 1 || d.getDay() === 1);
          const isToday = +d === +now;
          return (
            <View key={i} style={styles.cell}>
              <View
                style={[
                  styles.day,
                  { minHeight: narrow ? 46 : 78, borderColor: isToday ? theme.primary : theme.border },
                  hits.length > 0 && { backgroundColor: theme.background },
                ]}>
                <ThemedText type="smallBold" themeColor={isToday ? 'primary' : 'textSecondary'}>
                  {d.getDate()}
                </ThemedText>
                {narrow
                  ? hits.length > 0 && <View style={[styles.dot, { backgroundColor: theme.primary }]} />
                  : starts.map((x) => (
                      <Pressable
                        key={x.m.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${x.m.title}, ${dateText(x.m)}`}
                        disabled={!onEdit}
                        onPress={() => onEdit?.(x.m.id)}
                        style={[styles.event, { backgroundColor: ink(x.m) }]}>
                        <ThemedText type="small" numberOfLines={1} style={styles.eventText}>
                          {isMeeting(x.m) && clock(x.m.starts_at) ? `${clock(x.m.starts_at)} ` : ''}
                          {x.m.title}
                        </ThemedText>
                      </Pressable>
                    ))}
              </View>
            </View>
          );
        })}
      </View>
      {inMonth.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Nothing this month.
        </ThemedText>
      )}
      {inMonth.map((x) => (
        <View key={x.m.id} style={styles.tools}>
          <Chip text={[dateText(x.m), isMeeting(x.m) ? timeText(x.m) : ''].filter(Boolean).join(' · ')} tone={tone(x.m)} />
          <ThemedText type="bold" style={styles.grow}>
            {x.m.title}
            {isMeeting(x.m) && x.m.location ? ` · ${x.m.location}` : ''}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  grow: { flex: 1, minWidth: 0 },
  bar: { height: 8, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 58 },
  stepDate: { width: 118, textAlign: 'right', paddingTop: 3 },
  rail: { width: 16, alignItems: 'center', alignSelf: 'stretch' },
  node: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginTop: 7 },
  wire: { width: 2, flex: 1, marginTop: 2 },
  stepBody: { flex: 1, minWidth: 0, paddingBottom: 14, gap: 2 },
  minutes: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10, marginTop: 6 },
  form: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12, marginVertical: 6 },
  dates: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  gantt: { gap: 0 },
  ganttRow: { flexDirection: 'row', alignItems: 'stretch' },
  track: { flex: 1, minHeight: 34, justifyContent: 'center' },
  monthRow: { height: 28 },
  month: { position: 'absolute', top: 2, paddingLeft: 4 },
  gridLine: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  todayLine: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  ganttBar: { position: 'absolute', height: 18, borderRadius: 9, top: '50%', marginTop: -9 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  key: { width: 18, height: 10, borderRadius: 5 },
  calendar: { gap: 10 },
  week: { flexDirection: 'row', flexWrap: 'wrap' },
  dow: { width: `${100 / 7}%`, textAlign: 'center', paddingBottom: 4 },
  cell: { width: `${100 / 7}%`, padding: 2 },
  day: { borderWidth: 1, borderRadius: 10, padding: 5, gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, alignSelf: 'center' },
  event: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  eventText: { fontSize: 12.5, lineHeight: 17 },
});
