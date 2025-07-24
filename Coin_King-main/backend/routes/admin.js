const express = require('express');
const router = express.Router();

// Access to db
const db = require('../db'); 


// ✅ Admin Wallet GET Route
router.get("/wallet", async (req, res) => {
  const db = req.app.locals.db;

  try {
    const wallet = await db.get("SELECT * FROM admin_wallet LIMIT 1");
    if (!wallet) {
      return res.status(404).json({ message: "Admin wallet not found" });
    }
    return res.json(wallet);
  } catch (err) {
    console.error("Error fetching admin wallet:", err.message);
    return res.status(500).json({ message: "❌ Failed to fetch admin wallet" });
  }
});
router.get('/admin/summary', (req, res) => {
  const db = req.app.locals.db;
  db.all("SELECT * FROM admin_summary ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      console.error("Error fetching admin summary:", err.message);
      return res.status(500).json({ message: "Internal server error" });
    }
    res.status(200).json(rows);
  });
});
