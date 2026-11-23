<template>
  <form class="grid gap-4" @submit.prevent="onSubmit">
    <div class="flex flex-col gap-1.5">
      <Label for="serverUrl">{{ t('login.server') }}</Label>
      <Input id="serverUrl" v-model.trim="serverUrl" type="url"
        :placeholder="t('login.serverPlaceholder')"
        :disabled="loading" required />
    </div>

    <div class="flex flex-col gap-1.5">
      <Label for="username">{{ t('login.username') }}</Label>
      <Input id="username" v-model.trim="username" type="text"
        :placeholder="t('login.username')"
        :disabled="loading" required autocomplete="username" />
    </div>

    <div class="flex flex-col gap-1.5">
      <Label for="password">{{ t('login.password') }}</Label>
      <div class="relative">
        <Input id="password" v-model="password" :type="showPassword ? 'text' : 'password'"
          :placeholder="t('login.password')" class="pr-12"
          :disabled="loading" required autocomplete="current-password" />
        <button type="button"
          :aria-label="showPassword ? t('login.hidePassword') : t('login.showPassword')"
          class="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-text-muted hover:text-text-default transition-colors"
          :disabled="loading"
          @click="showPassword = !showPassword">
          <Eye v-if="!showPassword" class="size-4" />
          <EyeOff v-else class="size-4" />
        </button>
      </div>
    </div>

    <Button type="submit" :disabled="loading" class="w-full">
      {{ loading ? t('login.connecting') : t('login.signIn') }}
    </Button>

    <p v-if="error" class="text-error text-center text-sm">{{ error }}</p>
  </form>

  <!-- Quick Connect divider -->
  <div class="flex items-center gap-3 my-4">
    <div class="flex-1 h-px bg-border-input" />
    <span class="text-xs text-text-muted">{{ t('login.or') }}</span>
    <div class="flex-1 h-px bg-border-input" />
  </div>

  <div v-if="!quickConnectActive">
    <Button variant="outline" class="w-full" :disabled="!serverUrl" @click="startQuickConnect">
      {{ t('login.quickConnect') }}
    </Button>
    <p v-if="quickConnectError" class="text-error text-center text-sm mt-2">{{ quickConnectError }}</p>
  </div>

  <DeviceCodePanel v-else :code="quickConnectCode" :hint="t('login.quickConnectCode')" @cancel="cancelQuickConnect" />
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Eye, EyeOff } from 'lucide-vue-next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeviceCodeLogin } from '@/composables/useDeviceCodeLogin';
import type { AuthStep } from '@/domain';
import { useSessionStore } from '@/store/session-store';
import { authMessage } from '@/utils/authMessage';
import { validateServerUrl } from '@/utils/validateServerUrl';

import DeviceCodePanel from './DeviceCodePanel.vue';

const emit = defineEmits<{ step: [step: AuthStep] }>();
const { t } = useI18n();
const session = useSessionStore();

const jellyfinAccounts = session.connections.filter((c) => c.kind === 'jellyfin');
const serverUrl = ref(
  (session.active?.kind === 'jellyfin' ? session.active.baseUrl : undefined) ?? jellyfinAccounts[jellyfinAccounts.length - 1]?.baseUrl ?? '',
);
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

const {
  active: quickConnectActive, code: quickConnectCode, error: quickConnectError, start, cancel: cancelQuickConnect,
} = useDeviceCodeLogin((step) => emit('step', step));

async function onSubmit() {
  error.value = null;
  const urlError = validateServerUrl(serverUrl.value);
  if (urlError) { error.value = urlError; return; }
  loading.value = true;
  try {
    emit('step', await session.signInWithPassword('jellyfin', serverUrl.value, username.value, password.value));
  } catch (e) {
    error.value = authMessage(t, e);
    loading.value = false;
  }
}

function startQuickConnect() {
  const urlError = validateServerUrl(serverUrl.value);
  if (urlError) { quickConnectError.value = urlError; return; }
  start('jellyfin', serverUrl.value);
}

onUnmounted(cancelQuickConnect);
</script>
