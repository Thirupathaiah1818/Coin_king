const db = require('./db');

function getISTMinute() {
  const now = new Date();
  const istTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

  const yyyy = istTime.getFullYear();
  const MM = String(istTime.getMonth() + 1).padStart(2, '0');
  const dd = String(istTime.getDate()).padStart(2, '0');
  const HH = String(istTime.getHours()).padStart(2, '0');
  const mm = String(istTime.getMinutes()).padStart(2, '0');

  return `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
}

function updateAdminSummary() {
  const minute = getISTMinute(); // ✅ Use IST time

  const queryDeposits = `
    SELECT COALESCE(SUM(amount), 0) AS total FROM add_balance_requests
    WHERE status = 'approved'
      AND strftime('%Y-%m-%d %H:%M', created_at) = ?
  `;

  const queryWithdraws = `
    SELECT COALESCE(SUM(amount), 0) AS total FROM withdraw_requests
    WHERE status = 'approved'
      AND strftime('%Y-%m-%d %H:%M', created_at) = ?
  `;

  const queryProfit = `
    SELECT COALESCE(SUM(profit), 0) AS total FROM transactions_summary
    WHERE strftime('%Y-%m-%d %H:%M', minute) = ?
  `;

  db.get(queryDeposits, [minute], (err1, depositRow) => {
    if (err1) return console.error("❌ Deposit fetch error:", err1);

    db.get(queryWithdraws, [minute], (err2, withdrawRow) => {
      if (err2) return console.error("❌ Withdraw fetch error:", err2);

      db.get(queryProfit, [minute], (err3, profitRow) => {
        if (err3) return console.error("❌ Profit fetch error:", err3);

        const deposit = depositRow.total || 0;
        const withdraw = withdrawRow.total || 0;
        const profit = profitRow.total || 0;

        db.run(`
          INSERT INTO admin_summary (minute, total_deposits, total_withdrawals, total_profit)
          VALUES (?, ?, ?, ?)
        `, [minute, deposit, withdraw, profit], (err4) => {
          if (err4) {
            console.error("❌ Insert admin_summary error:", err4);
          } else {
            console.log(`[✔] Admin Summary inserted for ${minute}`);
          }
        });
      });
    });
  });
}

setInterval(updateAdminSummary, 60 * 1000);
updateAdminSummary(); // Initial run
