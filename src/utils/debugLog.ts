import { reactive } from 'vue';

export interface LogEntry {
    ts: number;
    source: 'vue' | 'kotlin';
    message: string;
}

const MAX_ENTRIES = 500;

const state = reactive({
    entries: [] as LogEntry[],
});

export function debugLog(message: string, source: 'vue' | 'kotlin' = 'vue') {
    state.entries.push({ ts: Date.now(), source, message });
    if (state.entries.length > MAX_ENTRIES) state.entries.splice(0, state.entries.length - MAX_ENTRIES);
    // Still log to console for adb logcat / devtools
    if (source === 'vue') console.log(message);
}

export function getLogEntries(): LogEntry[] {
    return state.entries;
}

export function clearLogs() {
    state.entries.splice(0);
}

export function dumpLogs(): string {
    return state.entries.map(e => {
        const d = new Date(e.ts);
        const time = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
        return `${time} [${e.source}] ${e.message}`;
    }).join('\n');
}
