const db = require('../config/db');

const getAdminWalletData = async () => {
    const [depositRows] = await db.query(`SELECT SUM(amount) AS totalDeposits FROM deposits WHERE status = 'approved'`);
    const [withdrawRows] = await db.query(`SELECT SUM(amount) AS totalWithdrawals FROM withdrawals WHERE status = 'approved'`);
    const [profitRows] = await db.query(`SELECT SUM(profit) AS totalProfit FROM transaction_summary`);

    const totalDeposits = depositRows[0].totalDeposits || 0;
    const totalWithdrawals = withdrawRows[0].totalWithdrawals || 0;
    const totalProfit = profitRows[0].totalProfit || 0;

    const currentBalance = (totalDeposits + totalProfit) - totalWithdrawals;
// ✅ Add today's date in YYYY-MM-DD format (IST)
const now = new Date();
const istOffset = 330; // 5 hours 30 mins
const istTime = new Date(now.getTime() + istOffset * 60000);
const today = istTime.toISOString().split("T")[0];

    return {
        date: today,
        totalDeposits,
        totalWithdrawals,
        totalProfit,
        currentBalance
    };
};

module.exports = {
    getAdminWalletData
};
