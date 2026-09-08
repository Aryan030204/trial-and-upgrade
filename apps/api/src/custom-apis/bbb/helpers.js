function assertBbbConfig(env) {
  if (!env.bbbAdminApi) {
    throw new Error("Missing required env var BBB_ADMIN_API");
  }
  if (!env.bbbAccessToken) {
    throw new Error("Missing required env var BBB_ACCESS_TOKEN");
  }
  if (!env.bbbFlitsToken) {
    throw new Error("Missing required env var BBB_FLITS_TOKEN");
  }
  if (!env.bbbFlitsUserId) {
    throw new Error("Missing required env var BBB_FLITS_USERID");
  }
  if (!env.bbbFlitsAppName) {
    throw new Error("Missing required env var BBB_FLITS_APPNAME");
  }
}

function numericShopifyId(gid) {
  return String(gid || "").split("/").pop();
}

module.exports = {
  assertBbbConfig,
  numericShopifyId
};
