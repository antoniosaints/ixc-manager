/** Verified against information_schema on 2026-10-09. Consolidated byte counters. */
export interface IxcLoginConsumptionRow {
  id: number | string;
  id_login: number | null;
  data: string | null;
  consumo: string | null;
  consumo_upload: string | null;
  maior_id_consumo?: string | null;
}
export const loginConsumptionTables = {
  daily: {
    table: "radusuarios_consumo_d",
    date: "data",
    login: "id_login",
    download: "consumo",
    upload: "consumo_upload",
    unit: "bytes",
    indexes: ["id_login", "data", "maior_id_consumo"],
  },
  monthly: {
    table: "radusuarios_consumo_m",
    date: "data",
    login: "id_login",
    download: "consumo",
    upload: "consumo_upload",
    unit: "bytes",
    indexes: ["id_login", "data", "maior_id_consumo"],
  },
} as const;
