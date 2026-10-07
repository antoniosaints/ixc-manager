export const equipmentAccessOptions = [
  { protocol: "https", port: 7000 },
  { protocol: "https", port: 7001 },
  { protocol: "http", port: 7000 },
  { protocol: "http", port: 7001 },
  { protocol: "https", port: 80 },
  { protocol: "http", port: 80 },
] as const;
export type EquipmentAccessOption = (typeof equipmentAccessOptions)[number];
export interface EquipmentAccessTarget {
  readonly closed: boolean;
  navigate(url: string): void;
  close(): void;
}
/** Only navigate after the exact router-1 password has been copied successfully. */
export async function copyPasswordAndAccess(
  read: () => Promise<{ url: string; password: string }>,
  copy: (password: string) => Promise<void>,
  target: EquipmentAccessTarget,
  signal: AbortSignal
) {
  let access: { url: string; password: string } | undefined;
  const assertActive = () => {
    if (signal.aborted || target.closed) throw new Error("Acesso cancelado.");
  };
  try {
    access = await read();
    assertActive();
    try {
      await copy(access.password);
    } catch {
      throw new Error("Não foi possível copiar a senha. Permita o acesso à área de transferência e tente novamente.");
    }
    assertActive();
    target.navigate(access.url);
  } catch (error) {
    target.close();
    throw error;
  } finally {
    if (access) access.password = "";
  }
}
