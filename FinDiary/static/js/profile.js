
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("change-password-form");
    const button = document.getElementById("update-password-btn");
    const message = document.getElementById("password-message");

   if (response.ok && data.success) {
    form.reset();
}

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await updatePassword();
    });

    button.addEventListener("click", async (event) => {
        event.preventDefault();

        if (form.requestSubmit) {
            form.requestSubmit();
        } else {
            await updatePassword();
        }
    });

    async function updatePassword() {
        const currentPassword =
            document.getElementById("current-password").value;
        const newPassword =
            document.getElementById("new-password").value;
        const confirmPassword =
            document.getElementById("confirm-password").value;

        message.textContent = "";

        if (!currentPassword || !newPassword || !confirmPassword) {
            showMessage("Please fill in all password fields.", false);
            return;
        }

        if (newPassword.length < 8) {
            showMessage(
                "New password must be at least 8 characters.",
                false
            );
            return;
        }

        if (newPassword !== confirmPassword) {
            showMessage(
                "New password and confirmation do not match.",
                false
            );
            return;
        }

        button.disabled = true;
        button.textContent = "Updating...";

        try {
            const response = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                    confirm_password: confirmPassword
                })
            });

            const data = await response.json();

            showMessage(
                data.message || "Request completed.",
                response.ok && data.success
            );

            if (response.ok && data.success) {
                form.reset();
            }
        } catch (error) {
            showMessage(
                "Unable to connect to the server. Please try again.",
                false
            );
        } finally {
            button.disabled = false;
            button.textContent = "Update Password";
        }
    }

    function showMessage(text, success) {
        message.textContent = text;
        message.style.color = success ? "#34d399" : "#f87171";
    }
});

// -------------------------------
// Personal Information
// -------------------------------

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("personal-info-form");
    const button = document.getElementById("save-profile-btn");
    const message = document.getElementById("profile-message");

    if (!form || !button || !message) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const fullName = document
            .getElementById("profile-full-name")
            .value.trim();

        const email = document
            .getElementById("profile-email")
            .value.trim();

        message.textContent = "";

        if (!fullName || !email) {
            showProfileMessage("Please fill in all fields.", false);
            return;
        }

        if (fullName.length > 100) {
            showProfileMessage(
                "Full name must be 100 characters or fewer.",
                false
            );
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showProfileMessage(
                "Please enter a valid email address.",
                false
            );
            return;
        }

        button.disabled = true;
        button.textContent = "Saving...";

        try {
            const response = await fetch("/api/auth/update-profile", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    full_name: fullName,
                    email: email
                })
            });

            const data = await response.json();

            showProfileMessage(
                data.message || "Request completed.",
                response.ok && data.success
            );

        } catch (error) {
            showProfileMessage(
                "Unable to connect to the server. Please try again.",
                false
            );
        } finally {
            button.disabled = false;
            button.textContent = "Save Changes";
        }
    });

    function showProfileMessage(text, success) {
        message.textContent = text;
        message.style.color = success ? "#34d399" : "#f87171";
    }
});