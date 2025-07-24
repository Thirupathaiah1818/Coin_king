const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

// ✅ Admin Registration
router.post('/register', async (req, res) => {
  const db = req.app.locals.db;
  const { name, phone, email, password } = req.body;

  if (!name || !phone || !email || !password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  db.get(`SELECT * FROM admins WHERE email = ? OR phone = ?`, [email, phone], async (err, existing) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (existing) return res.status(409).json({ message: "Admin already exists with this email or phone" });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      db.run(
        `INSERT INTO admins (name, phone, email, password) VALUES (?, ?, ?, ?)`,
        [name, phone, email, hashedPassword],
        function (err2) {
          if (err2) return res.status(500).json({ message: "Insert error", error: err2.message });

          res.json({
            message: "✅ Admin registered successfully",
            adminId: this.lastID
          });
        }
      );
    } catch (hashErr) {
      res.status(500).json({ message: "Error hashing password", error: hashErr.message });
    }
  });
});

// ✅ Admin Login (email or phone)
router.post('/login', (req, res) => {
  const db = req.app.locals.db;
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ message: "Email or Phone and password are required" });
  }

  db.get(
    `SELECT * FROM admins WHERE email = ? OR phone = ?`,
    [identifier, identifier],
    async (err, admin) => {
      if (err) return res.status(500).json({ message: "Database error", error: err.message });
      if (!admin) return res.status(401).json({ message: "Invalid credentials" });

      const valid = await bcrypt.compare(password, admin.password);
      if (!valid) return res.status(401).json({ message: "Invalid credentials" });

      res.json({
        message: "✅ Login successful",
        adminId: admin.id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone
      });
    }
  );
});

module.exports = router;
