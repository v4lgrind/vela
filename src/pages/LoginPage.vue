<template>
  <div class="grid min-h-dvh place-items-center bg-background safe-pt safe-pb overflow-auto py-8">
    <div class="w-[min(92vw,420px)] flex flex-col gap-4">

      <!-- Saved servers -->
      <template v-if="session.connections.length > 0 && !showNewServer">
        <Card class="bg-surface-raised/85 border-border-default">
          <CardHeader>
            <CardTitle class="text-center text-2xl font-bold">Vela</CardTitle>
          </CardHeader>
          <CardContent class="flex flex-col gap-3">
            <p class="text-xs text-text-muted text-center mb-1">{{ t('login.selectAccount') }}</p>
            <button
              v-for="s in session.connections"
              :key="s.tokenKey"
              class="flex items-center gap-3 w-full rounded-xl border border-border-input bg-surface-raised hover:bg-surface-hover px-4 py-3 text-left transition-colors"
              @click="quickSwitch(s)"
            >
              <div class="size-10 rounded-full bg-accent-purple/20 flex items-center justify-center shrink-0">
                <span class="text-accent-purple font-bold text-base uppercase">{{ s.user.name.charAt(0) }}</span>
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium text-text-heading truncate">{{ s.user.name }}</p>
                <p class="text-xs text-text-muted truncate">{{ s.serverName }}</p>
              </div>
            </button>
            <Separator />
            <button
              class="text-sm text-accent-purple hover:underline text-center py-1"
              @click="showNewServer = true"
            >
              + {{ t('login.addServer') }}
            </button>
          </CardContent>
        </Card>
      </template>

      <!-- Login form -->
      <Card v-else class="bg-surface-raised/85 border-border-default">
        <CardHeader>
          <div class="flex items-center gap-2">
            <button
              v-if="session.connections.length > 0 && showNewServer"
              @click="showNewServer = false"
              :aria-label="t('common.back')"
              class="flex size-11 items-center justify-center rounded-lg hover:bg-surface-hover transition-colors"
            >
              <ArrowLeft class="size-4 text-text-muted" />
            </button>
            <CardTitle class="text-center text-3xl font-bold flex-1">Vela</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="onSubmit" class="grid gap-4">
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

          <!-- Quick Connect -->
          <div v-if="!quickConnectActive">
            <Button
              variant="outline"
              class="w-full"
              :disabled="!serverUrl"
              @click="startQuickConnect"
            >
              {{ t('login.quickConnect') }}
            </Button>
            <p v-if="quickConnectError" class="text-error text-center text-sm mt-2">{{ quickConnectError }}</p>
          </div>

          <div v-else class="rounded-xl border border-border-input bg-surface-raised/60 p-4 text-center">
            <p class="text-xs text-text-muted mb-3">{{ t('login.quickConnectCode') }}</p>
            <div class="flex justify-center gap-2 mb-3">
              <span
                v-for="(ch, i) in quickConnectCode.split('')"
                :key="i"
                class="w-9 h-11 flex items-center justify-center rounded-lg bg-surface border border-border-input text-xl font-mono font-bold text-text-heading"
              >{{ ch }}</span>
            </div>
            <div class="flex items-center justify-center gap-2 text-xs text-text-muted">
              <Loader2 class="size-3.5 animate-spin" />
              <span>{{ t('login.waitingApproval') }}</span>
            </div>
            <Button variant="link" class="mt-1 text-xs text-text-muted" @click="cancelQuickConnect">{{ t('common.cancel') }}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useSessionStore } from '@/store/session-store'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-vue-next'
import { AuthError } from '@/domain'
import type { AuthStep, DeviceCodeSession, ServerConnection } from '@/domain'
import { validateServerUrl } from '@/utils/validateServerUrl'

const { t } = useI18n()
const session = useSessionStore()
const router = useRouter()

const serverUrl = ref(session.active?.baseUrl ?? session.connections[session.connections.length - 1]?.baseUrl ?? '')
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const showNewServer = ref(false)

const loading = ref(false)
const error = ref<string | null>(null)

// Quick Connect state
const quickConnectActive = ref(false)
const quickConnectCode = ref('')
const quickConnectError = ref<string | null>(null)
const QC_POLL_INTERVAL_MS = 2000
let qcSession: DeviceCodeSession | null = null
let qcPollTimer: ReturnType<typeof setInterval> | null = null
let qcPolling = false

const AUTH_ERROR_KEYS: Record<AuthError['reason'], string> = {
  'invalid-credentials': 'login.failed',
  unreachable: 'login.unreachable',
  'device-code-disabled': 'login.qcDisabled',
  'device-code-unsupported': 'login.qcUnsupported',
  expired: 'login.qcTimeout',
  unknown: 'login.failed',
}

function authMessage(e: unknown): string {
  return t(e instanceof AuthError ? AUTH_ERROR_KEYS[e.reason] : 'login.failed')
}

function enter(step: AuthStep) {
  // Jellyfin sign-ins finish in one step; profile/server choices arrive with Plex.
  if (step.step === 'connected') router.push({ name: 'libraries' })
}

async function onSubmit() {
  error.value = null
  const urlError = validateServerUrl(serverUrl.value)
  if (urlError) { error.value = urlError; return; }
  loading.value = true
  try {
    enter(await session.signInWithPassword('jellyfin', serverUrl.value, username.value, password.value))
  } catch (e) {
    error.value = authMessage(e)
    loading.value = false
  }
}

async function quickSwitch(connection: ServerConnection) {
  if (await session.switchTo(connection.tokenKey)) router.push({ name: 'libraries' })
  else showNewServer.value = true
}

async function pollQuickConnect() {
  if (!qcSession || qcPolling) return
  qcPolling = true
  try {
    const state = await qcSession.poll()
    if (state.status === 'expired') {
      cancelQuickConnect()
      quickConnectError.value = t('login.qcTimeout')
    } else if (state.status === 'approved') {
      cancelQuickConnect()
      enter(await session.settle(state.next))
    }
  } catch {
    // Poll errors are transient: keep polling until the code expires.
  } finally {
    qcPolling = false
  }
}

async function startQuickConnect() {
  quickConnectError.value = null
  const urlError = validateServerUrl(serverUrl.value)
  if (urlError) { quickConnectError.value = urlError; return; }
  try {
    qcSession = await session.startDeviceCode('jellyfin', serverUrl.value)
    quickConnectCode.value = qcSession.challenge.code
    quickConnectActive.value = true
    qcPollTimer = setInterval(pollQuickConnect, QC_POLL_INTERVAL_MS)
  } catch (e) {
    quickConnectError.value = authMessage(e)
  }
}

function cancelQuickConnect() {
  qcSession?.cancel()
  qcSession = null
  quickConnectActive.value = false
  quickConnectCode.value = ''
  if (qcPollTimer) { clearInterval(qcPollTimer); qcPollTimer = null }
}

onUnmounted(() => cancelQuickConnect())
</script>
