const express = require("express");
const env = require("../../config/env");
const { assertBbbConfig } = require("./helpers");
const { getBbbCashback } = require("./service");

assertBbbConfig(env);

const router = express.Router();

router.post("/get-cashback", async (req, res, next) => {
  try {
    const result = await getBbbCashback(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
