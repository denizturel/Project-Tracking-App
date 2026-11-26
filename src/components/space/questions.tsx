import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { inScope, personName, placeName } from '@/components/space/scope';
import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Choices,
  EditedLabel,
  ErrorText,
  Field,
  Icon,
  IconButton,
  type IconName,
  SearchField,
  type Tone,
} from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useRows } from '@/lib/use-rows';
import { useWorkspace } from '@/lib/workspace';

type Solution = {
  id: string;
  body: string;
  solved_by: string;
  outcome: 'worked' | 'did_not_work' | null;
  created_at: string;
  edited_at: string | null;
  solver: unknown;
  editor: unknown;
};

type Question = {
  id: string;
  subgroup_id: string | null;
  title: string;
  details: string | null;
  status: string;
  asked_by: string;
  created_at: string;
  edited_at: string | null;
  asker: unknown;
  editor: unknown;
  solutions: Solution[];
};

const SELECT =
  'id, subgroup_id, title, details, status, asked_by, created_at, edited_at, ' +
  'asker:profiles!asked_by(full_name), editor:profiles!edited_by(full_name), ' +
  'solutions(id, body, solved_by, outcome, created_at, edited_at, ' +
  'solver:profiles!solved_by(full_name), editor:profiles!edited_by(full_name))';

