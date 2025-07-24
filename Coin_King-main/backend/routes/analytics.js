const express = require('express');

module.exports = (db) => {
  const router = express.Router();

  router.get('/game-summary', (req, res) => {
    const query = `
      SELECT
        strftime('%Y-%m-%d %H:%M', created_at) AS minute,
        COUNT(DISTINCT user_id) AS users_played,
        GROUP_CONCAT(CASE WHEN bet_side = 'king' THEN user_name || ' ₹' || amount END, ', ') AS king_bets,
        GROUP_CONCAT(CASE WHEN bet_side = 'queen' THEN user_name || ' ₹' || amount END, ', ') AS queen_bets,
        result,
        SUM(CASE
            WHEN result = bet_side THEN -won_amount
            ELSE amount
        END) AS profit
      FROM transactions
      GROUP BY minute, result
      ORDER BY minute DESC
    `;

    db.all(query, [], (err, rows) => {
      if (err) {
        console.error("❌ Error fetching summary:", err.message);
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.json(rows);
    });
  });

  return router;
};
