<template>
  <div class="flex flex-col gap-3">
    <template v-if="step.step === 'choose-profile'">
      <p class="text-sm font-semibold text-text-heading text-center">{{ t('login.chooseProfile') }}</p>
      <div class="grid grid-cols-3 gap-3">
        <button
          v-for="profile in step.profiles"
          :key="profile.id"
          type="button"
          :disabled="busy"
          :aria-pressed="pinFor?.id === profile.id"
          class="flex flex-col items-center gap-2 rounded-xl p-2 transition-colors hover:bg-surface-hover disabled:opacity-60"
          @click="pickProfile(profile)"
        >
          <span class="relative size-16 overflow-hidden rounded-full bg-accent-purple/20 flex items-center justify-center">
            <img v-if="profile.avatarUrl" :src="profile.avatarUrl" alt="" class="size-full object-cover" />
            <span v-else class="text-accent-purple text-xl font-bold uppercase">{{ profile.name.charAt(0) }}</span>
          </span>
          <span class="flex max-w-full items-center gap-1 text-xs font-medium text-text-heading">
            <Lock v-if="profile.needsPin" class="size-3 shrink-0 text-text-muted" :aria-label="t('login.pinProtected')" />
            <span class="truncate">{{ profile.name }}</span>
          </span>
        </button>
      </div>

      <form v-if="pinFor" class="flex flex-col gap-2" @submit.prevent="submitPin">
        <Label for="profilePin">{{ t('login.pinFor', { name: pinFor.name }) }}</Label>
        <Input id="profilePin" ref="pinInput" v-model="pin" type="password" inputmode="numeric" autocomplete="off"
          maxlength="4" pattern="[0-9]*" :disabled="busy" required />
        <Button type="submit" :disabled="busy || pin.length < 4">{{ t('login.signIn') }}</Button>
      </form>
    </template>

    <template v-else-if="step.step === 'choose-server'">
      <p class="text-sm font-semibold text-text-heading text-center">{{ t('login.chooseServer') }}</p>
      <button
        v-for="server in step.servers"
        :key="server.id"
        type="button"
        :disabled="busy"
        class="flex items-center gap-3 w-full rounded-xl border border-border-input bg-surface-raised hover:bg-surface-hover px-4 py-3 text-left transition-colors disabled:opacity-60"
        @click="run(() => (step as ChooseServer).choose(server.id))"
      >
        <Server class="size-5 shrink-0 text-accent-purple" />
        <span class="min-w-0 flex-1 truncate text-sm font-medium text-text-heading">{{ server.name }}</span>
        <span v-if="!server.isOnline" class="text-xs text-text-muted">{{ t('login.serverOffline') }}</span>
      </button>
    </template>

    <div v-if="busy" class="flex items-center justify-center gap-2 text-xs text-text-muted">
      <Loader2 class="size-3.5 animate-spin" />
      <span>{{ t('login.connecting') }}</span>
    </div>
    <p v-if="error" class="text-error text-center text-sm">{{ error }}</p>
    <Button variant="link" class="text-xs text-text-muted" :disabled="busy" @click="emit('cancel')">{{ t('common.cancel') }}</Button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Loader2, Lock, Server } from 'lucide-vue-next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AuthProfile, AuthStep } from '@/domain';
import { authMessage } from '@/utils/authMessage';

type ChooseProfile = Extract<AuthStep, { step: 'choose-profile' }>;
type ChooseServer = Extract<AuthStep, { step: 'choose-server' }>;

const props = defineProps<{ step: ChooseProfile | ChooseServer }>();
const emit = defineEmits<{ next: [step: AuthStep]; cancel: [] }>();
const { t } = useI18n();

const busy = ref(false);
const error = ref<string | null>(null);
const pinFor = ref<AuthProfile | null>(null);
const pin = ref('');
const pinInput = ref<{ $el?: HTMLElement } | null>(null);

watch(() => props.step, () => {
  pinFor.value = null;
  pin.value = '';
  error.value = null;
});

async function run(choose: () => Promise<AuthStep>) {
  busy.value = true;
  error.value = null;
  try {
    emit('next', await choose());
  } catch (e) {
    error.value = authMessage(t, e, { 'invalid-credentials': pinFor.value ? 'login.wrongPin' : 'login.profileRefused' });
    pin.value = '';
  } finally {
    busy.value = false;
  }
}

async function pickProfile(profile: AuthProfile) {
  if (!profile.needsPin) {
    pinFor.value = null;
    await run(() => (props.step as ChooseProfile).choose(profile.id));
    return;
  }
  pinFor.value = profile;
  pin.value = '';
  error.value = null;
  await nextTick();
  (pinInput.value?.$el as HTMLInputElement | undefined)?.focus?.();
}

function submitPin() {
  const profile = pinFor.value;
  if (profile) run(() => (props.step as ChooseProfile).choose(profile.id, pin.value));
}
</script>
