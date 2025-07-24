const express = require('express');
const router = express.Router();

const STATUS_PENDING = 'pending';
const STATUS_APPROVED = 'approved';
const STATUS_REJECTED = 'rejected';
function getTodayDate() {
  const today = new Date();
  return today.toISOString().split('T')[0]; // e.g., "2025-07-01"
}// ✅ Submit withdraw request (deduct only from winnings_balance)
router.post('/request', (req, res) => {
  const db = req.app.locals.db;
  const { user_id, amount, account_number, ifsc_code } = req.body;

  if (!user_id || !amount || !account_number || !ifsc_code)
    return res.status(400).json({ message: 'All fields are required' });

  if (account_number.length < 10)
    return res.status(400).json({ message: '❌ Account number must be at least 10 digits' });

  if (ifsc_code.length < 9)
    return res.status(400).json({ message: '❌ IFSC code must be at least 9 characters' });

  if (amount < 100 || amount > 5000)
    return res.status(400).json({ message: '❌ Withdrawal must be between ₹100 and ₹5000' });

  const today = getTodayDate();

  db.all(`
    SELECT * FROM withdraw_requests
    WHERE user_id = ? AND DATE(created_at) = ? AND status != 'rejected'
  `, [user_id, today], (err, rows) => {
    if (err) return res.status(500).json({ message: '❌ DB error checking daily limits' });

    const totalRequests = rows.length;
    const totalWithdrawnToday = rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);

    if (totalRequests >= 3) {
      return res.status(403).json({ message: '❌ You can only request 3 withdrawals per day' });
    }

    if (totalWithdrawnToday + amount > 5000) {
      return res.status(403).json({ message: `❌ Daily winning withdrawal limit ₹5000 exceeded. You already requested ₹${totalWithdrawnToday}` });
    }

    // ✅ Proceed with normal withdrawal if allowed
    db.get(`SELECT winnings_balance, total_deposit FROM users WHERE userid = ?`, [user_id], (err2, user) => {
      if (err2 || !user) return res.status(400).json({ message: '❌ User not found or DB error' });

      const winnings = parseFloat(user.winnings_balance || 0);
      const deposit = parseFloat(user.total_deposit || 0);

      if (winnings < amount) {
        return res.status(403).json({ message: `❌ Insufficient winning balance. Available: ₹${winnings}` });
      }

      const newWinnings = winnings - amount;
      const newBalance = deposit + newWinnings;

      db.serialize(() => {
        db.run(
          `UPDATE users SET winnings_balance = ?, balance = ? WHERE userid = ?`,
          [newWinnings, newBalance, user_id],
          function (err3) {
            if (err3) return res.status(500).json({ message: '❌ Failed to deduct from winnings balance' });

            db.run(
              `INSERT INTO withdraw_requests 
               (user_id, amount, account_number, ifsc_code, status, comment, created_at) 
               VALUES (?, ?, ?, ?, ?, '', datetime('now', 'localtime'))`,
              [user_id, amount, account_number, ifsc_code, STATUS_PENDING],
              function (err4) {
                if (err4) return res.status(500).json({ message: '❌ Failed to create request' });
                const requestId = this.lastID;

                // ✅ Log transaction as pending
                db.run(
                  `INSERT INTO transactions (user_id, type, amount, balance, status, action, created_at)
                   VALUES (?, 'withdraw', ?, ?, 'pending', 'Withdraw requested by user', datetime('now', 'localtime'))`,
                  [user_id, amount, newBalance],
                  function (err5) {
                    if (err5) {
                      console.error("❌ Failed to log transaction:", err5);
                      return res.status(201).json({
                        message: '✅ Withdraw request submitted, but failed to log transaction.',
                        id: requestId
                      });
                    }

                    res.status(201).json({ message: '✅ Withdraw request submitted', id: requestId });
                  }
                );
              }
            );
          }
        );
      });
    });
  });
});
// ✅ Admin approves or rejects withdraw
router.post('/submit/:id', (req, res) => {
  const db = req.app.locals.db;
  const requestId = req.params.id;
  let { status, comment } = req.body;

  if (!status) return res.status(400).json({ message: '⚠️ Please select Approved or Rejected.' });
  status = status.toLowerCase();

  db.get(
    `SELECT wr.*, u.total_deposit, u.winnings_balance 
     FROM withdraw_requests wr 
     JOIN users u ON wr.user_id = u.userid 
     WHERE wr.id = ?`,
    [requestId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ message: 'Withdraw request not found' });
      if (row.status !== STATUS_PENDING) return res.status(400).json({ message: 'Request already processed' });

      const { user_id, amount, total_deposit, winnings_balance } = row;
if (status === STATUS_REJECTED) {
  const newWinnings = parseFloat(winnings_balance) + parseFloat(amount);
  const newBalance = parseFloat(total_deposit) + newWinnings;

  db.serialize(() => {
    db.run(
      `UPDATE users SET winnings_balance = ?, balance = ? WHERE userid = ?`,
      [newWinnings, newBalance, user_id],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        db.run(
          `UPDATE withdraw_requests SET status = ?, comment = ? WHERE id = ?`,
          [STATUS_REJECTED, comment?.trim() || 'Withdraw rejected', requestId],
          (err3) => {
            if (err3) return res.status(500).json({ error: err3.message });

            // ✅ Fix: Find matching transaction and update status
            db.get(`
              SELECT id FROM transactions 
              WHERE user_id = ? AND type = 'withdraw' AND amount = ? AND status = 'pending'
              ORDER BY created_at DESC LIMIT 1
            `, [user_id, amount], (err4, tx) => {
              if (err4) return res.status(500).json({ error: err4.message });
              if (!tx) return res.status(404).json({ message: 'No matching transaction to update' });

              db.run(`UPDATE transactions SET status = ? WHERE id = ?`, ['rejected', tx.id], (err5) => {
                if (err5) return res.status(500).json({ error: err5.message });

                res.json({ message: '❌ Withdraw rejected and transaction updated' });
              });
            });
          }
        );
      }
    );
  });








    } else if (status === STATUS_APPROVED) {
  db.run(
    `UPDATE withdraw_requests SET status = ?, comment = ? WHERE id = ?`,
    [STATUS_APPROVED, comment?.trim() || 'Withdraw successful', requestId],
    (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      const updatedBalance = parseFloat(total_deposit) + parseFloat(winnings_balance);

      db.run(
        `INSERT INTO transactions (user_id, type, amount, balance, status, action)
         VALUES (?, 'withdraw', ?, ?, 'approved', 'Admin Approved Withdraw')`,
        [user_id, amount, updatedBalance],
        (err3) => {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ message: '✅ Withdraw approved' });
        }
      );
    }
  );

      } else {
        res.status(400).json({ message: 'Invalid status' });
      }
    }
  );
});

