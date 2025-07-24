// File: routes/userRoutes.js

const express = require('express');
const bcrypt = require("bcryptjs");
const router = express.Router();
const { sendEmail } = require("../utils/mailer");

// ✅ Signup Route
router.post('/signup', async (req, res) => {
  const db = req.app.locals.db;
  const generateUserId = req.app.locals.generateUserId;
  const { name, email, phone, password } = req.body;

  if (!name || !email || !phone || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const userId = generateUserId();
  console.log("🔁 Signup attempt:", { name, email, phone });

  try {
    const existing = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (existing) {
      console.log("⚠️ User already exists:", email);
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (userId, name, email, phone, password) VALUES (?, ?, ?, ?, ?)',
        [userId, name, email, phone, hashedPassword],
        function (err) {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // ✅ Send welcome email to user
    const userMail = await sendEmail(
      email,
      "🎉 Welcome to Coin King",
      `<h2>Hi ${name}!</h2><p>Your account (ID: <strong>${userId}</strong>) has been created.</p>`
    );

    const adminMail = await sendEmail(
      "ncsupritha@gmail.com",
      "📥 New User Signup",
      `<p>User <strong>${name}</strong> (${email}) just signed up.</p>`
    );

    if (!userMail || !adminMail) {
      console.warn("⚠️ Email sending failed during signup");
    } else {
      console.log("✅ Emails sent to user and admin");
    }

    console.log("✅ Signup complete. Email sent to user and admin.");
    res.status(200).json({ message: 'Signup successful', userId });

  } catch (err) {
    console.error("❌ Signup error:", err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ✅ Login
router.post('/login', (req, res) => {
  const db = req.app.locals.db;
  const { userId, password } = req.body;

  db.get('SELECT * FROM users WHERE userId = ? OR email = ? OR phone = ?', [userId, userId, userId], async (err, user) => {
    if (err || !user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

    res.json({ message: "Login successful", user });
  });
});

// ✅ Deposit
// router.post('/deposit', (req, res) => {
//   const db = req.app.locals.db;
//   const { userId, amount } = req.body;

//   if (!userId || !amount) return res.status(400).json({ message: "Missing data" });

//   db.run('UPDATE users SET balance = balance + ? WHERE userId = ?', [amount, userId]);
//   db.run('INSERT INTO transactions (userId, type, amount, date) VALUES (?, "deposit", ?, datetime("now"))', [userId, amount]);

//   res.json({ message: "Deposit successful" });
// });

// ✅ Withdraw
router.post('/withdraw', (req, res) => {
  const db = req.app.locals.db;
  const { userId, amount } = req.body;

  db.get('SELECT balance FROM users WHERE userId = ?', [userId], (err, row) => {
    if (err || !row) return res.status(404).json({ message: "User not found" });
    if (row.balance < amount) return res.status(400).json({ message: "Insufficient balance" });

    db.run('UPDATE users SET balance = balance - ? WHERE userId = ?', [amount, userId]);
    db.run('INSERT INTO transactions (userId, type, amount, date) VALUES (?, "withdraw", ?, datetime("now"))', [userId, amount]);

    res.json({ message: "Withdraw successful" });
  });
});

// ✅ Bet (Heads/Tails)
router.post('/bet', (req, res) => {
  const db = req.app.locals.db;
  const { userId, amount, choice } = req.body;
  const result = Math.random() < 0.5 ? "Heads" : "Tails";

  db.get('SELECT balance FROM users WHERE userId = ?', [userId], (err, row) => {
    if (err || !row) return res.status(404).json({ message: "User not found" });
    if (row.balance < amount) return res.status(400).json({ message: "Insufficient balance" });

    let win = result === choice;
    let newBalance = win ? amount : -amount;

    db.run('UPDATE users SET balance = balance + ? WHERE userId = ?', [newBalance, userId]);
    db.run('INSERT INTO bets (userId, choice, result, amount, date) VALUES (?, ?, ?, ?, datetime("now"))', [userId, choice, result, amount]);

    res.json({ result, won: win, newBalance: row.balance + newBalance });
  });
});

// ✅ Get History
router.get('/history/:userId', (req, res) => {
  const db = req.app.locals.db;
  const { userId } = req.params;

  db.all('SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC', [userId], (err, transactions) => {
    if (err) return res.status(500).json({ message: "Error fetching transactions" });

    db.all('SELECT * FROM bets WHERE userId = ? ORDER BY date DESC', [userId], (err2, bets) => {
      if (err2) return res.status(500).json({ message: "Error fetching bets" });

      res.json({ transactions, bets });
    });
  });
});

module.exports = router;


