const API_URL = "http://localhost:3000/api";

function showAlert(msg) {
  alert(msg);
}

// Login handler
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const loginId = document.getElementById("loginId").value.trim();
  const password = document.getElementById("loginPassword").value.trim();

  try {
    const res = await fetch(`${API_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ loginId, password })
    });

    const data = await res.json();

    if (!data.success) {
      return showAlert(data.error || "Login failed");
    }

    // Store user in localStorage
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("wallet", data.user.balance);
    window.location.href = "game.html";

  } catch (err) {
    console.error("Login error:", err);
    showAlert("Something went wrong.");
  }
});
document.getElementById('signupForm').addEventListener('submit', function(e) {
  e.preventDefault();
  
  const formData = new FormData(this);
  
  fetch('/api/signup', {
    method: 'POST',
    body: formData,
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Redirect or show success message
    } else {
      console.log('Error:', data.error);
    }
  })
  .catch(error => {
    console.error('Signup error:', error);
  });
});
