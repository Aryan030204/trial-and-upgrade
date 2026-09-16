const test = require("node:test");
const assert = require("node:assert/strict");
const { findBbbCustomerIdByPhone } = require("../src/custom-apis/bbb/service");

test("findBbbCustomerIdByPhone returns the single Shopify customer id", async () => {
  const client = {
    async post() {
      return {
        data: {
          data: {
            customers: {
              nodes: [{ id: "gid://shopify/Customer/9391685271847", phone: null }]
            }
          }
        }
      };
    }
  };

  const customerId = await findBbbCustomerIdByPhone("+919289641150", { client });
  assert.equal(customerId, "9391685271847");
});

test("findBbbCustomerIdByPhone throws 404 when no customer is found", async () => {
  const client = {
    async post() {
      return { data: { data: { customers: { nodes: [] } } } };
    }
  };

  await assert.rejects(
    () => findBbbCustomerIdByPhone("+919289641150", { client }),
    (err) => err.status === 404 && /No customer found/.test(err.message)
  );
});

test("findBbbCustomerIdByPhone picks the candidate whose contact phone matches when multiple customers match by address", async () => {
  const client = {
    async post() {
      return {
        data: {
          data: {
            customers: {
              nodes: [
                { id: "gid://shopify/Customer/9144937087271", phone: null },
                { id: "gid://shopify/Customer/9033826271527", phone: "+917737128689" }
              ]
            }
          }
        }
      };
    }
  };

  const customerId = await findBbbCustomerIdByPhone("+917737128689", { client });
  assert.equal(customerId, "9033826271527");
});

test("findBbbCustomerIdByPhone throws 409 when multiple customers match and none has a matching contact phone", async () => {
  const client = {
    async post() {
      return {
        data: {
          data: {
            customers: {
              nodes: [
                { id: "gid://shopify/Customer/1", phone: null },
                { id: "gid://shopify/Customer/2", phone: null }
              ]
            }
          }
        }
      };
    }
  };

  await assert.rejects(
    () => findBbbCustomerIdByPhone("+919289641150", { client }),
    (err) => err.status === 409 && /Multiple customers found/.test(err.message)
  );
});

test("findBbbCustomerIdByPhone maps Shopify transport errors to 502", async () => {
  const client = {
    async post() {
      const error = new Error("upstream unavailable");
      error.response = { data: { errors: [{ message: "Shopify broke" }] } };
      throw error;
    }
  };

  await assert.rejects(
    () => findBbbCustomerIdByPhone("+919289641150", { client }),
    (err) => err.status === 502 && /Shopify broke/.test(err.message)
  );
});
