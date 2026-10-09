<script setup lang="ts">
import { Database, CheckCircle2 } from "lucide-vue-next";
</script>
<template>
  <section class="panel p-5">
    <h1 class="flex items-center gap-2 text-xl font-bold"><Database class="h-5 w-5" aria-hidden="true" />Churn por consulta direta</h1>
    <p class="mt-3 text-sm text-slate-500">
      A lista, os indicadores e os detalhes consultam as fontes do IXC ao abrir ou atualizar a análise.
    </p>
    <p class="mt-3 flex items-center gap-2 text-sm">
      <CheckCircle2 class="h-4 w-4 text-emerald-600" aria-hidden="true" />Não é necessário sincronizar dados nem aguardar tarefas em segundo
      plano.
    </p>
  </section>
</template>
