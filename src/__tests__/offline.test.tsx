 
/**
 * What a page does when the server cannot be reached or refuses: it must show the
 * error and keep what it already had, never crash or show an empty page as if all was well.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { forgetRows, useRows } from '@/lib/use-rows';

type Row = { id: string };
const ok = (rows: Row[]) => Promise.resolve({ data: rows, error: null });
const failed = (message: string) => Promise.resolve({ data: null, error: { message } });

beforeEach(() => forgetRows());

describe('loading a list', () => {
  it('shows the rows when the server answers', async () => {
    const { result } = await renderHook(() => useRows<Row>('a', () => ok([{ id: '1' }])));
    await waitFor(() => expect(result.current.rows).toEqual([{ id: '1' }]));
    expect(result.current.error).toBeNull();
  });

  it('shows the error and stops the spinner when the server cannot be reached', async () => {
    const { result } = await renderHook(() => useRows<Row>('b', () => failed('Network request failed')));
    await waitFor(() => expect(result.current.error).toBe('Network request failed'));
    expect(result.current.loading).toBe(false);
    expect(result.current.rows).toEqual([]);
  });

  it('keeps the rows it had when a later reload fails', async () => {
    let online = true;
    const { result } = await renderHook(() => useRows<Row>('c', () => (online ? ok([{ id: '1' }]) : failed('offline'))));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    online = false;
    await act(async () => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe('offline'));
    expect(result.current.rows).toEqual([{ id: '1' }]);
  });

  it('shows a page opened before at once, then brings it up to date', async () => {
    const first = await renderHook(() => useRows<Row>('d', () => ok([{ id: 'old' }])));
    await waitFor(() => expect(first.result.current.rows).toHaveLength(1));
    await first.unmount();
    const again = await renderHook(() => useRows<Row>('d', () => ok([{ id: 'old' }])));
    expect(again.result.current.loading).toBe(false);
    expect(again.result.current.rows).toEqual([{ id: 'old' }]);
  });

  it('forgets everything when another person signs in', async () => {
    const first = await renderHook(() => useRows<Row>('e', () => ok([{ id: 'private' }])));
    await waitFor(() => expect(first.result.current.rows).toHaveLength(1));
    await first.unmount();
    forgetRows();
    const other = await renderHook(() => useRows<Row>('e', () => failed('no access')));
    expect(other.result.current.rows).toEqual([]);
  });
});
