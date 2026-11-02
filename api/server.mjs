import http from "node:http";
import yaml from "js-yaml";
import { compareYamlDocs, pairDocuments } from "../shared/yaml-diff.mjs";

const port = Number.parseInt(process.env.PORT || "8080", 10);
const MAX_BODY = 1_000_000;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("body_too_large"), { code: "body_too_large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseYamlSide(text, side) {
  try {
    const docs = yaml.loadAll(text, null, { schema: yaml.DEFAULT_SCHEMA });
    return { ok: true, value: docs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: side === "left" ? "left_parse_error" : "right_parse_error",
      message,
    };
  }
}

function normalizeOptions(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      ignorePaths: [],
      preset: undefined,
      arrayAsSet: false,
    };
  }
  const ignorePaths = Array.isArray(raw.ignorePaths)
    ? raw.ignorePaths.filter((v) => typeof v === "string")
    : [];
  const preset =
    typeof raw.preset === "string" && raw.preset.length > 0 ? raw.preset : undefined;
  return {
    ignorePaths,
    preset,
    kubernetes: Boolean(raw.kubernetes),
    arrayAsSet: Boolean(raw.arrayAsSet),
  };
}

async function handleCompare(req, res) {
  let raw;
  try {
    raw = await readBody(req, MAX_BODY);
  } catch (err) {
    if (err && err.code === "body_too_large") {
      sendJson(res, 413, { error: "body_too_large", message: "Request body exceeds 1MB" });
      return;
    }
    sendJson(res, 400, { error: "invalid_body", message: "Failed to read request body" });
    return;
  }

  let body;
  try {
    body = JSON.parse(raw || "null");
  } catch {
    sendJson(res, 400, { error: "invalid_body", message: "Body must be JSON" });
    return;
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.left !== "string" ||
    typeof body.right !== "string"
  ) {
    sendJson(res, 400, {
      error: "invalid_body",
      message: "Expected JSON object with string fields left and right",
    });
    return;
  }

  if (!body.left.trim() || !body.right.trim()) {
    sendJson(res, 400, {
      error: "empty_both",
      message: "Both left and right YAML texts are required (whitespace-only is not enough)",
    });
    return;
  }

  const leftParsed = parseYamlSide(body.left, "left");
  if (!leftParsed.ok) {
    sendJson(res, 400, { error: leftParsed.error, message: leftParsed.message });
    return;
  }

  const rightParsed = parseYamlSide(body.right, "right");
  if (!rightParsed.ok) {
    sendJson(res, 400, { error: rightParsed.error, message: rightParsed.message });
    return;
  }

  const options = normalizeOptions(body.options);
  const paired = pairDocuments(leftParsed.value, rightParsed.value);
  const result = compareYamlDocs(paired.left, paired.right, options);
  sendJson(res, 200, result);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathName = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "GET" && pathName === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathName === "/compare" || pathName === "/api/compare") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }
    void handleCompare(req, res);
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(port, "0.0.0.0");
