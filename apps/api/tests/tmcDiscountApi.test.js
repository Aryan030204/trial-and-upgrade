const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractShopFromAdminApi,
  numericShopifyId,
  buildDiscountCode,
  normalizeDuration,
  normalizeProductId,
  toProductGid,
  assertTmcConfig
} = require("../src/custom-apis/the-man-company/helpers");
const {
  parseRequestPayload,
  buildCustomerGets,
  buildShopifyDiscountInput,
  buildTmcFlitsLookupUrl,
  findTmcCustomerIdByPhone,
  getTmcCashback
} = require("../src/custom-apis/the-man-company/service");

test("assertTmcConfig rejects invalid TMC config", () => {
  const validBaseConfig = {
    tmcAdminApi: "https://example.myshopify.com/admin/api/2026-04/graphql.json",
    tmcAccessToken: "token",
    tmcFlitsToken: "flits-token",
    tmcFlitsUserId: "123",
    tmcFlitsAppName: "TMC",
    defaultTmcDiscountExpirationTime: 5,
    defaultDiscountPrice: null,
    defaultType: "",
    defaultDtype: "",
    tmcDefaultDiscountPrefix: "TMC"
  };

  assert.throws(() => assertTmcConfig({ ...validBaseConfig, tmcAdminApi: "" }), /TMC_ADMIN_API/);
  assert.throws(() => assertTmcConfig({ ...validBaseConfig, tmcAccessToken: "" }), /TMC_ACCESS_TOKEN/);
  assert.throws(() => assertTmcConfig({ ...validBaseConfig, tmcFlitsToken: "" }), /TMC_FLITS_TOKEN/);
  assert.throws(() => assertTmcConfig({ ...validBaseConfig, tmcFlitsUserId: "" }), /TMC_FLITS_USERID/);
  assert.throws(() => assertTmcConfig({ ...validBaseConfig, tmcFlitsAppName: "" }), /TMC_FLITS_APPNAME/);
  assert.throws(
    () => assertTmcConfig({ ...validBaseConfig, defaultTmcDiscountExpirationTime: 0 }),
    /DEFAULT_TMC_DISCOUNT_EXPIRATION_TIME/
  );
  assert.throws(() => assertTmcConfig({ ...validBaseConfig, tmcDefaultDiscountPrefix: "" }), /TMC_DEFAULT_DISCOUNT_PREFIX/);
  assert.throws(() => assertTmcConfig({ ...validBaseConfig, defaultType: "bogus" }), /DEFAULT_TYPE/);
  assert.throws(() => assertTmcConfig({ ...validBaseConfig, defaultDtype: "bogus" }), /DEFAULT_DTYPE/);
  assert.throws(() => assertTmcConfig({ ...validBaseConfig, defaultDtype: "fixed" }), /DEFAULT_DISCOUNT_PRICE/);
  assert.throws(() => assertTmcConfig({ ...validBaseConfig, defaultDiscountPrice: 0 }), /DEFAULT_DISCOUNT_PRICE/);
});

test("extractShopFromAdminApi returns the Shopify hostname", () => {
  assert.equal(
    extractShopFromAdminApi("https://the-man-company.myshopify.com/admin/api/2026-04/graphql.json"),
    "the-man-company.myshopify.com"
  );
});

test("numericShopifyId returns the numeric id suffix from a Shopify gid", () => {
  assert.equal(numericShopifyId("gid://shopify/Customer/9391685271847"), "9391685271847");
});

test("buildDiscountCode preserves prefix and falls back to random", () => {
  assert.match(buildDiscountCode("tmc", "FALLBACK"), /^TMC-[A-Z0-9]{8}$/);
  assert.match(buildDiscountCode("", "FALLBACK"), /^FALLBACK-[A-Z0-9]{8}$/);
});

test("normalizeDuration uses default when omitted", () => {
  assert.equal(normalizeDuration(undefined, 7), 7);
  assert.equal(normalizeDuration("9", 7), 9);
  assert.throws(() => normalizeDuration(0, 7), /duration must be a positive integer/);
});