/** Turkish letters and capitals are ignored when searching. */
const plain = (text: string) =>
  text
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const STATUS = [
  { value: 'all', label: 'All' },
  { value: 'solved', label: 'Solved' },
  { value: 'open', label: 'Waiting for a solution' },
] as const;
const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function Questions({ info }: { info: SpaceInfo }) {
  const theme = useTheme();
  const { subgroups } = useWorkspace();
  const { session } = useAuth();
  const me = session?.user.id;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'solved'>('all');
  const [place, setPlace] = useState('all');
  const [asking, setAsking] = useState(false);
  const twoColumns = useWindowDimensions().width >= 1240 && !info.simple;

  const { rows, loading, error, reload } = useRows<Question>(info.project.id, () =>
    supabase
      .from('questions')
      .select(SELECT)
      .eq('project_id', info.project.id)
      .order('created_at', { ascending: false })
      .returns<Question[]>(),
  );

  // The groups of a project, or the teams of a group, to narrow the list.
  const inside = info.simple
    ? []
    : info.level === 'project'
      ? subgroups.filter((s) => s.project_id === info.project.id && !s.parent_id)
      : subgroups.filter((s) => s.parent_id === info.subgroup?.id);
  const treeOf = (id: string) => [id, ...subgroups.filter((s) => s.parent_id === id).map((s) => s.id)];
  const mine = rows.filter((q) => inScope(info, subgroups, q.subgroup_id));

  const words = plain(search).split(/\s+/).filter(Boolean);
  const shown = mine
    .filter((q) => place === 'all' || treeOf(place).includes(q.subgroup_id ?? ''))
    .filter((q) => filter === 'all' || (filter === 'solved') === (q.status === 'solved'))
    .filter((q) => {
      if (words.length === 0) return true;
      const text = plain(
        [q.title, q.details ?? '', placeName(info, subgroups, q.subgroup_id) ?? '', ...q.solutions.map((s) => s.body)].join(' '),
      );
      return words.every((word) => text.includes(word));
    });

  const side = (
    <Card>
      <ThemedText type="label">By {info.level === 'project' ? 'group' : 'team'}</ThemedText>
      <View>
        {inside.map((item, index) => {
          const list = mine.filter((q) => treeOf(item.id).includes(q.subgroup_id ?? ''));
          const open = list.filter((q) => q.status !== 'solved').length;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => setPlace(item.id)}
              style={[styles.byPlace, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
              <View style={styles.grow}>
                <ThemedText type="bold" numberOfLines={1}>
                  {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {list.length} question{list.length === 1 ? '' : 's'}
                </ThemedText>
              </View>
              {open > 0 ? <Chip text={`${open} open`} tone="warn" /> : list.length > 0 ? <Chip text="All solved" tone="ok" /> : null}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );

  return (
    <View style={twoColumns ? styles.columns : styles.stack}>
      <View style={[styles.stack, twoColumns && styles.grow]}>
        {info.level !== 'team' && (
          <ThemedText type="small" themeColor="textSecondary">
            {info.level === 'project'
              ? 'Every question and solution from all groups, in one place. Everyone in the project can search here.'
              : 'Questions from this group and its teams.'}
          </ThemedText>
        )}
        <SearchField value={search} onChangeText={setSearch} placeholder="Search a keyword, e.g. night audit, door lock, e-Fatura" />
        {inside.length > 0 && (
          <Choices
            options={[
              { value: 'all', label: info.level === 'project' ? 'All groups' : 'All teams' },
              ...inside.map((item) => ({ value: item.id, label: item.name })),
            ]}
            value={place}
            onChange={setPlace}
          />
        )}
        <View style={styles.between}>
          <Choices options={STATUS} value={filter} onChange={setFilter} />
          <Button title="Ask a question" icon="plus" small onPress={() => setAsking(true)} />
        </View>
        {asking && <NewQuestion info={info} onSaved={reload} onClose={() => setAsking(false)} />}

        <ErrorText>{error}</ErrorText>
        {!!search.trim() && (
          <ThemedText type="small" themeColor="textSecondary">
            {shown.length} result{shown.length === 1 ? '' : 's'} for “{search.trim()}”
          </ThemedText>
        )}
        {!loading && shown.length === 0 && (
          <Card style={{ alignItems: 'center' }}>
            <ThemedText type="bold">{mine.length === 0 ? 'No questions yet.' : 'No matching solution yet.'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {mine.length === 0
                ? 'Ask the first one so the right team can answer.'
                : 'Try another word, or ask the question so the right team can answer.'}
            </ThemedText>
          </Card>
        )}
        {shown.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            place={placeName(info, subgroups, question.subgroup_id)}
            me={me}
            isAdmin={info.isAdmin}
            forceOpen={!!search.trim()}
            onChanged={reload}
          />
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          Search ignores Turkish letters and capitals, so “sirket” also finds “Şirket”.
        </ThemedText>
        {!twoColumns && inside.length > 0 && side}
      </View>
      {twoColumns && <View style={[styles.stack, styles.sideColumn]}>{side}</View>}
    </View>
  );
}

function NewQuestion({ info, onSaved, onClose }: { info: SpaceInfo; onSaved: () => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase.from('questions').insert({
      project_id: info.project.id,
      subgroup_id: info.subgroup?.id ?? null,
      title: title.trim(),
      details: details.trim() || null,
    });
    setBusy(false);
    if (failed) return setError(failed.message);
    onSaved();
    onClose();
  }

  return (
    <Card>
      <ThemedText type="heading">Ask a question</ThemedText>
      <Field label="Question or error, in one line" required value={title} onChangeText={setTitle} />
      <Field label="Details" value={details} onChangeText={setDetails} multiline />
      <ErrorText>{error}</ErrorText>
      <View style={styles.row}>
        <Button title="Post question" small onPress={save} loading={busy} disabled={!title.trim()} />
        <Button title="Cancel" variant="plain" small onPress={onClose} disabled={busy} />
      </View>
    </Card>
  );
}

type CardProps = {
  question: Question;
  place: string | null;
  me: string | undefined;
  isAdmin: boolean;
  /** Open while searching, so the matching text is visible. */
  forceOpen: boolean;
  onChanged: () => void;
};

function QuestionCard({ question, place, me, isAdmin, forceOpen, onChanged }: CardProps) {
  const theme = useTheme();
  const [opened, setOpened] = useState(false);
  const open = opened || forceOpen;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(question.title);
  const [details, setDetails] = useState(question.details ?? '');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = question.asked_by === me;
  const solved = question.status === 'solved';
  const solutions = [...question.solutions].sort((a, b) => a.created_at.localeCompare(b.created_at));

  async function run(action: PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: failed } = await action;
    setBusy(false);
    if (failed) {
      setError(failed.message);
      return false;
    }
    onChanged();
    return true;
  }

  async function saveEdit() {
    const done = await run(
      supabase
        .from('questions')
        .update({ title: title.trim(), details: details.trim() || null })
        .eq('id', question.id),
    );
    if (done) setEditing(false);
  }

  async function addSolution() {
    const done = await run(supabase.from('solutions').insert({ question_id: question.id, body: answer.trim() }));
    if (done) setAnswer('');
  }

  const confirmed = solutions.find((x) => x.outcome === 'worked');
  const failed = !solved && solutions.length > 0 && solutions.every((x) => x.outcome === 'did_not_work');
  const latest = confirmed ?? [...solutions].reverse().find((x) => x.outcome !== 'did_not_work');

  return (
    <Card style={[styles.question, { borderLeftColor: solved ? theme.ok : theme.warn }]}>
      <View style={styles.questionHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpened(!opened)}
          style={[styles.grow, { gap: 8 }]}>
          <View style={styles.titleRow}>
            <ThemedText type="bold" style={[styles.grow, { fontSize: 18 }]}>
              {question.title}
            </ThemedText>
            {solved ? (
              <Tag text={confirmed ? 'Confirmed fix' : 'Solved'} tone="ok" icon={confirmed ? 'check' : undefined} />
            ) : (
              <Tag text={failed ? 'Fix did not work' : 'Open'} tone="warn" />
            )}
          </View>
          <View style={styles.tags}>
            {place && <Tag text={place} tone={place === 'Whole project' ? 'accent' : 'lavender'} />}
            <PersonTag label="Asked by" name={personName(question.asker)} />
            <ThemedText type="small" themeColor="textSecondary">
              {shortDate(question.created_at)}
            </ThemedText>
            {latest && <PersonTag label="Solved by" name={personName(latest.solver)} tone="ok" />}
            {question.edited_at && <PersonTag label="Edited by" name={personName(question.editor)} />}
          </View>
        </Pressable>
        {(mine || isAdmin) && (
          <IconButton icon="edit-2" label="Edit question" onPress={() => { setOpened(true); setEditing(true); }} />
        )}
      </View>

      {open && editing && (
        <>
          <Field label="Question" required value={title} onChangeText={setTitle} />
          <Field label="Details" value={details} onChangeText={setDetails} multiline />
          <View style={styles.row}>
            <Button title="Save" small onPress={saveEdit} loading={busy} disabled={!title.trim()} />
            <Button title="Cancel" variant="plain" small onPress={() => setEditing(false)} disabled={busy} />
            {isAdmin && (
              <Button
                title="Delete"
                icon="trash-2"
                variant="plain"
                small
                disabled={busy}
                onPress={() => run(supabase.from('questions').delete().eq('id', question.id))}
              />
            )}
          </View>
        </>
      )}
      {open && !editing && !!question.details && <ThemedText>{question.details}</ThemedText>}

      {open &&
        solutions.map((solution) => (
          <SolutionBox
            key={solution.id}
            solution={solution}
            asker={personName(question.asker)}
            canMark={mine}
            canEdit={solution.solved_by === me || isAdmin}
            run={run}
            busy={busy}
          />
        ))}

      {open && (!solved || failed) && (
        <>
          <Field
            label={solutions.length ? 'Suggest another solution' : 'Write the solution if you know it'}
            value={answer}
            onChangeText={setAnswer}
            multiline
          />
          <Button title="Post solution" icon="check" small onPress={addSolution} loading={busy} disabled={!answer.trim()} />
        </>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** Small tag with the person's initials: who asked, who solved, who edited. */
export function PersonTag({ label, name, tone = 'plain' }: { label: string; name: string; tone?: Tone }) {
  const theme = useTheme();
  const colours = { ok: [theme.mint, theme.ok], warn: [theme.butter, theme.warn] } as Record<string, string[]>;
  const [background, ink] = colours[tone] ?? [theme.lavender, theme.lavenderInk];
  return (
    <View style={[styles.personTag, { backgroundColor: background }]}>
      <Avatar name={name} size={22} />
      <ThemedText type="small" style={{ color: ink, fontSize: 14 }}>
        {label} <ThemedText type="smallBold" style={{ color: ink, fontSize: 14 }}>{name}</ThemedText>
      </ThemedText>
    </View>
  );
}

type SolutionProps = {
  solution: Solution;
  asker: string;
  /** Only the person who asked says whether it worked. */
  canMark: boolean;
  canEdit: boolean;
  busy: boolean;
  run: (action: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;
};

function SolutionBox({ solution, asker, canMark, canEdit, busy, run }: SolutionProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(solution.body);
  const bad = solution.outcome === 'did_not_work';

  const mark = (worked: boolean) => run(supabase.rpc('mark_solution', { solution_id: solution.id, worked }));

  async function save() {
    const done = await run(supabase.from('solutions').update({ body: body.trim() }).eq('id', solution.id));
    if (done) setEditing(false);
  }

  return (
    <View
      style={[
        styles.solution,
        { backgroundColor: bad ? theme.background : theme.mint, borderColor: bad ? theme.border : theme.mint },
      ]}>
      <View style={styles.tags}>
        <ThemedText type="label">{bad ? '✕ Tried, did not work' : 'Solution'}</ThemedText>
        <PersonTag label={bad ? 'Suggested by' : 'Solved by'} name={personName(solution.solver)} tone={bad ? 'plain' : 'ok'} />
        <ThemedText type="small" themeColor="textSecondary">
          {shortDate(solution.created_at)}
        </ThemedText>
        {canEdit && !editing && <IconButton icon="edit-2" label="Edit solution" onPress={() => setEditing(true)} />}
      </View>

      {editing ? (
        <>
          <Field label="Solution" value={body} onChangeText={setBody} multiline />
          <View style={styles.row}>
            <Button title="Save" small onPress={save} loading={busy} disabled={!body.trim()} />
            <Button title="Cancel" variant="plain" small onPress={() => setEditing(false)} disabled={busy} />
            <Button
              title="Delete"
              icon="trash-2"
              variant="plain"
              small
              disabled={busy}
              onPress={() => run(supabase.from('solutions').delete().eq('id', solution.id))}
            />
          </View>
        </>
      ) : (
        <>
          <ThemedText>{solution.body}</ThemedText>
          <EditedLabel name={solution.edited_at ? personName(solution.editor) : null} at={solution.edited_at} />
        </>
      )}

      <View style={styles.footer}>
        {solution.outcome === 'worked' ? (
          <PersonTag label="Confirmed it worked:" name={asker} tone="ok" />
        ) : bad ? (
          <PersonTag label="Said it did not work:" name={asker} tone="warn" />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Waiting for {canMark ? 'you' : asker} to confirm
          </ThemedText>
        )}
        {/* The asker's tick and X sit in the lower right of the solution box (decided by Deniz). */}
        {canMark && !solution.outcome && (
          <View style={styles.row}>
            <ThemedText type="smallBold">Did it work?</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Yes, it worked"
              disabled={busy}
              onPress={() => mark(true)}
              style={[styles.verdict, { backgroundColor: theme.ok }]}>
              <Icon name="check" size={20} color="card" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="No, it did not work"
              disabled={busy}
              onPress={() => mark(false)}
              style={[styles.verdict, { backgroundColor: theme.danger }]}>
              <Icon name="x" size={20} color="card" />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

/** Kept as a thin wrapper so every screen shares the same tags. */
export function Tag({ text, tone, icon }: { text: string; tone?: Tone; icon?: IconName }) {
  return <Chip text={text} tone={tone} icon={icon} />;
}

const styles = StyleSheet.create({
  stack: { gap: 16, minWidth: 0 },
  columns: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  sideColumn: { width: 340 },
  grow: { flex: 1, minWidth: 0 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  byPlace: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  question: { borderLeftWidth: 4, gap: 12 },
  questionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  personTag: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingRight: 10, padding: 3 },
  verdict: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  solution: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
