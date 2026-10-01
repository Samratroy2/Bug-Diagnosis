// =========================================================
// BUGAI CREATE ACCOUNT
// =========================================================

import {
    auth,
    db,

    createUserWithEmailAndPassword,
    updateProfile,

    doc,
    setDoc,
    serverTimestamp
} from "../firebase.js";


// =========================================================
// ELEMENTS
// =========================================================

const createAccountForm =
    document.getElementById("createAccountForm");

const nameInput =
    document.getElementById("name");

const emailInput =
    document.getElementById("email");

const passwordInput =
    document.getElementById("password");

const confirmPasswordInput =
    document.getElementById("confirmPassword");

const createAccountButton =
    document.getElementById("createAccountButton");

const createAccountButtonText =
    document.getElementById("createAccountButtonText");

const createAccountSpinner =
    document.getElementById("createAccountSpinner");

const togglePassword =
    document.getElementById("togglePassword");

const toggleConfirmPassword =
    document.getElementById("toggleConfirmPassword");

const message =
    document.getElementById("message");


// =========================================================
// MESSAGE
// =========================================================

function showMessage(text, type = "error") {

    if (!message) return;

    message.textContent = text;

    message.className =
        `message ${type}`;
}


// =========================================================
// LOADING
// =========================================================

function setLoading(isLoading) {

    if (createAccountButton) {

        createAccountButton.disabled =
            isLoading;
    }


    if (createAccountButtonText) {

        createAccountButtonText.textContent =
            isLoading
                ? "Creating account..."
                : "Create Account";
    }


    if (createAccountSpinner) {

        createAccountSpinner.classList.toggle(
            "active",
            isLoading
        );
    }
}


// =========================================================
// PASSWORD TOGGLE
// =========================================================

function setupPasswordToggle(
    button,
    input
) {

    if (!button || !input) return;


    button.addEventListener(
        "click",
        () => {

            const isPassword =
                input.type === "password";


            input.type =
                isPassword
                    ? "text"
                    : "password";


            button.textContent =
                isPassword
                    ? "Hide"
                    : "Show";
        }
    );
}


setupPasswordToggle(
    togglePassword,
    passwordInput
);


setupPasswordToggle(
    toggleConfirmPassword,
    confirmPasswordInput
);


// =========================================================
// PASSWORD VALIDATION
// =========================================================

function validatePassword(password) {

    if (password.length < 6) {

        return "Password must contain at least 6 characters.";
    }


    return null;
}


// =========================================================
// CREATE ACCOUNT
// =========================================================

createAccountForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        showMessage("");


        const name =
            nameInput.value.trim();

        const email =
            emailInput.value.trim();

        const password =
            passwordInput.value;

        const confirmPassword =
            confirmPasswordInput.value;


        // -------------------------------------------------
        // VALIDATION
        // -------------------------------------------------

        if (!name) {

            showMessage(
                "Please enter your full name."
            );

            nameInput.focus();

            return;
        }


        if (!email) {

            showMessage(
                "Please enter your email address."
            );

            emailInput.focus();

            return;
        }


        const passwordError =
            validatePassword(password);


        if (passwordError) {

            showMessage(passwordError);

            passwordInput.focus();

            return;
        }


        if (password !== confirmPassword) {

            showMessage(
                "Passwords do not match."
            );

            confirmPasswordInput.focus();

            return;
        }


        setLoading(true);


        try {

            // -------------------------------------------------
            // CREATE FIREBASE AUTH ACCOUNT
            // -------------------------------------------------

            const userCredential =
                await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );


            const user =
                userCredential.user;


            // -------------------------------------------------
            // UPDATE DISPLAY NAME
            // -------------------------------------------------

            await updateProfile(
                user,
                {
                    displayName: name
                }
            );


            // -------------------------------------------------
            // CREATE FIRESTORE USER PROFILE
            // -------------------------------------------------

            await setDoc(
                doc(
                    db,
                    "users",
                    user.uid
                ),
                {

                    uid: user.uid,

                    name: name,

                    email: email,

                    role: "user",

                    provider: "password",

                    createdAt:
                        serverTimestamp(),

                    updatedAt:
                        serverTimestamp()
                }
            );


            // -------------------------------------------------
            // SUCCESS
            // -------------------------------------------------

            showMessage(
                "Account created successfully. Redirecting...",
                "success"
            );


            // -------------------------------------------------
            // REDIRECT
            // -------------------------------------------------

            setTimeout(() => {

                window.location.href =
                    "../Dashboard/dashboard.html";

            }, 700);


        } catch (error) {

            console.error(
                "Firebase account creation error:",
                error
            );


            let errorMessage =
                "Unable to create account. Please try again.";


            switch (error.code) {

                case "auth/email-already-in-use":

                    errorMessage =
                        "An account already exists with this email.";

                    break;


                case "auth/invalid-email":

                    errorMessage =
                        "Please enter a valid email address.";

                    break;


                case "auth/weak-password":

                    errorMessage =
                        "Password is too weak. Use at least 6 characters.";

                    break;


                case "auth/network-request-failed":

                    errorMessage =
                        "Network error. Please check your internet connection.";

                    break;


                case "auth/operation-not-allowed":

                    errorMessage =
                        "Email/password authentication is not enabled in Firebase.";

                    break;


                default:

                    errorMessage =
                        error.message ||
                        errorMessage;
            }


            showMessage(errorMessage);

        } finally {

            setLoading(false);
        }
    }
);