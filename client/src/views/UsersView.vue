<script setup lang="ts">
import { toast } from "../notifications/toast";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { Pencil, Plus, ShieldCheck, Users, X } from "lucide-vue-next";
import { api, type AuthUser, type UserRole } from "../api";
import { settingsApi, type AccessCatalog } from "../settingsApi";
import { useAuthStore } from "../stores/auth";

type ModalMode = "create" | "edit" | null;

const access = ref<AccessCatalog>();
const selection = ref("role:USER");
const overrides = ref<Record<string, boolean>>({});
const users = ref<AuthUser[]>([]);
const modalMode = ref<ModalMode>(null);
const editingUserId = ref<number | null>(null);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const form = ref({ name: "", email: "", password: "", role: "USER" as UserRole, active: true });
const auth = useAuthStore();
const dialog = ref<HTMLElement>();
let returnFocus: HTMLElement | null = null;
let previousOverflow = "";
let previousInert = false;
const restoreModal = () => {
  const app = document.getElementById("app");
  if (app) app.inert = previousInert;
  document.body.style.overflow = previousOverflow;
  returnFocus?.focus();
};
watch(modalMode, async (value) => {
  if (value) {
    returnFocus = document.activeElement as HTMLElement;
    previousOverflow = document.body.style.overflow;
    const app = document.getElementById("app");
    previousInert = app?.inert ?? false;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    await nextTick();
    dialog.value?.querySelector<HTMLInputElement>("input")?.focus();
  } else restoreModal();
});
onUnmounted(() => {
  if (modalMode.value) restoreModal();
});
const modalKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeModal();
  }
  if (event.key !== "Tab") return;
  const elements = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),summary") ?? []
  ).filter((el) => el.getClientRects().length);
  const first = elements[0],
    last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
};
const permissionGroups = computed(() => [...new Set(access.value?.catalog.map((p) => p.group) ?? [])]);
const basePermissions = computed(() =>
  selection.value.startsWith("profile:")
    ? (access.value?.profiles.find((p) => p.id === Number(selection.value.split(":")[1]))?.permissions ?? [])
    : (access.value?.defaults[selection.value.split(":")[1]] ?? [])
);
const allowed = (key: string) => selection.value === "role:ADMIN" || (overrides.value[key] ?? basePermissions.value.includes(key));
const setOverride = (key: string, event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  if (value === "inherit") delete overrides.value[key];
  else overrides.value[key] = value === "allow";
};
const accessInput = () => ({
  role: (selection.value.startsWith("profile:") ? "USER" : selection.value.split(":")[1]) as UserRole,
  profileId: selection.value.startsWith("profile:") ? Number(selection.value.split(":")[1]) : null,
  permissionOverrides: selection.value === "role:ADMIN" ? {} : overrides.value,
});
const editingOwnAccount = computed(() => editingUserId.value !== null && editingUserId.value === auth.user?.id);

function resetForm() {
  form.value = { name: "", email: "", password: "", role: "USER", active: true };
  selection.value = "role:USER";
  overrides.value = {};
  error.value = "";
}

