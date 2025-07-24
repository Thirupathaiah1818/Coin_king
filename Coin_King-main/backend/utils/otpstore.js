// Temporary in-memory OTP store
const otpStore = {};

// Set OTP
function setOTP(email, code) {
  otpStore[email] = {
    code,
    expires: Date.now() + 5 * 60 * 1000 // valid for 5 minutes
  };
}

// Verify OTP
function verifyOTP(email, code) {
  const record = otpStore[email];
  if (!record) return false;
  if (Date.now() > record.expires) return false;
  return record.code === code;
}

// Clear OTP after use
function clearOTP(email) {
  delete otpStore[email];
}

module.exports = {
  setOTP,
  verifyOTP,
  clearOTP
};
