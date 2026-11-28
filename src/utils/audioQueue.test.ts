import { describe, expect, it } from 'vitest';
import { freshTracks, indexAfterMove, moveItem, radioQueue, shuffleAround } from './audioQueue';

describe('shuffleAround', () => {
  it('keeps the chosen item first and every item once', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const result = shuffleAround(items, 2);
    expect(result[0]).toBe('c');
    expect([...result].sort()).toEqual(items);
  });

  it('shuffles everything when keepIndex is out of range', () => {
    expect(shuffleAround(['a', 'b'], -1, () => 0).sort()).toEqual(['a', 'b']);
  });

  it('does not mutate the input', () => {
    const items = ['a', 'b', 'c'];
    shuffleAround(items, 0);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('moveItem', () => {
  it('moves forward and backward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
});

describe('indexAfterMove', () => {
  it('follows the playing track when it is moved', () => {
    expect(indexAfterMove(1, 1, 3)).toBe(3);
  });

  it('shifts when a track crosses the playing one', () => {
    expect(indexAfterMove(2, 0, 3)).toBe(1);
    expect(indexAfterMove(2, 4, 1)).toBe(3);
  });

  it('stays put when the move does not cross it', () => {
    expect(indexAfterMove(2, 3, 4)).toBe(2);
    expect(indexAfterMove(2, 0, 1)).toBe(2);
  });

  it('matches the actual position after moveItem', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    for (let from = 0; from < 5; from++) {
      for (let to = 0; to < 5; to++) {
        const moved = moveItem(items, from, to);
        expect(moved[indexAfterMove(2, from, to)]).toBe('c');
      }
    }
  });
});

describe('freshTracks', () => {
  const track = (id: string) => ({ id });

  it('drops tracks already in the queue', () => {
    expect(freshTracks([track('a'), track('b')], [track('b'), track('c')])).toEqual([track('c')]);
  });

  it('starts a new round once every candidate was queued', () => {
    expect(freshTracks([track('a'), track('b')], [track('b'), track('a')])).toEqual([track('b'), track('a')]);
  });
});

describe('radioQueue', () => {
  const seed = { id: 's' };
  const x = { id: 'x' };
  const y = { id: 'y' };

  it('puts the seed first without repeating it', () => {
    expect(radioQueue(seed, [x, { id: 's' }, y])).toEqual([seed, x, y]);
  });

  it('keeps the mix as is without a seed', () => {
    expect(radioQueue(null, [x])).toEqual([x]);
  });
});
