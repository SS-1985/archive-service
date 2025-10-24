import { readFileSync } from "node:fs";
import { pool } from "./db.js";

(async ()=>{
  const sql = readFileSync("migrations/001_archive.sql", "utf8");
  try {
    await pool.query(sql);
    console.log("Migration applied.");
  } finally {
    await pool.end();
  }
})();