// ✅ Get all withdraw requests
router.get('/all', (req, res) => {
  const db = req.app.locals.db;
  db.all("SELECT * FROM withdraw_requests ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ✅ Get a single request by ID
router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const requestId = req.params.id;

  db.get("SELECT * FROM withdraw_requests WHERE id = ?", [requestId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Withdraw request not found" });
    res.json(row);
  });
});

// ✅ Update comment
router.patch('/comment/:id', (req, res) => {
  const db = req.app.locals.db;
  const requestId = req.params.id;
  const { comment } = req.body;

  if (!comment) return res.status(400).json({ message: 'Comment is required' });

  db.run(
    `UPDATE withdraw_requests SET comment = ? WHERE id = ?`,
    [comment, requestId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ message: 'Withdraw request not found' });

      res.json({ message: '✅ Comment updated successfully' });
    }
  );
});
router.post('/cancel/:id', (req, res) => {
  const db = req.app.locals.db;
  const requestId = req.params.id;

  db.get(`
    SELECT wr.*, u.total_deposit, u.winnings_balance 
    FROM withdraw_requests wr
    JOIN users u ON wr.user_id = u.userid
    WHERE wr.id = ?
  `, [requestId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ message: 'Withdrawal request not found' });

    const { user_id, amount, status, total_deposit, winnings_balance } = row;

    if (status !== 'pending') {
      return res.status(400).json({ message: 'Only pending withdrawals can be cancelled' });
    }

    const newWinnings = parseFloat(winnings_balance) + parseFloat(amount);
    const newBalance = parseFloat(total_deposit) + newWinnings;

    db.serialize(() => {
      db.run(
        `UPDATE users SET winnings_balance = ?, balance = ? WHERE userid = ?`,
        [newWinnings, newBalance, user_id],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });

          db.run(
            `UPDATE withdraw_requests SET status = 'cancelled', comment = 'Cancelled by user' WHERE id = ?`,
            [requestId],
            (err3) => {
              if (err3) return res.status(500).json({ error: err3.message });

              // ✅ Also update matching transaction to cancelled
              db.get(`
                SELECT id FROM transactions 
                WHERE user_id = ? AND type = 'withdraw' AND amount = ? AND status = 'pending'
                ORDER BY created_at DESC LIMIT 1
              `, [user_id, amount], (err4, tx) => {
                if (err4) return res.status(500).json({ error: err4.message });

                if (!tx) {
                  return res.status(200).json({
                    message: '✅ Withdraw cancelled (transaction not found but request updated)'
                  });
                }

                db.run(`
                  UPDATE transactions SET status = 'cancelled' WHERE id = ?
                `, [tx.id], (err5) => {
                  if (err5) return res.status(500).json({ error: err5.message });

                  res.json({ message: '✅ Withdrawal cancelled and transaction updated' });
                });
              });
            }
          );
        }
      );
    });
  });
});



module.exports = router;
