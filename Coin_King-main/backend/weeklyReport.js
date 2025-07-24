const { sendTemplatedEmail } = require('./utils/mailer');

// Function to send weekly report to admin
function sendWeeklyAdminReport(adminEmail, reportData) {
  sendTemplatedEmail(
    adminEmail,
    '📊 Weekly Report – Coin King',
    'templates/weeklyReportEmail.html',
    {
      summary: reportData.summary,
      totalUsers: reportData.totalUsers,
      totalBets: reportData.totalBets,
      totalPayouts: reportData.totalPayouts,
    }
  );
}

module.exports = { sendWeeklyAdminReport };