test("product ids are normalized to Shopify product gids", () => {
  assert.equal(normalizeProductId("12345"), "12345");
  assert.equal(toProductGid("12345"), "gid://shopify/Product/12345");
  assert.throws(() => normalizeProductId("gid://shopify/Product/12345"), /product_id must be a numeric Shopify product ID/);
});

test("parseRequestPayload validates conditional fields and applies defaults", () => {
  const parsed = parseRequestPayload(
    { type: "product", product_id: "12345", dtype: "percent", percent: 5, order_discount_combination: true },
    { defaultDuration: 6, defaultType: "", defaultDtype: "", defaultDiscountPrice: null }
  );
  assert.equal(parsed.type, "product");
  assert.equal(parsed.productIdNumeric, "12345");
  assert.equal(parsed.productGid, "gid://shopify/Product/12345");
  assert.equal(parsed.percent, 5);
  assert.equal(parsed.durationMinutes, 6);
  assert.equal(parsed.orderDiscountCombination, true);
  assert.match(parsed.code, /^TMC-[A-Z0-9]{8}$/);
  assert.equal(parsed.prefix, "TMC");

  const parsedWithDefaults = parseRequestPayload(
    {},
    { defaultDuration: 6, defaultType: "cart", defaultDtype: "fixed", defaultDiscountPrice: 25 }
  );
  assert.equal(parsedWithDefaults.type, "cart");
  assert.equal(parsedWithDefaults.dtype, "fixed");
  assert.equal(parsedWithDefaults.price, 25);
  assert.equal(parsedWithDefaults.percent, null);
  assert.equal(parsedWithDefaults.durationMinutes, 6);

  assert.throws(
    () => parseRequestPayload(
      { type: "product", dtype: "percent", percent: 5 },
      { defaultDuration: 6, defaultType: "", defaultDtype: "", defaultDiscountPrice: null }
    ),
    /product_id/
  );
  assert.throws(
    () => parseRequestPayload(
      { type: "cart", dtype: "percent" },
      { defaultDuration: 6, defaultType: "", defaultDtype: "", defaultDiscountPrice: null }
    ),
    /percent/
  );
  assert.throws(
    () => parseRequestPayload(
      { type: "cart", dtype: "fixed", price: "" },
      { defaultDuration: 6, defaultType: "", defaultDtype: "", defaultDiscountPrice: null }
    ),
    /price/
  );
  assert.throws(
    () => parseRequestPayload(
      { type: "product", product_id: "12345", dtype: "percent", percent: 5, order_discount_combination: "true" },
      { defaultDuration: 6, defaultType: "", defaultDtype: "", defaultDiscountPrice: null }
    ),
    /order_discount_combination/
  );
});

test("buildCustomerGets shapes cart and product discounts correctly", () => {
  assert.deepEqual(
    buildCustomerGets({ type: "cart", dtype: "percent", percent: 5 }),
    { items: { all: true }, value: { percentage: 0.05 } }
  );

  assert.deepEqual(
    buildCustomerGets({ type: "product", dtype: "fixed", price: 100, productGid: "gid://shopify/Product/123" }),
    {
      items: { products: { productsToAdd: ["gid://shopify/Product/123"] } },
      value: { discountAmount: { amount: "100.00", appliesOnEachItem: false } }
    }
  );
});

test("buildShopifyDiscountInput creates an all-buyers cart discount with expiry", () => {
  const now = new Date("2026-06-18T10:00:00.000Z");
  const result = buildShopifyDiscountInput(
    {
      type: "cart",
      dtype: "fixed",
      price: 100,
      code: "TMC-TEST",
      durationMinutes: 5
    },
    now
  );

  assert.equal(result.title, "TMC-TEST");
  assert.equal(result.input.context.all, "ALL");
  assert.equal(result.input.appliesOncePerCustomer, false);
  assert.equal(result.input.combinesWith.orderDiscounts, false);
  assert.equal(result.input.customerGets.items.all, true);
  assert.equal(result.input.customerGets.value.discountAmount.amount, "100.00");
  assert.equal(result.startsAt.toISOString(), "2026-06-18T10:00:00.000Z");
  assert.equal(result.expiresAt.toISOString(), "2026-06-18T10:05:00.000Z");
});

