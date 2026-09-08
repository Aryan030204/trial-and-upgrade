const axios = require("axios");
const env = require("../../config/env");
const { numericShopifyId } = require("./helpers");

const BBB_CUSTOMER_LOOKUP_QUERY = `
  query GetBbbCustomersByPhone($query: String!) {
    customers(first: 10, query: $query) {
      nodes {
        id
      }
    }
  }
`;

function shopifyClient() {
  return axios.create({
    baseURL: env.bbbAdminApi,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": env.bbbAccessToken
    },
    timeout: 15000
  });
}

function flitsClient() {
  return axios.create({
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-integration-app-name": env.bbbFlitsAppName
    },
    timeout: 15000
  });
}

function normalizePhone(phone) {
  const normalized = String(phone || "").trim();
  if (!normalized) {
    const error = new Error("phone is required");
    error.status = 400;
    throw error;
  }
  return normalized;
}

function normalizeFlitsNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findBbbCustomerIdByPhone(phone, { client = shopifyClient() } = {}) {
  const normalizedPhone = normalizePhone(phone);
  let response;
  try {
    response = await client.post("", {
      query: BBB_CUSTOMER_LOOKUP_QUERY,
      variables: { query: `phone:${normalizedPhone}` }
    });
  } catch (err) {
    const error = new Error(err?.response?.data?.errors?.[0]?.message || err.message || "Shopify customer lookup failed");
    error.status = 502;
    throw error;
  }

  if (response.data.errors?.length) {
    const error = new Error(response.data.errors.map((item) => item.message).join(", "));
    error.status = 502;
    throw error;
  }

  const nodes = response.data?.data?.customers?.nodes || [];
  if (!nodes.length) {
    const error = new Error("No customer found");
    error.status = 404;
    throw error;
  }
  if (nodes.length > 1) {
    const error = new Error("Multiple customers found for this phone");
    error.status = 409;
    throw error;
  }

  return numericShopifyId(nodes[0].id);
}

function buildBbbFlitsLookupUrl(customerId) {
  const normalizedCustomerId = String(customerId || "").trim();
  return `https://app.getflits.com/api/1/${encodeURIComponent(env.bbbFlitsUserId)}/${encodeURIComponent(normalizedCustomerId)}/credit/get_credit?token=${encodeURIComponent(env.bbbFlitsToken)}`;
}

async function getBbbCashback(requestBody, { shopify = shopifyClient(), flits = flitsClient() } = {}) {
  const customerId = await findBbbCustomerIdByPhone(requestBody?.phone, { client: shopify });
  let response;
  try {
    response = await flits.get(buildBbbFlitsLookupUrl(customerId));
  } catch (err) {
    const error = new Error(err?.response?.data?.message || err.message || "Flits lookup failed");
    error.status = 502;
    throw error;
  }

  const customer = response.data?.customer;
  if (!customer || typeof customer !== "object") {
    const error = new Error("Invalid Flits response");
    error.status = 502;
    throw error;
  }

  return {
    customerId: String(customerId),
    flits_points: normalizeFlitsNumber(customer.points),
    flits_credits: normalizeFlitsNumber(customer.credits)
  };
}

module.exports = {
  normalizePhone,
  buildBbbFlitsLookupUrl,
  findBbbCustomerIdByPhone,
  getBbbCashback
};
