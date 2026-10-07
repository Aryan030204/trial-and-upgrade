const TenantStore = require("../../models/TenantStore");
const { findCustomers, pickContactPhoneCustomer } = require("../../services/shopifyService");
const { lookupFlitsCredits } = require("../../services/flitsLookupService");

const THREE_TENX_SLUG = "3tenx";

async function loadThreeTenxStore() {
  const store = await TenantStore.findOne({ slug: THREE_TENX_SLUG, enabled: true, deletedAt: null });
  if (!store) {
    const error = new Error("3TENX store is not configured");
    error.status = 500;
    throw error;
  }
  return store;
}

function normalizeFlitsNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function resolveThreeTenxCustomerId(requestBody, store, { findCustomersFn = findCustomers } = {}) {
  const customerId = String(requestBody?.customer_id || "").trim();
  if (customerId) {
    return customerId;
  }

  const phoneNumber = String(requestBody?.phone_number || "").trim();
  if (!phoneNumber) {
    const error = new Error("phone_number or customer_id is required");
    error.status = 400;
    throw error;
  }

  let candidates;
  try {
    candidates = await findCustomersFn(store, { phone: phoneNumber, limit: 20 });
  } catch (err) {
    const error = new Error(err?.message || "Shopify customer lookup failed");
    error.status = err?.status || 502;
    throw error;
  }

  if (!candidates.length) {
    const error = new Error("No customer found");
    error.status = 404;
    throw error;
  }
  if (candidates.length === 1) {
    return candidates[0].numericId;
  }

  const contactMatch = pickContactPhoneCustomer(candidates, phoneNumber);
  if (contactMatch) {
    return contactMatch.numericId;
  }

  const error = new Error("Multiple customers found for this phone");
  error.status = 409;
  throw error;
}

async function get3tenxCashback(requestBody, {
  loadStoreFn = loadThreeTenxStore,
  findCustomersFn = findCustomers,
  lookupFlitsCreditsFn = lookupFlitsCredits
} = {}) {
  const store = await loadStoreFn();
  const customerId = await resolveThreeTenxCustomerId(requestBody, store, { findCustomersFn });

  let customer;
  try {
    ({ customer } = await lookupFlitsCreditsFn(store, { shopifyCustomerId: customerId }));
  } catch (err) {
    const error = new Error(err?.response?.data?.message || err.message || "Flits lookup failed");
    error.status = 502;
    throw error;
  }

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
  THREE_TENX_SLUG,
  loadThreeTenxStore,
  resolveThreeTenxCustomerId,
  get3tenxCashback
};
