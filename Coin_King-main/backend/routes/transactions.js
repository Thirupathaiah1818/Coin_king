// routes/transaction.js
const express = require('express');
const router = express.Router();

// ✅ Get ONLY deposit and withdraw transactions for user
// ✅ Get ONLY deposit and withdraw transactions for user
router.get('/api/transactions/:user_id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.params.user_id;

  const sql = `
    SELECT 
      id, 
      user_id,
      CASE
        WHEN type = 'withdraw' THEN 'Withdrawal'
        WHEN type = 'deposit' THEN 'Deposit Request'
        ELSE type
      END AS type,
      amount, 
      balance, 
      status, 
      created_at
    FROM transactions
    WHERE user_id = ?
      AND type IN ('deposit', 'withdraw')
    ORDER BY created_at DESC
  `;

  db.all(sql, [userId], (err, rows) => {
    if (err) {
      console.error("❌ Transaction fetch error:", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json(rows);
  });
});

// ✅ (Optional) Keep this route if needed elsewhere
router.get('/transactions/:userId', (req, res) => {
  const db = req.app.locals.db;
  const { userId } = req.params;

  db.all(`
    SELECT 
      id, 
      user_id,
      CASE
        WHEN type = 'withdraw' THEN 'Withdrawal'
        WHEN type = 'deposit' THEN 'Deposit Request'
        ELSE type
      END AS type,
      amount, 
      balance, 
      status, 
      created_at
    FROM transactions
    WHERE user_id = ?
      AND type IN ('deposit', 'withdraw')
    ORDER BY created_at DESC
  `, [userId], (err, rows) => {
    if (err) {
      console.error("❌ Error fetching transactions:", err.message);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(rows);
  });
});

module.exports = router;
