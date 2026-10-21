<template>
  <Dialog :open="open" @update:open="(v: boolean) => emit('update:open', v)">
    <DialogContent class="z-300 max-w-sm bg-surface-raised border-border-default">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-text-heading">
          <Airplay class="size-5" /> AirPlay
        </DialogTitle>
        <DialogDescription class="text-text-muted text-sm">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <!-- Connected -->
      <div v-if="audioStore.airplayDevice && step === 'list'" class="flex flex-col gap-3">
        <div class="flex items-center gap-3 rounded-xl bg-accent-purple/10 px-4 py-3 text-accent-purple">
          <Tv class="size-5 shrink-0" />
          <span class="font-semibold truncate">{{ audioStore.airplayDevice }}</span>
        </div>
        <Button variant="outline" class="w-full" @click="disconnect">{{ t('airplay.stop') }}</Button>
      </div>

      <!-- Device list -->
      <ul v-else-if="step === 'list'" class="flex flex-col gap-1 list-none p-0 m-0">
        <li v-if="!devices.length" class="flex items-center gap-2 py-4 text-sm text-text-muted">
          <Loader2 class="size-4 animate-spin" /> {{ t('airplay.searching') }}
        </li>
        <li v-for="d in devices" :key="d.id">
          <button class="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/5 active:bg-white/10 cursor-pointer"
            :disabled="busyId !== null" @click="choose(d)">
            <Tv v-if="d.model.startsWith('AppleTV')" class="size-5 text-text-muted shrink-0" />
            <Speaker v-else class="size-5 text-text-muted shrink-0" />
            <span class="flex-1 min-w-0">
              <span class="block font-medium text-text-heading truncate">{{ d.name }}</span>
              <span v-if="d.needsPin && !d.paired" class="block text-xs text-text-subtle">{{ t('airplay.needsPin') }}</span>
            </span>
            <Loader2 v-if="busyId === d.id" class="size-4 animate-spin text-text-muted" />
          </button>
        </li>
      </ul>

      <!-- Pairing -->
      <div v-else-if="step === 'waitingPin' || step === 'pairing'" class="flex items-center gap-2 py-4 text-sm text-text-muted">
        <Loader2 class="size-4 animate-spin" /> {{ step === 'waitingPin' ? t('airplay.askingCode') : t('airplay.pairing') }}
      </div>
      <form v-else-if="step === 'enterPin'" class="flex flex-col gap-3" @submit.prevent="submitPin">
        <Input v-model="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="8" :placeholder="t('airplay.pin')"
          class="text-center text-2xl tracking-[0.5em] h-14" autofocus />
        <Button type="submit" class="w-full" :disabled="pin.length < 4">{{ t('airplay.pair') }}</Button>
      </form>

      <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { PluginListenerHandle } from '@capacitor/core';
import { Airplay, Loader2, Speaker, Tv } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AirPlay, type AirPlayDevice } from '@/plugins/AirPlayPlugin';
import { useAudioPlayerStore } from '@/store/audio-player-store';

const { t } = useI18n();
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();

const audioStore = useAudioPlayerStore();
const devices = ref<AirPlayDevice[]>([]);
const step = ref<'list' | 'waitingPin' | 'enterPin' | 'pairing'>('list');
const busyId = ref<string | null>(null);
const pairingDevice = ref<AirPlayDevice | null>(null);
const pin = ref('');
const error = ref('');
const listeners: PluginListenerHandle[] = [];

const description = computed(() => {
  if (step.value === 'enterPin') return t('airplay.enterCode', { name: pairingDevice.value?.name ?? '' });
  if (audioStore.airplayDevice) return t('airplay.playingThrough');
  return t('airplay.description');
});

watch(() => props.open, async (open) => {
  if (open) {
    reset();
    listeners.push(await AirPlay.addListener('devicesChanged', (e) => { devices.value = e.devices; }));
    listeners.push(await AirPlay.addListener('pairingDone', onPairingDone));
    await AirPlay.startDiscovery();
  } else {
    await cleanup();
  }
});

onBeforeUnmount(cleanup);

function reset() {
  step.value = 'list';
  busyId.value = null;
  pin.value = '';
  error.value = '';
}

async function cleanup() {
  listeners.splice(0).forEach((l) => l.remove());
  if (step.value !== 'list') await AirPlay.cancelPairing().catch(() => {});
  await AirPlay.stopDiscovery().catch(() => {});
}

async function choose(device: AirPlayDevice) {
  error.value = '';
  busyId.value = device.id;
  try {
    const { needsPairing } = await AirPlay.connect({ id: device.id, volume: audioStore.volume });
    if (needsPairing) {
      await pair(device);
      return;
    }
    emit('update:open', false);
  } catch (e) {
    error.value = String((e as Error).message ?? e);
  } finally {
    busyId.value = null;
  }
}

async function pair(device: AirPlayDevice) {
  pairingDevice.value = device;
  step.value = 'waitingPin';
  await AirPlay.startPairing({ id: device.id });
  step.value = 'enterPin';
}

async function submitPin() {
  step.value = 'pairing';
  await AirPlay.submitPin({ pin: pin.value });
}

async function onPairingDone({ ok, error: message }: { ok: boolean; error?: string }) {
  const device = pairingDevice.value;
  reset();
  if (!ok || !device) {
    error.value = message ?? t('airplay.pairFailed');
    return;
  }
  await choose(device);
}

async function disconnect() {
  await AirPlay.disconnect();
  emit('update:open', false);
}
</script>
