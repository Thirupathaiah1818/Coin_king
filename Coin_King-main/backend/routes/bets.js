const express = require('express');
const router = express.Router();

// ✅ PLACE BET
router.post('/place', (req, res) => {
  console.log("📩 /api/bets/place called with:", req.body);
  const db = req.app.locals.db;
  let { userId, betChoice, amount } = req.body;

  const parsedAmount = parseFloat(amount);
  if (!userId || !betChoice || isNaN(parsedAmount)) {
    return res.status(400).json({ message: "Missing or invalid fields" });
  }

  if (parsedAmount < 50 || parsedAmount > 5000) {
    return res.status(400).json({ message: "Bet amount must be between ₹50 and ₹5000" });
  }

  db.get(`SELECT balance, total_deposit, winnings_balance FROM users WHERE userid = ?`, [userId], (err, user) => {
    if (err || !user) return res.status(500).json({ message: "User not found or DB error" });

    const deposit = parseFloat(user.total_deposit || 0);
    const winnings = parseFloat(user.winnings_balance || 0);
    const totalAvailable = deposit + winnings;

    if (parsedAmount > totalAvailable) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // 💡 Deduct from deposit first
    let newDeposit = deposit;
    let newWinnings = winnings;
    let source = '';

    if (parsedAmount <= deposit) {
      newDeposit -= parsedAmount;
      source = 'deposit';
    } else {
      const fromWinnings = parsedAmount - deposit;
      newDeposit = 0;
      newWinnings -= fromWinnings;
      source = 'winnings';
    }

    const updatedBalance = newDeposit + newWinnings;
    const date = new Date().toISOString();

    db.serialize(() => {
      db.run(
        `UPDATE users SET total_deposit = ?, winnings_balance = ?, balance = ? WHERE userid = ?`,
        [newDeposit, newWinnings, updatedBalance, userId]
      );

      db.run(
        `INSERT INTO bets (userId, betChoice, outcome, amount, result, source, date)
         VALUES (?, ?, NULL, ?, 'pending', ?, ?)`,
        [userId, betChoice, parsedAmount, source, date],
        function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });

          db.run(
            `INSERT INTO transactions (user_id, type, amount, balance, status, action, bet_side)
             VALUES (?, 'bet', ?, ?, 'placed', ?, ?)`,
            [userId, parsedAmount, updatedBalance, `Bet placed on ${betChoice}`, betChoice]
          );

          return res.json({
            message: "✅ Bet recorded. Waiting for result...",
            betId: this.lastID
          });
        }
      );
    });
  });
});

// ✅ GET BET HISTORY
router.get('/:userId', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.params.userId;

  db.all(`
    SELECT 
      id, 
      betChoice AS bet_side, 
      amount, 
      outcome AS result_side, 
      result AS status, 
      date AS created_at
    FROM bets 
    WHERE userId = ?
    ORDER BY date DESC
  `, [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch bet history' });
    res.json(rows);
  });
});

