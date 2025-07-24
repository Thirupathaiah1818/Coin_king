const express = require('express');
const router = express.Router();
// ✅ Add this here
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'thirupathaiah1818@gmail.com',     // ✅ use your Gmail
    pass: 'nnby bkwq okvo twcv'                // ✅ use Gmail App Password
  }
});

function sendWelcomeEmail(toEmail, userName) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Welcome to Coin King!</title>
    </head>
    <body style="font-family: sans-serif; background-color: #f7f9fc; padding: 20px;">
      <div style="max-width: 640px; margin: auto; background: white; padding: 30px; border-radius: 8px;">
        <h1 style="color: #4A00E0;">👑 Welcome to Coin King!</h1>
        <p>Hello <strong>${userName}</strong>,</p>
        <p>Thanks for joining <strong>Coin King</strong> — India's most thrilling online coin-flip betting game!</p>
        <p>Bet on <strong>KING 👑</strong> (Heads) or <strong>QUEEN 👸</strong> (Tails), watch the coin flip live, and win instantly!</p>
        <p><strong>Welcome Bonus:</strong> Deposit ₹500 or more today and get ₹100 extra.</p>
        <p>Start flipping now and rule the coin kingdom!</p>
        <p>Regards,<br>Team Coin King</p>
        <hr>
        <small style="color: #999;">© 2025 Coin King. All rights reserved.</small>
      </div>
    </body>
    </html>
  `;

  return transporter.sendMail({
    from: '"Coin King" <thirupathaiah1818@gmail.com>',
    to: toEmail,
    subject: '🎉 Welcome to Coin King!',
    html: htmlContent
  });
}
// ✅ POST /register (create user with wallet balance = 0)

// ✅ Login Route
router.post('/login', (req, res) => {
  const db = req.app.locals.db;
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: "Username/Phone and password required." });
  }

  const query = `
    SELECT * FROM users
    WHERE (username = ? OR phone = ?) AND password = ?
  `;

  db.get(query, [identifier, identifier, password], (err, user) => {
    if (err) return res.status(500).json({ message: "Database error." });

    if (!user) {
      return res.status(401).json({ message: "Invalid username/phone or password." });
    }

    res.status(200).json({
       message: "Login successful", userid: user.userid  });
  });
});

router.post('/register', (req, res) => {
  const db = req.app.locals.db;
  const { username, email, phone, password } = req.body;

  if (!username || !email || !phone || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const userid = req.app.locals.generateUserId();

  db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
    if (err) return res.status(500).json({ message: "Database error" });

    if (row) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    db.run(
      `INSERT INTO users (userid, username, email, phone, password, balance)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userid, username, email, phone, password, 0],
      function (err) {
        if (err) {
          console.error("Insert error:", err.message);
          return res.status(500).json({ message: "Failed to register user", error: err.message });
        }

        // ✅ Send welcome email
        sendWelcomeEmail(email, username)
          .then(() => {
            console.log("✅ Welcome email sent to", email);
          })
          .catch((err) => {
            console.error("❌ Failed to send welcome email:", err.message);
          });

        // ✅ Respond after sending email
        db.get(
          `SELECT rowid AS S_no, userid, username, email, phone, password, balance
           FROM users WHERE rowid = ?`,
          [this.lastID],
          (err, user) => {
            if (err) {
              console.error("Fetch error:", err.message);
              return res.status(500).json({ message: "User created but fetch failed" });
            }

            res.status(200).json({
              message: "User registered successfully",
              user
            });
          }
        );
      }
    );
  });
});


// ✅ GET /all-users
router.get('/all-users', (req, res) => {
  const db = req.app.locals.db;

  db.all(`
    SELECT 
      rowid AS S_no, 
      id,
      userid, 
      username, 
      email, 
      phone, 
      password,
      balance
    FROM users
     ORDER BY rowid DESC
  `, [], (err, rows) => {
    if (err) {
      console.error("❌ Error fetching users:", err.message);
      return res.status(500).json({ message: "Failed to fetch users" });
    }

    res.json(rows);
  });
});

// ✅ PATCH /update-balance/:id
router.patch('/update-balance/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.params.id;
  const { amount } = req.body;

  if (!amount || isNaN(amount)) {
    return res.status(400).json({ message: "Amount must be a number" });
  }

  db.run(
    "UPDATE users SET balance = balance + ? WHERE id = ?",
    [amount, userId],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ message: "User not found" });

      res.json({ message: "Balance updated successfully" });
    }
  );
});

// ✅ DELETE /delete-table
router.delete('/delete-table', (req, res) => {
  const db = req.app.locals.db;

  db.run("DROP TABLE IF EXISTS users", (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "Users table deleted." });
  });
});

// ✅ GET balance and winnings
router.get('/users/:userid/balance', (req, res) => {
  const db = req.app.locals.db;
  const { userid } = req.params;

  db.get("SELECT balance, winnings_balance FROM users WHERE userid = ?", [userid], (err, row) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (!row) return res.status(404).json({ message: "User not found" });

    res.json({ 
      balance: row.balance,
      winnings_balance: row.winnings_balance || 0
    });
  });
});

// ✅ Reset winnings
router.post('/:userid/reset-winnings', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.params.userid;

  db.run(`UPDATE users SET winnings_balance = 0 WHERE userid = ?`, [userId], function (err) {
    if (err) return res.status(500).json({ message: '❌ DB error while resetting winnings' });
    res.json({ message: '✅ Winnings reset successfully' });
  });
});

// ✅ Update winnings_balance
router.post('/:userid/update-winnings', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.params.userid;
  const { winnings_balance } = req.body;

  if (typeof winnings_balance !== 'number') {
    return res.status(400).json({ message: 'Invalid winnings_balance' });
  }

  db.run(`UPDATE users SET winnings_balance = ? WHERE userid = ?`, [winnings_balance, userId], function (err) {
    if (err) return res.status(500).json({ message: '❌ DB error while updating winnings' });
    res.json({ message: '✅ Winnings updated successfully' });
  });
});

module.exports = router;
