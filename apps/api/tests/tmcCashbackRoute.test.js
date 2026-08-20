const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const express = require("express");

function primeTmcEnv() {
  process.env.TMC_ADMIN_API = "https://the-man-company.myshopify.com/admin/api/2026-04/graphql.json";
  process.env.TMC_ACCESS_TOKEN = "tmc-access-token";
  process.env.TMC_FLITS_TOKEN = "tmc-flits-token";
  process.env.TMC_FLITS_USERID = "31778";
  process.env.TMC_FLITS_APPNAME = "TMC";
}

function buildApp(mockCashbackHandler) {
  primeTmcEnv();
  delete require.cache[require.resolve("../src/config/env")];
  delete require.cache[require.resolve("../src/custom-apis/the-man-company/helpers")];
  delete require.cache[require.resolve("../src/custom-apis/the-man-company/service")];
  delete require.cache[require.resolve("../src/custom-apis/the-man-company/routes")];

  const service = require("../src/custom-apis/the-man-company/service");
  service.getTmcCashback = mockCashbackHandler;
  const router = require("../src/custom-apis/the-man-company/routes");
  const { errorHandler } = require("../src/middleware/errorHandler");

  const app = express();
  app.use(express.json());
  app.use("/api/custom-apis/the-man-company", router);
  app.use(errorHandler);
  return app;
}

async function requestJson(app, body) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/custom-apis/the-man-company/get-cashback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return {
      status: response.status,
      body: await response.json()
    };
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test("POST /get-cashback returns 400 when phone is missing", async () => {
  const app = buildApp(async () => {
    const error = new Error("phone is required");
    error.status = 400;
    throw error;
  });

  const result = await requestJson(app, {});
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "phone is required");
});

test("POST /get-cashback returns 200 for a valid lookup", async () => {
  const app = buildApp(async () => ({
    customerId: "9391685271847",
    flits_points: 10,
    flits_credits: 3
  }));

  const result = await requestJson(app, { phone: "+919289641150" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    customerId: "9391685271847",
    flits_points: 10,
    flits_credits: 3
  });
});

test("POST /get-cashback returns 404 when no customer is found", async () => {
  const app = buildApp(async () => {
    const error = new Error("No customer found");
    error.status = 404;
    throw error;
  });

  const result = await requestJson(app, { phone: "+919289641150" });
  assert.equal(result.status, 404);
  assert.equal(result.body.error, "No customer found");
});

test("POST /get-cashback returns 409 for multiple Shopify matches", async () => {
  const app = buildApp(async () => {
    const error = new Error("Multiple customers found for this phone");
    error.status = 409;
    throw error;
  });

  const result = await requestJson(app, { phone: "+919289641150" });
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "Multiple customers found for this phone");
});