// ✅ RESOLVE BET
router.post('/resolve', (req, res) => {
  const db = req.app.locals.db;
  const { userId, betId } = req.body;

  if (!userId || !betId) {
    return res.status(400).json({ message: "Missing userId or betId" });
  }

  db.get(`SELECT * FROM bets WHERE id = ? AND userId = ?`, [betId, userId], (err, bet) => {
    if (err || !bet) return res.status(404).json({ message: "Bet not found" });

    if (bet.result !== 'pending') {
      return res.json({
        message: "Bet already resolved",
        result: bet.outcome,
        isWin: bet.result === 'Win',
        updatedBalance: bet.balance
      });
    }

    // ✅ Check number of distinct users in last minute
    db.get(`
      SELECT COUNT(DISTINCT userId) as count FROM bets
      WHERE datetime(date) >= datetime('now', '-1 minute')
    `, (err4, userCountRow) => {
      if (err4) return res.status(500).json({ message: "Error checking user count" });

      const userCount = userCountRow.count;
      let forceLose = false;

      if (userCount === 1) {
        const chance = Math.random();
        // Force 70% lose if only one user
        if (chance < 0.7) {
          forceLose = true;
        }

        // Additional rule: if amount > 500, again 70% lose chance
        if (bet.amount > 500) {
          const highBetChance = Math.random();
          if (highBetChance < 0.7) {
            forceLose = true;
          }
        }

        console.log(`🧪 SINGLE USER: bet=${bet.amount}, forceLose=${forceLose}`);
      }

      // ✅ Calculate total King vs Queen bets
      db.all(`
        SELECT betChoice, SUM(amount) as total FROM bets
        WHERE datetime(date) >= datetime('now', '-1 minute')
        GROUP BY betChoice
      `, (err3, rows) => {
        if (err3 || !rows) {
          console.error("❌ Failed to calculate bet totals", err3);
          return res.status(500).json({ message: "Failed to calculate total bet amounts" });
        }

        const king = rows.find(r => r.betChoice === 'King');
        const queen = rows.find(r => r.betChoice === 'Queen');

        const kingTotal = king ? king.total : 0;
        const queenTotal = queen ? queen.total : 0;

        let outcome = '';

        // ✅ Apply forced lose logic
        if (forceLose) {
          outcome = bet.betChoice === 'King' ? 'Queen' : 'King';
          console.log(`💀 Forced Loss applied. User bet: ${bet.betChoice}, Outcome: ${outcome}`);
        } else {
          // ✅ Normal win logic based on lower total
          if (kingTotal < queenTotal) outcome = 'King';
          else if (queenTotal < kingTotal) outcome = 'Queen';
          else outcome = Math.random() < 0.5 ? 'King' : 'Queen';

          console.log(`✅ Regular outcome: King ₹${kingTotal}, Queen ₹${queenTotal}, Chosen: ${outcome}`);
        }

        const isWin = outcome === bet.betChoice;
        const profit = isWin ? bet.amount : 0;

        // ✅ Fetch user wallet
        db.get(`SELECT balance, winnings_balance, total_deposit FROM users WHERE userid = ?`, [userId], (err2, user) => {
          if (err2 || !user) return res.status(400).json({ message: "User not found" });

          let newDeposit = user.total_deposit;
          let newWinnings = user.winnings_balance;

          if (isWin) {
            if (bet.source === 'deposit') {
              newDeposit += bet.amount;
              newWinnings += profit;
            } else {
              newWinnings += bet.amount + profit;
            }
          }

          const newBalance = newDeposit + newWinnings;

          db.serialize(() => {
            db.run(
              `UPDATE users SET total_deposit = ?, winnings_balance = ?, balance = ? WHERE userid = ?`,
              [newDeposit, newWinnings, newBalance, userId]
            );

            db.run(
              `UPDATE bets SET outcome = ?, result = ? WHERE id = ?`,
              [outcome, isWin ? 'Win' : 'Lose', betId]
            );

            db.run(`
              INSERT INTO transactions (user_id, type, amount, balance, status, action, bet_side)
              VALUES (?, 'bet_result', ?, ?, 'completed', ?, ?)
            `, [
              userId,
              profit,
              newBalance,
              `Result: ${outcome} (${isWin ? 'Win' : 'Lose'})`,
              bet.betChoice
            ]);

            // ✅ Admin profit = losing amount = amount if user lost
            const adminProfit = isWin ? 0 : bet.amount;

            db.run(`
              UPDATE admin_wallet
              SET total_profit = total_profit + ?,
                  current_balance = current_balance + ?,
                  last_updated = datetime('now', 'localtime')
              WHERE date = date('now', 'localtime')
            `, [adminProfit, adminProfit]);

            res.json({
              message: `Bet ${isWin ? 'won' : 'lost'}!`,
              result: outcome,
              isWin,
              updatedBalance: newBalance
            });
          });
        });
      });
    });
  });
});


module.exports = router;
