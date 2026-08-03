import httpx

from app.core.config import settings

RESEND_API_URL = "https://api.resend.com/emails"


def send_invite_email(to_email: str, invite_token: str) -> None:
    set_password_url = f"{settings.frontend_url}/set-password?token={invite_token}"

    html_body = f"""
    <p>You've been invited to the LA County Parks &amp; Recreation Grants Management System.</p>
    <p><a href="{set_password_url}">Click here to set your password and activate your account</a></p>
    <p>This link expires in 72 hours. If you did not expect this invite, you can ignore this email.</p>
    """

    response = httpx.post(
        RESEND_API_URL,
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": settings.resend_from_email,
            "to": [to_email],
            "subject": "You're invited — LA County Parks Grants Management System",
            "html": html_body,
        },
        timeout=10.0,
    )
    response.raise_for_status()
