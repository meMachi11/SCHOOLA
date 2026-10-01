# Hostinger domain setup

Scola's custom hostname is `app.schoolapp.space`. It was registered with Sites on 1 October 2026 and is pending DNS validation and SSL issuance. This hostname was chosen to match the school contact-email domain; confirm that `schoolapp.space` is the domain in your Hostinger account before editing DNS.

Open the DNS zone for `schoolapp.space` in Hostinger and add these records. Names below are relative to that zone:

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `app` | `custom-domains.chatgpt.site.` |
| TXT | `_openai-site-verification.app` | `openai-site-verification=E54I3x0l1TYQfrIgo7n8YIPt0AF3OjgxFb1I58KCS6A` |
| TXT | `_cf-custom-hostname.app` | `8004bf5f-9b06-43d7-8fe8-f5416608be54` |

Use Hostinger's default TTL. The fully qualified TXT names are `_openai-site-verification.app.schoolapp.space` and `_cf-custom-hostname.app.schoolapp.space`.

After saving, refresh the custom-domain status through Sites. Wait for the hostname and SSL to become active, then set `SCOLA_ORIGIN` to `https://app.schoolapp.space` and deploy the current saved version to apply that runtime setting. Until then, retain the current canonical origin and use the existing Scola URL.

The custom domain changes the address; Sites continues hosting the application and its database/storage. Site sharing and application roles still apply. Souhail's external Site access does not grant Site editor permissions; Site editing requires workspace membership. His authorized school administrator account is created on his first verified ChatGPT sign-in.
