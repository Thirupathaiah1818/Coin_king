const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ncsupritha@gmail.com',
    pass: 'jodc gyrd dlus fopg' // App password
  }
});

async function sendEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: '"Coin King" <ncsupritha@gmail.com>',
      to,
      subject,
      html
    });

    console.log(`✅ Email sent to ${to}: ${info.response}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
    return false;
  }
}

module.exports = { sendEmail };
