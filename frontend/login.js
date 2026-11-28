// The old practice login page (login.html) was retired: it accepted any username and password.
// Sign-in uses Amazon Cognito on signin.html; a stale cached copy of login.html that still loads this file goes there.
location.replace("signin.html");
