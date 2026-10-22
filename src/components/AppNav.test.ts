import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

import { i18n } from '@/i18n';

import AppNav from './AppNav.vue';

afterEach(() => vi.unstubAllGlobals());

describe('AppNav bottom bar', () => {
  it('shares the bar width between tabs so long labels shrink instead of overflowing', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const Blank = { template: '<div />' };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: ['libraries', 'libraryList', 'search', 'offline', 'settings'].map((name) => ({ path: `/${name}`, name, component: Blank })),
    });
    router.push('/libraries');
    await router.isReady();
    const wrapper = mount(AppNav, { global: { plugins: [router, i18n] } });
    const tabs = wrapper.findAll('a');
    expect(tabs).toHaveLength(5);
    for (const tab of tabs) {
      expect(tab.classes()).toEqual(expect.arrayContaining(['flex-1', 'min-w-0']));
      expect(tab.get('span').classes()).toContain('truncate');
    }
  });
});

describe('AppNav rail', () => {
  it('stays 72px wide in landscape, the highlight hugging the icon only', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const Blank = { template: '<div />' };
    const router = createRouter({
      history: createMemoryHistory(),
      routes: ['libraries', 'libraryList', 'search', 'offline', 'settings'].map((name) => ({ path: `/${name}`, name, component: Blank })),
    });
    router.push('/libraries');
    await router.isReady();
    const wrapper = mount(AppNav, { global: { plugins: [router, i18n] } });
    expect(wrapper.get('nav').classes()).toContain('w-[72px]');
    const active = wrapper.get('a[aria-current="page"]');
    expect(active.classes().join(' ')).not.toMatch(/bg-/);
    expect(active.get('span').classes().join(' ')).toMatch(/bg-accent-purple/);
  });
});
