// ✅ FINAL: db.js (cleaned)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'db', 'coin_king.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error('❌ DB connection error:', err.message);
  console.log('✅ Connected to DB at', dbPath);

  db.serialize(() => {
    // USERS
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

    // ADD BALANCE REQUESTS
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



// ✅ Create 'admins' table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`, (err) => {
  if (err) {
    console.error("❌ Failed to create admins table:", err.message);
  } else {
    console.log("✅ Admins table ensured.");
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


db.run(`CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  type TEXT,               -- 'deposit', 'withdraw', 'bet'
  amount REAL,
  balance REAL,            -- User's balance after this transaction
  status TEXT,             -- 'approved', 'pending', 'rejected'
  action TEXT,             -- Optional (e.g. "Placed on King")
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY(user_id) REFERENCES users(userid)
)`);
// ✅ Ensure bet_side column exists in transactions table
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



    // TRANSACTION SUMMARY
    db.run(`CREATE TABLE IF NOT EXISTS transactions_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      minute TEXT DEFAULT (datetime('now', 'localtime')),
      users_played INTEGER,
      king_bets REAL,
      queen_bets REAL,
      result TEXT,
      profit REAL
    )`);

    // ADMIN WALLET
    db.run(`CREATE TABLE IF NOT EXISTS admin_wallet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_deposits REAL DEFAULT 0,
      total_withdrawals REAL DEFAULT 0,
      total_profit REAL DEFAULT 0,
      current_balance REAL DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      date TEXT
    )`);

    // UNIQUE date for admin_wallet
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_adminwallet_date ON admin_wallet(date)`);

    // ADMIN SUMMARY
    db.run(`CREATE TABLE IF NOT EXISTS admin_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      minute TEXT,
      total_deposits REAL,
      total_withdrawals REAL,
      total_profit REAL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });
});


module.exports = db;
