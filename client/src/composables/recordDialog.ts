import { computed, ref, type InjectionKey } from "vue";

/** Portals stay inside the active native dialog so menus and alerts remain accessible. */
export const recordDialogPortal: InjectionKey<string> = Symbol("record-dialog-portal");
const targets = ref<string[]>([]);
export const activeRecordDialogTarget = computed(() => targets.value.at(-1) ?? "body");
export function registerRecordDialog(target: string) {
  targets.value.push(target);
  return () => {
    targets.value = targets.value.filter((item) => item !== target);
  };
}
