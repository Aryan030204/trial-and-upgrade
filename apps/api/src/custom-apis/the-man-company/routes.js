const express = require("express");
const env = require("../../config/env");
const { assertTmcConfig } = require("./helpers");
const { createTmcDiscount, getTmcCashback } = require("./service");

assertTmcConfig(env);

const router = express.Router();

router.post("/discount", async (req, res, next) => {
  try {
    const result = await createTmcDiscount(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/get-cashback", async (req, res, next) => {
  try {
    const result = await getTmcCashback(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
