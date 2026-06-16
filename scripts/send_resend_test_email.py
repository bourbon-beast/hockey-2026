#!/usr/bin/env python3
"""Send a test email via Resend."""

import resend

# TODO: Replace re_xxxxxxxxx with your real Resend API key.
resend.api_key = "re_xxxxxxxxx"

r = resend.Emails.send(
    {
        "from": "onboarding@resend.dev",
        "to": "steve.g.waters@gmail.com",
        "subject": "Hello World",
        "html": "<p>Congrats on sending your <strong>first email</strong>!</p>",
    }
)

print(r)
