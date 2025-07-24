const express = require('express');
const router = express.Router();

// ✅ GET: Fetch all minute-wise summaries
router.get('/minute-wise', (req, res) => {
  const db = req.app.locals.db;

  const sql = `
    SELECT
      id,
      minute,
      users_played,
      king_bets,
      queen_bets,
      result,
      profit
    FROM transactions_summary
    ORDER BY minute DESC;
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("❌ SQL Error (summary):", err.message);
      return res.status(500).json({ error: "Failed to fetch transaction summary." });
    }

    res.json(rows);
  });
});

// ✅ POST: Insert a new summary & update admin_wallet profit
router.post('/minute-wise', (req, res) => {
  const db = req.app.locals.db;
  const { users_played, king_bets, queen_bets, result } = req.body;

  // ✅ Convert current time to IST accurately
  const now = new Date();
  const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

  // Format time: 'YYYY-MM-DD HH:mm:ss' in IST
  const minute = istTime.toLocaleString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
  }).replace(',', '');

  // For wallet table (only date part)
  const today = istTime.toISOString().split("T")[0];

  if (parseInt(users_played) < 3) {
    return res.status(400).json({
      message: "⚠️ More than 2 users required to play this game. Bets not allowed."
    });
  }

  const kingAmount = parseFloat(king_bets);
  const queenAmount = parseFloat(queen_bets);
  const profit = Math.abs(kingAmount - queenAmount);

  // ✅ Step 1: Insert into transactions_summary
  const insertSummarySQL = `
    INSERT INTO transactions_summary (minute, users_played, king_bets, queen_bets, result, profit)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  db.run(insertSummarySQL, [minute, users_played, kingAmount, queenAmount, result, profit], function (err) {
    if (err) {
      console.error("❌ Insert Error:", err.message);
      return res.status(500).json({ error: err.message });
    }

    console.log(`✅ Inserted transaction summary at IST ${minute}`);

    // ✅ Step 2: Update today's profit and balance in admin_wallet
    db.get(`SELECT * FROM admin_wallet WHERE date = ?`, [today], (checkErr, walletRow) => {
      if (checkErr) {
        console.error("❌ Error checking admin_wallet:", checkErr.message);
        return res.status(500).json({ error: "Failed to check admin_wallet" });
      }

      if (walletRow) {
        // ✅ Update existing wallet record
        const updateWalletSQL = `
          UPDATE admin_wallet 
          SET total_profit = total_profit + ?, current_balance = current_balance + ?, last_updated = CURRENT_TIMESTAMP
          WHERE date = ?
        `;
        db.run(updateWalletSQL, [profit, profit, today], (updateErr) => {
          if (updateErr) {
            console.error("❌ Wallet update failed:", updateErr.message);
            return res.status(500).json({ error: "Failed to update wallet" });
          }
          return res.status(201).json({ message: "✅ Summary added and wallet updated" });
        });
      } else {
        // 🚀 First record for today
        const insertWalletSQL = `
          INSERT INTO admin_wallet (date, total_profit, current_balance, last_updated)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `;
        db.run(insertWalletSQL, [today, profit, profit], (insertErr) => {
          if (insertErr) {
            console.error("❌ Wallet insert failed:", insertErr.message);
            return res.status(500).json({ error: "Failed to insert wallet record" });
          }
          return res.status(201).json({ message: "✅ Summary and new wallet record added" });
        });
      }
    });
  });
});

module.exports = router;
