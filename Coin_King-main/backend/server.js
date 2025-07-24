// server.js
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;
const frontendPath = path.join(__dirname, 'frontend');
app.use('/frontend', express.static(frontendPath));
app.use(express.static(frontendPath));
app.use('/assets', express.static(path.join(__dirname, 'frontend', 'admin', 'assets')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin', 'CK11 Final.html'));
});


// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static('uploads'));
app.use('/frontend', express.static(path.join(__dirname, 'frontend')));


// ✅ Connect to SQLite DB
const db = new sqlite3.Database('./db/coin_king.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) return console.error('❌ DB Connection Error:', err.message);
  console.log('✅ Connected to SQLite database.');
});

db.configure("busyTimeout", 5000);
app.locals.db = db;
app.locals.generateUserId = () => 'CK' + Date.now();

// ✅ Ensure admin_wallet row exists
function ensureAdminWalletRow() {
  db.get("SELECT id FROM admin_wallet WHERE id = 1", [], (err, row) => {
    if (err) {
      console.error('❌ Failed to check admin_wallet:', err.message);
    } else if (!row) {
      db.run(`INSERT INTO admin_wallet (id, total_deposits, total_withdrawals, total_profit,  current_balance, date) VALUES (1, 0, 0, 0,  0, ?)`, [new Date().toISOString().split("T")[0]]);
    }
  });
}

db.serialize(() => {
  // ✅ Create all tables
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userid TEXT UNIQUE,
    username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    balance REAL DEFAULT 0
  )`);
  // Add winnings_balance column if not exists
db.get("PRAGMA table_info(users)", (err, row) => {
    if (err) {
      console.error("❌ Failed to fetch table info:", err.message);
      return;
    }

    db.all("PRAGMA table_info(users)", (err, columns) => {
      const colNames = columns.map(col => col.name);

      if (!colNames.includes('winnings_balance')) {
        db.run("ALTER TABLE users ADD COLUMN winnings_balance REAL DEFAULT 0", () =>
          console.log("✅ Added 'winnings_balance' column"));
      }

      if (!colNames.includes('total_deposit')) {
        db.run("ALTER TABLE users ADD COLUMN total_deposit REAL DEFAULT 0", () =>
          console.log("✅ Added 'total_deposit' column"));
      }
    });
  });

db.run(`CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  betChoice TEXT NOT NULL,
  outcome TEXT,
  amount REAL NOT NULL,
  result TEXT CHECK(result IN ('pending', 'Win', 'Lose')) DEFAULT 'pending',
  date DATETIME DEFAULT CURRENT_TIMESTAMP
)`);
db.run(`ALTER TABLE bets ADD COLUMN source TEXT`, (err) => {
  if (err && !err.message.includes("duplicate column")) {
    console.error("❌ Failed to alter bets table:", err.message);
  } else {
    console.log("✅ 'source' column added to bets table (if not already present)");
  }
});
  db.run(`
  CREATE TABLE IF NOT EXISTS transactions_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    users_played INTEGER NOT NULL,
    king_bets REAL DEFAULT 0,
    queen_bets REAL DEFAULT 0,
    result TEXT,
    profit REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    type TEXT,
    amount REAL,
    balance REAL,
    status TEXT,
    action TEXT,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(user_id) REFERENCES users(userid)
  )`);

  db.all("PRAGMA table_info(transactions)", (err, columns) => {
    if (err) return console.error("❌ Failed to check transactions schema:", err);
    const hasBetSide = columns.some(col => col.name === "bet_side");
    if (!hasBetSide) {
      db.run(`ALTER TABLE transactions ADD COLUMN bet_side TEXT`, (err2) => {
        if (err2) return console.error("❌ Failed to add bet_side column:", err2.message);
        console.log("✅ bet_side column added to transactions table.");
      });
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS add_balance_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    amount REAL,
    screenshot TEXT,
    status TEXT CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
    comment TEXT,
    created_at DATETIME DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(user_id) REFERENCES users(userid)
  )`);
