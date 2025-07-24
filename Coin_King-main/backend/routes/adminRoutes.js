
module.exports = (app) => {
  const express = require('express');
  const router = express.Router();

  router.get('/users', (req, res) => {
    const db = app.locals.db;

    db.all('SELECT user_id, name, email FROM users', [], (err, rows) => {
      if (err) {
        console.error('DB error:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    });
  });
  // Fetch Admin Wallet Details
router.get('/wallet', async (req, res) => {
  const db = app.locals.db;
  try {
    const [wallet] = await db.query("SELECT * FROM admin_wallet LIMIT 1");
    if (wallet) {
      res.json(wallet);
    } else {
      res.status(404).json({ message: 'No wallet data found' });
    }
  } catch (error) {
    console.error('Error fetching admin wallet:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET latest admin wallet row
router.get("/api/admin/wallet", (req, res) => {
  const sql = `SELECT *, created_at AS last_updated FROM admin_wallet ORDER BY id DESC LIMIT 1`;

  db.get(sql, (err, row) => {
    if (err) {
      console.error("❌ Error fetching wallet:", err.message);
      return res.status(500).json({ error: "Failed to fetch wallet summary" });
    }

    if (!row) {
      return res.status(404).json({ error: "No wallet data found" });
    }

    res.json(row); // Will include `last_updated` field
  });
});


  return router;
};
