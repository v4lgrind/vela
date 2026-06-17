import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AppToast from './AppToast.vue';
import { useToast } from '@/composables/useToast';

const { toasts, showError, showSuccess } = useToast();

describe('AppToast.vue', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    toasts.value.splice(0, toasts.value.length);
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('renders one toast per item with its message text', async () => {
    showError('network down');
    showSuccess('saved');
    const wrapper = mount(AppToast, { attachTo: host });
    await flushPromises();

    const text = document.body.textContent ?? '';
    expect(text).toContain('network down');
    expect(text).toContain('saved');

    wrapper.unmount();
  });

  it('reacts to toasts being dismissed from the shared store', async () => {
    showError('temporary');
    const wrapper = mount(AppToast, { attachTo: host });
    await flushPromises();
    expect(document.body.textContent).toContain('temporary');

    // Remove via the shared composable state
    toasts.value.splice(0, toasts.value.length);
    await flushPromises();
    expect(document.body.textContent).not.toContain('temporary');

    wrapper.unmount();
  });
});
