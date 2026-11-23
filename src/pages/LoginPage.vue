<template>
  <div class="grid min-h-dvh place-items-center bg-background safe-pt safe-pb overflow-auto py-8">
    <div class="w-[min(92vw,420px)] flex flex-col gap-4">

      <!-- Plex: Home profile, then server -->
      <Card v-if="pendingStep" class="bg-surface-raised/85 border-border-default">
        <CardHeader>
          <CardTitle class="text-center text-3xl font-bold">Vela</CardTitle>
        </CardHeader>
        <CardContent>
          <AuthStepPicker :step="pendingStep" @next="enter" @cancel="pendingStep = null" />
        </CardContent>
      </Card>

      <!-- Saved accounts -->
      <Card v-else-if="!showNewServer" class="bg-surface-raised/85 border-border-default">
        <CardHeader>
          <CardTitle class="text-center text-2xl font-bold">Vela</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-3">
          <p class="text-xs text-text-muted text-center mb-1">{{ t('login.selectAccount') }}</p>
          <div
            v-for="s in session.connections"
            :key="s.tokenKey"
            class="flex items-center w-full rounded-xl border border-border-input bg-surface-raised hover:bg-surface-hover transition-colors"
          >
            <button class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left" @click="quickSwitch(s)">
              <span class="size-10 overflow-hidden rounded-full bg-accent-purple/20 flex items-center justify-center shrink-0">
                <img v-if="s.user.avatarUrl" :src="s.user.avatarUrl" alt="" class="size-full object-cover" />
                <span v-else class="text-accent-purple font-bold text-base uppercase">{{ s.user.name.charAt(0) }}</span>
              </span>
              <span class="min-w-0">
                <span class="block text-sm font-medium text-text-heading truncate">{{ s.user.name }}</span>
                <span class="block text-xs text-text-muted truncate">{{ s.serverName }} · {{ t(`login.kind.${s.kind}`) }}</span>
              </span>
            </button>
            <button
              class="flex size-11 shrink-0 items-center justify-center rounded-lg mr-1 text-text-muted hover:text-error transition-colors"
              :aria-label="t('login.removeAccount', { name: s.user.name, server: s.serverName })"
              @click="removeAccount(s)"
            >
              <Trash2 class="size-4" />
            </button>
          </div>
          <Separator />
          <button class="text-sm text-accent-purple hover:underline text-center py-1" @click="showNewServer = true">
            + {{ t('login.addServer') }}
          </button>
        </CardContent>
      </Card>

      <!-- New server -->
      <Card v-else class="bg-surface-raised/85 border-border-default">
        <CardHeader>
          <div class="flex items-center gap-2">
            <button
              v-if="session.connections.length > 0"
              :aria-label="t('common.back')"
              class="flex size-11 items-center justify-center rounded-lg hover:bg-surface-hover transition-colors"
              @click="showNewServer = false"
            >
              <ArrowLeft class="size-4 text-text-muted" />
            </button>
            <CardTitle class="text-center text-3xl font-bold flex-1">Vela</CardTitle>
          </div>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <Tabs v-model="serverKind" class="w-full">
            <TabsList class="grid w-full grid-cols-2" :aria-label="t('login.serverType')">
              <TabsTrigger value="jellyfin">{{ t('login.kind.jellyfin') }}</TabsTrigger>
              <TabsTrigger value="plex">{{ t('login.kind.plex') }}</TabsTrigger>
            </TabsList>
          </Tabs>
          <JellyfinSignIn v-if="serverKind === 'jellyfin'" @step="enter" />
          <PlexSignIn v-else @step="enter" />
        </CardContent>
      </Card>

      <p v-if="switchError" class="text-error text-center text-sm">{{ switchError }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, Trash2 } from 'lucide-vue-next';

import AuthStepPicker from '@/components/login/AuthStepPicker.vue';
import JellyfinSignIn from '@/components/login/JellyfinSignIn.vue';
import PlexSignIn from '@/components/login/PlexSignIn.vue';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AuthStep, ServerConnection, ServerKind } from '@/domain';
import { useSessionStore } from '@/store/session-store';
import { authMessage } from '@/utils/authMessage';

type PendingStep = Exclude<AuthStep, { step: 'connected' }>;

const { t } = useI18n();
const session = useSessionStore();
const router = useRouter();
const route = useRoute();

// Decided once: a sign-in saves the account before it finishes, and the form must stay mounted.
const showNewServer = ref(session.connections.length === 0);
const serverKind = ref<ServerKind>(session.active?.kind ?? 'jellyfin');
/** A sign-in waiting for the user's choice (Plex Home profile, server). */
const pendingStep = ref<PendingStep | null>(null);
const switchError = ref<string | null>(null);

async function enter(step: AuthStep) {
  const settled = await session.settle(step);
  if (settled.step === 'connected') {
    pendingStep.value = null;
    router.push({ name: 'libraries' });
  } else {
    pendingStep.value = settled;
  }
}

/** Forgets a saved account and its token; downloads made from it stay on the device. */
async function removeAccount(connection: ServerConnection) {
  if (!confirm(t('login.confirmRemoveAccount', { name: connection.user.name, server: connection.serverName }))) return;
  await session.forget(connection.tokenKey);
  if (session.connections.length === 0) showNewServer.value = true;
}

async function quickSwitch(connection: ServerConnection) {
  if (await session.switchTo(connection.tokenKey)) router.push({ name: 'libraries' });
  else showNewServer.value = true;
}

// Settings → "Switch Plex profile" lands here with ?switch=profile.
onMounted(async () => {
  if (route.query.switch !== 'profile') return;
  try {
    const step = await session.switchProfile();
    if (step) await enter(step);
  } catch (e) {
    switchError.value = authMessage(t, e);
  }
});
</script>
