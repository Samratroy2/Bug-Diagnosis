// =========================================================
// BUGAI LOGIN
// =========================================================

import {
    auth,

    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,

    signInWithEmailAndPassword,
    sendPasswordResetEmail
} from "../firebase.js";


// =========================================================
// ELEMENTS
// =========================================================

const loginForm = document.getElementById("loginForm");

const emailInput = document.getElementById("email");

const passwordInput = document.getElementById("password");

const rememberMe = document.getElementById("rememberMe");

const loginButton = document.getElementById("loginButton");

const loginButtonText = document.getElementById("loginButtonText");

const loginSpinner = document.getElementById("loginSpinner");

const togglePassword = document.getElementById("togglePassword");

const forgotPassword = document.getElementById("forgotPassword");

const message = document.getElementById("message");


// =========================================================
// MESSAGE
// =========================================================

function showMessage(text, type = "error") {

    if (!message) return;

    message.textContent = text;

    message.className = `message ${type}`;
}


// =========================================================
// LOADING
// =========================================================

function setLoading(isLoading) {

    if (loginButton) {
        loginButton.disabled = isLoading;
    }

    if (loginButtonText) {
        loginButtonText.textContent =
            isLoading ? "Logging in..." : "Login";
    }

    if (loginSpinner) {
        loginSpinner.classList.toggle(
            "active",
            isLoading
        );
    }
}


// =========================================================
// PASSWORD VISIBILITY
// =========================================================

if (togglePassword) {

    togglePassword.addEventListener("click", () => {

        const isPassword =
            passwordInput.type === "password";

        passwordInput.type =
            isPassword ? "text" : "password";

        togglePassword.textContent =
            isPassword ? "Hide" : "Show";

        togglePassword.setAttribute(
            "aria-label",
            isPassword
                ? "Hide password"
                : "Show password"
        );
    });
}


// =========================================================
// LOGIN
// =========================================================

loginForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    showMessage("");

    const email =
        emailInput.value.trim();

    const password =
        passwordInput.value;


    if (!email || !password) {

        showMessage(
            "Please enter your email and password."
        );

        return;
    }


    setLoading(true);


    try {

        // -------------------------------------------------
        // SET FIREBASE AUTH PERSISTENCE
        // -------------------------------------------------

        await setPersistence(
            auth,
            rememberMe.checked
                ? browserLocalPersistence
                : browserSessionPersistence
        );


        // -------------------------------------------------
        // SIGN IN
        // -------------------------------------------------

        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );


        showMessage(
            "Login successful. Redirecting...",
            "success"
        );


        // -------------------------------------------------
        // REDIRECT
        // -------------------------------------------------

        setTimeout(() => {

            window.location.href =
                "../Dashboard/dashboard.html";

        }, 500);


    } catch (error) {

        console.error(
            "Firebase login error:",
            error
        );


        let errorMessage =
            "Unable to login. Please try again.";


        switch (error.code) {

            case "auth/invalid-email":
                errorMessage =
                    "Please enter a valid email address.";
                break;

            case "auth/invalid-credential":
            case "auth/wrong-password":
            case "auth/user-not-found":
                errorMessage =
                    "Invalid email or password.";
                break;

            case "auth/user-disabled":
                errorMessage =
                    "This account has been disabled.";
                break;

            case "auth/too-many-requests":
                errorMessage =
                    "Too many login attempts. Please try again later.";
                break;

            case "auth/network-request-failed":
                errorMessage =
                    "Network error. Please check your internet connection.";
                break;

            default:
                errorMessage =
                    error.message || errorMessage;
        }


        showMessage(errorMessage);

    } finally {

        setLoading(false);
    }
});


// =========================================================
// FORGOT PASSWORD
// =========================================================

if (forgotPassword) {

    forgotPassword.addEventListener(
        "click",
        async (event) => {

            event.preventDefault();

            const email =
                emailInput.value.trim();


            if (!email) {

                showMessage(
                    "Enter your email address first."
                );

                emailInput.focus();

                return;
            }


            try {

                await sendPasswordResetEmail(
                    auth,
                    email
                );


                showMessage(
                    "Password reset email sent. Check your inbox.",
                    "success"
                );


            } catch (error) {

                console.error(
                    "Password reset error:",
                    error
                );


                let errorMessage =
                    "Unable to send password reset email.";


                switch (error.code) {

                    case "auth/invalid-email":
                        errorMessage =
                            "Please enter a valid email address.";
                        break;

                    case "auth/user-not-found":
                        errorMessage =
                            "No account exists with this email.";
                        break;

                    case "auth/network-request-failed":
                        errorMessage =
                            "Network error. Please check your connection.";
                        break;

                    default:
                        errorMessage =
                            error.message || errorMessage;
                }


                showMessage(errorMessage);
            }
        }
    );
}