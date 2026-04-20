"""
One-time script to get a Gmail OAuth refresh token.
Run this once, copy the refresh token, store it in GCP Secret Manager.

Usage:
  pip install google-auth-oauthlib
  python get_gmail_token.py

A browser window will open for consent — sign in as the Gmail account
where you want drafts to appear.
"""

from google_auth_oauthlib.flow import InstalledAppFlow

# Paste your OAuth client ID and NEW client secret here
CLIENT_CONFIG = {
    "installed": {
        "client_id": "YOUR_CLIENT_ID",
        "client_secret": "YOUR_NEW_CLIENT_SECRET",
        "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token"
    }
}

SCOPES = ["https://www.googleapis.com/auth/gmail.compose"]

flow = InstalledAppFlow.from_client_config(CLIENT_CONFIG, SCOPES)
creds = flow.run_local_server(port=0)

print("\n=== COPY THIS REFRESH TOKEN INTO GCP SECRET MANAGER ===")
print(f"\nRefresh token:\n{creds.refresh_token}\n")
print("=======================================================")