async function loadUsers() {
  loading.value = true;
  error.value = "";
  try {
    const [result, catalog] = await Promise.all([api.users(), settingsApi.access()]);
    users.value = result.items;
    access.value = catalog;
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : "Não foi possível carregar os usuários.";
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  resetForm();
  editingUserId.value = null;
  modalMode.value = "create";
}

function openEdit(user: AuthUser) {
  form.value = { name: user.name, email: user.email, password: "", role: user.role, active: Boolean(user.active) };
  selection.value = user.profileId ? `profile:${user.profileId}` : `role:${user.role}`;
  overrides.value = { ...user.permissionOverrides };
  editingUserId.value = user.id;
  error.value = "";
  modalMode.value = "edit";
}

function closeModal() {
  if (saving.value) return;
  modalMode.value = null;
  editingUserId.value = null;
  error.value = "";
}

async function submit() {
  if (modalMode.value === "create" && form.value.password.length < 8) {
    error.value = "A senha deve ter ao menos 8 caracteres.";
    return;
  }

  saving.value = true;
  error.value = "";
  try {
    if (modalMode.value === "create") {
      await api.createUser({ ...form.value, ...accessInput() });
    } else if (editingUserId.value !== null) {
      const input: Parameters<typeof api.updateUser>[1] = {
        name: form.value.name,
        email: form.value.email,
        ...(editingOwnAccount.value ? {} : { ...accessInput(), active: form.value.active }),
      };
      if (form.value.password) input.password = form.value.password;
      await api.updateUser(editingUserId.value, input);
    }
    toast.success(modalMode.value === "create" ? "Usuário criado" : "Usuário atualizado");
    await loadUsers();
    modalMode.value = null;
    editingUserId.value = null;
  } catch (caughtError) {
    error.value = caughtError instanceof Error ? caughtError.message : "Não foi possível salvar o usuário.";
    toast.error("Falha ao salvar usuário", error.value);
  } finally {
    saving.value = false;
  }
}

function roleLabel(role: UserRole) {
  return { USER: "Usuário", OPERATOR: "Operador", MANAGER: "Gestor", ADMIN: "Administrador" }[role];
}

onMounted(loadUsers);
</script>

<template>
  <section class="mx-auto">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="mt-1 text-xl font-bold tracking-tight text-slate-900">
          <Users class="mr-2 inline h-4 w-4 align-middle" aria-hidden="true" focusable="false" />Usuários e permissões
        </h2>
        <p class="mt-2 text-slate-500">Controle quem acessa a plataforma e as ações disponíveis para cada perfil.</p>
      </div>
      <button type="button" class="button-primary" @click="openCreate">
        <Plus :size="18" aria-hidden="true" focusable="false" /> Novo usuário
      </button>
    </div>

    <section class="panel overflow-hidden">
      <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div class="flex items-center gap-3">
          <span class="rounded-lg bg-indigo-50 p-2 text-indigo-600"><Users :size="19" aria-hidden="true" focusable="false" /></span>
          <div>
            <h2 class="font-semibold text-slate-800">Acessos cadastrados</h2>
            <p class="text-sm text-slate-500">
              {{ users.length }} usuário{{ users.length === 1 ? "" : "s" }} cadastrado{{ users.length === 1 ? "" : "s" }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="loading" class="p-10 text-center text-sm text-slate-500">Carregando usuários...</div>
      <div v-else-if="error" class="m-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{{ error }}</div>
      <div v-else-if="!users.length" class="p-10 text-center text-sm text-slate-500">Nenhum usuário cadastrado.</div>
      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[760px] text-left">
          <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th class="px-5 py-3 font-semibold">Usuário</th>
              <th class="px-5 py-3 font-semibold">E-mail</th>
              <th class="px-5 py-3 font-semibold">Perfil</th>
              <th class="px-5 py-3 font-semibold">Status</th>
              <th class="px-5 py-3 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 text-sm text-slate-700">
            <tr v-for="user in users" :key="user.id" class="hover:bg-slate-50/70">
              <td class="px-5 py-2 font-semibold text-slate-800">{{ user.name }}</td>
              <td class="px-5 py-2">{{ user.email }}</td>
              <td class="px-5 py-2">
                <span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700"
                  ><ShieldCheck :size="14" aria-hidden="true" focusable="false" /> {{ user.profileName || roleLabel(user.role) }}</span
                >
              </td>
              <td class="px-5 py-2">
                <span
                  :class="user.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'"
                  class="rounded-full px-2.5 py-1 text-xs font-semibold"
                  >{{ user.active ? "Ativo" : "Inativo" }}</span
                >
              </td>
              <td class="px-5 py-2 text-right">
                <button
                  type="button"
                  :aria-label="`Editar usuário ${user.name}`"
                  class="button-secondary px-3 py-2 text-sm"
                  @click="openEdit(user)"
                >
                  <Pencil :size="15" aria-hidden="true" focusable="false" /> Editar
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Teleport to="body"
      ><div
        v-if="modalMode"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        @click.self="closeModal"
        @keydown="modalKeydown"
      >
        <section
          ref="dialog"
          class="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-modal-title"
        >
          <header class="flex items-start justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <h2 id="user-modal-title" class="text-lg font-bold text-slate-900">
                {{ modalMode === "create" ? "Novo usuário" : "Editar usuário" }}
              </h2>
              <p class="mt-1 text-sm text-slate-500">Defina os dados de acesso e o perfil de permissão.</p>
            </div>
            <button type="button" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar" @click="closeModal">
              <X :size="20" aria-hidden="true" focusable="false" />
            </button>
          </header>
          <form class="space-y-4 px-6 py-5" @submit.prevent="submit">
            <label class="block"
              ><span class="mb-1.5 block text-sm font-medium text-slate-700">Nome</span
              ><input v-model.trim="form.name" required class="input" placeholder="Nome completo"
            /></label>
            <label class="block"
              ><span class="mb-1.5 block text-sm font-medium text-slate-700">E-mail</span
              ><input v-model.trim="form.email" required type="email" class="input" placeholder="nome@empresa.com"
            /></label>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block"
                ><span class="mb-1.5 block text-sm font-medium text-slate-700">Perfil</span
                ><select v-model="selection" class="input" :disabled="editingOwnAccount">
                  <optgroup label="Papéis padrão">
                    <option value="role:USER">Usuário</option>
                    <option value="role:OPERATOR">Operador</option>
                    <option value="role:MANAGER">Gestor</option>
                    <option value="role:ADMIN">Administrador</option>
                  </optgroup>
                  <optgroup v-if="access?.profiles.length" label="Perfis personalizados">
                    <option v-for="profile in access?.profiles" :key="profile.id" :value="`profile:${profile.id}`">
                      {{ profile.name }}
                    </option>
                  </optgroup>
                </select></label
              >
              <label class="block"
                ><span class="mb-1.5 block text-sm font-medium text-slate-700">Status</span
                ><select v-model="form.active" class="input" :disabled="editingOwnAccount">
                  <option :value="true">Ativo</option>
                  <option :value="false">Inativo</option>
                </select></label
              >
            </div>
            <p v-if="editingOwnAccount" class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Para proteger o acesso ao sistema, você não pode alterar seu próprio perfil nem desativar sua conta.
            </p>
            <label class="block"
              ><span class="mb-1.5 block text-sm font-medium text-slate-700">{{
                modalMode === "create" ? "Senha" : "Nova senha (opcional)"
              }}</span
              ><input
                v-model="form.password"
                :required="modalMode === 'create'"
                minlength="8"
                type="password"
                class="input"
                :placeholder="modalMode === 'create' ? 'Mínimo de 8 caracteres' : 'Deixe em branco para manter a atual'"
            /></label>
            <details v-if="selection !== 'role:ADMIN'" class="rounded-lg border border-slate-200 p-3">
              <summary class="cursor-pointer text-sm font-semibold">
                Permissões individuais · {{ access?.catalog.filter((p) => allowed(p.key)).length ?? 0 }} liberadas
              </summary>
              <p class="my-2 text-xs text-slate-500">
                Herdar acompanha o perfil. Permitir ou bloquear cria uma exceção apenas para este usuário. Ações no cliente exigem acesso
                aos detalhes; exportar exige acesso a oportunidades.
              </p>
              <fieldset :disabled="editingOwnAccount" class="space-y-3">
                <div v-for="group in permissionGroups" :key="group">
                  <h3 class="mb-1 text-xs font-bold">{{ group }}</h3>
                  <label
                    v-for="permission in access?.catalog.filter((p) => p.group === group)"
                    :key="permission.key"
                    class="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-xs"
                    ><span
                      >{{ permission.label }}
                      <span class="text-slate-500">· {{ allowed(permission.key) ? "Liberado" : "Bloqueado" }}</span></span
                    ><select
                      :value="overrides[permission.key] === undefined ? 'inherit' : overrides[permission.key] ? 'allow' : 'deny'"
                      class="input !w-32 !py-1 text-xs"
                      @change="setOverride(permission.key, $event)"
                    >
                      <option value="inherit">Herdar</option>
                      <option value="allow">Permitir</option>
                      <option value="deny">Bloquear</option>
                    </select></label
                  >
                </div>
              </fieldset>
            </details>
            <p v-else class="text-xs text-slate-500">Administrador possui acesso completo, incluindo Configurações.</p>
            <p v-if="error" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
            <footer class="flex justify-end gap-3 border-t border-slate-100 pt-5">
              <button type="button" class="button-secondary" :disabled="saving" @click="closeModal">Cancelar</button
              ><button type="submit" class="button-primary" :disabled="saving">
                {{ saving ? "Salvando..." : modalMode === "create" ? "Criar usuário" : "Salvar alterações" }}
              </button>
            </footer>
          </form>
        </section>
      </div></Teleport
    >
  </section>
</template>
