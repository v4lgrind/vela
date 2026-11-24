import { describe, expect, it } from 'vitest';

import { srtToVtt } from './srtToVtt';

describe('srtToVtt', () => {
  it('adds the header and converts the timestamps', () => {
    const srt = '﻿1\r\n00:00:01,500 --> 00:00:03,000\r\nHello, world\r\n\r\n2\r\n00:01:02,003 --> 00:01:04,000\r\nBye\r\n';
    expect(srtToVtt(srt)).toBe('WEBVTT\n\n1\n00:00:01.500 --> 00:00:03.000\nHello, world\n\n2\n00:01:02.003 --> 00:01:04.000\nBye\n');
  });
});