db.all("PRAGMA table_info(add_balance_requests)", (err, columns) => {
  if (err) {
    console.error("❌ Failed to inspect table:", err.message);
    return;
  }

  const hasColumn = columns.some(col => col.name === "transaction_id");

  if (!hasColumn) {
    db.run("ALTER TABLE add_balance_requests ADD COLUMN transaction_id ", (err) => {
      if (err) {
        console.error("❌ Failed to add transaction_id column:", err.message);
      } else {
        console.log("✅ transaction_id column added successfully.");
      }
    });
  } else {
    console.log("✅ transaction_id column already exists.");
  }
});
db.run(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_transaction_id 
  ON add_balance_requests (transaction_id)
`, (err) => {
  if (err) {
    console.error("❌ Failed to create unique index:", err.message);
  } else {
    console.log("✅ Unique index on transaction_id created successfully.");
  }
});


  db.run(`CREATE TABLE IF NOT EXISTS withdraw_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  account_number TEXT NOT NULL CHECK(length(account_number) >= 10),
  ifsc_code TEXT NOT NULL CHECK(length(ifsc_code) >= 9),
  status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(userid)
)`);

// ✅ Patch: Allow 'cancelled' in withdraw_requests.status
db.all(`PRAGMA table_info(withdraw_requests)`, (err, columns) => {
  if (err) return console.error("❌ Failed to inspect withdraw_requests table:", err.message);

  const statusColumn = columns.find(col => col.name === "status");
  const hasCancelled = statusColumn && statusColumn.type.includes("'cancelled'");

  if (!hasCancelled) {
    // ✅ Check if withdraw_requests_old already exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='withdraw_requests_old'", (err, row) => {
      if (err) return console.error("❌ Failed to check withdraw_requests_old:", err.message);

      if (row) {
        console.warn("⚠️ Migration skipped: 'withdraw_requests_old' already exists. Manual cleanup required if needed.");
        return;
      }

      console.log("🔧 Updating withdraw_requests to support 'cancelled' status...");

      db.serialize(() => {
        // 1. Rename the old table
        db.run(`ALTER TABLE withdraw_requests RENAME TO withdraw_requests_old`, (err1) => {
          if (err1) return console.error("❌ Step 1: Rename failed:", err1.message);

          // 2. Create the new table with updated CHECK constraint
          db.run(`
            CREATE TABLE withdraw_requests (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              amount REAL NOT NULL,
              account_number TEXT NOT NULL CHECK(length(account_number) >= 10),
              ifsc_code TEXT NOT NULL CHECK(length(ifsc_code) >= 9),
              status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')) DEFAULT 'pending',
              comment TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (user_id) REFERENCES users(userid)
            )
          `, (err2) => {
            if (err2) return console.error("❌ Step 2: Create new table failed:", err2.message);

            // 3. Copy data from old to new table
            db.run(`
              INSERT INTO withdraw_requests 
                (id, user_id, amount, account_number, ifsc_code, status, comment, created_at)
              SELECT 
                id, user_id, amount, account_number, ifsc_code, status, comment, created_at 
              FROM withdraw_requests_old
            `, (err3) => {
              if (err3) return console.error("❌ Step 3: Copy data failed:", err3.message);

              // 4. Drop old table
              db.run(`DROP TABLE withdraw_requests_old`, (err4) => {
                if (err4) return console.error("❌ Step 4: Drop old table failed:", err4.message);
                console.log("✅ withdraw_requests table updated to include 'cancelled' in status check.");
              });
            });
          });
        });
      });
    });
  } else {
    console.log("✅ withdraw_requests already supports 'cancelled' status.");
  }
});

  db.run(`CREATE TABLE IF NOT EXISTS admin_wallet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_deposits REAL DEFAULT 0,
    total_withdrawals REAL DEFAULT 0,
    total_profit REAL DEFAULT 0,
    current_balance REAL DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    date TEXT
  )`);

  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_adminwallet_date ON admin_wallet(date)`);

  db.run(`CREATE TABLE IF NOT EXISTS admin_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    minute TEXT,
    total_deposits REAL,
    total_withdrawals REAL,
    total_profit REAL
  )`);

  ensureAdminWalletRow();
});

// ✅ Route imports
const userRoutes = require('./routes/users');
const adminsRoutes = require('./routes/admins');
const addBalanceRoutes = require('./routes/addbalance');
const analyticsRoutes = require('./routes/analytics')(db);
const summaryRoutes = require('./routes/summary');
const withdrawRoutes = require('./routes/withdraw');
const adminWalletRoutes = require('./routes/adminwallet');
const adminRoutes = require('./routes/adminRoutes');
const transactionRoutes = require('./routes/transactions');
const betsRoutes = require('./routes/bets'); // ✅ FIXED: Corrected from betsplace.js

// ✅ Use routes
app.use('/api', userRoutes);
app.use('/api', addBalanceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/withdraw', withdrawRoutes);
app.use('/api/admin', adminWalletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', transactionRoutes);
app.use('/api/bets', betsRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/admins', adminsRoutes);
// ✅ Background workers
require('./adminSummary');
require('./summaryWorker');

// ✅ Extra endpoints
app.get('/api/users/:id/balance', (req, res) => {
  const userId = req.params.id;
  db.get("SELECT balance FROM users WHERE userid = ?", [userId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "User not found" });
    res.json({ balance: row.balance });
  });
});

app.get('/api/withdraw/:id', (req, res) => {
  const id = req.params.id;
  db.get("SELECT * FROM withdraw_requests WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Withdraw request not found" });
    res.json(row);
  });
});

app.get('/api/admin/summary', (req, res) => {
  db.all(`SELECT * FROM admin_summary ORDER BY minute DESC LIMIT 50`, [], (err, rows) => {
    if (err) {
      console.error("Error fetching admin summary:", err.message);
      return res.status(500).json({ error: "Internal Server Error" });
    }
    res.json(rows);
  });
});

app.get('/api/users/:userid', (req, res) => {
  const userid = req.params.userid;
  db.get("SELECT username, phone, email FROM users WHERE userid = ?", [userid], (err, row) => {
    if (err) {
      console.error("❌ Failed to fetch user profile:", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
    if (!row) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(row);
  });
});
// ✅ Add these 2 routes below after DB is set
app.post('/api/users/:userid/reset-winnings', (req, res) => {
  const db = req.app.locals.db;
  db.run(`UPDATE users SET winnings_balance = 0 WHERE userid = ?`, [req.params.userid], function (err) {
    if (err) return res.status(500).json({ message: 'DB error while resetting' });
    res.json({ message: '✅ Winnings reset' });
  });
});

app.post('/api/users/:userid/update-winnings', (req, res) => {
  const db = req.app.locals.db;
  const { winnings_balance } = req.body;
  db.run(`UPDATE users SET winnings_balance = ? WHERE userid = ?`, [winnings_balance, req.params.userid], function (err) {
    if (err) return res.status(500).json({ message: 'DB error while updating winnings' });
    res.json({ message: '✅ Winnings updated' });
  });
});


// ✅ Start server
app.listen(3000, '0.0.0.0', () => {
  console.log("Server running on 0.0.0.0:3000");
});
