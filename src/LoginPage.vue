<template>
  <div class="login-root">
    <div class="login-card">
      <h1 class="app-title">Jellyfin Client</h1>

      <form @submit.prevent="onSubmit" class="login-form">
        <div class="field">
          <label for="serverUrl">Serveur</label>
          <input id="serverUrl" v-model.trim="serverUrl" type="url" placeholder="http://localhost:8096 ou https://exemple.tld" :disabled="loading" required />
        </div>

        <div class="field">
          <label for="username">Utilisateur</label>
          <input id="username" v-model.trim="username" type="text" placeholder="Nom d’utilisateur" :disabled="loading" required autocomplete="username" />
        </div>

        <div class="field">
          <label for="password">Mot de passe</label>
          <input id="password" v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Mot de passe" :disabled="loading" required autocomplete="current-password" />
          <label class="showpass">
            <input type="checkbox" v-model="showPassword" :disabled="loading" /> Afficher
          </label>
        </div>

        <div class="actions">
          <button class="btn primary" type="submit" :disabled="loading">{{ loading ? 'Connexion...' : 'Se connecter' }}</button>
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useJellyfinStore } from './store/jellyfin-store'
import { useRouter } from 'vue-router'

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
    loading.value = false
  }
}
</script>

<style scoped>
/* Style simplifié, adapte comme dans l'exemple login précédent */
.login-root {
  height: 100vh;
  display: grid;
  place-items: center;
  background: #121212;
  color: white;
  padding-top: env(safe-area-inset-top, 0px);
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-sizing: border-box;
  overflow: hidden;
}
.login-card {
  width: min(92vw, 420px);
  padding: 24px;
  background: rgba(30, 30, 40, 0.85);
  border-radius: 12px;
}
.app-title {
  text-align: center;
  margin-bottom: 20px;
  font-size: 1.8rem;
}
.login-form {
  display: grid;
  gap: 15px;
}
.field {
  display: flex;
  flex-direction: column;
}
input {
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #444;
  background-color: #222;
  color: white;
}
.btn.primary {
  background: #5f48ff;
  padding: 10px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: white;
  font-weight: bold;
}
.error-msg {
  color: #ff6b6b;
  margin-top: 10px;
  text-align: center;
}
.showpass {
  font-size: 0.875rem;
  margin-top: 5px;
  display: flex;
  align-items: center;
  gap: 5px;
  color: #bbb;
}
</style>
