<template>
  <div class="grid min-h-dvh place-items-center bg-background safe-pt safe-pb overflow-auto py-8">
    <div class="w-[min(92vw,420px)] flex flex-col gap-4">

      <!-- Saved servers -->
      <template v-if="jellyfin.savedServers.length > 0 && !showNewServer">
        <Card class="bg-surface-raised/85 border-border-default">
          <CardHeader>
            <CardTitle class="text-center text-2xl font-bold">Jellyfin Client</CardTitle>
          </CardHeader>
          <CardContent class="flex flex-col gap-3">
            <p class="text-xs text-text-muted text-center mb-1">Select an account to continue</p>
            <button
              v-for="s in jellyfin.savedServers"
              :key="s.serverUrl + s.userId"
              class="flex items-center gap-3 w-full rounded-xl border border-border-input bg-surface-raised hover:bg-surface-hover px-4 py-3 text-left transition-colors"
              @click="quickSwitch(s)"
            >
              <div class="size-10 rounded-full bg-accent-purple/20 flex items-center justify-center shrink-0">
                <span class="text-accent-purple font-bold text-base uppercase">{{ s.userName.charAt(0) }}</span>
              </div>
              <div class="min-w-0">
                <p class="text-sm font-medium text-text-heading truncate">{{ s.userName }}</p>
                <p class="text-xs text-text-muted truncate">{{ s.serverName }}</p>
              </div>
            </button>
            <Separator />
            <button
              class="text-sm text-accent-purple hover:underline text-center py-1"
              @click="showNewServer = true"
            >
              + Add new server
            </button>
          </CardContent>
        </Card>
      </template>

      <!-- Login form -->
      <Card v-else class="bg-surface-raised/85 border-border-default">
        <CardHeader>
          <div class="flex items-center gap-2">
            <button
              v-if="jellyfin.savedServers.length > 0 && showNewServer"
              @click="showNewServer = false"
              class="p-1 rounded-lg hover:bg-surface-hover transition-colors"
            >
              <ArrowLeft class="size-4 text-text-muted" />
            </button>
            <CardTitle class="text-center text-3xl font-bold flex-1">Jellyfin Client</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="onSubmit" class="grid gap-4">
            <div class="flex flex-col gap-1.5">
              <Label for="serverUrl">Server</Label>
              <Input id="serverUrl" v-model.trim="serverUrl" type="url"
                placeholder="http://localhost:8096 or https://example.com"
                :disabled="loading" required />
            </div>

            <div class="flex flex-col gap-1.5">
              <Label for="username">Username</Label>
              <Input id="username" v-model.trim="username" type="text"
                placeholder="Username"
                :disabled="loading" required autocomplete="username" />
            </div>

            <div class="flex flex-col gap-1.5">
              <Label for="password">Password</Label>
              <div class="relative">
                <Input id="password" v-model="password" :type="showPassword ? 'text' : 'password'"
                  placeholder="Password" class="pr-10"
                  :disabled="loading" required autocomplete="current-password" />
                <button type="button"
                  class="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text-default transition-colors"
                  :disabled="loading"
                  @click="showPassword = !showPassword">
                  <Eye v-if="!showPassword" class="size-4" />
                  <EyeOff v-else class="size-4" />
                </button>
              </div>
            </div>

            <Button type="submit" :disabled="loading" class="w-full">
              {{ loading ? 'Connecting...' : 'Sign in' }}
            </Button>

            <p v-if="error" class="text-error text-center text-sm">{{ error }}</p>
          </form>

          <!-- Quick Connect divider -->
          <div class="flex items-center gap-3 my-4">
            <div class="flex-1 h-px bg-border-input" />
            <span class="text-xs text-text-muted">or</span>
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
              Use Quick Connect
            </Button>
            <p v-if="quickConnectError" class="text-error text-center text-sm mt-2">{{ quickConnectError }}</p>
          </div>

          <div v-else class="rounded-xl border border-border-input bg-surface-raised/60 p-4 text-center">
            <p class="text-xs text-text-muted mb-3">Enter this code in your Jellyfin web client</p>
            <div class="flex justify-center gap-2 mb-3">
              <span
                v-for="(ch, i) in quickConnectCode.split('')"
                :key="i"
                class="w-9 h-11 flex items-center justify-center rounded-lg bg-surface border border-border-input text-xl font-mono font-bold text-text-heading"
              >{{ ch }}</span>
            </div>
            <div class="flex items-center justify-center gap-2 text-xs text-text-muted">
              <Loader2 class="size-3.5 animate-spin" />
              <span>Waiting for approval…</span>
            </div>
            <button
              class="mt-3 text-xs text-text-muted hover:text-text-default underline"
              @click="cancelQuickConnect"
            >Cancel</button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useJellyfinStore } from '@/store/jellyfin-store'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-vue-next'
