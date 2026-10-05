#!/usr/bin/env node
// Local curation UI for the quality-filter stage: approve/reject candidates and
// add titles, locations and visual clues. Writes pipeline/out/decisions.json.
//
//   node pipeline/curate-server.mjs   → http://localhost:5199

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const DECISIONS = path.join(OUT, "decisions.json");
const PORT = Number(process.env.PORT ?? 5199);

const readJson = async (f, fallback) => {
  try {
    return JSON.parse(await fs.readFile(f, "utf8"));
  } catch {
    return fallback;
  }
};

http
  .createServer(async (req, res) => {
    try {
      if (req.url === "/" || req.url === "/index.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(await fs.readFile(path.join(here, "curate.html")));
      }
      if (req.url === "/api/candidates") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ candidates: await readJson(path.join(OUT, "candidates.json"), []), decisions: await readJson(DECISIONS, {}) }));
      }
      if (req.url === "/api/decision" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { id, decision } = JSON.parse(body);
        const all = await readJson(DECISIONS, {});
        if (decision === null) delete all[id];
        else all[id] = decision;
        await fs.writeFile(DECISIONS, JSON.stringify(all, null, 2));
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true, count: Object.keys(all).length }));
      }
      res.writeHead(404).end();
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  })
  .listen(PORT, () => console.log(`Curation UI → http://localhost:${PORT}`));
