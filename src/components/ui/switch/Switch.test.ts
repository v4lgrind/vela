import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';

import { Switch } from './index';

describe('Switch', () => {
  it('draws an outlined track and a grey thumb when off, readable on white and on black', () => {
    const track = mount(Switch, { props: { modelValue: false } }).get('button');
    expect(track.attributes('data-state')).toBe('unchecked');
    expect(track.classes()).toEqual(expect.arrayContaining(['data-[state=unchecked]:border-text-subtle', 'data-[state=unchecked]:bg-transparent']));
    expect(track.get('span').classes()).toContain('data-[state=unchecked]:bg-text-subtle');
  });
});
