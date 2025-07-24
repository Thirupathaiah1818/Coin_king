// ===============================
// Admin Login Logic
// ===============================
const adminLoginForm = document.getElementById('adminLoginForm');
if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value.trim();

    if (email === 'admin@gmail.com' && password === 'admin123') {
      window.location.href = 'admin-dashboard.html';  // ✅ Redirect on success
    } else {
      document.getElementById('message').textContent = '❌ Invalid admin credentials.';
    }
  });
}

// ===============================
// Fetch Users on Button Click
// ===============================
const fetchUsersBtn = document.getElementById('fetchUsersBtn');
if (fetchUsersBtn) {
  fetchUsersBtn.addEventListener('click', () => {
    fetch('http://localhost:3000/api/users') // ✅ Update to match your route if needed
      .then(response => response.json())
      .then(users => {
        const userListDiv = document.getElementById('userList');
        const table = document.createElement('table');

        // Optional: Add table headers
        table.innerHTML = `
          <tr>
            <th>User ID</th>
            <th>Username</th>
            <th>Email</th>
          </tr>
        `;

        users.forEach(user => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${user.userid}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
          `;
          table.appendChild(row);
        });

        userListDiv.innerHTML = '';
        userListDiv.appendChild(table);
      })
      .catch(error => {
        console.error('❌ Error fetching users:', error);
        document.getElementById('userList').innerHTML = '<p>Error loading users.</p>';
      });
  });
}

// ===============================
// Load Admin Wallet Summary on Page Load
// ===============================
window.addEventListener("DOMContentLoaded", () => {
  loadAdminWallet();
});

async function loadAdminWallet() {
  try {
    const res = await fetch("http://localhost:3000/api/admin/wallet");

    if (!res.ok) throw new Error(`Status: ${res.status}`);

    const wallet = await res.json();
    console.log("✅ Admin Wallet Response:", wallet);

    document.getElementById("totalDeposit").textContent = `₹${parseFloat(wallet.total_deposits || 0).toFixed(2)}`;
    document.getElementById("totalWithdraw").textContent = `₹${parseFloat(wallet.total_withdrawals || 0).toFixed(2)}`;
    document.getElementById("totalProfit").textContent = `₹${parseFloat(wallet.total_profit || 0).toFixed(2)}`;
    document.getElementById("currentBalance").textContent = `₹${parseFloat(wallet.current_balance || 0).toFixed(2)}`;
    document.getElementById("lastUpdated").textContent = wallet.last_updated
      ? new Date(wallet.last_updated).toLocaleString()
      : "--";
  } catch (err) {
    console.error("❌ Admin Wallet Load Error:", err);
  }
}
