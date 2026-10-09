<script setup lang="ts">
import { ref, computed } from "vue";
import { ArrowLeftRight, LoaderCircle } from "lucide-vue-next";
import { useAuthStore } from "../stores/auth";
import { portManeuverApi } from "../portManeuverApi";
import { toast } from "../notifications/toast";
import PortManeuverDialog from "./PortManeuverDialog.vue";
const props = defineProps<{ loginId: number; disabled?: boolean; boxTransfer?: boolean }>();
const emit = defineEmits<{ completed: [port?: number]; transferred: [destination: { boxId: number; boxName: string; port: number }] }>();
const auth = useAuthStore();
const allowed = computed(() => ["network.boxes.view", "network.logins.view", "network.ports.manage"].every((p) => auth.can(p)));
const loading = ref(false),
  context = ref<{ boxId: number; boxName: string } | null>(null);
async function open() {
  if (loading.value || props.disabled || !allowed.value) return;
  loading.value = true;
  try {
    context.value = await portManeuverApi.loginContext(props.loginId);
  } catch (error) {
    toast.error("Não foi possível consultar a porta", (error as Error).message);
  } finally {
    loading.value = false;
  }
}
</script>
<template>
  <button v-if="allowed" type="button" class="button-secondary" :disabled="disabled || loading" @click="open">
    <component
      :is="loading ? LoaderCircle : ArrowLeftRight"
      class="h-3.5 w-3.5"
      :class="{ 'animate-spin': loading }"
      aria-hidden="true"
    />{{ boxTransfer ? "Mudar caixa" : "Mudar porta" }}
  </button>
  <PortManeuverDialog
    v-if="context && allowed"
    :box-id="context.boxId"
    :box-name="context.boxName"
    :initial-login-id="loginId"
    :login-only="!boxTransfer"
    :box-transfer="boxTransfer"
    @close="context = null"
    @completed="
      (ports) => {
        const moved = ports.find((p) => p.id === loginId);
        if (boxTransfer && moved?.boxId)
          emit('transferred', { boxId: moved.boxId, boxName: moved.boxName ?? `CTO #${moved.boxId}`, port: moved.port });
        emit('completed', boxTransfer ? undefined : ports.find((p) => p.id === loginId)?.port);
      }
    "
  />
</template>