import type { SavedServer } from '@/store/jellyfin-store'
import { validateServerUrl } from '@/utils/validateServerUrl'

const jellyfin = useJellyfinStore()
const router = useRouter()

const serverUrl = ref(jellyfin.serverUrl)
const username = ref('')
const password = ref('')
const showPassword = ref(false)
const showNewServer = ref(false)

const loading = ref(false)
const error = ref<string | null>(null)

// Quick Connect state
const quickConnectActive = ref(false)
const quickConnectCode = ref('')
const quickConnectSecret = ref('')
const quickConnectError = ref<string | null>(null)
let qcPollTimer: ReturnType<typeof setInterval> | null = null
let qcTimeoutTimer: ReturnType<typeof setTimeout> | null = null
let qcAuthenticating = false

async function onSubmit() {
  error.value = null
  const urlError = validateServerUrl(serverUrl.value)
  if (urlError) { error.value = urlError; return; }
  loading.value = true
  try {
    await jellyfin.login(serverUrl.value, username.value, password.value)
    router.push({ name: 'libraries' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Login failed. Please check your credentials.'
    loading.value = false
  }
}

async function quickSwitch(server: SavedServer) {
  await jellyfin.switchServer(server)
  router.push({ name: 'libraries' })
}

async function startQuickConnect() {
  quickConnectError.value = null
  const urlError = validateServerUrl(serverUrl.value)
  if (urlError) { quickConnectError.value = urlError; return; }
  try {
    const result = await jellyfin.quickConnectInitiate(serverUrl.value)
    quickConnectCode.value = result.Code
    quickConnectSecret.value = result.Secret
    quickConnectActive.value = true

    qcPollTimer = setInterval(async () => {
      if (qcAuthenticating) return
      try {
        const poll = await jellyfin.quickConnectPoll(serverUrl.value, quickConnectSecret.value)
        if (poll.Authenticated) {
          qcAuthenticating = true
          const secret = quickConnectSecret.value
          const server = serverUrl.value
          cancelQuickConnect()
          try {
            await jellyfin.quickConnectAuthenticate(server, secret)
            router.push({ name: 'libraries' })
          } catch (e: any) {
            qcAuthenticating = false
            quickConnectError.value = `Sign-in failed: ${e?.message ?? e}`
          }
        }
      } catch {
        // poll errors are transient — keep polling
      }
    }, 2000)

    // Auto-cancel after 5 minutes
    qcTimeoutTimer = setTimeout(() => {
      cancelQuickConnect()
      quickConnectError.value = 'Quick Connect timed out. Please try again.'
    }, 5 * 60 * 1000)
  } catch (e: any) {
    const status = e?.response?.status
    if (status === 400 || status === 401 || status === 403) {
      quickConnectError.value = 'Quick Connect is disabled. Enable it in Jellyfin: Dashboard → Advanced → Quick Connect.'
    } else if (status === 404) {
      quickConnectError.value = 'Quick Connect is not supported by this server version.'
    } else {
      quickConnectError.value = `Quick Connect failed (${status ?? 'network error'}): ${e?.message ?? e}`
    }
  }
}

function cancelQuickConnect() {
  quickConnectActive.value = false
  quickConnectCode.value = ''
  quickConnectSecret.value = ''
  qcAuthenticating = false
  if (qcPollTimer) { clearInterval(qcPollTimer); qcPollTimer = null }
  if (qcTimeoutTimer) { clearTimeout(qcTimeoutTimer); qcTimeoutTimer = null }
}

onUnmounted(() => cancelQuickConnect())
</script>
