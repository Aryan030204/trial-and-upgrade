const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveThreeTenxCustomerId, get3tenxCashback } = require("../src/custom-apis/3tenx/service");

const fakeStore = { slug: "3tenx", flitsConfig: {} };

test("resolveThreeTenxCustomerId returns customer_id directly without calling Shopify", async () => {
  const findCustomersFn = async () => {
    throw new Error("should not be called");
  };

  const customerId = await resolveThreeTenxCustomerId({ customer_id: "582001" }, fakeStore, { findCustomersFn });
  assert.equal(customerId, "582001");
});

test("resolveThreeTenxCustomerId resolves the single Shopify match by phone_number", async () => {
  const findCustomersFn = async () => [{ numericId: "9391685271847", phone: "+919289641150" }];

  const customerId = await resolveThreeTenxCustomerId({ phone_number: "+919289641150" }, fakeStore, { findCustomersFn });
  assert.equal(customerId, "9391685271847");
});

test("resolveThreeTenxCustomerId throws 400 when neither field is provided", async () => {
  await assert.rejects(
    () => resolveThreeTenxCustomerId({}, fakeStore, { findCustomersFn: async () => [] }),
    (err) => err.status === 400 && /phone_number or customer_id is required/.test(err.message)
  );
});

test("resolveThreeTenxCustomerId throws 404 when no customer is found", async () => {
  const findCustomersFn = async () => [];

  await assert.rejects(
    () => resolveThreeTenxCustomerId({ phone_number: "+919289641150" }, fakeStore, { findCustomersFn }),
    (err) => err.status === 404 && /No customer found/.test(err.message)
  );
});

test("resolveThreeTenxCustomerId picks the candidate whose contact phone matches when multiple customers match", async () => {
  const findCustomersFn = async () => [
    { numericId: "9144937087271", phone: null },
    { numericId: "9033826271527", phone: "+917737128689" }
  ];

  const customerId = await resolveThreeTenxCustomerId({ phone_number: "+917737128689" }, fakeStore, { findCustomersFn });
  assert.equal(customerId, "9033826271527");
});

test("resolveThreeTenxCustomerId throws 409 when multiple customers match and none has a matching contact phone", async () => {
  const findCustomersFn = async () => [
    { numericId: "1", phone: null },
    { numericId: "2", phone: null }
  ];

  await assert.rejects(
    () => resolveThreeTenxCustomerId({ phone_number: "+919289641150" }, fakeStore, { findCustomersFn }),
    (err) => err.status === 409 && /Multiple customers found/.test(err.message)
  );
});

test("get3tenxCashback returns points and credits from Flits using a direct customer_id", async () => {
  const loadStoreFn = async () => fakeStore;
  const lookupFlitsCreditsFn = async (store, { shopifyCustomerId }) => {
    assert.equal(shopifyCustomerId, "582001");
    return { customer: { points: 42, credits: 7 } };
  };

  const result = await get3tenxCashback({ customer_id: "582001" }, { loadStoreFn, lookupFlitsCreditsFn });
  assert.deepEqual(result, { customerId: "582001", flits_points: 42, flits_credits: 7 });
});

test("get3tenxCashback throws 502 when Flits payload is unusable", async () => {
  const loadStoreFn = async () => fakeStore;
  const lookupFlitsCreditsFn = async () => ({ customer: null });

  await assert.rejects(
    () => get3tenxCashback({ customer_id: "582001" }, { loadStoreFn, lookupFlitsCreditsFn }),
    (err) => err.status === 502 && /Invalid Flits response/.test(err.message)
  );
});
