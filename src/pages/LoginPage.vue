<template>
  <div class="grid h-dvh place-items-center bg-surface safe-pt safe-pb overflow-hidden">
    <Card class="w-[min(92vw,420px)] bg-surface-raised/85 border-border-default">
      <CardHeader>
        <CardTitle class="text-center text-3xl font-bold">Jellyfin Client</CardTitle>
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
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useJellyfinStore } from '@/store/jellyfin-store'
import { useRouter } from 'vue-router'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff } from 'lucide-vue-next'

const jellyfin = useJellyfinStore()
const router = useRouter()

const serverUrl = ref(jellyfin.serverUrl)
const username = ref('')
const password = ref('')
const showPassword = ref(false)

const loading = ref(false)
const error = ref<string | null>(null)

async function onSubmit() {
  error.value = null
  loading.value = true
  try {
    await jellyfin.login(serverUrl.value, username.value, password.value)

    router.push({ name: 'libraries' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Login failed. Please check your credentials.'
    loading.value = false
  }
}
</script>
