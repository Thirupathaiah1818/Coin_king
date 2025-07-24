const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

// File storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

router.post('/admin/add-balance', upload.single('screenshot'), (req, res) => {
  const db = req.app.locals.db;
  const { user_id, amount, transaction_id } = req.body;
  const screenshot = req.file ? req.file.filename : null;

  if (!user_id || !amount || !screenshot) {
    return res.status(400).json({ message: 'User ID, amount, and screenshot are required' });
  }

  db.get(`SELECT id FROM users WHERE userid = ?`, [user_id], (err, user) => {
    if (err || !user) return res.status(400).json({ message: 'User not found' });

    db.get(`SELECT id FROM add_balance_requests WHERE transaction_id = ?`, [transaction_id], (err2, exists) => {
      if (err2) return res.status(500).json({ message: 'Database error' });

      if (exists) {
        return res.status(400).json({ message: '❌ This Transaction ID is already used. Please enter a unique one.' });
      }

      // ✅ Insert balance request first
      db.run(`
        INSERT INTO add_balance_requests (user_id, amount, screenshot, transaction_id, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', datetime('now', 'localtime'))
      `, [user_id, amount, screenshot, transaction_id], function (err) {
        if (err) return res.status(500).json({ error: err.message });

        const requestId = this.lastID;

        // ✅ Then insert pending transaction log
        db.get(`SELECT balance FROM users WHERE userid = ?`, [user_id], (balErr, userRow) => {
          const currentBalance = userRow?.balance ?? null;

          db.run(`
            INSERT INTO transactions (user_id, type, amount, balance, status, action)
            VALUES (?, 'deposit', ?, ?, 'pending', 'Waiting for admin approval')
          `, [user_id, amount, currentBalance], (txErr) => {
            if (txErr) {
              console.error("❌ Transaction log failed:", txErr.message);
              return res.status(500).json({ error: 'Request stored, but transaction log failed.' });
            }

            res.json({ message: '✅ Balance request submitted and pending transaction recorded', requestId });
          });
        });
      });
    });
  });
});

// ✅ Approve request and update balances
router.post('/admin/approve/:id', (req, res) => {
  const db = req.app.locals.db;
  const requestId = req.params.id;
  const { comment, amount: newAmount } = req.body;

  db.get(`SELECT id, user_id, amount FROM add_balance_requests WHERE id = ?`, [requestId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ message: 'Request not found' });

    const { user_id } = row;
    const amount = parseFloat(newAmount) || row.amount;

    let finalComment = comment;
    if (!comment || comment.toLowerCase().includes("withdraw")) {
      finalComment = "Deposit Successfully Completed";
    }

    db.serialize(() => {
      db.run(`
        UPDATE add_balance_requests
        SET status = 'approved', comment = ?, amount = ?
        WHERE id = ?`,
        [finalComment || '', amount, requestId]
      );

      
  db.run(`
  UPDATE users 
  SET balance = balance + ?, total_deposit = total_deposit + ?
  WHERE userid = ?
`, [amount, amount, user_id], (err2) => {
  if (err2) return res.status(500).json({ error: err2.message });

  // ✅ Fetch updated balance after updating user
  db.get(`SELECT balance FROM users WHERE userid = ?`, [user_id], (err3, userRow) => {
    if (err3 || !userRow) {
      return res.status(500).json({ error: 'Failed to fetch updated balance' });
    }

    db.run(`
      INSERT INTO transactions (user_id, type, amount, balance, status, action)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      user_id,
      'deposit',
      amount,
      userRow.balance,
      'approved',
      'Admin Approved Deposit'
    ]);
  });
});


      

      db.run(`
        UPDATE admin_wallet
        SET total_deposits = total_deposits + ?,
            current_balance = current_balance + ?,
            last_updated = datetime('now', 'localtime')
        WHERE id = 1`,
        [amount, amount],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ message: '✅ Request approved and balances updated' });
        }
      );
    });
  });
});

// ✅ Update status and comment
router.post('/admin/update-status/:id', (req, res) => {
  const db = req.app.locals.db;
  const id = req.params.id;
  const { status, comment } = req.body;

  let query, params;

  if (status === 'approved') {
    query = `UPDATE add_balance_requests 
             SET status = ?, comment = ?, created_at = datetime('now', 'localtime') 
             WHERE id = ?`;
    params = [status, comment, id];
  } else {
    query = `UPDATE add_balance_requests 
             SET status = ?, comment = ? 
             WHERE id = ?`;
    params = [status, comment, id];
  }

  db.run(query, params, function (err) {
    if (err) {
      console.error("Error updating status/comment:", err.message);
      return res.status(500).json({ success: false, message: "DB error" });
    }
    res.json({ success: true, message: "Status and comment updated" });
  });
});

// ✅ Reject request
router.post('/admin/reject/:id', (req, res) => {
  const db = req.app.locals.db;
  const requestId = req.params.id;
  const { comment } = req.body;

  db.get(`SELECT id FROM add_balance_requests WHERE id = ?`, [requestId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ message: 'Request not found' });

    db.run(`
      UPDATE add_balance_requests
      SET status = 'rejected', comment = ?
      WHERE id = ?`,
      [comment || '', requestId],
      (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '❌ Request rejected successfully' });
      }
    );
  });
});

// ✅ Get all balance requests (includes transaction_id)
router.get('/admin/all', (req, res) => {
  const db = req.app.locals.db;
  db.all(`
    SELECT abr.id, abr.user_id, abr.amount, abr.screenshot, abr.status,
           abr.comment, abr.transaction_id, abr.created_at,
           COALESCE(u.username, 'Unknown') AS username
    FROM add_balance_requests abr
    LEFT JOIN users u ON u.id = abr.user_id
    ORDER BY abr.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// ✅ Update status with comment
router.post('/admin/update-status/:id', (req, res) => {
  const db = req.app.locals.db;
  const requestId = req.params.id;
  const { status, comment } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  db.run(`
    UPDATE add_balance_requests
    SET status = ?, comment = ?
    WHERE id = ?`,
    [status, comment || '', requestId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ message: 'Request not found' });

      res.json({ message: `Status updated to ${status}` });
    }
  );
});

// ✅ Only update comment
router.patch('/admin/comment/:id', (req, res) => {
  const db = req.app.locals.db;
  const requestId = req.params.id;
  const { comment } = req.body;

  db.run(`
    UPDATE add_balance_requests
    SET comment = ?
    WHERE id = ?`,
    [comment, requestId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ message: "Request not found" });

      res.json({ message: 'Comment updated successfully' });
    }
  );
});

module.exports = router;
