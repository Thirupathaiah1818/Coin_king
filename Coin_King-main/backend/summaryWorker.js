const db = require('./db');

function generateTransactionSummary() {
  const minute = new Date().toISOString().slice(0, 16).replace('T', ' ');

  db.all(`
    SELECT user_id, bet_side, amount FROM transactions
    WHERE strftime('%Y-%m-%d %H:%M', created_at) = strftime('%Y-%m-%d %H:%M', 'now', 'localtime')
      AND type IN ('bet', 'bet_result')
  `, (err, rows) => {
    if (err) return console.error("❌ Error fetching transactions:", err.message);
    if (rows.length <= 1) {
      console.log(`[${minute}] ⛔ Only one or no users played. Summary skipped.`);
      return;
    }

    const uniqueUsers = new Set();
    let kingBets = 0, queenBets = 0;

    rows.forEach(row => {
      uniqueUsers.add(row.user_id);

      const side = row.bet_side?.toLowerCase();
      if (side === 'king') {
        kingBets += row.amount;
      } else if (side === 'queen') {
        queenBets += row.amount;
      } else {
        console.warn(`⚠️ Skipping transaction row with missing or invalid side: user ${row.user_id}, amount ₹${row.amount}`);
      }
    });

    const result = kingBets > queenBets ? 'queen' : 'king';
    const profit = Math.abs(kingBets - queenBets);

    db.run(`
      INSERT INTO transactions_summary (minute, users_played, king_bets, queen_bets, result, profit)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [minute, uniqueUsers.size, kingBets, queenBets, result, profit], (insertErr) => {
      if (insertErr) {
        console.error("❌ Failed to insert transaction summary:", insertErr.message);
      } else {
        console.log(`[${minute}] ✅ Transaction summary saved.`);

        const timePattern = `${minute}%`;
        db.run(`
          INSERT INTO admin_summary (minute, total_deposits, total_withdrawals, total_profit)
          VALUES (
            ?,
            (SELECT IFNULL(SUM(amount), 0) FROM add_balance_requests WHERE status = 'approved' AND created_at LIKE ?),
            (SELECT IFNULL(SUM(amount), 0) FROM withdraw_requests WHERE status = 'approved' AND created_at LIKE ?),
            ?
          )
        `, [minute, timePattern, timePattern, profit], (err) => {
          if (err) {
            console.error("❌ Failed to insert into admin_summary:", err.message);
          } else {
            console.log(`[${minute}] 🧾 Admin summary inserted. Profit: ₹${profit}`);
          }
        });
      }
    });
  });
}

// ⏱️ Run every 1 minute
setInterval(generateTransactionSummary, 60 * 1000);
