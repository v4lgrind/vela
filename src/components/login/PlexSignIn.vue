<template>
  <div class="grid gap-4">
    <p class="text-sm text-text-muted text-center">{{ t('login.plexIntro') }}</p>
    <Button v-if="!active" class="w-full" @click="start('plex')">{{ t('login.plexSignIn') }}</Button>
    <DeviceCodePanel v-else :code="code" :hint="t('login.plexLinkHint')" :url="verificationUrl" @cancel="cancel" />
    <p v-if="error" class="text-error text-center text-sm">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

import { Button } from '@/components/ui/button';
import { useDeviceCodeLogin } from '@/composables/useDeviceCodeLogin';
import type { AuthStep } from '@/domain';

import DeviceCodePanel from './DeviceCodePanel.vue';

const emit = defineEmits<{ step: [step: AuthStep] }>();
const { t } = useI18n();
const { active, code, verificationUrl, error, start, cancel } = useDeviceCodeLogin((step) => emit('step', step));

onUnmounted(cancel);
</script>
