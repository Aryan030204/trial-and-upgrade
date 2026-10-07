const express = require("express");
const { get3tenxCashback } = require("./service");

const router = express.Router();

router.post("/get-cashback", async (req, res, next) => {
  try {
    const result = await get3tenxCashback(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
