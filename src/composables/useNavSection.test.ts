import { describe, it, expect } from 'vitest';

import { resolveNavSection } from './useNavSection';

describe('resolveNavSection', () => {
  it('maps tab routes to their own section', () => {
    expect(resolveNavSection('libraries', 'search')).toBe('home');
    expect(resolveNavSection('libraryItem', 'home')).toBe('library');
    expect(resolveNavSection('offline', null)).toBe('downloads');
    expect(resolveNavSection('logs', null)).toBe('settings');
  });

  it('keeps the section a detail page was opened from', () => {
    expect(resolveNavSection('ItemDetails', 'library')).toBe('library');
    expect(resolveNavSection('PersonDetail', 'search')).toBe('search');
  });

  it('falls back to Home for a detail page opened directly', () => {
    expect(resolveNavSection('ItemDetails', null)).toBe('home');
    expect(resolveNavSection(undefined, null)).toBe('home');
  });
});
