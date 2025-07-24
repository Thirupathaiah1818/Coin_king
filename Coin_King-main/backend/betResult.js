const { sendTemplatedEmail } = require('./mailer');

function notifyPlayerOfBet(playerEmail, username, resultText) {
  sendTemplatedEmail(
    playerEmail,
    '🎮 Your Coin King Bet Result',
    'templates/betResultEmail.html',
    {
      username,
      betResult: resultText,
    }
  );
}
