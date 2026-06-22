import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { debugLog, getLogEntries, clearLogs, dumpLogs } from './debugLog';

describe('debugLog', () => {
  beforeEach(() => {
    clearLogs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records entries with a source and timestamp', () => {
    debugLog('hello');
    const entries = getLogEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('hello');
    expect(entries[0].source).toBe('vue');
    expect(typeof entries[0].ts).toBe('number');
  });

  it('mirrors vue-sourced logs to console but not kotlin-sourced ones', () => {
    debugLog('from vue', 'vue');
    debugLog('from kotlin', 'kotlin');
    expect(console.log).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('from vue');
  });

  it('clearLogs empties the buffer', () => {
    debugLog('a');
    debugLog('b');
    clearLogs();
    expect(getLogEntries()).toHaveLength(0);
  });

  it('caps the buffer at 500 entries (drops oldest)', () => {
    for (let i = 0; i < 520; i++) debugLog(`m${i}`);
    const entries = getLogEntries();
    expect(entries).toHaveLength(500);
    expect(entries[0].message).toBe('m20');
    expect(entries[entries.length - 1].message).toBe('m519');
  });

  it('dumpLogs renders "HH:MM:SS.mmm [source] message" lines', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 17, 9, 8, 7, 6));
    debugLog('boot', 'kotlin');
    expect(dumpLogs()).toBe('09:08:07.006 [kotlin] boot');
    vi.useRealTimers();
  });
});