test("buildShopifyDiscountInput creates a product discount with one-use-per-customer and order combination control", () => {
  const now = new Date("2026-06-18T10:00:00.000Z");
  const result = buildShopifyDiscountInput(
    {
      type: "product",
      dtype: "percent",
      percent: 10,
      code: "TMC-PRODUCT",
      productGid: "gid://shopify/Product/123",
      durationMinutes: 5,
      orderDiscountCombination: true
    },
    now
  );

  assert.equal(result.title, "TMC-PRODUCT");
  assert.equal(result.input.appliesOncePerCustomer, true);
  assert.equal(result.input.combinesWith.orderDiscounts, true);
  assert.equal(result.input.combinesWith.productDiscounts, false);
  assert.equal(result.input.combinesWith.shippingDiscounts, false);
  assert.deepEqual(result.input.customerGets.items, { products: { productsToAdd: ["gid://shopify/Product/123"] } });
});

test("buildTmcFlitsLookupUrl uses env-based Flits credentials", () => {
  assert.match(buildTmcFlitsLookupUrl("9391685271847"), /api\/1\/.*\/9391685271847\/credit\/get_credit\?token=/);
});

test("findTmcCustomerIdByPhone returns the single Shopify customer id", async () => {
  const client = {
    async post() {
      return {
        data: {
          data: {
            customers: {
              nodes: [{ id: "gid://shopify/Customer/9391685271847" }]
            }
          }
        }
      };
    }
  };

  const customerId = await findTmcCustomerIdByPhone("+919289641150", { client });
  assert.equal(customerId, "9391685271847");
});

test("findTmcCustomerIdByPhone throws 404 when no customer is found", async () => {
  const client = {
    async post() {
      return { data: { data: { customers: { nodes: [] } } } };
    }
  };

  await assert.rejects(
    () => findTmcCustomerIdByPhone("+919289641150", { client }),
    (err) => err.status === 404 && /No customer found/.test(err.message)
  );
});

test("findTmcCustomerIdByPhone throws 409 when multiple customers match", async () => {
  const client = {
    async post() {
      return {
        data: {
          data: {
            customers: {
              nodes: [
                { id: "gid://shopify/Customer/1" },
                { id: "gid://shopify/Customer/2" }
              ]
            }
          }
        }
      };
    }
  };

  await assert.rejects(
    () => findTmcCustomerIdByPhone("+919289641150", { client }),
    (err) => err.status === 409 && /Multiple customers found/.test(err.message)
  );
});

test("findTmcCustomerIdByPhone maps Shopify transport errors to 502", async () => {
  const client = {
    async post() {
      const error = new Error("upstream unavailable");
      error.response = { data: { errors: [{ message: "Shopify broke" }] } };
      throw error;
    }
  };

  await assert.rejects(
    () => findTmcCustomerIdByPhone("+919289641150", { client }),
    (err) => err.status === 502 && /Shopify broke/.test(err.message)
  );
});

test("getTmcCashback returns points and credits from Flits", async () => {
  const shopify = {
    async post() {
      return {
        data: {
          data: {
            customers: {
              nodes: [{ id: "gid://shopify/Customer/9391685271847" }]
            }
          }
        }
      };
    }
  };
  const flits = {
    async get(url) {
      assert.match(url, /9391685271847/);
      return {
        data: {
          customer: {
            points: 42,
            credits: 9
          }
        }
      };
    }
  };

  const result = await getTmcCashback({ phone: "+919289641150" }, { shopify, flits });
  assert.deepEqual(result, {
    customerId: "9391685271847",
    flits_points: 42,
    flits_credits: 9
  });
});

test("getTmcCashback throws 502 when Flits payload is unusable", async () => {
  const shopify = {
    async post() {
      return {
        data: {
          data: {
            customers: {
              nodes: [{ id: "gid://shopify/Customer/9391685271847" }]
            }
          }
        }
      };
    }
  };
  const flits = {
    async get() {
      return { data: { status: true } };
    }
  };

  await assert.rejects(
    () => getTmcCashback({ phone: "+919289641150" }, { shopify, flits }),
    (err) => err.status === 502 && /Invalid Flits response/.test(err.message)
  );
});
