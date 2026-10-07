import mysql from "mysql2/promise";
import { env } from "../config/env.js";

export const db = mysql.createPool({ uri: env.DATABASE_URL, connectionLimit: 10, decimalNumbers: true, timezone: "Z" });
