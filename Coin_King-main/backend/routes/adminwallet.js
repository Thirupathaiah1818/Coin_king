const express = require('express');
const router = express.Router();

// ✅ Convert current time to IST date
function getISTDate() {
  const now = new Date();
  const istOffset = 330; // IST is UTC +5:30
  const istTime = new Date(now.getTime() + istOffset * 60000);
  return istTime.toISOString().split("T")[0];
}

// ✅ GET /api/admin/wallet - Calculate today's live admin wallet data (not from DB)
router.get('/wallet', (req, res) => {
  const today = getISTDate();
  const db = req.app.locals.db;

  db.serialize(() => {
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalProfit = 0;

    db.get(`SELECT SUM(amount) AS total FROM add_balance_requests WHERE status = 'approved' AND DATE(created_at) = ?`, [today], (err1, row1) => {
      if (err1) return res.status(500).json({ error: err1.message });
      totalDeposits = row1?.total || 0;

      db.get(`SELECT SUM(amount) AS total FROM withdraw_requests WHERE status = 'approved' AND DATE(created_at) = ?`, [today], (err2, row2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        totalWithdrawals = row2?.total || 0;

        db.get(`SELECT SUM(profit) AS total FROM transactions_summary WHERE DATE(minute) = ?`, [today], (err3, row3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          totalProfit = row3?.total || 0;

          const currentBalance = (totalDeposits + totalProfit) - totalWithdrawals;

          return res.json({
            date: today,
            total_deposits: totalDeposits,
            total_withdrawals: totalWithdrawals,
            total_profit: totalProfit,
            current_balance: currentBalance,
            last_updated: new Date().toISOString()
          });
        });
      });
    });
  });
});

// ✅ POST /api/admin/wallet/update - Store today's calculated values into DB
// ✅ POST /api/admin/wallet/update - Store today's calculated values into DB
router.post('/wallet/update', (req, res) => {
  const db = req.app.locals.db;
  const today = new Date(new Date().getTime() + 330 * 60000).toISOString().split("T")[0]; // IST date

  db.serialize(() => {
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalProfit = 0;

    db.get(`
      SELECT SUM(amount) AS total 
      FROM add_balance_requests 
      WHERE status = 'approved' AND DATE(created_at) = ?
    `, [today], (err1, row1) => {
      if (err1) return res.status(500).json({ error: err1.message });
      totalDeposits = row1?.total || 0;

      db.get(`
        SELECT SUM(amount) AS total 
        FROM withdraw_requests 
        WHERE status = 'approved' AND DATE(created_at) = ?
      `, [today], (err2, row2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        totalWithdrawals = row2?.total || 0;

        db.get(`
          SELECT SUM(profit) AS total 
          FROM transactions_summary 
          WHERE DATE(minute) = ?
        `, [today], (err3, row3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          totalProfit = row3?.total || 0;

          const currentBalance = (totalDeposits + totalProfit) - totalWithdrawals;

          db.get(`SELECT * FROM admin_wallet WHERE date = ?`, [today], (err4, row) => {
            if (err4) return res.status(500).json({ error: err4.message });

            if (row) {
              db.run(`
                UPDATE admin_wallet 
                SET total_deposits = ?, 
                    total_withdrawals = ?, 
                    total_profit = ?, 
                    current_balance = ?, 
                    last_updated = datetime('now', 'localtime')
                WHERE date = ?
              `, [totalDeposits, totalWithdrawals, totalProfit, currentBalance, today], (err5) => {
                if (err5) return res.status(500).json({ error: err5.message });
                return res.status(200).json({ message: "✅ Admin wallet updated successfully." });
              });
            } else {
              db.run(`
                INSERT INTO admin_wallet 
                (date, total_deposits, total_withdrawals, total_profit, current_balance, last_updated) 
                VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
              `, [today, totalDeposits, totalWithdrawals, totalProfit, currentBalance], (err6) => {
                if (err6) return res.status(500).json({ error: err6.message });
                return res.status(201).json({ message: "✅ Admin wallet inserted successfully." });
              });
            }
          });
        });
      });
    });
  });
});


// ✅ GET latest row from admin_wallet DB table
router.get('/wallet/summary', (req, res) => {
  const db = req.app.locals.db;
  db.get('SELECT * FROM admin_wallet ORDER BY id DESC LIMIT 1', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Admin wallet not found' });
    res.json(row);
  });
});

// ✅ GET all admin wallet history (ordered by latest date)
router.get('/wallet/history', (req, res) => {
  const db = req.app.locals.db;
  db.all('SELECT * FROM admin_wallet ORDER BY date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
// ✅ GET overall current balance (sum of all admin_wallet current_balance)
router.get('/wallet/total-balance', (req, res) => {
  const db = req.app.locals.db;
  db.get(`SELECT SUM(current_balance) as total_balance FROM admin_wallet`, [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ total_balance: row?.total_balance || 0 });
  });
});

// ✅ One-time fix: Update old deposit entries with wrong date
router.post('/fix-old-deposits', (req, res) => {
  const db = req.app.locals.db;

  db.run(`
    UPDATE add_balance_requests
    SET created_at = datetime('now', 'localtime')
    WHERE DATE(created_at) = '2025-06-18'
  `, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    return res.json({ message: '✅ Old deposit dates updated to today (once only)' });
  });
});

module.exports = router;
