module.exports = (db) => {
  setInterval(() => {
    // ✅ Step 1: Get current IST time
    const now = new Date();
    const istOffset = 330 * 60000; // IST = UTC +5:30
    const istNow = new Date(now.getTime() + istOffset);

    const currentMinute = istNow.toISOString().slice(0, 16).replace('T', ' ');
    const today = istNow.toISOString().split("T")[0];

    // ✅ Step 2: Define 1-minute time window
    const start = new Date(Math.floor(istNow.getTime() / 60000) * 60000); // floor to minute
    const end = new Date(start.getTime() + 60000); // next minute

    const startStr = new Date(start.getTime() - istOffset).toISOString(); // UTC start
    const endStr = new Date(end.getTime() - istOffset).toISOString();     // UTC end

    // ✅ Step 3: Fetch transactions in this 1-minute window (UTC-based)
    db.all(`
      SELECT user_id, bet_side, amount
      FROM transactions
      WHERE created_at >= ? AND created_at < ?
    `, [startStr, endStr], (err, rows) => {
      if (err) {
        console.error("❌ Error fetching transactions:", err.message);
        return;
      }

      if (rows.length === 0) {
        console.log("⏳ No transactions during", currentMinute);
        return;
      }

      // ✅ Step 4: Calculate summary
      const usersSet = new Set();
      let kingAmount = 0;
      let queenAmount = 0;

      rows.forEach(row => {
        usersSet.add(row.user_id);
        if (row.bet_side === 'king') kingAmount += row.amount;
        if (row.bet_side === 'queen') queenAmount += row.amount;
      });

      const usersPlayed = usersSet.size;
      if (usersPlayed < 2) {
        console.log(`⚠️ Only one user played at ${currentMinute}, skipping summary.`);
        return;
      }

      const result = kingAmount > queenAmount ? 'king' :
                     queenAmount > kingAmount ? 'queen' : 'draw';
      const profit = Math.abs(kingAmount - queenAmount);

      // ✅ Step 5: Insert into transaction_summary
      db.run(`
        INSERT INTO transactions_summary (minute, users_played, king_bets, queen_bets, result, profit)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [currentMinute, usersPlayed, kingAmount, queenAmount, result, profit], (err2) => {
        if (err2) {
          console.error("❌ Failed to insert into transactions_summary:", err2.message);
          return;
        }

        // ✅ Step 6: Update or insert into admin_wallet
        db.get(`SELECT * FROM admin_wallet WHERE date = ?`, [today], (err3, row) => {
          if (err3) {
            console.error("❌ Fetch admin_wallet failed:", err3.message);
            return;
          }

          if (row) {
            db.run(`
              UPDATE admin_wallet
              SET total_profit = total_profit + ?,
                  current_balance = current_balance + ?,
                  last_updated = datetime('now', 'localtime')
              WHERE date = ?
            `, [profit, profit, today], (err4) => {
              if (err4) {
                console.error("❌ Updating admin_wallet failed:", err4.message);
              } else {
                console.log("✅ Summary and wallet updated at", currentMinute);
              }
            });
          } else {
            db.run(`
              INSERT INTO admin_wallet (date, total_deposits, total_withdrawals, total_profit, current_balance, last_updated)
              VALUES (?, 0, 0, ?, ?, datetime('now', 'localtime'))
            `, [today, profit, profit], (err5) => {
              if (err5) {
                console.error("❌ Failed to insert new admin_wallet row:", err5.message);
              } else {
                console.log("✅ Summary added and new admin_wallet row created at", currentMinute);
              }
            });
          }
        });
      });
    });
  }, 60000);
};
