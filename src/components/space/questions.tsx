import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { inScope, personName, placeName } from '@/components/space/scope';
import { type SpaceInfo } from '@/components/space/space';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EditedLabel, ErrorText, Field, TextButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDate, useRows } from '@/lib/use-rows';
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

export function Questions({ info }: { info: SpaceInfo }) {
  const { subgroups } = useWorkspace();
  const { session } = useAuth();
  const me = session?.user.id;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'solved'>('all');

  const { rows, loading, error, reload } = useRows<Question>(info.project.id, () =>
    supabase
      .from('questions')
      .select(SELECT)
      .eq('project_id', info.project.id)
      .order('created_at', { ascending: false })
      .returns<Question[]>(),
  );

  const words = plain(search).split(/\s+/).filter(Boolean);
  const shown = rows
    .filter((q) => inScope(info, subgroups, q.subgroup_id))
    .filter((q) => filter === 'all' || (filter === 'solved') === (q.status === 'solved'))
    .filter((q) => {
      if (words.length === 0) return true;
      const text = plain([q.title, q.details ?? '', ...q.solutions.map((s) => s.body)].join(' '));
      return words.every((word) => text.includes(word));
    });

  return (
    <>
      <ThemedText type="subtitle">Questions & solutions</ThemedText>
      {info.level !== 'team' && (
        <ThemedText type="small" themeColor="textSecondary">
          {info.level === 'project'
            ? 'Everything asked anywhere in this project, in one place.'
            : 'Questions from this group and its teams.'}
        </ThemedText>
      )}

      <NewQuestion info={info} onSaved={reload} />

      <Field label="Search by keyword" value={search} onChangeText={setSearch} autoCapitalize="none" />
      <View style={styles.row}>
        {(['all', 'open', 'solved'] as const).map((value) => (
          <TextButton
            key={value}
            title={(filter === value ? '● ' : '○ ') + value[0].toUpperCase() + value.slice(1)}
            onPress={() => setFilter(value)}
          />
        ))}
      </View>

      <ErrorText>{error}</ErrorText>
      {!loading && shown.length === 0 && (
        <ThemedText themeColor="textSecondary">
          {rows.length === 0 ? 'No questions yet. Ask the first one above.' : 'Nothing matches.'}
        </ThemedText>
      )}
      {shown.map((question) => (
        <QuestionCard
          key={question.id}
          question={question}
          place={placeName(info, subgroups, question.subgroup_id)}
          me={me}
          isAdmin={info.isAdmin}
          onChanged={reload}
        />
      ))}
    </>
  );
}

function NewQuestion({ info, onSaved }: { info: SpaceInfo; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return <Button title="Ask a question or report an error" onPress={() => setOpen(true)} />;

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
    setTitle('');
    setDetails('');
    setOpen(false);
    onSaved();
  }

  return (
    <Card>
      <Field label="Question or error, in one line" required value={title} onChangeText={setTitle} />
      <Field label="Details" value={details} onChangeText={setDetails} multiline />
      <ErrorText>{error}</ErrorText>
      <Button title="Post" onPress={save} loading={busy} disabled={!title.trim()} />
      <Button title="Cancel" variant="plain" onPress={() => setOpen(false)} disabled={busy} />
    </Card>
  );
}

type CardProps = {
  question: Question;
  place: string | null;
  me: string | undefined;
  isAdmin: boolean;
  onChanged: () => void;
};

function QuestionCard({ question, place, me, isAdmin, onChanged }: CardProps) {
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

  return (
    <Card tint={solved ? 'mint' : 'card'}>
      <View style={styles.tags}>
        <Tag text={solved ? 'Solved' : 'Open'} />
        {place && <Tag text={place} />}
        <Tag text={`Asked by ${personName(question.asker)}`} />
        <ThemedText type="small" themeColor="textSecondary">
          {formatDate(question.created_at)}
        </ThemedText>
      </View>

      {editing ? (
        <>
          <Field label="Question" required value={title} onChangeText={setTitle} />
          <Field label="Details" value={details} onChangeText={setDetails} multiline />
          <Button title="Save" onPress={saveEdit} loading={busy} disabled={!title.trim()} />
          <Button title="Cancel" variant="plain" onPress={() => setEditing(false)} disabled={busy} />
        </>
      ) : (
        <>
          <ThemedText type="bold">{question.title}</ThemedText>
          {!!question.details && <ThemedText>{question.details}</ThemedText>}
          <EditedLabel name={question.edited_at ? personName(question.editor) : null} at={question.edited_at} />
          {(mine || isAdmin) && (
            <View style={styles.row}>
              <TextButton title="Edit" onPress={() => setEditing(true)} />
              {isAdmin && (
                <TextButton
                  title="Delete"
                  danger
                  disabled={busy}
                  onPress={() => run(supabase.from('questions').delete().eq('id', question.id))}
                />
              )}
            </View>
          )}
        </>
      )}

      {solutions.map((solution) => (
        <SolutionBox
          key={solution.id}
          solution={solution}
          canMark={mine}
          canEdit={solution.solved_by === me || isAdmin}
          run={run}
          busy={busy}
        />
      ))}

      <Field label="Suggest a solution" value={answer} onChangeText={setAnswer} multiline />
      <ErrorText>{error}</ErrorText>
      {!!answer.trim() && <Button title="Post solution" variant="secondary" onPress={addSolution} loading={busy} />}
    </Card>
  );
}

type SolutionProps = {
  solution: Solution;
  /** Only the person who asked says whether it worked. */
  canMark: boolean;
  canEdit: boolean;
  busy: boolean;
  run: (action: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;
};

function SolutionBox({ solution, canMark, canEdit, busy, run }: SolutionProps) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(solution.body);

  const mark = (worked: boolean) => run(supabase.rpc('mark_solution', { solution_id: solution.id, worked }));

  async function save() {
    const done = await run(supabase.from('solutions').update({ body: body.trim() }).eq('id', solution.id));
    if (done) setEditing(false);
  }

  return (
    <View style={[styles.solution, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.tags}>
        <Tag text={`Solution by ${personName(solution.solver)}`} />
        {solution.outcome === 'worked' && <Tag text="✓ Confirmed fix" />}
        {solution.outcome === 'did_not_work' && <Tag text="✕ Tried, did not work" />}
      </View>

      {editing ? (
        <>
          <Field label="Solution" value={body} onChangeText={setBody} multiline />
          <Button title="Save" onPress={save} loading={busy} disabled={!body.trim()} />
          <Button title="Cancel" variant="plain" onPress={() => setEditing(false)} disabled={busy} />
        </>
      ) : (
        <>
          <ThemedText>{solution.body}</ThemedText>
          <EditedLabel name={solution.edited_at ? personName(solution.editor) : null} at={solution.edited_at} />
        </>
      )}

      <View style={styles.footer}>
        <View style={styles.row}>
          {canEdit && !editing && <TextButton title="Edit" onPress={() => setEditing(true)} />}
          {canEdit && !editing && (
            <TextButton
              title="Delete"
              danger
              disabled={busy}
              onPress={() => run(supabase.from('solutions').delete().eq('id', solution.id))}
            />
          )}
        </View>
        {canMark && (
          <View style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary">
              Did it work?
            </ThemedText>
            <TextButton title="✓ Yes" onPress={() => mark(true)} disabled={busy} />
            <TextButton title="✕ No" danger onPress={() => mark(false)} disabled={busy} />
          </View>
        )}
      </View>
    </View>
  );
}

export function Tag({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold">{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  tags: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  tag: { paddingVertical: Spacing.half, paddingHorizontal: Spacing.two, borderRadius: 999 },
  solution: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
