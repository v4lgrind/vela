import { mount } from '@vue/test-utils';
import { Inbox } from 'lucide-vue-next';
import { describe, it, expect, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

import { i18n } from '@/i18n';

import { EmptyState, ListRow, PageHeader } from './index';

function makeRouter() {
  const Blank = { template: '<div />' };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'libraries', component: Blank },
      { path: '/settings', name: 'settings', component: Blank },
    ],
  });
}

function mountWith(component: object, options: Record<string, unknown> = {}) {
  const router = makeRouter();
  const wrapper = mount(component, { global: { plugins: [router, i18n] }, ...options });
  return { wrapper, router };
}

describe('PageHeader', () => {
  it('goes back to Home when there is no history entry', async () => {
    const { wrapper, router } = mountWith(PageHeader, { props: { title: 'Andor', back: true } });
    const replace = vi.spyOn(router, 'replace');
    await wrapper.get('button[aria-label]').trigger('click');
    expect(replace).toHaveBeenCalledWith({ name: 'libraries' });
  });

  it('calls onBack instead of the router when given one', async () => {
    const onBack = vi.fn();
    const { wrapper, router } = mountWith(PageHeader, { props: { title: 'Season 1', back: true, onBack } });
    const replace = vi.spyOn(router, 'replace');
    await wrapper.get('button[aria-label]').trigger('click');
    expect(onBack).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it('clamps long titles to two lines and keeps actions from shrinking', () => {
    const { wrapper } = mountWith(PageHeader, {
      props: { title: 'Astérix & Obélix : Le Combat des Chefs' },
      slots: { actions: '<button class="act">x</button>' },
    });
    expect(wrapper.get('h1').classes()).toContain('line-clamp-2');
    expect(wrapper.get('.act').element.parentElement?.classList.contains('shrink-0')).toBe(true);
  });
});

describe('ListRow', () => {
  it('is at least 48px high and shows a chevron when it links somewhere', () => {
    const { wrapper } = mountWith(ListRow, { props: { label: 'Theme', to: { name: 'settings' } } });
    expect(wrapper.classes()).toContain('min-h-12');
    expect(wrapper.find('.lucide-chevron-right').exists()).toBe(true);
  });

  it('has no chevron for a plain row', () => {
    const { wrapper } = mountWith(ListRow, { props: { label: 'Version', value: '1.0' } });
    expect(wrapper.find('.lucide-chevron-right').exists()).toBe(false);
  });
});

describe('EmptyState', () => {
  it('renders the given icon and the action slot', () => {
    const { wrapper } = mountWith(EmptyState, {
      props: { icon: Inbox, title: 'Nothing here' },
      slots: { action: '<button class="cta">Browse</button>' },
    });
    expect(wrapper.find('.lucide-inbox').exists()).toBe(true);
    expect(wrapper.find('.cta').exists()).toBe(true);
    expect(wrapper.text()).toContain('Nothing here');
  });
});
